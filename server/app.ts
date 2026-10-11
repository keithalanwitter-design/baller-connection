import type { Command, Role } from '../shared/domain';
import { dispatch, WorkflowError } from '../shared/engine';
import { seed } from '../shared/seed';
import { buildQueue, capacity, guide, progress, TRANSITIONS } from '../shared/workflow';
import type { Db } from './db';
import { Repo } from './repo';

const json = (data: unknown, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, x-demo-role', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
const ROLES: Role[] = ['player', 'parent', 'coach'];

/** REST API shared by the Cloudflare Worker and the Node dev server. */
export async function handle(req: Request, db: Db, allowOrigin = '*'): Promise<Response> {
  const url = new URL(req.url); const path = url.pathname.replace(/\/+$/, '');
  if (req.method === 'OPTIONS') return json({}, 204, allowOrigin);
  const repo = new Repo(db);
  try {
    if (!(await repo.isSeeded())) await repo.save(seed());
    if (path === '/api/health') return json({ ok: true, version: (await repo.load()).version }, 200, allowOrigin);
    if (path === '/api/workflow') return json({ transitions: TRANSITIONS }, 200, allowOrigin);
    if (path === '/api/reset' && req.method === 'POST') { const s = seed(); await repo.save(s); return json({ snapshot: s }, 200, allowOrigin); }
    let s = await repo.load();
    const tick = dispatch(s, { type: 'tick' }); if (tick.events.length) { await repo.save(tick.snapshot, s); s = tick.snapshot; }
    if (path === '/api/snapshot' && req.method === 'GET') return json(s, 200, allowOrigin);
    if (path === '/api/queue') { const q = buildQueue(s); return json({ capacity: capacity(s), counts: Object.fromEntries(['Reply needed', 'Work ready', 'Plan needed', 'Activation', 'Upcoming'].map((k) => [k, q.filter((x) => x.kind === k).length])), items: q.map((x) => ({ ...x, player: { id: x.player.id, name: x.player.name, state: x.player.state } })) }, 200, allowOrigin); }
    if (path === '/api/events') return json(s.events.slice(-Number(url.searchParams.get('limit') ?? 100)), 200, allowOrigin);
    const pm = path.match(/^\/api\/players\/([\w-]+)(\/guide)?$/);
    if (pm) { const p = s.players.find((x) => x.id === pm[1]); if (!p) return json({ error: 'Not found' }, 404, allowOrigin);
      if (pm[2]) { const role = (url.searchParams.get('role') as Role) || 'player'; return json({ guide: guide(s, p, ROLES.includes(role) ? role : 'player'), progress: progress(s, p.id) }, 200, allowOrigin); }
      return json(p, 200, allowOrigin); }
    if (path === '/api/commands' && req.method === 'POST') {
      const cmd = (await req.json()) as Command; const role = req.headers.get('x-demo-role') as Role | null;
      const r = dispatch(s, cmd, role && ROLES.includes(role) ? role : undefined); await repo.save(r.snapshot, s); return json(r, 200, allowOrigin);
    }
    return json({ error: 'Not found' }, 404, allowOrigin);
  } catch (e) {
    if (e instanceof WorkflowError) return json({ error: e.message }, 409, allowOrigin);
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500, allowOrigin);
  }
}
