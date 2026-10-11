import { describe, expect, it } from 'vitest';
import { handle } from '../server/app';
import { openDb } from '../server/sqljs';

const call = async (db: Awaited<ReturnType<typeof openDb>>, path: string, body?: unknown) => {
  const r = await handle(new Request(`http://x${path}`, body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : undefined), db);
  return { status: r.status, json: (await r.json()) as any }; // eslint-disable-line
};
describe('REST API over SQLite (D1-compatible)', () => {
  it('seeds, serves, transitions, persists and rejects illegal commands', async () => {
    const db = await openDb();
    expect((await call(db, '/api/health')).json.ok).toBe(true);
    const snap = (await call(db, '/api/snapshot')).json; expect(snap.players).toHaveLength(5);
    expect(snap.players.find((p: { id: string }) => p.id === 'riley').state).toBe('Feedback due'); // tick on read
    const q = (await call(db, '/api/queue')).json; expect(Object.values(q.counts).reduce((a: number, b) => a + (b as number), 0)).toBe(q.items.length);
    const r = await call(db, '/api/commands', { type: 'review', playerId: 'riley', decision: 'approve', feedback: 'Feet set, great.' });
    expect(r.status).toBe(200); expect(r.json.events[0].to).toBe('Next step ready');
    const again = (await call(db, '/api/snapshot')).json; expect(again.players.find((p: { id: string }) => p.id === 'riley').state).toBe('Next step ready');
    const bad = await call(db, '/api/commands', { type: 'openPlan', playerId: 'avery' }); expect(bad.status).toBe(409); expect(bad.json.error).toMatch(/not allowed/);
    const g = (await call(db, '/api/players/riley/guide?role=player')).json; expect(g.guide.whoLabel).toBe('You');
    expect((await call(db, '/api/events')).json.length).toBeGreaterThan(5);
    await call(db, '/api/reset', {}); expect((await call(db, '/api/snapshot')).json.players.find((p: { id: string }) => p.id === 'riley').state).toBe('Feedback due');
  });
});
