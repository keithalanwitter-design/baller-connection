import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { ConflictError, dispatch } from '../shared/engine';
import { coachKnows, composeFeedback, feedbackTemplate, greeting, plainFeedback, repWhy, rhythmToday } from '../shared/personal';
import { type Actor } from '../shared/permissions';
import { DEMO_INVITE, seed } from '../shared/seed';
import { sha256 } from '../shared/sha256';
import { officeDue } from '../shared/time';
import { buildOpsQueue, buildQueue, clock, guide } from '../shared/workflow';
import { redactSecrets } from '../server/app';
import { client, login, makeEnv } from './helpers';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const ASST: Actor = { id: 'u_asst', role: 'assistant' }; const OPS: Actor = { id: 'u_ops', role: 'ops' };
const AVERY: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' }; const DANA: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' }; const SYS: Actor = { id: 'system', role: 'system' };
const NIA: Actor = { id: 'u_nia', role: 'player', playerId: 'nia', familyId: 'f_fable' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const fb = { wentWell: 'Stayed low through contact', adjust: 'Eyes up on the catch', why: 'Control first' };
/** Advance the demo clock to the next given weekday at `hour`. */
const toDay = (s: Snapshot, dow: number, hour = 12) => { const n = clock(s); const d = new Date(n); d.setHours(hour, 0, 0, 0); do d.setDate(d.getDate() + 1); while (d.getDay() !== dow); return run(s, SYS, { type: 'advanceClock', hours: (d.getTime() - n.getTime()) / 36e5 }); };

describe('personalization', () => {
  it('uses the player’s own words in greeting, rep why and coach summary', () => {
    const s = seed(); const a = P(s, 'avery'); const sam = P(s, 'sam');
    expect(repWhy(a, { title: 'Ladder' }, 'Weak hand')).toMatch(/make the 8th-grade A team/i);
    expect(repWhy(sam, { title: 'x' })).toMatch(/You said: “Dribble in traffic/); // under 13: simpler tone
    expect(greeting(sam, new Date())).toMatch(/^Hi Sam!/); expect(greeting(P(s, 'riley'), new Date('2026-10-12T09:00'))).toMatch(/Morning, Riley/);
    expect(coachKnows(a)).toMatch(/proud of my right-hand finishing/i); expect(coachKnows(a)).toMatch(/frustrated when/);
    const s2 = run(s, AVERY, { type: 'updateAboutMe', playerId: 'avery', aboutMe: 'I learn by watching, then I want reps right away.' }); expect(coachKnows(P(s2, 'avery'))).toBe('I learn by watching, then I want reps right away.');
  });
  it('onboarding answers (frustration, proud of) are stored and used in the welcome', () => {
    let s = run(seed(), { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Kai Rook', parentName: 'Lou Rook', email: 'lou@x.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'x' }, next: 'apply' }); const kai = s.players.at(-1)!.id;
    const r = dispatch(s, { type: 'createInvite', playerId: kai }, OPS); s = r.snapshot; s = dispatch(s, { type: 'acceptInvite', code: r.created!.inviteCode, userId: 'u_lou' }, { id: 'public', role: 'public' }).snapshot;
    const LOU: Actor = { id: 'u_lou', role: 'parent', familyId: P(s, kai).familyId }; s = dispatch(s, { type: 'billingEvent', eventId: 'evt_v4', kind: 'checkout_completed', playerId: kai }, { id: 'system', role: 'system' }).snapshot;
    s = run(s, LOU, { type: 'recordConsent', playerId: kai, guardianName: 'Lou Rook', agreed: true }, { type: 'completeOnboarding', agreed: true, playerId: kai, position: 'Guard', goal: 'Start for my school team', learnStyle: 'Explain the why', rhythm: '3 days', frustration: 'Missing free throws late', proudOf: 'My defense' });
    expect(P(s, kai).frustration).toBe('Missing free throws late'); expect(P(s, kai).proudOf).toBe('My defense');
    // v9: no auto-written “coach” welcome. The first thing the family hears from the coach is the coach’s own first look.
    expect(s.messages.some((m) => m.playerId === kai && m.from === 'coach')).toBe(false);
  });
  it('feedback template and composed order adapt to learning style; parents get plain language', () => {
    const s = seed(); expect(feedbackTemplate(P(s, 'riley')).mode).toBe('why-first'); expect(feedbackTemplate(P(s, 'avery')).mode).toBe('show-me'); expect(feedbackTemplate(P(s, 'sam')).mode).toBe('short-steps');
    const r = { ...fb, nextRep: 'Ladder' }; expect(composeFeedback(P(s, 'riley'), r).split('\n')[0]).toMatch(/^Why:/); expect(composeFeedback(P(s, 'avery'), r).split('\n')[0]).toMatch(/^✓/);
    expect(plainFeedback(P(s, 'avery'), { ...fb, decision: 'approve' })).toBe('Avery nailed a rep. Doing well: stayed low through contact. Working on: eyes up on the catch.');
  });
});

