import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Notification, Snapshot } from '../shared/domain';
import { dispatch } from '../shared/engine';
import { seed } from '../shared/seed';
import { clock } from '../shared/workflow';
import { pushDecision, pushEventOf, validPushEndpoint } from '../shared/push';
import { b64u, encryptPayload, unb64u, vapidAuth, pushMode } from '../server/push';
import { pushNew } from '../server/app';
import { Repo } from '../server/repo';
import { client, login, makeEnv } from './helpers';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const png = (p: string) => { const b = readFileSync(new URL(p, root)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

describe('web app manifest', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));
  it('is installable under the GitHub Pages base path (relative scope/start_url)', () => {
    expect(m.display).toBe('standalone'); expect(m.scope).toBe('./'); expect(m.start_url.startsWith('./')).toBe(true);
    const base = 'https://x.github.io/baller-connection/manifest.webmanifest'; const scope = new URL(m.scope, base).href;
    expect(scope).toBe('https://x.github.io/baller-connection/'); expect(new URL(m.start_url, base).href.startsWith(scope)).toBe(true);
    expect(m.theme_color).toBe('#0A1430'); expect(m.background_color).toBeTruthy(); expect(m.name).toBe('Baller Connection'); expect(m.short_name.length).toBeLessThanOrEqual(12);
  });
  it('ships 192 + 512 icons, maskable variants and an apple-touch-icon, at their real sizes', () => {
    for (const i of m.icons) { const [w, h] = i.sizes.split('x').map(Number); expect(png(`public/${i.src}`)).toEqual({ w, h }); }
    expect(m.icons.some((i: { sizes: string; purpose: string }) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(m.icons.some((i: { sizes: string; purpose: string }) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(png('public/icons/apple-touch-icon.png')).toEqual({ w: 180, h: 180 });
    const html = read('index.html'); expect(html).toContain('href="%BASE_URL%manifest.webmanifest"'); expect(html).toContain('apple-touch-icon'); expect(html).toContain('theme-color');
    expect(existsSync(new URL('public/offline.html', root))).toBe(true);
  });
});

/** Runs the real sw.js in a sandbox with fake caches, so we can see exactly what it would store. */
async function sandboxSW(scope = 'https://x.github.io/baller-connection/') {
  const stored: string[] = []; const listeners: Record<string, (e: unknown) => void> = {}; const responded: Record<string, boolean> = {};
  const cache = { addAll: async (l: string[]) => { stored.push(...l); }, put: async (r: Request) => { stored.push(r.url); } };
  const self = { registration: { scope, showNotification: async () => undefined }, location: new URL(scope), addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; }, clients: { claim: async () => undefined }, skipWaiting: () => undefined };
  const fetchFn = async () => Object.defineProperty(new Response('ok', { status: 200 }), 'type', { value: 'basic' });
  const ctx = vm.createContext({ self, caches: { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true }, fetch: fetchFn, URL, Response, Request, Promise, console });
  vm.runInContext(read('pwa/sw.js').replace("'__VERSION__'", "'test'").replace('__SHELL__', JSON.stringify(['./', './index.html', './offline.html'])), ctx);
  const req = async (url: string, init: RequestInit & { mode?: string } = {}) => {
    const { mode, ...rest } = init; const r = new Request(url, rest); Object.defineProperty(r, 'mode', { value: mode ?? 'cors' }); let p: Promise<Response> | null = null;
    listeners.fetch({ request: r, respondWith: (x: Promise<Response>) => { p = x; } }); responded[url] = !!p; if (p) await p; await new Promise((res) => setTimeout(res, 5));
  };
  return { stored, listeners, req, responded };
}
describe('service worker scope + caching rules', () => {
  it('precaches only the shell, resolved under the base path', async () => {
    const sw = await sandboxSW(); let done: Promise<unknown> = Promise.resolve(); sw.listeners.install({ waitUntil: (p: Promise<unknown>) => { done = p; } }); await done;
    expect(sw.stored).toEqual(['https://x.github.io/baller-connection/', 'https://x.github.io/baller-connection/index.html', 'https://x.github.io/baller-connection/offline.html']);
  });
  it('NEVER touches API, clip, demo-video or authenticated responses; caches hashed assets', async () => {
    const sw = await sandboxSW(); const B = 'https://x.github.io/baller-connection/';
    for (const u of [`${B}api/snapshot`, `${B}api/clips/clip_1`, 'https://x.github.io/api/me', `${B}demo/clip.mp4`, `${B}clips/p/c1`, 'https://api.example.com/api/snapshot', 'https://fonts.googleapis.com/css2']) { await sw.req(u); expect(sw.responded[u], u).toBe(false); }
    await sw.req(`${B}assets/x.js`, { headers: { authorization: 'Bearer t' } }); expect(sw.responded[`${B}assets/x.js`]).toBe(false);
    await sw.req(`${B}api/commands`, { method: 'POST', body: '{}' }); expect(sw.stored).toEqual([]);
    await sw.req(`${B}assets/index-abc.js`); expect(sw.stored).toEqual([`${B}assets/index-abc.js`]);
    await sw.req(`${B}#/app`, { mode: 'navigate' }); expect(sw.stored).toHaveLength(1); // navigations are network-first, never stored
  });
  it('waits for the user before activating a new version (safe update prompt)', () => {
    const src = read('pwa/sw.js'); const install = src.slice(src.indexOf("addEventListener('install'"), src.indexOf("addEventListener('activate'"));
    expect(install).not.toMatch(/skipWaiting\(\)/); expect(src).toMatch(/e\.data === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
    expect(read('src/pwa.tsx')).toMatch(/register\(`\$\{BASE\}sw\.js`, \{ scope: BASE \}\)/);
  });
});

const note = (type: Notification['type'], dedupe: string, userId = 'u_chris'): Notification => ({ id: 'n_' + dedupe, userId, type, text: 'Coach Jordan left feedback.', link: '/parent', at: '2026-10-12T15:00:00Z', dedupe });
const noon = new Date('2026-10-12T17:00:00Z'); const night = new Date('2026-10-13T04:00:00Z'); // 12 PM / 11 PM CT
describe('push mapping → notification prefs + quiet hours', () => {
  it('maps the five events and nothing else', () => {
    expect(pushEventOf(note('feedback_ready', 'a'))).toBe('feedback'); expect(pushEventOf(note('rhythm', 'nudge:r1'))).toBe('nudge'); expect(pushEventOf(note('rhythm', 'rhythm:mid:p:w'))).toBe('nudge');
    expect(pushEventOf(note('new_message', 'm'))).toBe('reply'); expect(pushEventOf(note('rhythm', 'rhythm:plan:p:w'))).toBe('plan'); expect(pushEventOf(note('gameday', 'g'))).toBe('gameday');
    for (const t of ['billing', 'overdue', 'promise_risk', 'digest_ready', 'confidence'] as const) expect(pushEventOf(note(t, 'x'))).toBeNull();
  });
  it('follows the email category switches', () => {
    expect(pushDecision(note('feedback_ready', 'a'), null, noon)).toMatchObject({ title: 'Feedback ready', url: '#/parent' });
    expect(pushDecision(note('feedback_ready', 'a'), { coaching: false }, noon)).toBeNull();
    expect(pushDecision(note('gameday', 'g'), { coaching: false }, noon)).not.toBeNull(); expect(pushDecision(note('gameday', 'g'), { updates: false }, noon)).toBeNull();
  });
  it('skips pushes inside quiet hours (program timezone), honours custom and off', () => {
    expect(pushDecision(note('feedback_ready', 'a'), null, night)).toBeNull();
    expect(pushDecision(note('feedback_ready', 'a'), { quietStart: 0, quietEnd: 0 }, night)).not.toBeNull();
    expect(pushDecision(note('feedback_ready', 'a'), { quietStart: 11, quietEnd: 13 }, noon)).toBeNull();
    expect(pushDecision(note('feedback_ready', 'a'), null, night, 'America/Los_Angeles')).toBeNull();
  });
  it('accepts only real browser push services', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QX', 'https://wns2-by3p.notify.windows.com/w/?token=x']) expect(validPushEndpoint(ok), ok).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.com/x', 'https://169.254.169.254/', 'nonsense']) expect(validPushEndpoint(bad), bad).toBe(false);
  });
  it('game day card: one push-able notification on tournament day for the player only', () => {
    const s = seed(); const p = s.players.find((x) => x.id === 'riley')!; p.tournamentDate = clock(s).toISOString();
    const r = dispatch(s, { type: 'sweep' }, { id: 'system', role: 'system' }).snapshot; const g = r.notifications.filter((n) => n.type === 'gameday');
    expect(g.length).toBe(1); expect(r.users.find((u) => u.id === g[0].userId)?.role).toBe('player'); expect(g[0].text).toMatch(/^Game day card/);
    expect(dispatch(r, { type: 'sweep' }, { id: 'system', role: 'system' }).snapshot.notifications.filter((n) => n.type === 'gameday').length).toBe(1);
  });
});

async function uaKeys() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return { kp, p256dh: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}
async function hm(k: Uint8Array, d: Uint8Array) { return new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d as BufferSource)); }
const cat = (...a: Uint8Array[]) => Uint8Array.from(a.flatMap((x) => [...x]));
/** Receiver side of RFC 8291, written independently from the sender. */
async function decrypt(body: Uint8Array, ua: Awaited<ReturnType<typeof uaKeys>>) {
  const salt = body.slice(0, 16); const idlen = body[20]; const asPub = body.slice(21, 21 + idlen); const ct = body.slice(21 + idlen); const te = new TextEncoder();
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, ua.kp.privateKey, 256));
  const ikm = await hm(await hm(unb64u(ua.auth), shared), cat(te.encode('WebPush: info\0'), unb64u(ua.p256dh), asPub, new Uint8Array([1])));
  const prk = await hm(salt, ikm); const cek = (await hm(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16); const nonce = (await hm(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  expect(pt.at(-1)).toBe(2); return new TextDecoder().decode(pt.slice(0, -1));
}
/** Ephemeral test-only VAPID pair, generated in memory and thrown away (never a real key). */
async function testVapid() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair; const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { kp, env: { VAPID_PUBLIC_KEY: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: 'mailto:coach@example.com' } };
}
describe('web push crypto (VAPID + aes128gcm)', () => {
  it('encrypts so the browser side can decrypt it', async () => {
    const ua = await uaKeys(); const body = await encryptPayload({ endpoint: 'https://fcm.googleapis.com/x', p256dh: ua.p256dh, auth: ua.auth }, '{"title":"Feedback ready"}');
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096); expect(await decrypt(body, ua)).toBe('{"title":"Feedback ready"}');
  });
  it('signs a VAPID JWT for the push service origin that verifies with the public key', async () => {
    const v = await testVapid(); const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', v.env, Date.parse('2026-10-12T17:00:00Z'));
    const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!; expect(k).toBe(v.env.VAPID_PUBLIC_KEY); const [hd, cl, sig] = t.split('.');
    expect(JSON.parse(new TextDecoder().decode(unb64u(cl)))).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:coach@example.com', exp: Date.parse('2026-10-13T05:00:00Z') / 1000 });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, v.kp.publicKey, unb64u(sig), new TextEncoder().encode(`${hd}.${cl}`))).toBe(true);
  });
});

