/** v7 Web Push (RFC 8030 + VAPID RFC 8292 + aes128gcm RFC 8291), WebCrypto only so it runs in the Worker and in Node 20.
 * Keys come from env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, see DEPLOY.md) and VAPID_SUBJECT (mailto:...).
 * Without keys the sender is in "log" mode: it decides what WOULD be pushed and records it, but sends nothing. */
export interface PushEnv { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string }
export interface PushSub { endpoint: string; p256dh: string; auth: string }
const enc = new TextEncoder();
export const b64u = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const unb64u = (s: string) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const subtle = () => globalThis.crypto.subtle;
async function hmac(key: Uint8Array, data: Uint8Array) { const k = await subtle().importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await subtle().sign('HMAC', k, data as BufferSource)); }

export const pushMode = (env: PushEnv) => (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? 'vapid' : 'log') as 'vapid' | 'log';

/** VAPID JWT (ES256). WebCrypto ECDSA already returns the raw r||s form JWS wants. */
export async function vapidAuth(endpoint: string, env: Required<Pick<PushEnv, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY'>> & PushEnv, now = Date.now()) {
  const pub = unb64u(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 point (base64url, 65 bytes).');
  const key = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT ?? 'mailto:coach@example.com' })));
  const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** aes128gcm content encoding (RFC 8291), single record. */
export async function encryptPayload(sub: PushSub, plaintext: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const ua = unb64u(sub.p256dh); const auth = unb64u(sub.auth);
  const eph = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPub = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const uaKey = await subtle().importKey('raw', ua as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hmac(await hmac(auth, shared), cat(enc.encode('WebPush: info\0'), ua, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const k = await subtle().importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, k, cat(enc.encode(plaintext), new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPub.length); header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPub.length; header.set(asPub, 21);
  return cat(header, ct);
}

export type PushResult = { status: 'sent' | 'logged' | 'gone' | 'failed'; code?: number };
export async function sendPush(env: PushEnv, sub: PushSub, payload: object, f: typeof fetch = fetch): Promise<PushResult> {
  if (pushMode(env) === 'log') return { status: 'logged' };
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const r = await f(sub.endpoint, { method: 'POST', headers: { authorization: await vapidAuth(sub.endpoint, env as Required<PushEnv>), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal' }, body });
  if (r.status === 404 || r.status === 410) return { status: 'gone', code: r.status };
  return r.ok ? { status: 'sent', code: r.status } : { status: 'failed', code: r.status };
}
