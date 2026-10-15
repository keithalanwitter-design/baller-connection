import { describe, expect, it } from 'vitest';
import { scheduled } from '../server/app';
import { client, login, makeEnv } from './helpers';

describe('multi-user API flow with real sessions', () => {
  it('ops invites → parent accepts + consent → coach plans → player submits → assistant reviews → head signs off → player next step → digest', async () => {
    const env = await makeEnv(); const ops = await login(env, 'ops@demo.test'); const head = await login(env, 'head@demo.test');
    const app = await client(env).post('/api/apply', { type: 'submitApplication', playerName: 'Kai Rook', parentName: 'Lou Rook', email: 'lou@demo.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'Finish left' }, next: 'apply' });
    const kai = app.body.playerId as string;
    expect((await ops.cmd({ type: 'assignCoach', playerId: kai, coachId: 'u_asst' })).status).toBe(200);
    expect((await ops.cmd({ type: 'createInvite', playerId: kai })).status).toBe(200);
    const mail = (await ops.get('/api/outbox')).body.find((m: { to: string; kind: string }) => m.to === 'lou@demo.test' && m.kind === 'invite'); expect(mail.status).toBe('logged');
    const token = mail.body.match(/token=([a-f0-9]+)/)[1];
    const lou = client(env); expect((await lou.post('/api/auth/accept-invite', { token, parentName: 'Lou Rook', email: 'lou@demo.test', password: 'short' })).status).toBe(400);
    expect((await lou.post('/api/auth/accept-invite', { token, parentName: 'Lou Rook', email: 'lou@demo.test', password: 'kai-is-great-1' })).status).toBe(200);
    expect((await lou.cmd({ type: 'completeOnboarding', agreed: true, playerId: kai, position: 'Wing', goal: 'Finish left', learnStyle: 'Video', rhythm: '3 days' })).status).toBe(409);
    expect((await lou.cmd({ type: 'recordConsent', playerId: kai, guardianName: 'Lou Rook', agreed: true })).status).toBe(200);
    expect((await lou.post('/api/billing/simulate', { playerId: kai, outcome: 'checkout' })).status).toBe(200);
    expect((await lou.cmd({ type: 'completeOnboarding', agreed: true, playerId: kai, position: 'Wing', goal: 'Finish left', learnStyle: 'Video', rhythm: '3 days' })).status).toBe(200);
    expect((await lou.post('/api/auth/player-login', { playerId: kai, username: 'kai.rook', pin: '4321' })).status).toBe(200);
    const asst = await login(env, 'assistant@demo.test');
    expect((await asst.get('/api/queue')).body.coach.some((q: { player: { id: string }; kind: string }) => q.player.id === kai && q.kind === 'First look')).toBe(true);
    expect((await asst.cmd({ type: 'publishPlan', saw: 'Quick hands, eyes drop under pressure.', playerId: kai, focus: 'Left-hand finishing', drillIds: ['d2', 'd1'] })).status).toBe(200);
    const kaiC = await login(env, 'kai.rook', '4321', true);
    expect((await kaiC.cmd({ type: 'openPlan', playerId: kai })).status).toBe(200);
    expect((await kaiC.cmd({ type: 'submitRep', playerId: kai, repsDone: 3, reflection: 'Left hand felt better by set 3', linkUrl: 'https://example.com/clip' })).status).toBe(200);
    expect((await asst.cmd({ type: 'review', playerId: kai, decision: 'approve', wentWell: 'Good. Next: same speed, eyes on rim.', adjust: 'Keep eyes up', why: 'It builds control' })).status).toBe(200);
    let me = (await kaiC.get('/api/snapshot')).body.snapshot; expect(me.players[0].state).toBe('Sign-off'); expect(me.reviews).toEqual([]); // family can't see the unsigned review
    expect((await asst.cmd({ type: 'signOff', playerId: kai, approve: true })).status).toBe(403);
    expect((await head.cmd({ type: 'signOff', playerId: kai, approve: true })).status).toBe(200);
    me = (await kaiC.get('/api/snapshot')).body.snapshot; expect(me.players[0].state).toBe('Next step ready'); expect(me.reviews[0].feedback).toContain('eyes on rim');
    expect((await kaiC.get('/api/notifications')).body.some((n: { type: string }) => n.type === 'feedback_ready')).toBe(true);
    expect((await kaiC.cmd({ type: 'startNext', playerId: kai })).status).toBe(200);
    expect((await asst.cmd({ type: 'approveDigest', playerId: kai, text: 'Kai had a strong first week.' })).status).toBe(200);
    const louSnap = (await lou.get('/api/snapshot')).body.snapshot; expect(louSnap.digests[0].text).toContain('strong first week'); expect(louSnap.players[0].canvas).toBe('');
    const csv = await lou.get(`/api/players/${kai}/export.csv`); expect(csv.status).toBe(200); expect(csv.body).toContain('Left hand felt better');
    const audit = (await head.get('/api/audit')).body.map((e: { type: string }) => e.type); expect(audit).toEqual(expect.arrayContaining(['handoff', 'consent', 'signoff', 'account', 'transition', 'digest']));
  });
  it('cron sweep sends notification digests through the provider', async () => {
    const env = await makeEnv(); await scheduled(env, '*/15 * * * *');
    const head = await login(env, 'head@demo.test'); const n = (await head.get('/api/notifications')).body; expect(n.some((x: { type: string }) => x.type === 'overdue')).toBe(true);
    const out = (await head.get('/api/outbox')).body; expect(out.some((m: { kind: string; to: string }) => m.kind === 'notification-digest' && m.to === 'head@demo.test')).toBe(true);
    await scheduled(env, '0 23 * * SUN'); expect((await head.get('/api/snapshot')).body.snapshot.digests.some((d: { status: string }) => d.status === 'draft')).toBe(true);
  });
  it('rejects scheduler commands from users and demo reset when DEMO is off', async () => { const env = await makeEnv(); const h = await login(env, 'head@demo.test'); expect((await h.cmd({ type: 'advanceClock', hours: 5 })).status).toBe(403); expect((await h.post('/api/demo/reset')).status).toBe(403); });
  it('iCal link is signed and scoped', async () => {
    const env = await makeEnv(); const p = await login(env, 'dana@demo.test'); const url = (await p.get('/api/calendar-link')).body.url as string; const path = new URL(url).pathname;
    const ics = await client(env).get(path); expect(ics.body).toContain('BEGIN:VCALENDAR'); expect(ics.body).toContain('Avery'); expect(ics.body).not.toContain('Riley');
    expect((await client(env).get(path.replace(/[a-f0-9]{32}\.ics/, '0'.repeat(32) + '.ics'))).status).toBe(403);
  });
});
