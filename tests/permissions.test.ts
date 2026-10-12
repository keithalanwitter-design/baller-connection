import { describe, expect, it } from 'vitest';
import type { Command, Role } from '../shared/domain';
import { canRun, COMMAND_ROLES, ENDPOINT_ROLES, scopeSnapshot, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { client, login, makeEnv } from './helpers';

const ACTORS: Record<string, Actor> = {
  head: { id: 'u_head', role: 'head' }, assistant: { id: 'u_asst', role: 'assistant' }, ops: { id: 'u_ops', role: 'ops' },
  parent: { id: 'u_dana', role: 'parent', familyId: 'f_pine' }, player: { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' }, public: { id: 'public', role: 'public' }, system: { id: 'system', role: 'system' },
};
// One representative command per type, aimed at Avery (head-coached, Pine family).
const SAMPLE: Command[] = [
  { type: 'startFitReview', playerId: 'avery' }, { type: 'createInvite', playerId: 'avery' }, { type: 'assignCoach', playerId: 'avery', coachId: 'u_asst' }, { type: 'setBilling', playerId: 'avery', billing: 'paid' },
  { type: 'recordConsent', playerId: 'avery', guardianName: 'Dana Pine', agreed: true }, { type: 'publishPlan', playerId: 'avery', focus: 'x', drillIds: ['d1'] }, { type: 'review', playerId: 'avery', decision: 'approve', wentWell: 'good job', adjust: 'Keep eyes up', why: 'It builds control' },
  { type: 'signOff', playerId: 'avery', approve: true }, { type: 'submitRep', playerId: 'avery', repsDone: 1, reflection: 'did it' }, { type: 'toggleHabit', playerId: 'avery', key: 'x' }, { type: 'sendMessage', playerId: 'avery', text: 'hi' },
  { type: 'updateCanvas', playerId: 'avery', canvas: 'x' }, { type: 'saveDrill', drill: { title: 'x', reps: 1, minutes: 1, cues: [], tags: [] } }, { type: 'updateSettings', patch: { capacity: 20 } }, { type: 'requestData', playerId: 'avery', kind: 'export' },
  { type: 'completeDataRequest', requestId: 'x' }, { type: 'pause', playerId: 'avery' }, { type: 'sweep' }, { type: 'submitApplication', playerName: 'a', parentName: 'b', answers: {}, next: 'apply' }, { type: 'inviteStaff', name: 'x', email: 'x@y.z', role: 'ops' },
];
describe('command permission matrix (every role × command)', () => {
  const s = seed();
  for (const c of SAMPLE) for (const [name, a] of Object.entries(ACTORS)) {
    let expected = COMMAND_ROLES[c.type].includes(a.role as Role);
    if (name === 'assistant' && ['publishPlan', 'review', 'updateCanvas', 'sendMessage'].includes(c.type)) expected = false; // Avery is the head coach's player
    it(`${name} ${expected ? 'may' : 'may not'} ${c.type}`, () => expect(canRun(s, a, c) === true).toBe(expected));
  }
  it('parents and players are scoped to their own family/player', () => {
    expect(canRun(s, { id: 'u_jo', role: 'parent', familyId: 'f_quill' }, { type: 'pause', playerId: 'avery' })).not.toBe(true);
    expect(canRun(s, { id: 'u_nia', role: 'player', playerId: 'nia' }, { type: 'toggleHabit', playerId: 'avery', key: 'x' })).not.toBe(true);
    expect(canRun(s, ACTORS.assistant, { type: 'review', playerId: 'riley', decision: 'approve', wentWell: 'good job', adjust: 'Keep eyes up', why: 'It builds control' })).toBe(true);
  });
  it('read scoping hides other families, coach notes and unsigned reviews', () => {
    const p = scopeSnapshot(s, ACTORS.parent); expect(p.players.map((x) => x.id)).toEqual(['avery']); expect(p.players[0].canvas).toBe(''); expect(p.outbox).toEqual([]); expect(p.invites.every((i) => !i.tokenHash));
    const a = scopeSnapshot(s, ACTORS.assistant); expect(a.players.every((x) => x.coachId === 'u_asst')).toBe(true);
    const o = scopeSnapshot(s, ACTORS.ops); expect(o.messages).toEqual([]); expect(o.players.every((x) => x.canvas === '')).toBe(true);
  });
});

describe('HTTP endpoint matrix with real sessions', () => {
  const LOGINS: Record<string, [string, string, boolean?]> = { head: ['head@demo.test', 'demo-pass-123'], assistant: ['assistant@demo.test', 'demo-pass-123'], ops: ['ops@demo.test', 'demo-pass-123'], parent: ['dana@demo.test', 'demo-pass-123'], player: ['avery.pine', '1234', true] };
  const PATHS: Record<string, string> = { snapshot: '/api/snapshot', export: '/api/players/avery/export.csv', outbox: '/api/outbox', team: '/api/team', audit: '/api/audit', calendar: '/api/calendar-link', notifications: '/api/notifications' };
  it('anonymous is 401 everywhere', async () => { const env = await makeEnv(); for (const p of Object.values(PATHS)) expect((await client(env).get(p)).status).toBe(401); });
  it('each role gets 200 or 403 exactly per ENDPOINT_ROLES', async () => {
    const env = await makeEnv();
    for (const [role, [id, secret, pin]] of Object.entries(LOGINS)) { const c = await login(env, id, secret, pin);
      for (const [ep, p] of Object.entries(PATHS)) { const allowed = ENDPOINT_ROLES[ep as keyof typeof ENDPOINT_ROLES].includes(role as never); expect([role, ep, (await c.get(p)).status]).toEqual([role, ep, allowed ? 200 : 403]); } }
  });
  it('POST /api/commands enforces the command matrix server-side', async () => {
    const env = await makeEnv(); const parent = await login(env, 'dana@demo.test'); const asst = await login(env, 'assistant@demo.test'); const player = await login(env, 'avery.pine', '1234', true);
    expect((await parent.cmd({ type: 'updateSettings', patch: { capacity: 99 } })).status).toBe(403);
    expect((await parent.cmd({ type: 'pause', playerId: 'riley' })).status).toBe(403);
    expect((await asst.cmd({ type: 'review', playerId: 'avery', decision: 'approve', wentWell: 'nice one', adjust: 'Keep eyes up', why: 'It builds control' })).status).toBe(403);
    expect((await asst.cmd({ type: 'setBilling', playerId: 'riley', billing: 'paid' })).status).toBe(403);
    expect((await player.cmd({ type: 'sweep' })).status).toBe(403);
    expect((await player.cmd({ type: 'toggleHabit', playerId: 'avery', key: 'Handles 10 min' })).status).toBe(200);
  });
  it('wrong password is rejected and throttled; logout kills the session', async () => {
    const env = await makeEnv(); for (let i = 0; i < 5; i++) expect((await client(env).post('/api/auth/login', { login: 'ops@demo.test', password: 'nope' })).status).toBe(401);
    expect((await client(env).post('/api/auth/login', { login: 'ops@demo.test', password: 'demo-pass-123' })).status).toBe(429);
    const c = await login(env, 'head@demo.test'); expect((await c.get('/api/snapshot')).status).toBe(200); await c.post('/api/auth/logout'); expect((await client(env, c.cookie).get('/api/snapshot')).status).toBe(401);
  });
});
