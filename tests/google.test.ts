import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE, googleStart, pkceChallenge, readOAuthCookie, resetJwksCache, verifyIdToken } from '../server/google';
import { b64u } from '../server/push';
import { googleLink } from '../shared/google';
import { seed } from '../shared/seed';
import { client, makeEnv } from './helpers';

const CID = 'test-client.apps.googleusercontent.com'; const enc = new TextEncoder();
/** A throwaway RSA key standing in for Google's signing key; the mocked JWKS publishes its public half. */
async function signer(kid = 'k1') {
  const kp = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const sign = async (claims: object, head: object = { alg: 'RS256', kid, typ: 'JWT' }) => { const h = b64u(enc.encode(JSON.stringify(head))); const c = b64u(enc.encode(JSON.stringify(claims))); return `${h}.${c}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, enc.encode(`${h}.${c}`)))}`; };
  return { jwk, sign };
}
const NOW = Math.floor(Date.now() / 1000) * 1000; // real clock: the HTTP flow below verifies the token against Date.now()
const claims = (o: object = {}) => ({ iss: 'https://accounts.google.com', aud: CID, sub: 'g-123', email: 'dana@demo.test', email_verified: true, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3600, nonce: 'n1', ...o });
const jwksFetch = (keys: object[]) => (async (u: string) => { if (u === GOOGLE.jwks) return Response.json({ keys }); throw new Error('unexpected ' + u); }) as unknown as typeof fetch;
afterEach(() => { resetJwksCache(); vi.unstubAllGlobals(); });

