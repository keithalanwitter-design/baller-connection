import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch, suggestTier, WorkflowError } from '../shared/engine';
import { scopeSnapshot, type Actor } from '../shared/permissions';
import { promiseCard, PROMISES, promiseRisks } from '../shared/promises';
import { seed } from '../shared/seed';
import { canSeeClip, clipError } from '../shared/clips';
import { buildOpsQueue, buildQueue, clock } from '../shared/workflow';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const ASST: Actor = { id: 'u_asst', role: 'assistant' }; const OPS: Actor = { id: 'u_ops', role: 'ops' };
const SAM: Actor = { id: 'u_sam', role: 'player', playerId: 'sam', familyId: 'f_quill' };
const DANA: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' }; const SYS: Actor = { id: 'system', role: 'system' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const risk = (s: Snapshot, pid: string, id: string) => promiseRisks(s, P(s, pid)).find((r) => r.promise.id === id);
const fb = { wentWell: 'Stayed low', adjust: 'Eyes up on the catch', why: 'Control first' };
/** Sam: Foundation, Plan building → plan with 2 reps → rep 1 open. */
const samReady = () => run(run(seed(), HEAD, { type: 'publishPlan', saw: 'Quick hands, eyes drop under pressure.', playerId: 'sam', focus: 'Handle pressure', drillIds: ['d1', 'd2'] }), SAM, { type: 'openPlan', playerId: 'sam' });
const submit = (s: Snapshot) => run(s, SAM, { type: 'submitRep', playerId: 'sam', repsDone: 3, reflection: 'Felt better low' });