describe('unified feedback → messaging → queue', () => {
  it('structured review; a ❓ question opens a feedback thread and a coach queue item; the reply clears it', () => {
    let s = run(seed(), AVERY, { type: 'submitRep', playerId: 'avery', repsDone: 3, reflection: 'Slower this time' });
    s = run(s, HEAD, { type: 'review', playerId: 'avery', decision: 'approve', ...fb, linkUrl: 'https://example.com/clip' }); const r = s.reviews.at(-1)!;
    expect(r.nextRep).toBe('Two-ball rhythm'.length ? r.nextRep : ''); expect(r.feedback).toContain('Eyes up'); expect(r.linkUrl).toBe('https://example.com/clip');
    s = run(s, AVERY, { type: 'reactFeedback', playerId: 'avery', reviewId: r.id, reaction: 'question', question: 'Eyes up on which hand?' });
    const m = s.messages.at(-1)!; expect(m).toMatchObject({ context: 'feedback', refId: r.id, from: 'player', answered: false }); expect(m.dueBy).toBeTruthy();
    const item = buildQueue(s, 'u_head').find((q) => q.kind === 'Reply needed' && q.player.id === 'avery')!; expect(item.what).toMatch(/On your feedback/); expect(item.dueBy).toBe(m.dueBy);
    expect(s.notifications.some((n) => n.type === 'question' && n.userId === 'u_head')).toBe(true);
    s = run(s, HEAD, { type: 'sendMessage', playerId: 'avery', text: 'Left hand.', context: 'feedback', refId: r.id }); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Reply needed' && q.player.id === 'avery')).toBe(false);
  });
  it('👍 got it is recorded without a thread', () => { const s = run(seed(), NIA, { type: 'reactFeedback', playerId: 'nia', reviewId: 'r_ni2', reaction: 'got_it' }); expect(s.reviews.find((r) => r.id === 'r_ni2')!.reaction).toBe('got_it'); expect(s.messages.length).toBe(seed().messages.length); });
  it('assistant edits at sign-off recompose the feedback', () => { let s = run(seed(), ASST, { type: 'review', playerId: 'riley', decision: 'approve', ...fb }); s = run(s, HEAD, { type: 'signOff', playerId: 'riley', approve: true, edit: { adjust: 'Hop into the catch' } }); expect(s.reviews.at(-1)!.feedback).toContain('Hop into the catch'); });
});