describe('push subscriptions API + delivery', () => {
  const sub = async () => { const ua = await uaKeys(); return { ua, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/dev-' + Math.random().toString(36).slice(2), keys: { p256dh: ua.p256dh, auth: ua.auth } } }; };
  it('requires sign-in, refuses unknown endpoints, stores per user, unsubscribes', async () => {
    const env = await makeEnv(); expect(pushMode(env)).toBe('log'); expect((await client(env).post('/api/push/subscribe', (await sub()).body)).status).toBe(401);
    const c = await login(env, 'chris@demo.test'); const s = await sub();
    expect((await c.post('/api/push/subscribe', { ...s.body, endpoint: 'https://evil.example/hook' })).status).toBe(400);
    expect((await c.post('/api/push/subscribe', { ...s.body, keys: { p256dh: 'x', auth: 'y' } })).status).toBe(400);
    expect((await c.post('/api/push/subscribe', s.body)).status).toBe(200); expect((await c.get('/api/push/status')).body.devices).toBe(1);
    expect((await c.get('/api/push/key')).body).toEqual({ mode: 'log', publicKey: null });
    expect((await c.post('/api/push/unsubscribe', { endpoint: s.body.endpoint })).status).toBe(200); expect((await c.get('/api/push/status')).body.devices).toBe(0);
  });
  it('sends encrypted pushes for mapped events only, respects prefs, and drops gone endpoints', async () => {
    const v = await testVapid(); const env = await makeEnv(v.env); const c = await login(env, 'chris@demo.test'); const s = await sub(); await c.post('/api/push/subscribe', s.body);
    const repo = new Repo(env.DB); const before = await repo.load(); const after: Snapshot = structuredClone(before);
    after.notifications.push(note('feedback_ready', 'fb1'), note('billing', 'bill1'), note('confidence', 'c1'));
    const calls: { url: string; init: RequestInit }[] = []; const ok = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: 201 }); }) as typeof fetch;
    expect(await pushNew(env, before.notifications, after, ok, noon)).toBe(1); expect(calls[0].url).toBe(s.body.endpoint);
    const h = calls[0].init.headers as Record<string, string>; expect(h['content-encoding']).toBe('aes128gcm'); expect(h.authorization).toMatch(/^vapid t=/);
    expect(JSON.parse(await decrypt(calls[0].init.body as Uint8Array, s.ua))).toMatchObject({ title: 'Feedback ready', url: '#/parent' });
    expect(await pushNew(env, before.notifications, after, ok, night)).toBe(0); // quiet hours
    await c.cmd({ type: 'setEmailPrefs', prefs: { coaching: false } }); const b2 = await repo.load(); const a2 = structuredClone(b2); a2.notifications.push(note('feedback_ready', 'fb2'));
    expect(await pushNew(env, b2.notifications, a2, ok, noon)).toBe(0);
    await c.cmd({ type: 'setEmailPrefs', prefs: { coaching: true } }); const b3 = await repo.load(); const a3 = structuredClone(b3); a3.notifications.push(note('feedback_ready', 'fb3'));
    const gone = (async () => new Response(null, { status: 410 })) as unknown as typeof fetch; await pushNew(env, b3.notifications, a3, gone, noon); expect((await c.get('/api/push/status')).body.devices).toBe(0);
  });
  it('sign out everywhere removes this user’s push devices', async () => {
    const env = await makeEnv(); const c = await login(env, 'chris@demo.test'); await c.post('/api/push/subscribe', (await sub()).body);
    await c.post('/api/auth/logout-all'); const c2 = await login(env, 'chris@demo.test'); expect((await c2.get('/api/push/status')).body.devices).toBe(0);
  });
});
