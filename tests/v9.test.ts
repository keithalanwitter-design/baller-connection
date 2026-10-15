// v9: a coach who sees your reps between sessions. Teach-back, session notes → focus, miss-a-week, “I’m stuck”,
// parent week, game note + mark, show-me-again, optional gamification, defaults, copy.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch, parentOnly, WorkflowError } from '../shared/engine';
import { PermissionError, scopeSnapshot, type Actor } from '../shared/permissions';
import { seed } from '../shared/seed';
import { buildQueue, clock, guide } from '../shared/workflow';
import { latestSession, parentSentence, parentTips, sinceWeek1, sessionLine, teachBackWaiting } from '../shared/v9';
import { SAVED_REPLIES, CHECKIN_STARTERS } from '../shared/domain';
import { login, makeEnv } from './helpers';

const HEAD: Actor = { id: 'u_head', role: 'head' }; const SYS: Actor = { id: 'system', role: 'system' };
const AV: Actor = { id: 'u_avery', role: 'player', playerId: 'avery', familyId: 'f_pine' }; const DANA: Actor = { id: 'u_dana', role: 'parent', familyId: 'f_pine' };
const NIA: Actor = { id: 'u_nia', role: 'player', playerId: 'nia', familyId: 'f_fable' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const toDay = (s: Snapshot, dow: number, hour = 12) => { const n = clock(s); const d = new Date(n); d.setHours(hour, 0, 0, 0); do d.setDate(d.getDate() + 1); while (d.getDay() !== dow); return run(s, SYS, { type: 'advanceClock', hours: (d.getTime() - n.getTime()) / 36e5 }); };

describe('teach-back (instead of tap-to-confirm)', () => {
  it('is the player’s own words, optional, and the next rep opens either way', () => {
    const s0 = seed(); expect(guide(s0, P(s0, 'nia'), 'player').action?.label).toMatch(/Say it in my words/);
    const said = run(s0, NIA, { type: 'teachBack', playerId: 'nia', reviewId: 'r_ni2', change: 'Keep the pace change the same on my left.', notice: 'My left foot lands flat.' });
    expect(P(said, 'nia').state).toBe('Work ready'); expect(said.reviews.find((r) => r.id === 'r_ni2')!.teachBack).toMatchObject({ mark: null, notice: 'My left foot lands flat.' });
    const skipped = run(s0, NIA, { type: 'startNext', playerId: 'nia' }); expect(P(skipped, 'nia').state).not.toBe('Next step ready'); expect(skipped.reviews.find((r) => r.id === 'r_ni2')!.teachBack).toBeFalsy();
    expect(() => run(s0, NIA, { type: 'teachBack', playerId: 'nia', reviewId: 'r_ni2', change: 'ok' })).toThrow(WorkflowError);
  });
  it('only the player says it back; a parent cannot answer for them', () => {
    expect(() => run(seed(), DANA, { type: 'teachBack', playerId: 'avery', reviewId: 'r_av2', change: 'I will keep the left hand low.' })).toThrow(PermissionError);
    expect(() => run(seed(), HEAD, { type: 'teachBack', playerId: 'avery', reviewId: 'r_av2', change: 'I will keep the left hand low.' })).toThrow(PermissionError);
  });
  it('the coach marks it: “got it” tells the player; “clarify” needs a line and opens a short thread', () => {
    let s = seed(); expect(teachBackWaiting(s, 'avery').map((r) => r.id)).toEqual(['r_av2']); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Teach-back' && q.player.id === 'avery')).toBe(true);
    expect(() => run(s, HEAD, { type: 'markTeachBack', playerId: 'avery', reviewId: 'r_av2', mark: 'clarify' })).toThrow(WorkflowError);
    const clar = run(s, HEAD, { type: 'markTeachBack', playerId: 'avery', reviewId: 'r_av2', mark: 'clarify', note: 'Which hand are you keeping low? Say it once more.' });
    expect(clar.messages.at(-1)).toMatchObject({ context: 'feedback', refId: 'r_av2', from: 'coach' }); expect(clar.reviews.find((r) => r.id === 'r_av2')!.teachBack!.mark).toBe('clarify');
    s = run(s, HEAD, { type: 'markTeachBack', playerId: 'avery', reviewId: 'r_av2', mark: 'got-it' }); expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Teach-back' && q.player.id === 'avery')).toBe(false);
    expect(s.notifications.some((n) => n.userId === 'u_avery' && n.type === 'teachback' && /got it/.test(n.text))).toBe(true);
  });
});

describe('in-person session note → next focus', () => {
  it('sets the active focus, shows “From your session on …”, and feeds the first look', () => {
    const s = run(seed(), HEAD, { type: 'logSession', playerId: 'avery', note: 'Great hands today. Dropped the ball on contact twice.', focus: 'Left hand low through contact', cue: 'Two hands to the chest' });
    expect(s.cycles.find((c) => c.id === 'c_avery')!.focus).toBe('Left hand low through contact'); const x = latestSession(s, 'avery')!; expect(x.focus).toBe('Left hand low through contact'); expect(sessionLine(x)).toMatch(/^From your session on [A-Z][a-z]{2}$/);
    expect(s.notifications.some((n) => n.userId === 'u_avery' && n.type === 'session')).toBe(true);
    expect(() => run(seed(), HEAD, { type: 'logSession', playerId: 'avery', note: 'x', focus: '' })).toThrow(WorkflowError); expect(() => run(seed(), AV, { type: 'logSession', playerId: 'avery', note: 'my own note here', focus: 'mine' })).toThrow(PermissionError);
  });
  it('a first plan needs the coach’s own “what I saw”, which becomes the first thing the player hears', () => {
    const s = seed(); expect(() => run(s, HEAD, { type: 'publishPlan', playerId: 'sam', focus: 'Handle pressure', drillIds: ['d1'] })).toThrow(WorkflowError);
    const ok = run(s, HEAD, { type: 'logSession', playerId: 'sam', note: 'Quick feet, drifts away from the body on the cross-over.', focus: 'Ball close on the cross-over' }, { type: 'publishPlan', playerId: 'sam', focus: 'Ball close on the cross-over', drillIds: ['d1'], saw: 'Quick feet and good eyes. The ball drifts on the cross-over.', source: 'session' });
    expect(P(ok, 'sam').firstLook).toMatchObject({ source: 'session' }); expect(ok.messages.some((m) => m.playerId === 'sam' && m.from === 'coach' && /First look: Quick feet/.test(m.text))).toBe(true);
  });
});

describe('miss-a-week flow (no scolding, no streak at stake)', () => {
  it('the player picks a light week, a reset, or a talk; a talk is a private check-in the coach sees', () => {
    let s = run(seed(), AV, { type: 'roughWeek', playerId: 'avery', choice: 'light' }); expect(P(s, 'avery').weekChoice?.choice).toBe('light');
    s = run(seed(), AV, { type: 'roughWeek', playerId: 'avery', choice: 'talk', note: 'Tests all week.' }); expect(s.messages.at(-1)).toMatchObject({ context: 'checkin', from: 'player' }); expect(s.notifications.some((n) => n.userId === 'u_head' && n.type === 'stuck')).toBe(true);
    expect(scopeSnapshot(s, DANA).messages.some((m) => m.context === 'checkin')).toBe(false); expect(() => run(seed(), AV, { type: 'roughWeek', playerId: 'avery', choice: 'quit' as never })).toThrow(WorkflowError);
  });
  it('Friday offers the three ways forward when nothing came in, once, and not after a choice; the coach is never handed a chase list', () => {
    const s0 = seed(); s0.submissions = s0.submissions.filter((x) => x.playerId !== 'avery'); s0.players.find((p) => p.id === 'avery')!.state = 'Work ready';
    const fri = toDay(s0, 5); expect(fri.notifications.filter((n) => n.userId === 'u_avery' && /Rough week\?/.test(n.text)).length).toBe(1);
    const again = run(fri, SYS, { type: 'sweep' }, { type: 'sweep' }); expect(again.notifications.filter((n) => n.userId === 'u_avery' && /Rough week\?/.test(n.text)).length).toBe(1);
    const chose = toDay(run(s0, AV, { type: 'roughWeek', playerId: 'avery', choice: 'reset' }), 5); expect(chose.notifications.filter((n) => n.userId === 'u_avery' && /Rough week\?/.test(n.text)).length).toBe(0);
    expect(fri.notifications.some((n) => n.userId === 'u_head' && /missed|overdue|behind|no check-in/i.test(n.text) && n.type === 'rhythm')).toBe(false);
  });
  it('the rhythm is the player’s agreed pace, and the clip-day nudge goes to the player only', () => {
    const s = run(seed(), AV, { type: 'setRhythm', playerId: 'avery', repsPerWeek: 2, clipDay: 'Thursday' }); expect(P(s, 'avery').rhythmPlan).toEqual({ repsPerWeek: 2, clipDay: 'Thursday' });
    expect(() => run(seed(), AV, { type: 'setRhythm', playerId: 'avery', repsPerWeek: 9, clipDay: 'Thursday' })).toThrow(WorkflowError);
  });
});

describe('“I’m stuck” → private note → coach reply', () => {
  it('goes to the coach only, with the plan’s reply window, in three gentle prompts', () => {
    let s = run(seed(), AV, { type: 'sendStuck', playerId: 'avery', happened: 'Lost the ball three times', want: 'Just to talk', feeling: 'Annoyed' }); const m = s.messages.at(-1)!;
    expect(m).toMatchObject({ context: 'stuck', from: 'player' }); expect(m.text).toMatch(/Lost the ball three times/); expect(m.dueBy).toBeTruthy();
    expect(JSON.stringify(scopeSnapshot(s, DANA).messages)).not.toContain('Lost the ball three times'); expect(JSON.stringify(scopeSnapshot(s, { id: 'u_ops', role: 'ops' }).messages)).not.toContain('Lost the ball three times');
    expect(buildQueue(s, 'u_head').some((q) => q.kind === 'Check in' && q.player.id === 'avery')).toBe(true);
    s = run(s, HEAD, { type: 'sendMessage', playerId: 'avery', text: 'Thanks for telling me. Everyone has those weeks. Thursday we just do form shots.', context: 'checkin' });
    expect(s.messages.at(-1)).toMatchObject({ from: 'coach', context: 'checkin' }); expect(scopeSnapshot(s, DANA).messages.some((x) => x.context === 'checkin')).toBe(false);
    expect(() => run(seed(), DANA, { type: 'sendStuck', playerId: 'avery', happened: 'a parent cannot send this' })).toThrow(PermissionError);
    expect(() => run(seed(), DANA, { type: 'sendMessage', playerId: 'avery', text: 'hi', context: 'stuck' })).toThrow(WorkflowError);
  });
  it('a coach can check in on a player first, and the starters are warm, short and never clinical', () => {
    const s = run(seed(), HEAD, { type: 'sendCheckIn', playerId: 'riley', text: 'Saw the last game. Tough one. How are you feeling about it?' }); expect(s.messages.at(-1)).toMatchObject({ context: 'checkin', from: 'coach' });
    for (const t of [...SAVED_REPLIES, ...CHECKIN_STARTERS]) { expect(t).not.toMatch(/depress|anxiety|disorder|diagnos|therap|mental health|you should have|disappoint/i); expect(t.length).toBeLessThan(260); }
  });
  it('private threads are served over the API only to the player and coaches', async () => {
    const env = await makeEnv(); const av = await login(env, 'avery', '1234', true).catch(() => null); const dana = await login(env, 'dana@demo.test'); const head = await login(env, 'head@demo.test');
    const seen = (await dana.get('/api/snapshot')).body.snapshot.messages as { context: string }[]; expect(seen.some((m) => m.context === 'stuck' || m.context === 'checkin')).toBe(false);
    const coachSeen = (await head.get('/api/snapshot')).body.snapshot.messages as { context: string }[]; expect(coachSeen.some((m) => m.context === 'stuck')).toBe(true); void av;
  });
});

describe('what a parent sees', () => {
  it('one sentence plus do/don’t tips; the coach’s own sentence wins for the week', () => {
    let s = seed(); s.players.find((p) => p.id === 'avery')!.parentNote = undefined as never; const auto = parentSentence(s, P(s, 'avery')); expect(auto.byCoach).toBe(false); expect(auto.text).toMatch(/Avery is working on/); expect(parentTips(s, P(s, 'avery'))).toHaveLength(3);
    expect(parentTips(s, P(s, 'avery')).some((t) => t.kind === 'do')).toBe(true); expect(parentTips(s, P(s, 'avery')).some((t) => t.kind === 'dont')).toBe(true);
    s = run(s, HEAD, { type: 'setParentNote', playerId: 'avery', text: 'Avery is learning to keep the left hand low. Ask about the rep, not the result.' }); expect(parentSentence(s, P(s, 'avery'))).toMatchObject({ byCoach: true }); expect(() => run(s, DANA, { type: 'setParentNote', playerId: 'avery', text: 'I will write my own sentence' })).toThrow(PermissionError);
  });
  it('per-rep notifications are off by default; a parent can opt in; the player always hears', () => {
    const rev = (s: Snapshot) => run(s, HEAD, { type: 'review', playerId: 'riley', decision: 'approve', wentWell: 'Feet set', adjust: 'Hold the follow-through', why: 'Arc' });
    const off = rev(seed()); expect(off.notifications.some((n) => n.userId === 'u_riley' && n.type === 'feedback_ready')).toBe(true); expect(off.notifications.some((n) => n.userId === 'u_chris' && n.type === 'feedback_ready')).toBe(false);
    const on = rev(run(seed(), { id: 'u_chris', role: 'parent', familyId: 'f_moss' }, { type: 'setEmailPrefs', prefs: { parentCopy: true } })); expect(on.notifications.some((n) => n.userId === 'u_chris' && n.type === 'feedback_ready')).toBe(true);
    expect(seed().users.find((u) => u.id === 'u_dana')!.prefs?.parentCopy ?? false).toBe(false);
  });
  it('the Sunday note carries the clips sent, the sentence and the coach’s read of a game note, never a streak or a rate', () => {
    const d = run(seed(), SYS, { type: 'generateDigests' }).digests.find((x) => x.playerId === 'avery')!.text; expect(d).toMatch(/Avery sent \d+ check-in/); expect(d).not.toMatch(/streak|level|%|transfer/i);
  });
  it('roles agreement is required at onboarding', () => { expect(() => run(seed(), { id: 'u_x', role: 'parent', familyId: 'f_quill' }, { type: 'completeOnboarding', playerId: 'sam', agreed: false, position: 'Guard', goal: 'x goal', learnStyle: 'Video', rhythm: '3 days' })).toThrow(); });
});

describe('fit: the player’s own words', () => {
  it('parent-only applications are flagged for the coach, not rejected', () => {
    expect(parentOnly({ want: 'Mostly mine (parent)' })).toBe(true); expect(parentOnly({ want: 'Both of us', playerWords: 'Stop turning it over under pressure' })).toBe(false); expect(parentOnly({ want: 'Both of us', playerWords: 'idk' })).toBe(true);
    const s = run(seed(), { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Kai Rook', parentName: 'Lou Rook', email: 'lou@demo.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'Start', want: 'Mostly mine (parent)' }, next: 'apply' });
    const kai = s.players.at(-1)!; expect(kai.state).toBe('Applied'); expect(s.notifications.some((n) => n.type === 'new_application' && /Not a no/.test(n.text))).toBe(true);
    const s2 = run(seed(), { id: 'public', role: 'public' }, { type: 'submitApplication', playerName: 'Kai Rook', parentName: 'Lou Rook', email: 'lou@demo.test', answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'Start', want: 'Both of us', playerWords: 'Stop turning it over under pressure' }, next: 'apply' });
    expect(s2.notifications.some((n) => /Not a no/.test(n.text))).toBe(false);
  });
});