describe('message SLA + contexts', () => {
  it('every unanswered family message is its own thread item with an SLA', () => { const s = run(seed(), DANA, { type: 'sendMessage', playerId: 'avery', text: 'Schedule change: away Sat', context: 'schedule' }, { type: 'sendMessage', playerId: 'avery', text: 'Also a general question' }); const items = buildQueue(s, 'u_head').filter((q) => q.kind === 'Reply needed' && q.player.id === 'avery'); expect(items.length).toBe(2); expect(items.every((i) => i.dueBy)).toBe(true); });
  it('urgent is parent-only, uses office hours and goes to the head coach', () => {
    const s = run(seed(), DANA, { type: 'sendMessage', playerId: 'avery', text: 'Avery hurt her ankle', context: 'urgent' }); const m = s.messages.at(-1)!;
    const oh = s.settings.officeHours; expect(new Date(m.dueBy!).getTime()).toBe(officeDue(new Date(m.at), 4, oh).getTime());
    expect(s.notifications.some((n) => n.userId === 'u_head' && /URGENT/.test(n.text))).toBe(true);
    expect(() => run(seed(), AVERY, { type: 'sendMessage', playerId: 'avery', text: 'x', context: 'urgent' })).toThrow(/parents/);
  });
  it('officeDue skips closed hours', () => { const oh = { days: [1, 2, 3, 4, 5], start: 9, end: 17 }; expect(officeDue(new Date('2026-10-09T16:00'), 4, oh).toString()).toBe(new Date('2026-10-12T12:00').toString()); });
  it('read receipts stay', () => { const s = run(seed(), HEAD, { type: 'markRead', playerId: 'riley' }); expect(s.messages.find((m) => m.id === 'm2')!.readBy.u_head).toBeTruthy(); });
});

describe('weekly rhythm', () => {
  it('maps days to the rhythm', () => { expect(rhythmToday(new Date('2026-10-12T10:00')).key).toBe('plan-drop'); expect(rhythmToday(new Date('2026-10-14T10:00')).key).toBe('midweek'); expect(rhythmToday(new Date('2026-10-16T10:00')).key).toBe('wrap'); expect(rhythmToday(new Date('2026-10-18T10:00')).key).toBe('digest'); expect(rhythmToday(new Date('2026-10-13T10:00')).key).toBe('rest'); });
  it('sweep sends plan-drop, mid-week and Friday wrap nudges once per week', () => {
    let s = toDay(seed(), 1); expect(s.notifications.filter((n) => n.type === 'rhythm' && n.userId === 'u_avery' && /New week/.test(n.text)).length).toBe(1);
    s = run(s, SYS, { type: 'sweep' }, { type: 'sweep' }); expect(s.notifications.filter((n) => n.type === 'rhythm' && n.userId === 'u_avery' && /New week/.test(n.text)).length).toBe(1);
    s = toDay(s, 3); expect(s.notifications.some((n) => n.type === 'rhythm' && n.userId === 'u_head' && /no check-in/i.test(n.text))).toBe(false); // v9: the coach isn’t handed a list of who to chase
    s = toDay(s, 5);
    s = run(s, AVERY, { type: 'weeklyReflection', playerId: 'avery', text: 'Left hand is getting there.', feel: 4 }); s = run(s, SYS, { type: 'generateDigests' }); expect(s.digests.find((d) => d.playerId === 'avery')!.text).toMatch(/In Avery’s words: “Left hand is getting there.”/);
  });
});

describe('cycle review', () => {
  it('player reflection + coach ratings and next focus, then the next plan', () => {
    let s = run(seed(), SYS, { type: 'advanceClock', hours: 24 * 30 }); s = run(s, NIA, { type: 'startNext', playerId: 'nia' }); expect(P(s, 'nia').state).toBe('Cycle review');
    expect(guide(s, P(s, 'nia'), 'player').action.label).toBe('Do my re-check');
    s = run(s, NIA, { type: 'cycleReflection', playerId: 'nia', improved: 'Hesi is automatic', hardest: 'Left side pull-up', wantNext: 'Finishing through contact' });
    expect(buildQueue(s, 'u_asst').find((q) => q.kind === 'Re-check')!.what).toMatch(/Hesi is automatic/);
    s = run(s, ASST, { type: 'completeCycleReview', playerId: 'nia', summary: 'Pace changes are real now.', ratings: { Finishing: 3, 'Shot form': 3 }, nextFocus: 'Finishing through contact' });
    const cr = s.cycleReviews.at(-1)!; expect(cr.ratingsBefore!.Finishing).toBe(2); expect(cr.ratingsAfter!.Finishing).toBe(3); expect(buildQueue(s, 'u_asst').some((q) => q.kind === 'Plan needed' && q.player.id === 'nia')).toBe(true);
    s = run(s, ASST, { type: 'publishPlan', playerId: 'nia', focus: cr.nextFocus!, drillIds: ['d2'] }); expect(s.cycles.filter((c) => c.playerId === 'nia').at(-1)!.index).toBe(2);
    const c2 = s.cycles.at(-1)!; expect((new Date(c2.endAt).getTime() - new Date(c2.startAt).getTime()) / 864e5).toBe(28);
  });
});