/** One enforcement test per promise id. A promise without an entry here fails the ledger test. */
const ENFORCEMENT: Record<string, () => void> = {
  'reply-window': () => { const s = submit(samReady()); const sub = s.submissions.at(-1)!; expect(new Date(sub.dueBy) > clock(s)).toBe(true); const late = run(s, SYS, { type: 'advanceClock', hours: 24 * 6 }); expect(P(late, 'sam').state).toBe('Feedback due'); expect(late.notifications.some((n) => n.type === 'overdue' && n.userId === 'u_head')).toBe(true);
    // one number per plan: a message gets the same window as a clip
    const msg = run(seed(), DANA, { type: 'sendMessage', playerId: 'avery', text: 'Quick question about Friday' }); const m = msg.messages.at(-1)!; expect(m.dueBy).toBeTruthy(); expect(buildQueue(msg).some((q) => q.kind === 'Reply needed' && q.player.id === 'avery' && q.dueBy === m.dueBy)).toBe(true); },
  'reviews-per-week': () => { let s = submit(samReady()); expect(s.submissions.at(-1)!.reviewed).toBe(true); s = run(run(s, HEAD, { type: 'review', playerId: 'sam', decision: 'approve', ...fb }), SAM, { type: 'startNext', playerId: 'sam' }); s = submit(s); expect(s.submissions.at(-1)!.reviewed).toBe(false); expect(P(s, 'sam').state).toBe('Next step ready'); expect(buildQueue(s).some((q) => q.player.id === 'sam' && q.kind === 'Clip to review')).toBe(false); expect(seed().settings.reviewsPerWeek['Inner Circle']).toBeGreaterThanOrEqual(99); },
  'first-look': () => { const s = seed(); const q = buildQueue(s).find((x) => x.player.id === 'sam' && x.kind === 'First look')!; expect(q.dueBy).toBeTruthy();
    expect(() => run(s, HEAD, { type: 'publishPlan', playerId: 'sam', focus: 'Handle pressure', drillIds: ['d1'] })).toThrow(WorkflowError);
    const late = run(s, SYS, { type: 'advanceClock', hours: 24 * 4 }); expect(risk(late, 'sam', 'first-look')).toBeTruthy(); const done = samReady(); expect(P(done, 'sam').firstLook?.saw).toMatch(/Quick hands/); expect(done.messages.some((m) => m.playerId === 'sam' && m.from === 'coach' && /First look/.test(m.text))).toBe(true); },
  'teach-back': () => { let s = seed(); const r = s.reviews.find((x) => x.id === 'r_av2')!; expect(r.teachBack?.mark).toBeNull(); s = run(s, SYS, { type: 'advanceClock', hours: 24 * 4 }); expect(risk(s, 'avery', 'teach-back')).toBeTruthy(); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Teach-back' && q.player.id === 'avery')).toBe(true);
    s = run(s, HEAD, { type: 'markTeachBack', playerId: 'avery', reviewId: 'r_av2', mark: 'got-it' }); expect(risk(s, 'avery', 'teach-back')).toBeFalsy();
    // optional: the next rep opens without one
    const n = run(seed(), { id: 'u_nia', role: 'player', playerId: 'nia', familyId: 'f_fable' }, { type: 'startNext', playerId: 'nia' }); expect(P(n, 'nia').state).not.toBe('Next step ready'); },
  'stuck-reply': () => { const AV: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' }; let s = run(seed(), AV, { type: 'sendStuck', playerId: 'avery', happened: 'Missed three shots in a row', want: 'To talk about it' }); const m = s.messages.at(-1)!; expect(m.context).toBe('stuck'); expect(m.dueBy).toBeTruthy();
    expect(scopeSnapshot(s, { id: 'u_dana', role: 'parent', familyId: 'f_pine' }).messages.some((x) => x.id === m.id)).toBe(false); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Check in' && q.player.id === 'avery' && q.dueBy === m.dueBy)).toBe(true);
    s = run(s, SYS, { type: 'advanceClock', hours: 24 * 4 }); expect(risk(s, 'avery', 'stuck-reply')).toBeTruthy(); s = run(s, HEAD, { type: 'sendMessage', playerId: 'avery', text: 'Thanks for telling me. Thursday we start with just your form.', context: 'checkin' }); expect(risk(s, 'avery', 'stuck-reply')).toBeFalsy(); },
  'monthly-video': () => { let s = seed(); expect(risk(s, 'nia', 'monthly-video')).toBeTruthy(); s = run(s, ASST, { type: 'scheduleSession', playerId: 'nia', at: new Date(clock(s).getTime() + 3 * 864e5).toISOString(), minutes: 20, kind: 'check-in', note: 'Monthly video' }); expect(risk(s, 'nia', 'monthly-video')).toBeFalsy(); },
  'weekly-live': () => { let s = seed(); s.meetings = s.meetings.filter((m) => m.playerId !== 'riley'); expect(risk(s, 'riley', 'weekly-live')).toBeTruthy(); s = run(s, ASST, { type: 'scheduleSession', playerId: 'riley', at: new Date(clock(s).getTime() + 864e5).toISOString(), minutes: 30, kind: 'live', note: 'Live' }); expect(risk(s, 'riley', 'weekly-live')).toBeFalsy(); },
  'cycle-review': () => { const s0 = run(seed(), SYS, { type: 'advanceClock', hours: 24 * 30 }); expect(risk(s0, 'nia', 'cycle-review')).toBeTruthy(); const s = run(s0, { id: 'u_nia', role: 'player', playerId: 'nia', familyId: 'f_fable' }, { type: 'startNext', playerId: 'nia' }); expect(P(s, 'nia').state).toBe('Cycle review'); expect(buildQueue(s).some((q) => q.kind === 'Re-check' && q.player.id === 'nia')).toBe(true); },
  'parent-summary': () => { let s = run(seed(), SYS, { type: 'generateDigests' }); expect(s.digests.filter((d) => d.status === 'draft').length).toBeGreaterThan(0); expect(risk(s, 'avery', 'parent-summary')).toBeTruthy(); const items = s.digests.filter((d) => d.status === 'draft' && ['avery', 'sam'].includes(d.playerId)).map((d) => ({ playerId: d.playerId, text: d.text })); s = run(s, HEAD, { type: 'approveDigests', items }); expect(risk(s, 'avery', 'parent-summary')).toBeFalsy(); expect(s.outbox.filter((m) => m.kind === 'parent-digest').length).toBe(2); },
  capacity: () => { let s = run(seed(), HEAD, { type: 'updateSettings', patch: { capacity: 5, innerCircleCap: 1 } }); s = run(s, { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Kai Rook', parentName: 'Lou', email: 'l@x.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'x' }, next: 'apply' }); const kai = s.players.at(-1)!; s = run(s, OPS, { type: 'createInvite', playerId: kai.id }); expect(P(s, kai.id).state).toBe('Waitlist'); },
  'real-coach': () => { const s = run(submit(samReady()), HEAD, { type: 'review', playerId: 'sam', decision: 'approve', ...fb }); expect(s.reviews.at(-1)!.reviewerId).toBe('u_head'); const r = run(seed(), ASST, { type: 'review', playerId: 'riley', decision: 'approve', ...fb }); expect(P(r, 'riley').state).toBe('Sign-off'); },
  'short-clips': () => { expect(clipError({ mime: 'video/mp4', bytes: 1000, durationSec: 31 })).toMatch(/30 s max/); expect(clipError({ mime: 'video/x-msvideo', bytes: 1000, durationSec: 5 })).toMatch(/MP4, MOV or WebM/); expect(clipError({ mime: 'video/mp4', bytes: 51 * 1024 * 1024, durationSec: 5 })).toMatch(/50 MB/); expect(() => run(samReady(), SAM, { type: 'registerClip', playerId: 'sam', clipId: 'c1', storageKey: 'k', mime: 'video/mp4', bytes: 1000, durationSec: 45 })).toThrow(/30 s/); expect(() => run(samReady(), SAM, { type: 'submitRep', playerId: 'sam', repsDone: 2, reflection: 'hello there', linkUrl: 'file:///video.mp4' })).toThrow(/http/); },
  'clip-privacy': () => { const s = seed(); const c = s.clips[0]; const riley = P(s, 'riley'); expect(canSeeClip(ASST, riley, c)).toBe(true); expect(canSeeClip(OPS, riley, c)).toBe(false); expect(canSeeClip(DANA, riley, c)).toBe(false); expect(canSeeClip({ id: 'u_chris', role: 'parent', familyId: 'f_moss' }, riley, c)).toBe(true); const old = run(s, SYS, { type: 'advanceClock', hours: 24 * 91 }); expect(old.clips.length).toBe(0); },
  'card-private': () => { let s = seed(); expect(P(s, 'avery').card?.enabled ?? false).toBe(false); expect(() => run(s, HEAD, { type: 'setCard', playerId: 'avery', enabled: true })).toThrow(); s = run(s, DANA, { type: 'setCard', playerId: 'avery', enabled: true }); expect(P(s, 'avery').card?.token).toMatch(/^[a-f0-9]{32}$/); expect(P(s, 'avery').card?.showStats).toBe(false); },
  'application-reply': () => { expect(suggestTier({ age: '13–14', days: '3–4 days', need: 'Plan + regular feedback' }).fit).toBe('fit'); const s = run(seed(), { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Kai', parentName: 'Lou', email: 'l@x.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'x' }, next: 'apply' }); expect(buildOpsQueue(s).find((q) => q.kind === 'New application')?.dueBy).toBeTruthy(); },
  'data-30d': () => { const s = run(seed(), DANA, { type: 'requestData', playerId: 'avery', kind: 'export' }); const q = buildOpsQueue(s).find((x) => x.kind === 'Data request')!; expect(new Date(q.dueBy!).getTime() - clock(s).getTime()).toBeGreaterThan(29 * 864e5); },
  'pause-anytime': () => { const s = run(seed(), DANA, { type: 'pause', playerId: 'avery' }); expect(P(s, 'avery').state).toBe('Paused'); expect(buildQueue(s, 'u_head').some((q) => q.player.id === 'avery' && !['Upcoming', 'Check in'].includes(q.kind))).toBe(false); /* a private “I’m stuck” note is still answered while paused */ },
  'cancel-anytime': () => { let s = run(seed(), SYS, { type: 'billingEvent', eventId: 'e1', kind: 'subscription_updated', playerId: 'avery', status: 'active', cancelAtPeriodEnd: true }); expect(P(s, 'avery').state).toBe('Work ready'); expect(s.subscriptions.find((x) => x.playerId === 'avery')!.cancelAtPeriodEnd).toBe(true); s = run(s, SYS, { type: 'advanceClock', hours: 24 * 19 }); expect(P(s, 'avery').billing).toBe('canceled'); expect(P(s, 'avery').state).toBe('Paused'); },
};