describe('proof is the clips', () => {
  it('shows week 1 next to now, same drill when there is one', () => { const s = seed(); const w = sinceWeek1(s, 'avery')!; expect(w.then.clip.id).toBe('clip_avery1'); expect(w.now.clip.id).toBe('clip_avery2'); expect(sinceWeek1(s, 'sam')).toBeNull(); });
  it('“show me again”: the same drill comes back as the next rep on the date, as a clip request, not a quiz', () => {
    const due = new Date(clock(seed()).getTime() + 3 * 864e5).toISOString().slice(0, 10);
    let s = run(seed(), HEAD, { type: 'requestProbe', playerId: 'avery', title: 'Two-ball dribbling', dueOn: due, note: 'Same drill, fresh clip' }); expect(P(s, 'avery').probe?.status).toBe('requested');
    s = run(s, SYS, { type: 'advanceClock', hours: 24 * 4 }); const a = s.assignments.find((x) => x.playerId === 'avery' && /^Show me again/.test(x.title))!; expect(a).toBeTruthy(); expect(s.notifications.some((n) => n.userId === 'u_avery' && /Show me again/i.test(n.text))).toBe(true);
    expect(() => run(seed(), HEAD, { type: 'requestProbe', playerId: 'avery', title: 'x', dueOn: '2020-01-01' })).toThrow(WorkflowError);
  });
});