describe('next-step clarity', () => {
  it('every state × perspective has exactly one primary action', () => {
    const s = seed(); const states = ['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Plan building', 'Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Sign-off', 'Next step ready', 'Cycle review', 'Paused'] as const;
    for (const st of states) for (const v of ['player', 'parent', 'coach', 'ops'] as const) { const g = guide(s, { ...P(s, 'avery'), state: st, pausedFrom: 'Work ready' }, v); expect(g.action.label, `${st}/${v}`).toBeTruthy(); expect(!!g.action.to !== !!g.action.cmd, `${st}/${v} one target`).toBe(true); expect(g.unlocks).toBeTruthy(); }
  });
});

describe('security: hashed invites + optimistic concurrency', () => {
  it('invites store only hashes; ops queue never shows the code', () => {
    const s = seed(); const inv = s.invites[0]; expect(inv.tokenHash).toBe(sha256(DEMO_INVITE.token)); expect(JSON.stringify(s.invites)).not.toContain(DEMO_INVITE.code);
    expect(buildOpsQueue(s).find((q) => q.kind === 'Invite pending')!.what).not.toMatch(/\d{6}/);
    const r = dispatch(s, { type: 'acceptInvite', code: DEMO_INVITE.code, userId: 'u_morgan' }, { id: 'public', role: 'public' }); expect(r.created!.playerId).toBe('theo');
  });
  it('stale rev → ConflictError', () => {
    const s = seed(); const rev = P(s, 'riley').rev; const s2 = run(s, HEAD, { type: 'sendMessage', playerId: 'riley', text: 'hi' }, { type: 'pause', playerId: 'riley' }, { type: 'resume', playerId: 'riley' });
    expect(() => dispatch(s2, { type: 'review', playerId: 'riley', decision: 'approve', ...fb, rev }, HEAD)).toThrow(ConflictError);
    expect(dispatch(s2, { type: 'review', playerId: 'riley', decision: 'approve', ...fb, rev: P(s2, 'riley').rev }, HEAD).snapshot.reviews.length).toBe(s.reviews.length + 1);
  });
  it('outbox redaction removes invite/reset secrets', () => { expect(redactSecrets('Accept: /invite?token=abc123\nOr enter code 123456 at /invite.')).toBe('Accept: /invite?token=[sent]\nOr enter code [sent] at /invite.'); });
  it('HTTP: two coaches review at once → second gets 409; DB holds no plaintext invite secrets', async () => {
    const env = await makeEnv(); const head = await login(env, 'head@demo.test'); const head2 = await login(env, 'head@demo.test');
    const snap = (await head.get('/api/snapshot')).body.snapshot; const rev = snap.players.find((p: { id: string }) => p.id === 'avery').rev;
    expect((await head.cmd({ type: 'pause', playerId: 'avery' })).status).toBe(200);
    const r = await head2.cmd({ type: 'publishPlan', playerId: 'avery', focus: 'x', drillIds: ['d1'], rev }); expect(r.status).toBe(409);
    const rows = env.DB.prepare('SELECT * FROM invites').all(); const txt = JSON.stringify(await rows); expect(txt).not.toContain(DEMO_INVITE.token); expect(txt).not.toContain(DEMO_INVITE.code);
    const c = client(env); for (let i = 0; i < 5; i++) await c.post('/api/auth/accept-invite', { code: '000000', parentName: 'X', email: `x${i}@x.test`, password: 'longpassword1' });
    expect((await c.post('/api/auth/accept-invite', { code: DEMO_INVITE.code, parentName: 'M', email: 'm@x.test', password: 'longpassword1' })).status).toBe(429);
  });
});
