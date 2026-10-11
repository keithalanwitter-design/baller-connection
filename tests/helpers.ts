import { handle, type Env } from '../server/app';
import { openDb } from '../server/sqljs';
export async function makeEnv(extra: Partial<Env> = {}): Promise<Env> { return { DB: await openDb(), SESSION_SECRET: 'test-secret', DEMO: '0', SEED: 'demo', ...extra }; }
export type Client = { cookie?: string; get: (p: string) => Promise<{ status: number; body: any }>; post: (p: string, b?: unknown) => Promise<{ status: number; body: any }>; cmd: (c: unknown) => Promise<{ status: number; body: any }> }; // eslint-disable-line
export function client(env: Env, cookie?: string): Client {
  const req = async (method: string, p: string, b?: unknown) => {
    const r = await handle(new Request('http://t' + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }), env);
    const sc = r.headers.get('set-cookie'); if (sc?.startsWith('bc_session=') && !sc.includes('Max-Age=0')) cookie = sc.split(';')[0];
    const text = await r.text(); let body: unknown = text; try { body = JSON.parse(text); } catch { /* csv / ics */ } return { status: r.status, body: body as any }; // eslint-disable-line
  };
  const c: Client = { get cookie() { return cookie; }, get: (p) => req('GET', p), post: (p, b) => req('POST', p, b ?? {}), cmd: (x) => req('POST', '/api/commands', x) };
  return c;
}
export async function login(env: Env, login: string, secret = 'demo-pass-123', pin = false) { const c = client(env); const r = await c.post('/api/auth/login', pin ? { login, pin: secret } : { login, password: secret }); if (r.status !== 200) throw new Error(`login ${login}: ${JSON.stringify(r.body)}`); return c; }