describe('streaks and points are optional and off by default', () => {
  it('off for every seeded player; on only when the player or parent turns it on', () => {
    expect(seed().players.every((p) => !p.gamify)).toBe(true); const s = run(seed(), AV, { type: 'setGamify', playerId: 'avery', on: true }); expect(P(s, 'avery').gamify).toBe(true);
    const d = run(s, SYS, { type: 'generateDigests' }).digests.find((x) => x.playerId === 'avery')!.text; expect(d).toMatch(/Streak: \d+ days/);
  });
});

describe('copy: honest, respectful, no hype', () => {
  const read = (f: string) => fs.readFileSync(f, 'utf8');
  const playerFacing = ['src/pages/Player.tsx', 'src/v9.tsx', 'src/v5.tsx', 'shared/v9.ts', 'shared/emails.ts', 'src/pages/Welcome.tsx', 'src/pages/Apply.tsx', 'src/site/content.ts', 'src/site/Site.tsx'];
  it('never says “homework” or “assignment” to a player or parent, never implies an AI coach', () => {
    for (const f of playerFacing) { const t = read(f); expect(t, f).not.toMatch(/homework/i); expect(t, f).not.toMatch(/\bassignment\b(?!s|Id)/i); expect(t.replace(/Never an AI|AI coaching\.?|not an AI|never an AI/gi, ''), f).not.toMatch(/\bAI[- ](coach|powered|generated|feedback|analysis)|powered by AI|our AI\b/i); }
  });
  it('no hype, no percentages or transfer rates on public pages, no points/leaderboard promises', () => {
    for (const f of ['src/site/content.ts', 'src/site/Site.tsx', 'src/pages/Apply.tsx']) { const t = read(f); expect(t, f).not.toMatch(/\b(elite|revolutionary|world-class|unlock your potential|guaranteed?|game-changer|supercharge|crush it|dominate)\b/i); expect(t, f).not.toMatch(/63%|transfer rate|transfer\./i); }
  });
  it('the player-facing stuck, teach-back and rough-week copy is warm and plain', () => {
    const v = read('shared/v9.ts'); expect(v).toMatch(/I’m stuck|I’m frustrated|stuck/i); expect(v).not.toMatch(/you must|you failed|disappointed|lazy|excuse/i);
  });
  it('the landing leads with the method and keeps the outcome line', () => { const c = read('src/site/content.ts'); expect(c).toMatch(/A coach who sees your reps between sessions/); expect(c).toMatch(/Make practice show up in games/); });
  it('VOICE.md and BUILD-PLAN-v9.md exist and name the principles', () => { for (const f of ['VOICE.md', 'BUILD-PLAN-v9.md']) expect(fs.existsSync(f), f).toBe(true); });
});

describe('migration 0010 (SQL path)', () => {
  it('the new tables and columns persist through the SQL repository', async () => {
    const env = await makeEnv(); const head = await login(env, 'head@demo.test');
    const r = await head.cmd({ type: 'logSession', playerId: 'avery', note: 'Sharp hands. Lost it on contact.', focus: 'Left hand low through contact' }); expect(r.status).toBe(200);
    const snap = (await head.get('/api/snapshot')).body.snapshot as Snapshot; expect(snap.sessions.some((x) => x.playerId === 'avery' && /Left hand low/.test(x.focus))).toBe(true);
    const p = snap.players.find((x) => x.id === 'avery')!; expect(p.rhythmPlan).toBeTruthy(); expect(p.firstLook?.saw).toBeTruthy(); const rv = snap.reviews.find((x) => x.id === 'r_av2')!; expect(rv.teachBack?.change).toBeTruthy(); expect(snap.games.some((g) => g.mark === 'carried')).toBe(true);
    const avParent = await login(env, 'dana@demo.test'); const rr = await avParent.cmd({ type: 'setEmailPrefs', prefs: { parentCopy: true } }); expect(rr.status).toBe(200);
  });
});