describe('ID token verification (mocked JWKS)', () => {
  it('accepts a valid RS256 token and returns the claims we use', async () => {
    const k = await signer(); const t = await k.sign(claims());
    expect(await verifyIdToken(t, { clientId: CID, nonce: 'n1', now: NOW, fetch: jwksFetch([k.jwk]) })).toEqual({ sub: 'g-123', email: 'dana@demo.test', email_verified: true, name: undefined });
  });
  it('rejects wrong audience, issuer, nonce, expiry, signature, unknown kid and alg=none', async () => {
    const k = await signer(); const other = await signer(); const f = jwksFetch([k.jwk]); const v = (t: string) => verifyIdToken(t, { clientId: CID, nonce: 'n1', now: NOW, fetch: f });
    await expect(v(await k.sign(claims({ aud: 'someone-else' })))).rejects.toThrow('aud');
    await expect(v(await k.sign(claims({ iss: 'https://evil.example' })))).rejects.toThrow('iss');
    await expect(v(await k.sign(claims({ nonce: 'replayed' })))).rejects.toThrow('nonce');
    await expect(v(await k.sign(claims({ exp: NOW / 1000 - 3600 })))).rejects.toThrow('expired');
    await expect(v(await other.sign(claims()))).rejects.toThrow('signature');
    resetJwksCache(); const k2 = await signer('k2'); await expect(v(await k2.sign(claims()))).rejects.toThrow('unknown key');
    const t = await k.sign(claims()); const [, c, s] = t.split('.'); await expect(v(`${b64u(enc.encode('{"alg":"none","kid":"k1"}'))}.${c}.${s}`)).rejects.toThrow('alg');
  });
  it('PKCE S256 matches the RFC 7636 test vector', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('state cookie is signed and expires', async () => {
    const g = await googleStart({ GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: 'x' }, 'https://app.test', 'sec', '/parent', true, NOW);
    const req = (c: string) => new Request('https://app.test/', { headers: { cookie: c.split(';')[0] } });
    expect((await readOAuthCookie(req(g.cookie), 'sec', NOW))?.state).toBe(g.st.state);
    expect(await readOAuthCookie(req(g.cookie), 'other-secret', NOW)).toBeNull();
    expect(await readOAuthCookie(req(g.cookie), 'sec', NOW + 11 * 60e3)).toBeNull();
    expect(g.cookie).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const u = new URL(g.url); expect(u.searchParams.get('code_challenge')).toBe(await pkceChallenge(g.st.verifier)); expect(u.searchParams.get('code_challenge_method')).toBe('S256'); expect(u.searchParams.get('nonce')).toBe(g.st.nonce); expect(u.searchParams.get('redirect_uri')).toBe('https://app.test/api/auth/google/callback');
  });
});

describe('account linking: invited accounts only', () => {
  const s = seed(); const c = (o: object = {}) => ({ sub: 'g-1', email: 'dana@demo.test', email_verified: true, ...o });
  it('signs in an existing account by verified email and links it', () => { expect(googleLink(s, [], c())).toMatchObject({ kind: 'signin', role: 'parent', link: true }); });
  it('never creates an account: unknown email is refused', () => { expect(googleLink(s, [], c({ email: 'stranger@example.com' }))).toEqual({ kind: 'refuse', reason: 'no-account' }); });
  it('requires email_verified', () => { expect(googleLink(s, [], c({ email_verified: false }))).toEqual({ kind: 'refuse', reason: 'unverified' }); });
  it('a pending invite routes to the invite flow (consent first)', () => {
    const inv = s.invites.find((i) => i.status === 'pending'); if (!inv) return; expect(googleLink(s, [], c({ email: inv.email.toUpperCase() }))).toMatchObject({ kind: 'invite' });
  });
  it('a linked sub wins over email; a second Google account cannot take over a linked user', () => {
    const u = s.users.find((x) => x.email === 'dana@demo.test')!;
    expect(googleLink(s, [{ sub: 'g-1', userId: u.id }], c({ email: 'changed@gmail.com' }))).toMatchObject({ kind: 'signin', userId: u.id, link: false });
    expect(googleLink(s, [{ sub: 'g-other', userId: u.id }], c())).toEqual({ kind: 'refuse', reason: 'linked-elsewhere' });
  });
  it('under-13 players use their PIN, not Google', () => {
    const t = structuredClone(s); const p = t.players.find((x) => x.age < 13)!; const u = t.users.find((x) => x.playerId === p.id && x.role === 'player')!; u.email = 'kid@example.com';
    expect(googleLink(t, [], c({ email: 'kid@example.com' }))).toEqual({ kind: 'refuse', reason: 'young-player' });
  });
});

describe('Google sign-in over HTTP (mocked Google)', () => {
  const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().find((x) => x.startsWith(name + '='))!.split(';')[0];
  async function flow(email: string, mutate: (st: { state: string; nonce: string }) => object = () => ({})) {
    const env = await makeEnv({ GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: 'shh', APP_URL: 'https://app.test' }); const { handle } = await import('../server/app');
    const start = await handle(new Request('https://app.test/api/auth/google/start?next=/parent'), env); expect(start.status).toBe(302);
    const goog = new URL(start.headers.get('location')!); const st = { state: goog.searchParams.get('state')!, nonce: goog.searchParams.get('nonce')! };
    const k = await signer(); const idt = await k.sign(claims({ email, nonce: st.nonce, ...mutate(st) })); let sentVerifier = '';
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      if (u === GOOGLE.jwks) return Response.json({ keys: [k.jwk] });
      if (u === GOOGLE.token) { sentVerifier = new URLSearchParams(String(init?.body)).get('code_verifier') ?? ''; return Response.json({ id_token: idt }); }
      throw new Error('unexpected fetch ' + u);
    });
    const cb = await handle(new Request(`https://app.test/api/auth/google/callback?code=c1&state=${st.state}`, { headers: { cookie: cookieOf(start, 'bc_oauth') } }), env);
    return { env, cb, sentVerifier, goog };
  }
  it('existing parent: session cookie + redirect home, PKCE verifier sent', async () => {
    const r = await flow('dana@demo.test'); expect(r.cb.status).toBe(302); expect(r.cb.headers.get('location')).toBe('https://app.test/#/parent');
    expect(await pkceChallenge(r.sentVerifier)).toBe(r.goog.searchParams.get('code_challenge'));
    const sess = cookieOf(r.cb, 'bc_session'); const me = await client(r.env, sess).get('/api/auth/me'); expect(me.status).toBe(200); expect(JSON.stringify(me.body)).toContain('parent');
  });
  it('unknown email: no session, explained on the sign-in page', async () => {
    const r = await flow('stranger@example.com'); expect(r.cb.headers.get('location')).toBe('https://app.test/#/login?google=no-account'); expect(r.cb.headers.getSetCookie().some((c) => c.startsWith('bc_session=') && !c.includes('Max-Age=0'))).toBe(false);
  });
  it('tampered state or replayed nonce is refused', async () => {
    const env = await makeEnv({ GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: 'shh', APP_URL: 'https://app.test' }); const { handle } = await import('../server/app');
    const start = await handle(new Request('https://app.test/api/auth/google/start'), env);
    const bad = await handle(new Request('https://app.test/api/auth/google/callback?code=c&state=forged', { headers: { cookie: cookieOf(start, 'bc_oauth') } }), env); expect(bad.headers.get('location')).toMatch(/google=error$/);
    const r = await flow('dana@demo.test', () => ({ nonce: 'old-nonce' })); expect(r.cb.headers.get('location')).toMatch(/google=error$/);
  });
  it('without GOOGLE_CLIENT_ID it is off, and says so', async () => {
    const env = await makeEnv({ APP_URL: 'https://app.test' }); const { handle } = await import('../server/app');
    expect((await handle(new Request('https://app.test/api/auth/google/start'), env)).headers.get('location')).toBe('https://app.test/#/login?google=off');
  });
});
