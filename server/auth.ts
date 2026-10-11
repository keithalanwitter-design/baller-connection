/** Password/PIN hashing (PBKDF2-SHA256 via WebCrypto, works in Workers and Node) and session tokens. */
const enc = new TextEncoder();
const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ITER = 100_000; // Cloudflare Workers cap PBKDF2 at 100k iterations
async function pbkdf2(secret: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
}
export async function hashSecret(secret: string) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2$sha256$${ITER}$${b64(salt)}$${b64(await pbkdf2(secret, salt, ITER))}`; }
export async function verifySecret(secret: string, stored?: string | null) {
  if (!stored) return false; const [, , it, salt, hash] = stored.split('$'); const got = b64(await pbkdf2(secret, unb64(salt), Number(it)));
  let diff = got.length ^ hash.length; for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i); return diff === 0;
}
export async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
export const COOKIE = 'bc_session';
export function sessionCookie(token: string, secure: boolean, maxAge = 30 * 86400) { return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`; }
export function readToken(req: Request) {
  const a = req.headers.get('authorization'); if (a?.startsWith('Bearer ')) return a.slice(7);
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|; )${COOKIE}=([a-f0-9]+)`)); return m?.[1];
}
