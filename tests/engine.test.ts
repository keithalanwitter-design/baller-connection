import { describe, expect, it } from 'vitest';
import { dispatch, WorkflowError } from '../shared/engine';
import { seed } from '../shared/seed';
import { addBusinessDays } from '../shared/time';
import { buildQueue, capacity, guide, progress, QUEUE_KINDS } from '../shared/workflow';
import type { Command, Snapshot } from '../shared/domain';

const run = (s: Snapshot, ...cmds: Command[]) => cmds.reduce((acc, c) => dispatch(acc, c).snapshot, s);
const st = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!.state;

describe('lifecycle state machine', () => {
  it('runs the full path Applied → … → Cycle review → next cycle', () => {
    let s = run(seed(), { type: 'submitApplication', playerName: 'Test Player', parentName: 'Test Parent', next: 'apply', answers: { age: '13–14', days: '3–4 days', want: 'Both of us', need: 'Plan + regular feedback', goal: 'Get better' } });
    const id = s.players.at(-1)!.id; expect(st(s, id)).toBe('Applied');
    s = run(s, { type: 'startFitReview', playerId: id }, { type: 'decideFit', playerId: id, accept: true }); expect(st(s, id)).toBe('Invited');
    const code = s.invites.find((i) => i.playerId === id)!.code;
    s = run(s, { type: 'acceptInvite', playerId: id, code }); expect(st(s, id)).toBe('Onboarding');
    s = run(s, { type: 'completeOnboarding', playerId: id, position: 'Guard', goal: 'Make the team', learnStyle: 'Watch, then try', rhythm: '3 days' }); expect(st(s, id)).toBe('Plan building');
    s = run(s, { type: 'publishPlan', playerId: id, focus: 'Left hand', assignments: [0] }); expect(st(s, id)).toBe('Plan set');
    s = run(s, { type: 'openPlan', playerId: id }); expect(st(s, id)).toBe('Work ready');
    s = run(s, { type: 'submitRep', playerId: id, repsDone: 4, reflection: 'Stayed low most reps' }); expect(st(s, id)).toBe('Submitted');
    s = run(s, { type: 'advanceClock', hours: 25 }); expect(st(s, id)).toBe('Feedback due');
    s = run(s, { type: 'review', playerId: id, decision: 'approve', feedback: 'Great, keep the height.' }); expect(st(s, id)).toBe('Next step ready');
    s = run(s, { type: 'startNext', playerId: id }); expect(st(s, id)).toBe('Cycle review');
    s = run(s, { type: 'publishPlan', playerId: id, focus: 'Finishing', assignments: [1, 2] }); expect(st(s, id)).toBe('Plan set');
    expect(s.cycles.filter((c) => c.playerId === id).map((c) => c.status)).toEqual(['closed', 'active']);
    expect(s.events.filter((e) => e.playerId === id && e.type === 'transition').length).toBeGreaterThanOrEqual(11);
  });
  it('retry reopens the same rep and returns to Work ready', () => {
    const s = run(seed(), { type: 'review', playerId: 'riley', decision: 'retry', feedback: 'Set your feet first.' });
    expect(st(s, 'riley')).toBe('Work ready');
    expect(s.assignments.filter((a) => a.playerId === 'riley' && a.title === 'Form shooting: 5 spots').map((a) => a.status)).toEqual(['retry', 'open']);
  });
  it('rejects illegal transitions with a clear guard error', () => {
    expect(() => dispatch(seed(), { type: 'submitRep', playerId: 'sam', repsDone: 1, reflection: 'hello there' })).toThrow(WorkflowError);
    expect(() => dispatch(seed(), { type: 'openPlan', playerId: 'avery' })).toThrow(/not allowed/);
    expect(() => dispatch(seed(), { type: 'submitRep', playerId: 'avery', repsDone: 0, reflection: 'x' })).toThrow(/finished set/);
    expect(() => dispatch(seed(), { type: 'acceptInvite', playerId: 'theo', code: 'WRONG' })).toThrow(/code/);
    expect(() => dispatch(seed(), { type: 'publishPlan', playerId: 'sam', focus: '', assignments: [0] })).toThrow(/focus/);
  });
  it('pause and resume returns to the prior state', () => {
    const s = run(seed(), { type: 'pause', playerId: 'avery' }); expect(st(s, 'avery')).toBe('Paused');
    expect(st(run(s, { type: 'resume', playerId: 'avery' }), 'avery')).toBe('Work ready');
  });
  it('enforces roster capacity and the Inner Circle cap', () => {
    let s = seed(); s.coach.capacity = 5; // 5 already on roster
    s = run(s, { type: 'submitApplication', playerName: 'Overflow Kid', parentName: 'P', next: 'apply', answers: { age: '13–14', days: '3–4 days', want: 'Both of us', need: 'A plan and accountability', goal: 'x' } });
    const id = s.players.at(-1)!.id; s = run(s, { type: 'startFitReview', playerId: id }, { type: 'decideFit', playerId: id, accept: true });
    expect(st(s, id)).toBe('Waitlist'); expect(capacity(s).open).toBe(0);
    let t = seed(); t.coach.innerCircleCap = 1;
    t = run(t, { type: 'submitApplication', playerName: 'Live Kid', parentName: 'P', next: 'apply', answers: { age: '15–16', days: '5+ days', want: 'Both of us', need: 'Weekly live coaching', goal: 'x' } });
    const j = t.players.at(-1)!.id; expect(t.players.at(-1)!.tier).toBe('Inner Circle');
    t = run(t, { type: 'startFitReview', playerId: j }, { type: 'decideFit', playerId: j, accept: true }); expect(st(t, j)).toBe('Waitlist');
  });
});

