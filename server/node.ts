import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handle, scheduled, type Env } from './app';
import { openDb } from './sqljs';
import { diskStore } from './blobs-disk';

/** Local server: same API as the Worker, plus static hosting of dist/ (like Worker static assets) and a cron timer. */
const port = Number(process.env.PORT ?? 8787); const dist = path.resolve(process.env.DIST ?? 'dist');
const env: Env = { DB: await openDb(process.env.DB_FILE ?? 'server/local.sqlite'), SESSION_SECRET: process.env.SESSION_SECRET ?? 'local-dev-secret', DEMO: process.env.DEMO, SEED: process.env.SEED ?? 'demo', APP_URL: process.env.APP_URL ?? `http://localhost:${port}/baller-connection`, EMAIL_PROVIDER: process.env.EMAIL_PROVIDER, EMAIL_API_KEY: process.env.EMAIL_API_KEY, RESEND_API_KEY: process.env.RESEND_API_KEY, POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN, EMAIL_FROM: process.env.EMAIL_FROM, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_FOUNDATION: process.env.STRIPE_PRICE_FOUNDATION, STRIPE_PRICE_DEVELOPMENT: process.env.STRIPE_PRICE_DEVELOPMENT, STRIPE_PRICE_INNER_CIRCLE: process.env.STRIPE_PRICE_INNER_CIRCLE, STRIPE_ALLOW_LIVE: process.env.STRIPE_ALLOW_LIVE, VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: process.env.VAPID_SUBJECT, GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET, BLOBS: diskStore(process.env.CLIPS_DIR ?? 'server/clips') };
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const u = req.url ?? '/';
  if (!u.startsWith('/api/')) { const rel = u.split('?')[0].replace(/^\/baller-connection/, '') || '/'; const f = path.join(dist, rel === '/' ? 'index.html' : rel); if (f.startsWith(dist) && fs.existsSync(f) && fs.statSync(f).isFile()) { const buf = fs.readFileSync(f); const ct = types[path.extname(f)] ?? 'application/octet-stream'; const rg = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (rg) { const a = Number(rg[1]); const b = rg[2] ? Math.min(Number(rg[2]), buf.length - 1) : buf.length - 1; res.writeHead(206, { 'content-type': ct, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${buf.length}`, 'content-length': b - a + 1 }); return void res.end(buf.subarray(a, b + 1)); }
    res.writeHead(200, { 'content-type': ct, 'accept-ranges': 'bytes' }); return void res.end(buf); } res.writeHead(404); return void res.end('Not found'); }
  const body = await new Promise<Buffer>((ok) => { const parts: Buffer[] = []; req.on('data', (c: Buffer) => parts.push(c)); req.on('end', () => ok(Buffer.concat(parts))); });
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const r = await handle(new Request(`http://localhost:${port}${u}`, { method: req.method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method!) ? undefined : new Uint8Array(body) }), env);
  const out: Record<string, string | string[]> = {}; r.headers.forEach((v, k) => (out[k] = v)); res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`Baller Connection on http://localhost:${port}/baller-connection/  (API /api/health)`));
if (process.env.CRON !== '0') setInterval(() => scheduled(env, '*/15 * * * *').catch(console.error), 15 * 60 * 1000);
