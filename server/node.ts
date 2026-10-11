import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handle, scheduled, type Env } from './app';
import { openDb } from './sqljs';

/** Local server: same API as the Worker, plus static hosting of dist/ (like Worker static assets) and a cron timer. */
const port = Number(process.env.PORT ?? 8787); const dist = path.resolve(process.env.DIST ?? 'dist');
const env: Env = { DB: await openDb(process.env.DB_FILE ?? 'server/local.sqlite'), SESSION_SECRET: process.env.SESSION_SECRET ?? 'local-dev-secret', DEMO: process.env.DEMO, SEED: process.env.SEED ?? 'demo', APP_URL: process.env.APP_URL ?? `http://localhost:${port}/baller-connection`, EMAIL_PROVIDER: process.env.EMAIL_PROVIDER, EMAIL_API_KEY: process.env.EMAIL_API_KEY };
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const u = req.url ?? '/';
  if (!u.startsWith('/api/')) { const rel = u.split('?')[0].replace(/^\/baller-connection/, '') || '/'; const f = path.join(dist, rel === '/' ? 'index.html' : rel); if (f.startsWith(dist) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); return void res.end(fs.readFileSync(f)); } res.writeHead(404); return void res.end('Not found'); }
  const body = await new Promise<string>((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const r = await handle(new Request(`http://localhost:${port}${u}`, { method: req.method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method!) ? undefined : body }), env);
  const out: Record<string, string | string[]> = {}; r.headers.forEach((v, k) => (out[k] = v)); res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`Baller Connection on http://localhost:${port}/baller-connection/  (API /api/health)`));
if (process.env.CRON !== '0') setInterval(() => scheduled(env, '*/15 * * * *').catch(console.error), 15 * 60 * 1000);
