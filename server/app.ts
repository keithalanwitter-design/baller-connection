import type { Command, Snapshot, UserRole } from '../shared/domain';
import { ConflictError, dispatch, id as newId, WorkflowError } from '../shared/engine';
import { ENDPOINT_ROLES, PermissionError, SYSTEM, PUBLIC, canSeePlayer, scopeSnapshot, type Actor, type Endpoint } from '../shared/permissions';
import { DEMO_PASSWORD, DEMO_PIN, seed } from '../shared/seed';
import { buildOpsQueue, buildQueue, teamLoad, TRANSITIONS } from '../shared/workflow';
import { COOKIE, hashSecret, hmac, newToken, readToken, sessionCookie, verifySecret } from './auth';
import type { Db } from './db';
import { makeProvider } from './email';
import { Repo } from './repo';
import { playerCsv, calendarIcs } from './export';
import type { BlobStore } from './blobs';
import { CLIP_MAX_BYTES, canSeeClip, clipError, normalizeMime, sniffMime, videoDuration } from '../shared/clips';

export interface Env { DB: Db; SESSION_SECRET?: string; EMAIL_PROVIDER?: string; EMAIL_API_KEY?: string; EMAIL_FROM?: string; APP_URL?: string; DEMO?: string; ALLOW_ORIGIN?: string; SEED?: string; OWNER_EMAIL?: string; OWNER_NAME?: string; /** Clip bytes: R2 (Worker) or local disk (Node). Without it, uploads answer 503. */ BLOBS?: BlobStore }
class HttpError extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status; } }
const SYSTEM_ONLY = new Set(['sweep', 'advanceClock']);
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
  await deliver(env); return r;
}
/** Once a real provider has the mail, the outbox copy no longer needs the invite/reset secret. (The Log provider keeps it: it IS the delivery in dev.) */
export const redactSecrets = (b: string) => b.replace(/token=[A-Za-z0-9_-]+/g, 'token=[sent]').replace(/code \d{6}/g, 'code [sent]');
export async function deliver(env: Env) {
  const repo = new Repo(env.DB); const p = makeProvider(env); const app = env.APP_URL ?? '';
  for (const m of (await repo.queuedEmails()).results) { try { const st = await p.send({ to: m.to, subject: m.subject, body: m.body.replaceAll(' /invite', ` ${app}/#/invite`).replaceAll(' /reset', ` ${app}/#/reset`) }); await repo.markEmail(m.id, st); if (st === 'sent') await repo.setEmailBody(m.id, redactSecrets(m.body)); } catch { await repo.markEmail(m.id, 'failed'); } }
}
/** Cron: SLA/overdue sweep every run; weekly digests on the Sunday schedule; then a per-user notification email digest. */
export async function scheduled(env: Env, cron: string) {
  await runCommand(env, SYSTEM, { type: 'sweep' });
  if (cron === '0 23 * * SUN') await runCommand(env, SYSTEM, { type: 'generateDigests' });
  const repo = new Repo(env.DB); const pending = (await repo.unemailedNotifications()).results; const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
  for (const [, list] of byUser) { const u = list[0]; if (u.email) await repo.insertEmail({ id: newId('em'), to: u.email, subject: `${list.length} update${list.length > 1 ? 's' : ''} from Baller Connection`, body: `Hi ${u.name},\n\n${list.map((n) => `• ${n.text}`).join('\n')}\n\nOpen the app to act on these.`, kind: 'notification-digest', status: 'queued' }); await repo.markEmailed(list.map((n) => n.id)); }
  await deliver(env);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url); const path = url.pathname.replace(/\/+$/, ''); const origin = req.headers.get('origin');
  const cors: Record<string, string> = env.ALLOW_ORIGIN && origin === env.ALLOW_ORIGIN ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type, authorization, x-player-id, x-watch-for, range', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' } : {};
  const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...extra } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const repo = new Repo(env.DB); const secret = env.SESSION_SECRET ?? 'dev-only-secret-change-me'; const secure = url.protocol === 'https:';
  const body = async <T,>() => (req.method === 'POST' ? ((await req.json().catch(() => ({}))) as T) : ({} as T));
  const startSession = async (userId: string) => { const tok = newToken(); await repo.createSession(await hmac(secret, tok), userId, 30, req.headers.get('user-agent') ?? ''); return { 'set-cookie': sessionCookie(tok, secure), 'x-session-token': tok }; };
  const me = async (): Promise<Actor & { name: string; role: UserRole } | null> => { const t = readToken(req); if (!t) return null; const u = await repo.sessionUser(await hmac(secret, t)); return u ? { id: u.id as string, role: u.role as UserRole, name: u.name as string, familyId: u.family_id as string | null, playerId: u.player_id as string | null } : null; };
  const need = async (ep: Endpoint) => { const a = await me(); if (!a) throw new HttpError(401, 'Sign in required'); if (!ENDPOINT_ROLES[ep].includes(a.role)) throw new HttpError(403, `${a.role} can’t access ${ep}`); return a; };
  try {
    await ensureSeeded(env);
    if (path === '/api/health') return json({ ok: true, version: await repo.version(), demo: env.DEMO === '1', email: makeProvider(env).name });
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
    if (path === '/api/auth/me') { const a = await me(); return a ? json({ user: a }) : json({ user: null }, 401); }
    if (path === '/api/auth/accept-invite' && req.method === 'POST') {
      const b = await body<{ token?: string; code?: string; parentName: string; email: string; password: string }>();
      if (!b.password || b.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
      if (await repo.userByLogin(b.email ?? '')) throw new HttpError(409, 'An account with that email exists. Sign in instead.');
      const ipKey = `invite:${req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'local'}`; if ((await repo.recentFailures(ipKey)) >= 5) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
      const uid = newId('usr'); const r = await runCommand(env, PUBLIC, { type: 'acceptInvite', token: b.token, code: b.code, parentName: b.parentName, email: b.email, userId: uid }).catch(async (e) => { if (e instanceof WorkflowError) await repo.recordFailure(ipKey); throw e; });
      const userId = r.created?.userId ?? uid; await repo.setCredential(userId, 'password_hash', await hashSecret(b.password));
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
      if (u?.email) { const tok = newToken(); await repo.createPasswordToken(await hmac(secret, tok), u.id as string, 2); await repo.insertEmail({ id: newId('em'), to: u.email as string, subject: 'Set your Baller Connection password', body: `Set your password (link valid 2 hours): /reset?token=${tok}`, kind: 'password', status: 'queued' }); await deliver(env); }
      return json({ ok: true });
    }
    if (path === '/api/auth/reset-password' && req.method === 'POST') {
      const b = await body<{ token: string; password: string }>(); if (!b.password || b.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
      const uid = await repo.usePasswordToken(await hmac(secret, b.token ?? '')); if (!uid) throw new HttpError(400, 'That link is invalid or expired.');
      await repo.setCredential(uid, 'password_hash', await hashSecret(b.password)); return json({ ok: true }, 200, await startSession(uid));
    }
    // ---------- public intake ----------
    if (path === '/api/apply' && req.method === 'POST') { const b = await body<Command>(); if (b.type !== 'submitApplication') throw new HttpError(400, 'Bad request'); const r = await runCommand(env, (await me()) ?? PUBLIC, b); return json({ ok: true, playerId: r.created?.playerId }); }
    // ---------- app ----------
    if (path === '/api/snapshot') { const a = await need('snapshot'); return json({ me: a, snapshot: scopeSnapshot(await repo.load(), a) }); }
    if (path === '/api/commands' && req.method === 'POST') {
      const a = await need('commands'); const cmd = await body<Command>();
      if (SERVER_ONLY.has(cmd.type)) throw new HttpError(403, 'Clips are added by uploading them.');
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
    if (path === '/api/outbox') { await need('outbox'); return json((await repo.outbox()).results); }
    if (path === '/api/notifications') { const a = await need('notifications'); return json((await repo.load()).notifications.filter((n) => n.userId === a.id).reverse()); }
    const ex = path.match(/^\/api\/players\/([\w-]+)\/export\.csv$/);
    if (ex) { const a = await need('export'); const s = await repo.load(); const p = s.players.find((x) => x.id === ex[1]); if (!p || !canSeePlayer(a, p)) throw new HttpError(404, 'Not found'); return new Response(playerCsv(s, p.id), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${p.name.replace(/\W+/g, '-')}.csv"`, ...cors } }); }
    if (path === '/api/calendar-link') { const a = await need('calendar'); return json({ url: `${url.origin}/api/calendar/${a.id}/${(await hmac(secret, 'cal:' + a.id)).slice(0, 32)}.ics` }); }
    const cal = path.match(/^\/api\/calendar\/([\w-]+)\/([a-f0-9]{32})\.ics$/);
    if (cal) { if ((await hmac(secret, 'cal:' + cal[1])).slice(0, 32) !== cal[2]) throw new HttpError(403, 'Bad calendar link'); const u = await repo.userById(cal[1]); if (!u) throw new HttpError(404, 'Not found'); const a: Actor = { id: u.id as string, role: u.role as UserRole, familyId: u.family_id as string, playerId: u.player_id as string }; return new Response(calendarIcs(scopeSnapshot(await repo.load(), a)), { headers: { 'content-type': 'text/calendar; charset=utf-8' } }); }
    if (path === '/api/staff' && req.method === 'POST') {
      const a = await need('staff'); const b = await body<{ name: string; email: string; role: 'assistant' | 'ops' }>(); const r = await runCommand(env, a, { type: 'inviteStaff', ...b });
      const tok = newToken(); await repo.createPasswordToken(await hmac(secret, tok), r.created!.userId!, 72); await repo.insertEmail({ id: newId('em'), to: b.email, subject: 'Set your password', body: `Set your password: /reset?token=${tok}`, kind: 'password', status: 'queued' }); await deliver(env); return json({ ok: true });
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
  const tables = ['events', 'clips', 'reflections', 'cycle_reviews', 'data_requests', 'outbox', 'notifications', 'meetings', 'digests', 'milestones', 'habits', 'messages', 'reviews', 'submissions', 'assignments', 'templates', 'drills', 'cycles', 'consents', 'invites', 'applications', 'auth_sessions', 'password_tokens', 'credentials', 'login_attempts', 'users', 'players', 'families', 'settings', 'meta'];
  await db.batch([db.prepare('PRAGMA defer_foreign_keys = ON'), ...tables.map((t) => db.prepare(`DELETE FROM ${t}`))]);
}
export type { Snapshot };