describe('coach queue', () => {
  it('counts always equal rows and replies are included', () => {
    let s = seed();
    for (const c of [{ type: 'sendMessage', playerId: 'avery', from: 'player', text: 'Extra sets Saturday?' }, { type: 'review', playerId: 'riley', decision: 'approve', feedback: 'Nice work today.' }] as Command[]) {
      s = run(s, c); const q = buildQueue(s);
      expect(QUEUE_KINDS.reduce((n, k) => n + q.filter((x) => x.kind === k).length, 0)).toBe(q.length);
    }
    expect(buildQueue(s).some((x) => x.kind === 'Reply needed' && x.player.id === 'avery')).toBe(true);
    s = run(s, { type: 'sendMessage', playerId: 'avery', from: 'coach', text: 'Yes, 2 extra sets.' });
    expect(buildQueue(s).some((x) => x.kind === 'Reply needed' && x.player.id === 'avery')).toBe(false);
  });
  it('escalates overdue items to the top', () => {
    const s = run(seed(), { type: 'advanceClock', hours: 72 }); const q = buildQueue(s);
    const firstNon = q.findIndex((x) => !x.overdue); expect(q.slice(firstNon).some((x) => x.overdue)).toBe(false);
    expect(q[0].overdue).toBe(true);
  });
});

describe('guide + SLA + progression', () => {
  it('every state answers what/why/who/unlocks for each role', () => {
    const s = seed();
    for (const p of s.players) for (const r of ['player', 'parent', 'coach'] as const) { const g = guide(s, p, r); expect(g.what && g.why && g.whoLabel && g.unlocks).toBeTruthy(); }
  });
  it('business-day SLA skips weekends', () => {
    const fri = new Date('2026-10-09T10:00:00'); expect(addBusinessDays(fri, 1).getDay()).toBe(1); expect(addBusinessDays(fri, 2).getDay()).toBe(2);
    expect(addBusinessDays(new Date('2026-10-10T10:00:00'), 0).getDay()).toBe(1);
  });
  it('levels unlock by explicit criteria', () => {
    const s = seed(); expect(progress(s, 'theo').level).toBe(0); expect(progress(s, 'avery').level).toBe(2);
    const t = run(s, { type: 'submitRep', playerId: 'avery', repsDone: 5, reflection: 'Left hand only' }, { type: 'review', playerId: 'avery', decision: 'approve', feedback: 'Clean work.' }, { type: 'startNext', playerId: 'avery' }, { type: 'submitRep', playerId: 'avery', repsDone: 1, reflection: 'Clip looked good' }, { type: 'review', playerId: 'avery', decision: 'approve', feedback: 'Love it.' });
    expect(progress(t, 'avery').level).toBe(3); expect(t.milestones.some((m) => m.playerId === 'avery' && m.key === 'Level 3')).toBe(true);
  });
});
