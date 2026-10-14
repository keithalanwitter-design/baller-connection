import { publicCard } from '../shared/timeline';
import type { Command, Snapshot, UserRole } from '../shared/domain';
import { ConflictError, dispatch, id as newId, WorkflowError } from '../shared/engine';
import { ENDPOINT_ROLES, PermissionError, SYSTEM, PUBLIC, canSeePlayer, scopeSnapshot, type Actor, type Endpoint } from '../shared/permissions';
import { DEMO_PASSWORD, DEMO_PIN, seed } from '../shared/seed';
import { buildOpsQueue, buildQueue, teamLoad, TRANSITIONS } from '../shared/workflow';
import { COOKIE, hashSecret, hmac, newToken, readToken, sessionCookie, verifySecret } from './auth';
import type { Db } from './db';
import { makeProvider, ProviderError, type EmailEnv } from './email';
import { StripeClient, priceId, priceToTier, signStripe, stripeMode, verifyStripe, type StripeEnv } from './stripe';
import { pushDecision, validPushEndpoint } from '../shared/push';
import { pushMode, sendPush, type PushEnv } from './push';
import { clearOAuthCookie, exchangeCode, googleOn, googleStart, readOAuthCookie, verifyIdToken, type GoogleEnv } from './google';
import { googleLink } from '../shared/google';
import { CATEGORY, MAX_ATTEMPTS, RETRY_BACKOFF_MS, quietUntil, render, wants, type EmailData, type EmailKind } from '../shared/emails';
import { checkoutBlock, mockPriceToTier, mockStripeEvents, stripeToCommand, subscriptionOf, TIERS, type MockOutcome } from '../shared/billing';
import type { EmailCategory, Tier } from '../shared/domain';
import { Repo } from './repo';
import { playerCsv, calendarIcs } from './export';
import type { BlobStore } from './blobs';
import { CLIP_MAX_BYTES, canSeeClip, clipError, normalizeMime, sniffMime, videoDuration } from '../shared/clips';

export interface Env extends EmailEnv, StripeEnv, PushEnv, GoogleEnv { DB: Db; SESSION_SECRET?: string; APP_URL?: string; DEMO?: string; ALLOW_ORIGIN?: string; SEED?: string; OWNER_EMAIL?: string; OWNER_NAME?: string; /** Clip bytes: R2 (Worker) or local disk (Node). Without it, uploads answer 503. */ BLOBS?: BlobStore }
class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }
const SYSTEM_ONLY = new Set(['sweep', 'advanceClock']);
/** Never accepted from a browser: billing state only changes through a verified Stripe webhook (or the test-mode simulator, which signs its events the same way). */
const WEBHOOK_ONLY = new Set(['billingEvent']);
/** Commands only the server itself may run (registerClip is issued by POST /api/clips after it has checked the bytes). */
const SERVER_ONLY = new Set(['registerClip']);

/** First boot: demo data (SEED=demo, local/dev only) or an empty program with one head-coach account (OWNER_EMAIL). */
export async function ensureSeeded(env: Env) {
  const repo = new Repo(env.DB); if (await repo.isSeeded()) return;
  if (env.SEED === 'demo' || env.DEMO === '1') { await seedDb(env.DB); return; }
  const s = seed(); const empty = { ...s, reflections: [], cycleReviews: [], clips: [], users: [{ id: 'u_head', name: env.OWNER_NAME ?? 'Head Coach', email: (env.OWNER_EMAIL ?? 'owner@example.com').toLowerCase(), role: 'head' as const, active: true }], families: [], players: [], applications: [], invites: [], consents: [], cycles: [], assignments: [], submissions: [], reviews: [], messages: [], habits: [], milestones: [], digests: [], meetings: [], notifications: [], outbox: [], dataRequests: [], events: [] };
  await repo.save(empty); // owner sets a password with “First time / forgot password” (emailed link)
}
export async function seedDb(db: Db) {
  const repo = new Repo(db); const s = seed(); await repo.save(s);
  for (const u of s.users) { if (u.email) await repo.setCredential(u.id, 'password_hash', await hashSecret(DEMO_PASSWORD)); if (u.role === 'player') await repo.setCredential(u.id, 'pin_hash', await hashSecret(DEMO_PIN)); }
  return s;
}

