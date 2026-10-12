import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch, suggestTier, WorkflowError } from '../shared/engine';
import { PermissionError, SYSTEM, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { buildOpsQueue, buildQueue, canTransition, capacity, guide, teamLoad, TRANSITIONS } from '../shared/workflow';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const ASST: Actor = { id: 'u_asst', role: 'assistant' }; const OPS: Actor = { id: 'u_ops', role: 'ops' };
const PARENT_PINE: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' }; const AVERY: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;

describe('state machine', () => {
  it('every transition names valid states', () => { for (const t of TRANSITIONS) expect(t.from.length).toBeGreaterThan(0); });
  it('guards reject illegal moves', () => { expect(canTransition('Applied', 'submitRep')).toBe(false); expect(() => dispatch(seed(), { type: 'submitRep', playerId: 'sam', repsDone: 1, reflection: 'hello there' }, { id: 'u_sam', role: 'player', playerId: 'sam' })).toThrow(WorkflowError); });
  it('pause/resume returns to the prior state', () => { const s = run(seed(), PARENT_PINE, { type: 'pause', playerId: 'avery' }, { type: 'resume', playerId: 'avery' }); expect(P(s, 'avery').state).toBe(P(seed(), 'avery').state); });
  it('every state has a guide for every perspective', () => { const s = seed(); for (const p of s.players) for (const v of ['player', 'parent', 'coach', 'ops'] as const) { const g = guide(s, p, v); expect(g.what && g.why && g.unlocks && g.whoLabel).toBeTruthy(); } });
  it('fit suggestion is honest', () => { expect(suggestTier({ need: 'In-person team practice' }).fit).toBe('notyet'); expect(suggestTier({ need: 'Weekly live coaching', days: '3–4 days' }).tier).toBe('Inner Circle'); });
});

describe('invites + consent', () => {
  it('ops invite → token + code → parent accepts → consent required → Plan building in the coach queue', () => {
    let s = run(seed(), { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Kai Rook', parentName: 'Lou Rook', email: 'lou@demo.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'Left hand' }, next: 'apply' });
    const kai = s.players.find((p) => p.name === 'Kai Rook')!; expect(buildOpsQueue(s).some((q) => q.player.id === kai.id && q.kind === 'New application')).toBe(true);
    const r = dispatch(s, { type: 'createInvite', playerId: kai.id }, OPS); s = r.snapshot; expect(r.created?.inviteToken).toMatch(/^[a-f0-9]{48}$/); expect(r.created?.inviteCode).toMatch(/^\d{6}$/);
    expect(s.outbox.at(-1)!.body).toContain(r.created!.inviteToken!);
    s = dispatch(s, { type: 'acceptInvite', code: r.created!.inviteCode, parentName: 'Lou Rook', email: 'lou@demo.test', userId: 'u_lou' }, { id: 'public', role: 'public' }).snapshot;
    expect(P(s, kai.id).state).toBe('Onboarding'); const lou: Actor = { id: 'u_lou', role: 'parent', familyId: kai.familyId };
    expect(() => dispatch(s, { type: 'completeOnboarding', playerId: kai.id, position: 'Guard', goal: 'Left hand', learnStyle: 'Video', rhythm: '3 days' }, lou)).toThrow(/consent/i);
    s = run(s, lou, { type: 'recordConsent', playerId: kai.id, guardianName: 'Lou Rook', agreed: true }, { type: 'completeOnboarding', playerId: kai.id, position: 'Guard', goal: 'Left hand', learnStyle: 'Video', rhythm: '3 days' });
    expect(s.consents.find((c) => c.playerId === kai.id)?.at).toBeTruthy(); expect(P(s, kai.id).state).toBe('Plan building');
    expect(buildQueue(s, 'u_head').some((q) => q.player.id === kai.id && q.kind === 'Plan needed')).toBe(true);
    expect(s.notifications.some((n) => n.userId === 'u_head' && n.type === 'invite_accepted')).toBe(true);
  });
  it('expired invites are rejected and swept to ops', () => {
    const s = run(seed(), SYSTEM, { type: 'advanceClock', hours: 24 * 8 });
    expect(s.invites[0].status).toBe('expired'); expect(buildOpsQueue(s).some((q) => q.kind === 'Invite expired')).toBe(true);
    expect(() => dispatch(s, { type: 'acceptInvite', token: 'demo-theo-token' }, { id: 'public', role: 'public' })).toThrow(/expired/);
  });
  it('capacity full → waitlist', () => { let s = run(seed(), { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Zed Ray', parentName: 'Q Ray', email: 'q@demo.test', answers: {}, next: 'apply' }); const z = s.players.at(-1)!.id; s = run(s, HEAD, { type: 'updateSettings', patch: { capacity: 5 } }); s = run(s, OPS, { type: 'createInvite', playerId: z }); expect(P(s, z).state).toBe('Waitlist'); expect(capacity(s).waitlist).toBe(1); });
});

describe('routing, sign-off, reassignment', () => {
  it('queue items are routed to the assigned coach; sign-off goes to the head coach', () => {
    let s = seed(); expect(buildQueue(s, 'u_asst').every((q) => q.player.coachId === 'u_asst')).toBe(true);
    expect(() => dispatch(s, { type: 'review', playerId: 'riley', decision: 'approve', wentWell: 'Good stuff here', adjust: 'Keep eyes up', why: 'It builds control' }, { id: 'u_x', role: 'assistant' })).toThrow(PermissionError);
    s = run(s, ASST, { type: 'review', playerId: 'riley', decision: 'approve', wentWell: 'Nice tempo, keep eyes up.', adjust: 'Keep eyes up', why: 'It builds control' }); expect(P(s, 'riley').state).toBe('Sign-off');
    expect(buildQueue(s, 'u_head').find((q) => q.player.id === 'riley')?.kind).toBe('Sign-off');
    expect(() => dispatch(s, { type: 'signOff', playerId: 'riley', approve: true }, ASST)).toThrow(PermissionError);
    s = run(s, HEAD, { type: 'signOff', playerId: 'riley', approve: true, edit: { adjust: 'Nice tempo, eyes up. Same next rep.' } }); expect(P(s, 'riley').state).toBe('Next step ready');
    expect(s.notifications.some((n) => n.userId === 'u_riley' && n.type === 'feedback_ready')).toBe(true);
  });
  it('sign-off can be turned off', () => { const s = run(run(seed(), HEAD, { type: 'updateSettings', patch: { requireSignoff: false } }), ASST, { type: 'review', playerId: 'riley', decision: 'retry', wentWell: 'Again with lower dribble.', adjust: 'Keep eyes up', why: 'It builds control' }); expect(P(s, 'riley').state).toBe('Work ready'); });
  it('reassignment logs a handoff and moves queue ownership', () => {
    const s = run(seed(), OPS, { type: 'assignCoach', playerId: 'riley', coachId: 'u_head' }); expect(s.events.at(-1)!.type).toBe('handoff');
    expect(buildQueue(s, 'u_head').some((q) => q.player.id === 'riley')).toBe(true); expect(buildQueue(s, 'u_asst').some((q) => q.player.id === 'riley')).toBe(false);
  });
  it('team view counts load and overdue', () => { const t = teamLoad(seed()); expect(t.find((x) => x.user.id === 'u_asst')!.overdue).toBeGreaterThan(0); expect(t.map((x) => x.user.role)).toEqual(['head', 'assistant', 'ops']); });
});

describe('cron sweep + notifications', () => {
  it('sweep escalates, notifies once (dedupe), and is idempotent', () => {
    let s = run(seed(), SYSTEM, { type: 'sweep' }); const n1 = s.notifications.filter((n) => n.type === 'overdue').length; expect(n1).toBeGreaterThan(0);
    s = run(s, SYSTEM, { type: 'sweep' }); expect(s.notifications.filter((n) => n.type === 'overdue').length).toBe(n1);
  });
  it('Submitted → Feedback due after 24h', () => { let s = run(seed(), AVERY, { type: 'submitRep', playerId: 'avery', repsDone: 2, reflection: 'Kept it low today' }); s = run(s, SYSTEM, { type: 'advanceClock', hours: 25 }); expect(P(s, 'avery').state).toBe('Feedback due'); });
  it('plan published + new submission + cycle review notify the right people', () => {
    let s = seed(); s = run(s, HEAD, { type: 'publishPlan', playerId: 'sam', focus: 'Weak hand', drillIds: ['d1'] }); expect(s.notifications.some((n) => n.userId === 'u_sam' && n.type === 'plan_published')).toBe(true);
    s = run(s, { id: 'u_sam', role: 'player', playerId: 'sam' }, { type: 'openPlan', playerId: 'sam' }, { type: 'submitRep', playerId: 'sam', repsDone: 1, reflection: 'Did it all' }); expect(s.notifications.some((n) => n.userId === 'u_head' && n.type === 'new_submission')).toBe(true);
    s = run(s, HEAD, { type: 'review', playerId: 'sam', decision: 'approve', wentWell: 'Great. Keep it low.', adjust: 'Keep eyes up', why: 'It builds control' }); s = run(s, { id: 'u_sam', role: 'player', playerId: 'sam' }, { type: 'startNext', playerId: 'sam' }); expect(P(s, 'sam').state).toBe('Cycle review'); expect(s.notifications.some((n) => n.type === 'cycle_review')).toBe(true);
  });
  it('weekly digests are generated as drafts for the coach', () => { const s = run(seed(), SYSTEM, { type: 'generateDigests' }); expect(s.digests.filter((d) => d.status === 'draft').length).toBeGreaterThan(0); });
});

describe('library, settings, privacy', () => {
  it('coach creates, edits and reuses drills and templates', () => {
    let s = run(seed(), HEAD, { type: 'saveDrill', drill: { title: 'Mikan', reps: 3, minutes: 5, cues: ['Soft touch'], tags: ['finishing'] } }); const d = s.drills.at(-1)!;
    s = run(s, HEAD, { type: 'saveDrill', drill: { ...d, title: 'Mikan drill' } }, { type: 'saveTemplate', template: { name: 'Finisher', focus: 'Touch', drillIds: [d.id] } }); expect(s.drills.at(-1)!.title).toBe('Mikan drill');
    s = run(s, HEAD, { type: 'publishPlan', playerId: 'sam', focus: 'Touch', drillIds: s.templates.at(-1)!.drillIds, templateId: s.templates.at(-1)!.id }); expect(s.assignments.at(-1)!.drillId).toBe(d.id);
  });
  it('rejects non-URL attachments', () => { expect(() => dispatch(seed(), { type: 'sendMessage', playerId: 'avery', text: 'see', linkUrl: 'javascript:alert(1)' }, PARENT_PINE)).toThrow(/http/); });
  it('read receipts', () => { const s = run(seed(), ASST, { type: 'markRead', playerId: 'riley' }); expect(s.messages.filter((m) => m.playerId === 'riley' && m.authorId !== 'u_asst').every((m) => m.readBy.u_asst)).toBe(true); });
  it('deletion request removes player data', () => {
    let s = run(seed(), { id: 'u_jo', role: 'parent', familyId: 'f_quill' }, { type: 'requestData', playerId: 'sam', kind: 'delete' }); expect(buildOpsQueue(s).some((q) => q.kind === 'Data request')).toBe(true);
    s = run(s, OPS, { type: 'completeDataRequest', requestId: s.dataRequests[0].id }); expect(s.players.some((p) => p.id === 'sam')).toBe(false); expect(s.messages.some((m) => m.playerId === 'sam')).toBe(false);
  });
});