describe('promise ledger', () => {
  it('every promise has an enforcement test, a rule, a family screen and a coach alert', () => {
    for (const p of PROMISES) { expect(ENFORCEMENT[p.id], `no enforcement test for promise “${p.id}”`).toBeTypeOf('function'); expect(p.rule && p.familyScreen && p.coachAlert && p.sources.length).toBeTruthy(); }
    expect(Object.keys(ENFORCEMENT).sort()).toEqual(PROMISES.map((p) => p.id).sort());
  });
  it('PROMISES.md lists every promise id', () => { const md = fs.readFileSync('PROMISES.md', 'utf8'); for (const p of PROMISES) expect(md, p.id).toContain(`\`${p.id}\``); });
  for (const p of PROMISES) it(`enforced: ${p.id}`, ENFORCEMENT[p.id] ?? (() => { throw new Error('missing'); }));
  it('the family card shows live status and updates when a promise is kept', () => {
    let s = seed(); const before = promiseCard(s, P(s, 'nia')).find((x) => x.promise.id === 'monthly-video')!; expect(before.status.state).toBe('at-risk');
    s = run(s, ASST, { type: 'scheduleSession', playerId: 'nia', at: new Date(clock(s).getTime() + 2 * 864e5).toISOString(), minutes: 20, kind: 'check-in', note: 'Monthly' });
    expect(promiseCard(s, P(s, 'nia')).find((x) => x.promise.id === 'monthly-video')!.status.state).toBe('on-track');
  });
  it('site copy makes no promises the engine can’t keep, and no hype, AI or unsupported stats (v9 site)', () => {
    const site = ['src/site/Site.tsx', 'src/site/content.ts'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(site).not.toMatch(/\b(elite|revolutionary|world-class|unlock your potential|guaranteed?|game-changer|supercharge|next level)\b/i);
    for (const m of site.matchAll(/\bAI\b[^'"<]{0,40}/g)) expect(m[0], 'AI is only ever mentioned as something we do not do').toMatch(/^AI( coaching)?\.?\s*$|^AI\./);
    expect(site).not.toMatch(/(^|[^'"\d])\d{1,3}%/); /* a '60%' bar width in the sample screen is not a claim */ expect(site).not.toMatch(/transfer rate|practice → game|practice-to-game|streak|level up/i);
    expect(site).not.toMatch(/Plan adjusted every|Skill rubric|Pre-tournament|Season goal review|Urgent message/i); // promises v9 retired
    expect(site).toMatch(/Never an AI/); expect(site).toMatch(/full-game film/i);
    expect(site).toMatch(/deleted after 90 days/i); expect(site).toMatch(/within 30 days/); expect(site).toMatch(/within 2 business days/);
    expect(site).toMatch(/a coach who sees your reps between sessions/i); expect(site).toMatch(/Make practice show up in games/);
  });
});
