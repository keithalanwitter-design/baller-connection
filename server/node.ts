import http from 'node:http';
import { handle } from './app';
import { openDb } from './sqljs';

const port = Number(process.env.PORT ?? 8787);
const db = await openDb(process.env.DB_FILE ?? 'server/local.sqlite');
http.createServer(async (req, res) => {
  const body = await new Promise<string>((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });
  const r = await handle(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method!) ? undefined : body }), db);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
}).listen(port, () => console.log(`Baller Connection API on http://localhost:${port}/api/health`));