/** Runs one command through permissions + engine, persists the row diff, then delivers queued mail. */
export async function runCommand(env: Env, actor: Actor, cmd: Command) {
  await ensureSeeded(env); const repo = new Repo(env.DB); const prev = await repo.load(); const r = dispatch(prev, cmd, actor); await repo.save(r.snapshot, prev);
  // Clips removed by this command (deleted on request, 90-day retention, data deletion): remove the bytes too.
  const kept = new Set((r.snapshot.clips ?? []).map((c) => c.id)); for (const c of prev.clips ?? []) if (!kept.has(c.id) && env.BLOBS && !c.storageKey.startsWith('demo/')) await env.BLOBS.delete(c.storageKey).catch(() => undefined);
  await deliver(env); await pushNew(env, prev.notifications, r.snapshot).catch((e) => console.error('push failed', e)); return r;
}
/** v7: new in-app notifications that map to a push event go to that user's subscribed devices, respecting email-category prefs + quiet hours. */
export const pushLog: { userId: string; title: string; body: string; at: string; status: string }[] = [];
export async function pushNew(env: Env, before: Snapshot['notifications'], after: Snapshot, f: typeof fetch = fetch, now = new Date()) {
  const seen = new Set(before.map((n) => n.id)); const fresh = after.notifications.filter((n) => !seen.has(n.id)); if (!fresh.length) return 0;
  const repo = new Repo(env.DB); let sent = 0;
  for (const n of fresh) {
    const u = after.users.find((x) => x.id === n.userId); const p = pushDecision(n, u?.prefs, now, after.settings.timezone); if (!p) continue;
    const subs = (await repo.pushSubsFor(n.userId)).results; if (!subs.length) continue;
    for (const sub of subs) {
      const r = await sendPush(env, sub, p, f); sent++;
      if (pushMode(env) === 'log') { pushLog.unshift({ userId: n.userId, title: p.title, body: p.body, at: now.toISOString(), status: 'logged' }); pushLog.length = Math.min(pushLog.length, 50); }
      if (r.status === 'gone') await repo.deletePushSub(sub.endpoint); else await repo.markPush(sub.endpoint, r.status === 'failed' ? `HTTP ${r.code}` : null);
    }
  }
  return sent;
}
/** Once a real provider has the mail, the outbox copy no longer needs the invite/reset secret. (The Log provider keeps it: it IS the delivery in dev.) */
export const redactSecrets = (b: string) => b.replace(/token=[A-Za-z0-9_-]+/g, 'token=[sent]').replace(/code \d{6}/g, 'code [sent]');
const secretOf = (env: Env) => env.SESSION_SECRET ?? 'dev-only-secret-change-me';
const originOf = (app: string) => { try { return new URL(app).origin; } catch { return ''; } };
/** Signed one-click unsubscribe link for one user + category (RFC 8058 List-Unsubscribe-Post). */
export async function unsubscribeUrl(env: Env, userId: string, category: string) { return `${originOf(env.APP_URL ?? '')}/api/unsubscribe?u=${encodeURIComponent(userId)}&c=${category}&s=${(await hmac(secretOf(env), `unsub:${userId}:${category}`)).slice(0, 32)}`; }
/** Server-side mail (magic links, password links, roundups): same templates, preferences and quiet hours as the engine. */
export async function queueEmail(env: Env, kind: EmailKind, to: string, data: EmailData, userId?: string | null) {
  const repo = new Repo(env.DB); const prefs = userId ? await repo.userPrefs(userId) : null; const cat = CATEGORY[kind]; if (!wants(prefs, cat)) return false;
  const r = render(kind, data); await repo.insertEmail({ id: newId('em'), to, subject: r.subject, body: r.text, html: r.html, kind, status: 'queued', category: cat, userId: userId ?? null, sendAfter: quietUntil(new Date(), prefs, cat) }); return true;
}
/** Sends due mail. Provider errors retry with backoff (1 m, 5 m, 30 m, 2 h); after 5 attempts, or a permanent 4xx, the row is dead-lettered for staff. */
export async function deliver(env: Env, f: typeof fetch = fetch) {
  const repo = new Repo(env.DB); const p = makeProvider(env, f); const app = env.APP_URL ?? ''; const now = Date.now();
  const fill = (x: string) => x.replaceAll('{{APP}}', app).replaceAll(' /invite', ` ${app}/#/invite`).replaceAll(' /reset', ` ${app}/#/reset`);
  for (const m of (await repo.dueEmails(new Date(now).toISOString())).results) {
    const unsub = m.category && m.category !== 'essential' && m.userId ? await unsubscribeUrl(env, m.userId, m.category) : null; const u = (x: string) => x.replaceAll('{{UNSUB}}', unsub ?? `${app}/#/account`);
    const attempts = (m.attempts ?? 0) + 1;
    try {
      const body = u(fill(m.body)); const html = m.html ? u(fill(m.html)) : null;
      const st = await p.send({ to: m.to, subject: m.subject, body, html, headers: unsub ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined });
      // Outbox keeps exactly what went out; once a real provider has it, the secret link/code is redacted from our copy.
      await repo.markEmail(m.id, st, attempts); await repo.setEmailBody(m.id, st === 'sent' ? redactSecrets(body) : body, html && st === 'sent' ? redactSecrets(html) : html);
    } catch (e) {
      const status = e instanceof ProviderError ? e.status : 0; const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
      const dead = permanent || attempts >= MAX_ATTEMPTS; await repo.markEmail(m.id, dead ? 'dead' : 'queued', attempts, dead ? null : new Date(now + RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]).toISOString(), String((e as Error).message ?? e).slice(0, 300));
    }
  }
}
/** One verified Stripe event → one idempotent engine command. Shared by the real webhook and the test-mode simulator. */
export async function processStripeEvent(env: Env, payload: string) {
  const evt = JSON.parse(payload); const sim = stripeMode(env) === 'simulated'; const toTier = priceToTier(env);
  const cmd = stripeToCommand(evt, (id) => toTier(id) ?? (sim ? mockPriceToTier(id) : null)); if (!cmd) return { received: true, ignored: evt.type };
  try { const r = await runCommand(env, SYSTEM, cmd); return { received: true, duplicate: !!r.created?.duplicate }; }
  catch (e) { if (e instanceof WorkflowError) return { received: true, ignored: e.message }; throw e; }
}
export const simulatorSecret = (env: Env) => hmac(secretOf(env), 'stripe-simulator');
/** Cron: SLA/overdue sweep every run; weekly digests on the Sunday schedule; then a per-user notification email digest. */
export async function scheduled(env: Env, cron: string) {
  await runCommand(env, SYSTEM, { type: 'sweep' });
  if (cron === '0 23 * * SUN') await runCommand(env, SYSTEM, { type: 'generateDigests' });
  const repo = new Repo(env.DB); const pending = (await repo.unemailedNotifications()).results; const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  for (const [, list] of byUser) { const u = list[0]; if (u.email) await queueEmail(env, 'notification-digest', u.email, { name: u.name, count: list.length, items: list.map((n) => `• ${n.text}`).join('\n') }, u.user_id); await repo.markEmailed(list.map((n) => n.id)); }
  await deliver(env);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url); const path = url.pathname.replace(/\/+$/, ''); const origin = req.headers.get('origin');
  const cors: Record<string, string> = env.ALLOW_ORIGIN && origin === env.ALLOW_ORIGIN ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type, authorization, x-player-id, x-watch-for, range', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
  const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...extra } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const repo = new Repo(env.DB); const secret = secretOf(env); const secure = url.protocol === 'https:'; const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'; const app = env.APP_URL ?? url.origin;
  const body = async <T,>() => (req.method === 'POST' ? ((await req.json().catch(() => ({}))) as T) : ({} as T));
  const startSession = async (userId: string) => { const tok = newToken(); await repo.createSession(await hmac(secret, tok), userId, 30, req.headers.get('user-agent') ?? ''); return { 'set-cookie': sessionCookie(tok, secure), 'x-session-token': tok }; };
  const me = async (): Promise<Actor & { name: string; role: UserRole } | null> => { const t = readToken(req); if (!t) return null; const u = await repo.sessionUser(await hmac(secret, t)); return u ? { id: u.id as string, role: u.role as UserRole, name: u.name as string, familyId: u.family_id as string | null, playerId: u.player_id as string | null } : null; };
  const need = async (ep: Endpoint) => { const a = await me(); if (!a) throw new HttpError(401, 'Sign in required'); if (!ENDPOINT_ROLES[ep].includes(a.role)) throw new HttpError(403, `${a.role} can’t access ${ep}`); return a; };
  try {
    await ensureSeeded(env);
    if (path === '/api/health') return json({ ok: true, version: await repo.version(), demo: env.DEMO === '1', email: makeProvider(env).name, stripe: stripeMode(env), push: pushMode(env), google: googleOn(env) });
    if (path === '/api/workflow') return json({ transitions: TRANSITIONS });
    // ---------- auth ----------
    if (path === '/api/auth/login' && req.method === 'POST') {
      const b = await body<{ login?: string; password?: string; pin?: string }>(); const ident = (b.login ?? '').trim().toLowerCase();
      if ((await repo.recentFailures(ident)) >= 5) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
      const u = await repo.userByLogin(ident); const ok = !!u && (b.pin ? u.role === 'player' && (await verifySecret(b.pin, u.pin_hash as string)) : await verifySecret(b.password ?? '', u.password_hash as string));
      if (!u || !ok) { await repo.recordFailure(ident); throw new HttpError(401, 'Email/username or password is wrong.'); }
      return json({ user: { id: u.id, name: u.name, role: u.role } }, 200, await startSession(u.id as string));
    }
    if (path === '/api/auth/logout' && req.method === 'POST') { const t = readToken(req); if (t) await repo.deleteSession(await hmac(secret, t)); return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` }); }
    if (path === '/api/auth/logout-all' && req.method === 'POST') { const a = await me(); if (a) { await repo.endAllSessions(a.id); await repo.deleteUserPushSubs(a.id); } return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` }); }
    // ---------- v8 Google sign-in (OIDC code flow + PKCE). Links to existing accounts only. ----------
    if (path === '/api/auth/google/start') {
      if (!googleOn(env)) return Response.redirect(`${app}/#/login?google=off`, 302);
      const g = await googleStart(env, app, secret, url.searchParams.get('next') ?? '', secure);
      return new Response(null, { status: 302, headers: { location: g.url, 'set-cookie': g.cookie, 'cache-control': 'no-store' } });
    }
    if (path === '/api/auth/google/callback') {
      const back = (q: string, extra: Record<string, string> = {}) => { const h = new Headers({ location: `${app}/#${q}`, 'cache-control': 'no-store', ...extra }); h.append('set-cookie', clearOAuthCookie(secure)); return new Response(null, { status: 302, headers: h }); };
      if (!googleOn(env)) return back('/login?google=off');
      const st = await readOAuthCookie(req, secret); const code = url.searchParams.get('code');
      if (!st || !code || url.searchParams.get('state') !== st.state) return back('/login?google=error');
      let claims;
      try { claims = await verifyIdToken(await exchangeCode(env, app, code, st.verifier), { clientId: env.GOOGLE_CLIENT_ID!, nonce: st.nonce }); } catch { return back('/login?google=error'); }
      const s = await repo.load(); const out = googleLink(s, await repo.googleIdentities(), claims);
      if (out.kind === 'invite') return back('/invite?google=invite');
      if (out.kind === 'refuse') return back(`/login?google=${out.reason}`);
      await repo.linkGoogle(claims.sub, out.userId, claims.email); const sess = await startSession(out.userId);
      const role = out.role; const home = role === 'head' || role === 'assistant' ? '/coach' : role === 'ops' ? '/ops' : role === 'parent' ? '/parent' : '/app';
      const h = new Headers({ location: `${app}/#${st.next || home}`, 'cache-control': 'no-store' }); h.append('set-cookie', sess['set-cookie']); h.append('set-cookie', clearOAuthCookie(secure)); return new Response(null, { status: 302, headers: h });
    }
    // ---------- v6 magic links: hashed, 15 min, single use; same answer whether or not the account exists ----------
    if (path === '/api/auth/magic' && req.method === 'POST') {
      const b = await body<{ email?: string }>(); const email = (b.email ?? '').trim().toLowerCase(); const pair = `magic:${email}|${ip}`; const ipKey = `magic-ip:${ip}`;
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter your email address.');
      if ((await repo.recentFailures(pair)) >= 3 || (await repo.recentFailures(ipKey)) >= 20) throw new HttpError(429, 'Too many sign-in links requested. Try again in 15 minutes.');
      await repo.recordFailure(pair); await repo.recordFailure(ipKey); // every request counts, so the limit can't reveal which emails exist
      const u = await repo.userByLogin(email); const tok = newToken(); const th = await hmac(secret, tok);
      const kid = u?.role === 'player' && u.player_id ? ((await repo.playerAge(u.player_id as string))?.age ?? 0) < 13 : false; // under-13 players sign in with the PIN their parent manages
      if (u && u.email === email && !kid) { await repo.createMagicToken(th, u.id as string, 15, ip); await queueEmail(env, 'magic-link', email, { name: String(u.name).split(' ')[0], token: tok }, u.id as string); await deliver(env); }
      return json({ ok: true, message: 'If that email has an account, a sign-in link is on its way. It works once, for 15 minutes.' });
    }
    if (path === '/api/auth/magic/verify' && req.method === 'POST') {
      const b = await body<{ token?: string }>(); const vKey = `magic-verify:${ip}`; if ((await repo.recentFailures(vKey)) >= 10) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
      const th = await hmac(secret, String(b.token ?? '')); const uid = await repo.useMagicToken(th);
      if (!uid) { await repo.recordFailure(vKey); const st = await repo.magicTokenState(th); throw new HttpError(400, st?.used_at ? 'That sign-in link was already used. Request a new one.' : st ? 'That sign-in link has expired (links last 15 minutes). Request a new one.' : 'That sign-in link isn’t valid. Request a new one.'); }
      const old = readToken(req); if (old) await repo.deleteSession(await hmac(secret, old)); // session upgrade: never reuse a pre-login session token
      const u = await repo.userById(uid); if (!u) throw new HttpError(400, 'That account is no longer active.');
      return json({ user: { id: u.id, name: u.name, role: u.role } }, 200, await startSession(uid));
    }
    if (path === '/api/unsubscribe') {
      const uid = url.searchParams.get('u') ?? ''; const c = url.searchParams.get('c') ?? ''; const sig = url.searchParams.get('s') ?? '';
      const page = (title: string, msg: string, form = '') => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Arial,sans-serif;background:#F5F3EE;color:#1B2236;padding:40px"><div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:28px"><p style="font-weight:800;letter-spacing:1px;color:#0A1430">BALLER<span style="color:#FF5E1A">CONNECTION</span></p><h1 style="color:#0A1430;font-size:22px">${title}</h1><p>${msg}</p>${form}</div></body>`, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      const cats: EmailCategory[] = c === 'all' ? ['coaching', 'digest', 'updates'] : (['coaching', 'digest', 'updates'] as const).includes(c as never) ? [c as EmailCategory] : [];
      if (!cats.length || (await hmac(secret, `unsub:${uid}:${c}`)).slice(0, 32) !== sig) return page('Link not valid', 'This unsubscribe link is incomplete or was changed. Change email settings in the app instead.');
      const label = c === 'all' ? 'all non-essential email' : c === 'coaching' ? 'coaching emails' : c === 'digest' ? 'the weekly parent digest' : 'update roundups';
      if (req.method !== 'POST') return page(`Unsubscribe from ${label}?`, 'One click and you’re done. Sign-in links, invites, consent and payment emails still arrive.', `<form method="post"><button style="background:#FF5E1A;color:#0A1430;border:0;border-radius:999px;padding:12px 22px;font-weight:800;cursor:pointer">Unsubscribe</button></form>`);
      await runCommand(env, SYSTEM, { type: 'setEmailPrefs', userId: uid, prefs: Object.fromEntries(cats.map((k) => [k, false])) });
      return page('You’re unsubscribed', `You won’t get ${label} anymore. Essential account email (sign-in links, payments) still arrives. Turn it back on anytime in Email settings.`);
    }
    if (path === '/api/auth/me') { const a = await me(); return a ? json({ user: a }) : json({ user: null }, 401); }
    if (path === '/api/auth/accept-invite' && req.method === 'POST') {
      const b = await body<{ token?: string; code?: string; parentName: string; email: string; password?: string }>();
      if (b.password && b.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters (or leave it empty and sign in with emailed links).');
      if (await repo.userByLogin(b.email ?? '')) throw new HttpError(409, 'An account with that email exists. Sign in instead.');
      const ipKey = `invite:${req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'local'}`; if ((await repo.recentFailures(ipKey)) >= 5) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
      const uid = newId('usr'); const r = await runCommand(env, PUBLIC, { type: 'acceptInvite', token: b.token, code: b.code, parentName: b.parentName, email: b.email, userId: uid }).catch(async (e) => { if (e instanceof WorkflowError) await repo.recordFailure(ipKey); throw e; });
      const userId = r.created?.userId ?? uid; if (b.password) await repo.setCredential(userId, 'password_hash', await hashSecret(b.password)); // no password = passwordless account (magic links)
      return json({ user: { id: userId, role: 'parent' }, playerId: r.created?.playerId }, 200, await startSession(userId));
    }
    if (path === '/api/auth/player-login' && req.method === 'POST') {
      const a = await need('commands'); const b = await body<{ playerId: string; username: string; pin: string }>();
      if (!/^\d{4,8}$/.test(b.pin ?? '')) throw new HttpError(400, 'PIN must be 4–8 digits.');
      const r = await runCommand(env, a, { type: 'setPlayerLogin', playerId: b.playerId, username: b.username, userId: newId('usr') });
      await repo.setCredential(r.created!.userId!, 'pin_hash', await hashSecret(b.pin)); return json({ ok: true, username: b.username.toLowerCase() });
    }
    if (path === '/api/auth/request-password' && req.method === 'POST') {
      const b = await body<{ email: string }>(); const u = await repo.userByLogin(b.email ?? '');
      if (u?.email) { const tok = newToken(); await repo.createPasswordToken(await hmac(secret, tok), u.id as string, 2); await queueEmail(env, 'password', u.email as string, { token: tok, hours: 2 }, u.id as string); await deliver(env); }
      return json({ ok: true });
    }
    if (path === '/api/auth/reset-password' && req.method === 'POST') {
      const b = await body<{ token: string; password: string }>(); if (!b.password || b.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
      const uid = await repo.usePasswordToken(await hmac(secret, b.token ?? '')); if (!uid) throw new HttpError(400, 'That link is invalid or expired.');
      await repo.setCredential(uid, 'password_hash', await hashSecret(b.password)); await repo.endAllSessions(uid); return json({ ok: true }, 200, await startSession(uid)); // new password signs out other devices
    }
    // ---------- public intake ----------
    if (path === '/api/apply' && req.method === 'POST') { const b = await body<Command>(); if (b.type !== 'submitApplication') throw new HttpError(400, 'Bad request'); const r = await runCommand(env, (await me()) ?? PUBLIC, b); return json({ ok: true, playerId: r.created?.playerId }); }
    // ---------- app ----------
    // v7: a Player Card shared by its private link. No sign-in; only works while the parent has the link on; shows the public card fields only.
    const card = path.match(/^\/api\/card\/([a-f0-9]{16,64})$/);
    if (card && req.method === 'GET') { const s = await repo.load(); const p = s.players.find((x) => x.card?.enabled && x.card.token && x.card.token === card[1]); if (!p) throw new HttpError(404, 'This card link is off or was replaced.'); return json(publicCard(s, p), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }); }
    if (path === '/api/snapshot') { const a = await need('snapshot'); return json({ me: a, snapshot: scopeSnapshot(await repo.load(), a) }); }
    if (path === '/api/commands' && req.method === 'POST') {
      const a = await need('commands'); const cmd = await body<Command>();
      if (SERVER_ONLY.has(cmd.type)) throw new HttpError(403, 'Clips are added by uploading them.');
      if (WEBHOOK_ONLY.has(cmd.type)) throw new HttpError(403, 'Billing changes come from Stripe (checkout, portal, webhooks).');
      if (SYSTEM_ONLY.has(cmd.type) && env.DEMO !== '1') throw new HttpError(403, `${cmd.type} runs on the scheduler only`);
      const r = await runCommand(env, SYSTEM_ONLY.has(cmd.type) ? SYSTEM : a, cmd);
      return json({ snapshot: scopeSnapshot(r.snapshot, a), events: r.events.filter((e) => !e.playerId || scopeSnapshot(r.snapshot, a).players.some((p) => p.id === e.playerId)) });
    }
    // ---------- clips (≤30 s, ≤50 MB, mp4/mov/webm). Bytes go through the API so access is checked on every read. ----------
    if (path === '/api/clips' && req.method === 'POST') {
      const a = await need('clips'); if (a.role !== 'player' && a.role !== 'parent') throw new HttpError(403, 'Only the player or a parent can add clips.');
      if (!env.BLOBS) throw new HttpError(503, 'Clip storage isn’t configured on this server yet.');
      const pid = req.headers.get('x-player-id') ?? ''; const s = await repo.load(); const p = s.players.find((x) => x.id === pid); if (!p || !canSeePlayer(a, p)) throw new HttpError(404, 'Not found');
      const declared = Number(req.headers.get('content-length') ?? 0); if (declared > CLIP_MAX_BYTES) throw new HttpError(413, clipError({ mime: 'video/mp4', bytes: declared, durationSec: 1 })!);
      const bytes = new Uint8Array(await req.arrayBuffer()); const sniffed = sniffMime(bytes); const mime = sniffed ?? normalizeMime(req.headers.get('content-type') ?? '');
      if (!sniffed) throw new HttpError(415, 'Clips must be MP4, MOV or WebM video.');
      const err = clipError({ mime, bytes: bytes.length, durationSec: videoDuration(bytes) }); if (err) throw new HttpError(bytes.length > CLIP_MAX_BYTES ? 413 : 422, err);
      const clipId = newId('clip'); const key = `clips/${p.id}/${clipId}`; await env.BLOBS.put(key, bytes, mime);
      try { await runCommand(env, a, { type: 'registerClip', playerId: p.id, clipId, storageKey: key, mime, bytes: bytes.length, durationSec: videoDuration(bytes)!, watchFor: decodeURIComponent(req.headers.get('x-watch-for') ?? '') }); }
      catch (e) { await env.BLOBS.delete(key).catch(() => undefined); throw e; }
      const s2 = await repo.load(); return json({ clip: s2.clips.find((c) => c.id === clipId), snapshot: scopeSnapshot(s2, a) });
    }
    const cm = path.match(/^\/api\/clips\/([\w-]+)$/);
    if (cm && req.method === 'GET') {
      const a = await need('clips'); const s = await repo.load(); const c = s.clips.find((x) => x.id === cm[1]); const p = c && s.players.find((x) => x.id === c.playerId);
      if (!c || !canSeeClip(a, p, c)) throw new HttpError(404, 'Not found'); // 404, not 403: don't confirm a clip exists
      const priv = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes', ...cors };
      if (c.storageKey.startsWith('demo/') && !(env.BLOBS && (await env.BLOBS.get(c.storageKey, { offset: 0, length: 1 })))) return new Response(null, { status: 302, headers: { location: `${env.APP_URL ?? ''}/${c.storageKey}`, ...priv } });
      if (!env.BLOBS) throw new HttpError(503, 'Clip storage isn’t configured.');
      const rg = (req.headers.get('range') ?? '').match(/^bytes=(\d+)-(\d*)$/); const start = rg ? Number(rg[1]) : 0; const end = rg && rg[2] ? Number(rg[2]) : undefined;
      const o = await env.BLOBS.get(c.storageKey, rg ? { offset: start, length: end !== undefined ? end - start + 1 : undefined } : undefined); if (!o) throw new HttpError(404, 'Not found');
      if (!rg) return new Response(o.body as BodyInit, { headers: { 'content-type': c.mime, 'content-length': String(o.size), ...priv } });
      const last = end !== undefined ? Math.min(end, o.size - 1) : o.size - 1;
      return new Response(o.body as BodyInit, { status: 206, headers: { 'content-type': c.mime, 'content-range': `bytes ${start}-${last}/${o.size}`, 'content-length': String(last - start + 1), ...priv } });
    }
    if (path === '/api/queue') { const a = await need('snapshot'); const s = scopeSnapshot(await repo.load(), a); return json({ coach: buildQueue(s, a.role === 'assistant' ? a.id : undefined), ops: a.role === 'ops' || a.role === 'head' ? buildOpsQueue(s) : [] }); }
    if (path === '/api/team') { await need('team'); return json(teamLoad(await repo.load())); }
    if (path === '/api/audit') { await need('audit'); const s = await repo.load(); return json(s.events.slice(-Number(url.searchParams.get('limit') ?? 200)).reverse()); }
    // ---------- v7 Web Push (opt-in per device) ----------
    if (path === '/api/push/key') return json({ mode: pushMode(env), publicKey: env.VAPID_PUBLIC_KEY ?? null });
    if (path === '/api/push/status') { const a = await me(); if (!a) throw new HttpError(401, 'Sign in required'); return json({ mode: pushMode(env), devices: await repo.countPushSubs(a.id) }); }
    if (path === '/api/push/subscribe' && req.method === 'POST') {
      const a = await me(); if (!a) throw new HttpError(401, 'Sign in required'); const b = await body<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>();
      const ep = String(b.endpoint ?? ''), pk = String(b.keys?.p256dh ?? ''), au = String(b.keys?.auth ?? '');
      if (!validPushEndpoint(ep) || ep.length > 1000) throw new HttpError(400, 'That push endpoint isn’t from a known browser push service.');
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(pk) || !/^[A-Za-z0-9_-]{16,32}$/.test(au)) throw new HttpError(400, 'Push keys look wrong.');
      await repo.savePushSub(a.id, { endpoint: ep, p256dh: pk, auth: au }); return json({ ok: true, mode: pushMode(env) });
    }
    if (path === '/api/push/unsubscribe' && req.method === 'POST') { const a = await me(); if (!a) throw new HttpError(401, 'Sign in required'); const b = await body<{ endpoint?: string }>(); await repo.deletePushSub(String(b.endpoint ?? ''), a.id); return json({ ok: true }); }
    if (path === '/api/outbox') { await need('outbox'); return json((await repo.outbox(200, url.searchParams.get('status') ?? undefined)).results); }
    if (path === '/api/outbox/retry' && req.method === 'POST') { await need('outbox'); const b = await body<{ id: string }>(); await repo.requeueEmail(b.id); await deliver(env); return json({ ok: true }); }
    // ---------- v6 billing (Stripe test mode, or the built-in simulator when no key is set) ----------
    if (path === '/api/stripe/webhook' && req.method === 'POST') {
      const payload = await req.text(); const sim = stripeMode(env) === 'simulated'; const whsec = env.STRIPE_WEBHOOK_SECRET ?? (sim ? await simulatorSecret(env) : '');
      if (!whsec) throw new HttpError(503, 'STRIPE_WEBHOOK_SECRET is not set.');
      if (!(await verifyStripe(payload, req.headers.get('stripe-signature'), whsec))) throw new HttpError(400, 'Bad signature');
      return json(await processStripeEvent(env, payload));
    }
    if (path === '/api/billing/checkout' && req.method === 'POST') {
      const a = await need('billing'); if (a.role !== 'parent') throw new HttpError(403, 'Checkout is for the family’s parent account.');
      const b = await body<{ playerId: string; tier?: Tier }>(); const s = await repo.load(); const p = s.players.find((x) => x.id === b.playerId); if (!p || !canSeePlayer(a, p)) throw new HttpError(404, 'Not found');
      const tier: Tier = TIERS.includes(b.tier as Tier) ? (b.tier as Tier) : p.tier; const block = checkoutBlock(s, p, tier); if (block) return json(block, 409);
      const back = p.state === 'Onboarding' ? `${app}/#/welcome?p=${p.id}` : `${app}/#/parent?p=${p.id}&tab=billing`; const mode = stripeMode(env);
      if (mode === 'simulated') return json({ url: `${app}/#/checkout?p=${p.id}&tier=${encodeURIComponent(tier)}`, simulated: true });
      if (mode === 'live' && env.STRIPE_ALLOW_LIVE !== '1') throw new HttpError(503, 'Live Stripe keys are switched off (test mode only). Set STRIPE_ALLOW_LIVE=1 when you are ready to charge real cards.');
      const price = priceId(env, tier); if (!price) throw new HttpError(503, `The Stripe price for ${tier} isn’t configured (STRIPE_PRICE_*).`);
      const u = await repo.userById(a.id); const sess = await new StripeClient(env.STRIPE_SECRET_KEY!).checkout({ price, playerId: p.id, tier, email: (u?.email as string) ?? null, customer: subscriptionOf(s, p.id)?.customerId, successUrl: `${back}&paid=1`, cancelUrl: `${back}&canceled=1` });
      return json({ url: sess.url });
    }
    if (path === '/api/billing/portal' && req.method === 'POST') {
      const a = await need('billing'); const b = await body<{ playerId: string }>(); const s = await repo.load(); const p = s.players.find((x) => x.id === b.playerId); if (!p || !canSeePlayer(a, p)) throw new HttpError(404, 'Not found');
      if (stripeMode(env) === 'simulated') return json({ url: `${app}/#/billing/portal?p=${p.id}`, simulated: true });
      const cus = subscriptionOf(s, p.id)?.customerId; if (!cus) throw new HttpError(409, 'No Stripe customer yet: choose a plan first.');
      return json({ url: (await new StripeClient(env.STRIPE_SECRET_KEY!).portal(cus, `${app}/#/parent?p=${p.id}&tab=billing`)).url });
    }
    if (path === '/api/billing/simulate' && req.method === 'POST') {
      const a = await need('billing'); if (stripeMode(env) !== 'simulated') throw new HttpError(403, 'The billing simulator is only on when no Stripe key is set.');
      const b = await body<{ playerId: string; outcome: MockOutcome; tier?: Tier }>(); const s = await repo.load(); const p = s.players.find((x) => x.id === b.playerId); if (!p || !canSeePlayer(a, p)) throw new HttpError(404, 'Not found');
      const familyOk: string[] = ['checkout', 'cancel', 'reactivate', 'invoice_paid', 'switch:Foundation', 'switch:Development', 'switch:Inner Circle']; if (a.role === 'parent' && !familyOk.includes(b.outcome)) throw new HttpError(403, 'Staff-only simulation.');
      if (b.outcome === 'checkout') { const block = checkoutBlock(s, p, b.tier ?? p.tier); if (block) return json(block, 409); }
      if (b.outcome.startsWith('switch:')) { const block = b.outcome === 'switch:Inner Circle' && p.tier !== 'Inner Circle' ? checkoutBlock({ ...s, subscriptions: [] }, { ...p, billing: 'paid' }, 'Inner Circle') : null; if (block?.waitlist) return json(block, 409); }
      const whsec = await simulatorSecret(env); const results = [];
      for (const e of mockStripeEvents(s, p.id, b.outcome, b.tier)) { const payload = JSON.stringify(e); const sig = await signStripe(payload, whsec); if (!(await verifyStripe(payload, sig, whsec))) throw new HttpError(500, 'Simulator signature failed'); results.push(await processStripeEvent(env, payload)); }
      return json({ ok: true, results, snapshot: scopeSnapshot(await repo.load(), a) });
    }
    if (path === '/api/notifications') { const a = await need('notifications'); return json((await repo.load()).notifications.filter((n) => n.userId === a.id).reverse()); }
    const ex = path.match(/^\/api\/players\/([\w-]+)\/export\.csv$/);
    if (ex) { const a = await need('export'); const s = await repo.load(); const p = s.players.find((x) => x.id === ex[1]); if (!p || !canSeePlayer(a, p)) throw new HttpError(404, 'Not found'); return new Response(playerCsv(s, p.id), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${p.name.replace(/\W+/g, '-')}.csv"`, ...cors } }); }
    if (path === '/api/calendar-link') { const a = await need('calendar'); return json({ url: `${url.origin}/api/calendar/${a.id}/${(await hmac(secret, 'cal:' + a.id)).slice(0, 32)}.ics` }); }
    const cal = path.match(/^\/api\/calendar\/([\w-]+)\/([a-f0-9]{32})\.ics$/);
    if (cal) { if ((await hmac(secret, 'cal:' + cal[1])).slice(0, 32) !== cal[2]) throw new HttpError(403, 'Bad calendar link'); const u = await repo.userById(cal[1]); if (!u) throw new HttpError(404, 'Not found'); const a: Actor = { id: u.id as string, role: u.role as UserRole, familyId: u.family_id as string, playerId: u.player_id as string }; return new Response(calendarIcs(scopeSnapshot(await repo.load(), a)), { headers: { 'content-type': 'text/calendar; charset=utf-8' } }); }
    if (path === '/api/staff' && req.method === 'POST') {
      const a = await need('staff'); const b = await body<{ name: string; email: string; role: 'assistant' | 'ops' }>(); const r = await runCommand(env, a, { type: 'inviteStaff', ...b });
      const tok = newToken(); await repo.createPasswordToken(await hmac(secret, tok), r.created!.userId!, 72); await queueEmail(env, 'password', b.email.trim().toLowerCase(), { token: tok, hours: 72 }, r.created!.userId!); await deliver(env); return json({ ok: true });
    }
    if (path === '/api/demo/reset' && req.method === 'POST') { if (env.DEMO !== '1') throw new HttpError(403, 'Demo mode is off'); await wipe(env.DB); await seedDb(env.DB); return json({ ok: true }); }
    if (path === '/api/demo/sweep' && req.method === 'POST') { if (env.DEMO !== '1') throw new HttpError(403, 'Demo mode is off'); await scheduled(env, url.searchParams.get('cron') ?? '*/15 * * * *'); return json({ ok: true }); }
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof PermissionError) return json({ error: e.message }, 403);
    if (e instanceof ConflictError) return json({ error: e.message, conflict: true }, 409);
    if (e instanceof WorkflowError) return json({ error: e.message }, 409);
    console.error(e); return json({ error: 'Server error' }, 500);
  }
}
async function wipe(db: Db) {
  const tables = ['events', 'timeline_notes', 'wins', 'games', 'billing_events', 'subscriptions', 'push_subscriptions', 'oauth_identities', 'magic_tokens', 'clips', 'reflections', 'cycle_reviews', 'data_requests', 'outbox', 'notifications', 'meetings', 'digests', 'milestones', 'habits', 'messages', 'reviews', 'submissions', 'assignments', 'templates', 'drills', 'cycles', 'consents', 'invites', 'applications', 'auth_sessions', 'password_tokens', 'credentials', 'login_attempts', 'users', 'players', 'families', 'settings', 'meta'];
  await db.batch([db.prepare('PRAGMA defer_foreign_keys = ON'), ...tables.map((t) => db.prepare(`DELETE FROM ${t}`))]);
}
export type { Snapshot };
