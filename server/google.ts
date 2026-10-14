/** Google sign-in: OAuth 2.0 authorization code + PKCE, state + nonce, ID token verified against Google's JWKS (RS256). WebCrypto only. */
import { b64u, unb64u } from './push';
export interface GoogleEnv { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }
export const GOOGLE = { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] };
export const googleOn = (env: GoogleEnv) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const OAUTH_COOKIE = 'bc_oauth';
const enc = new TextEncoder();
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function hmacB64(secret: string, data: string) { const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(data))); }
export const pkceChallenge = async (verifier: string) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
export const redirectUri = (appUrl: string) => `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;

export interface OAuthState { state: string; nonce: string; verifier: string; next: string; exp: number }
/** Start: returns Google's URL and a signed, HttpOnly, 10-minute cookie carrying state/nonce/PKCE verifier. */
export async function googleStart(env: GoogleEnv, appUrl: string, secret: string, next: string, secure: boolean, now = Date.now()) {
  const st: OAuthState = { state: rand(), nonce: rand(), verifier: rand(48), next: /^\/[\w/?=&.-]*$/.test(next) ? next : '', exp: now + 10 * 60e3 };
  const payload = b64u(enc.encode(JSON.stringify(st))); const cookie = `${OAUTH_COOKIE}=${payload}.${await hmacB64(secret, `oauth:${payload}`)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`;
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(appUrl), response_type: 'code', scope: 'openid email profile', state: st.state, nonce: st.nonce, code_challenge: await pkceChallenge(st.verifier), code_challenge_method: 'S256', prompt: 'select_account' });
  return { url: `${GOOGLE.auth}?${q}`, cookie, st };
}
export async function readOAuthCookie(req: Request, secret: string, now = Date.now()): Promise<OAuthState | null> {
  const raw = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1); if (!raw) return null;
  const [payload, sig] = raw.split('.'); if (!payload || !sig || sig !== (await hmacB64(secret, `oauth:${payload}`))) return null;
  try { const st = JSON.parse(new TextDecoder().decode(unb64u(payload))) as OAuthState; return st.exp > now ? st : null; } catch { return null; }
}
export const clearOAuthCookie = (secure: boolean) => `${OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

let jwksCache: { at: number; keys: JsonWebKey[] } | null = null;
export const resetJwksCache = () => { jwksCache = null; };
async function jwks(f: typeof fetch, now: number, force = false) {
  if (!force && jwksCache && now - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await f(GOOGLE.jwks); if (!r.ok) throw new Error('JWKS fetch failed'); const j = (await r.json()) as { keys: JsonWebKey[] }; jwksCache = { at: now, keys: j.keys }; return j.keys;
}
export class TokenError extends Error {}
/** Full ID-token verification: RS256 signature with the JWKS key named by kid, iss, aud, exp/iat, nonce. */
export async function verifyIdToken(idToken: string, o: { clientId: string; nonce: string; now?: number; fetch?: typeof fetch }) {
  const now = o.now ?? Date.now(); const f = o.fetch ?? fetch;
  const parts = idToken.split('.'); if (parts.length !== 3) throw new TokenError('malformed');
  const head = JSON.parse(new TextDecoder().decode(unb64u(parts[0]))) as { alg: string; kid: string }; if (head.alg !== 'RS256') throw new TokenError('alg');
  let jwk = (await jwks(f, now)).find((k) => (k as { kid?: string }).kid === head.kid); if (!jwk) jwk = (await jwks(f, now, true)).find((k) => (k as { kid?: string }).kid === head.kid); if (!jwk) throw new TokenError('unknown key');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]) as BufferSource, enc.encode(`${parts[0]}.${parts[1]}`)))) throw new TokenError('signature');
  const c = JSON.parse(new TextDecoder().decode(unb64u(parts[1]))) as { iss: string; aud: string; exp: number; iat: number; nonce?: string; sub: string; email?: string; email_verified?: boolean | string; name?: string };
  if (!GOOGLE.issuers.includes(c.iss)) throw new TokenError('iss'); if (c.aud !== o.clientId) throw new TokenError('aud');
  if (c.exp * 1000 < now - 60e3 || c.iat * 1000 > now + 300e3) throw new TokenError('expired'); if (!c.nonce || c.nonce !== o.nonce) throw new TokenError('nonce');
  if (!c.sub || !c.email) throw new TokenError('claims');
  return { sub: c.sub, email: c.email, email_verified: c.email_verified === true || c.email_verified === 'true', name: c.name };
}
/** Exchange the authorization code (with the PKCE verifier) for tokens. */
export async function exchangeCode(env: GoogleEnv, appUrl: string, code: string, verifier: string, f: typeof fetch = fetch) {
  const r = await f(GOOGLE.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(appUrl), grant_type: 'authorization_code', code_verifier: verifier }) });
  const j = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string }; if (!r.ok || !j.id_token) throw new TokenError(j.error ?? `token ${r.status}`); return j.id_token;
}
