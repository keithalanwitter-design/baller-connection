import type { Assignment, Game, Snapshot } from './domain';
import { LIBRARY } from './library';
export const DEMO_PASSWORD = 'demo-pass-123'; export const DEMO_PIN = '1234';
export const DEMO_USERS = { head: 'u_head', assistant: 'u_asst', ops: 'u_ops' };
import { addBusinessDays, isoDay, weekKey } from './time';
import { sha256 } from './sha256';
import { composeFeedback } from './personal';
/** Seeded demo clip (fictional, generated test pattern) served from the static app. */ export const DEMO_CLIP_KEY = 'demo/riley-catch-shoot.mp4';
/** Demo-only plaintext (the stored invite holds hashes). */ export const DEMO_INVITE = { token: 'demo-theo-token', code: '246810' };

/** Fictional demo data. Times are relative to `base` so the demo always looks current. */
export function seed(base = new Date()): Snapshot {
  const G = (id: string, playerId: string, daysAgo: number, cycleId: string | null, opponent: string, stats: Game['stats'], confidence: number, focus: number, energy: number, wellDone: string, replay: string, focusTried: Game['focusTried'], seen: boolean): Game => ({ id, playerId, date: isoDay(new Date(base.getTime() - daysAgo * 864e5)), at: new Date(base.getTime() - daysAgo * 864e5 + 3 * 36e5).toISOString(), opponent, stats, confidence, focus, energy, wellDone, replay, focusTried, cycleId, focusText: cycleId ? { c_avery: 'Weak-hand control under pressure', c_riley: 'Catch-and-shoot rhythm' }[cycleId] ?? null : null, wantsReply: false, dueBy: null, seenAt: seen ? new Date(base.getTime() - (daysAgo - 1) * 864e5).toISOString() : null, seenBy: seen ? 'u_head' : null, reply: null });
  const h = (hrs: number) => new Date(base.getTime() - hrs * 36e5).toISOString();
  const d = (days: number) => isoDay(new Date(base.getTime() + days * 864e5));
  const A = (id: string, pid: string, cyc: string, order: number, li: number, status: Assignment['status']): Assignment => ({ id, playerId: pid, cycleId: cyc, order, status, drillId: `d${li + 1}`, ...LIBRARY[li] });
  const habits = (pid: string, days: number[]) => days.flatMap((k) => ['Handles 10 min', 'Form shots 25', 'Sleep 9 h'].map((key) => ({ id: `h_${pid}_${k}_${key.length}`, playerId: pid, date: d(-k), key })));
  const R = (id: string, submissionId: string, playerId: string, decision: 'approve' | 'retry', wentWell: string, adjust: string, why: string, nextRep: string, at: string, reviewerId: string, signedOffBy: string | null, reaction: 'got_it' | null) => ({ id, submissionId, playerId, decision, wentWell, adjust, why, nextRep, linkUrl: null, feedback: composeFeedback({ learnStyle: playerId === 'avery' || playerId === 'nia' ? 'Watch, then try' : 'Explain the why' } as never, { wentWell, adjust, why, nextRep }), reaction, reactedAt: reaction ? at : null, at, reviewerId, status: 'final' as const, signedOffBy });
  const rub = (a: number, b: number, c: number, e: number, f: number) => ({ 'Ball security': a, Finishing: b, Defense: c, 'Shot form': e, Confidence: f });
  return {
    version: 1, clockOffsetMs: 0,
    settings: { programName: 'Baller Connection', accent: '#FF5E1A', availability: 'Mon–Fri 3–8 PM CT · Sat 9–12', sla: { Foundation: 2, Development: 1, 'Inner Circle': 0 }, capacity: 15, innerCircleCap: 4, requireSignoff: true, dueSoonHours: 6, inviteDays: 7,
      reviewsPerWeek: { Foundation: 1, Development: 3, 'Inner Circle': 99 }, officeHours: { days: [1, 2, 3, 4, 5, 6], start: 9, end: 20 }, urgentReplyHours: 4, cycleWeeks: 4,
      savedReplies: ['Great question. Short answer: yes, same reps, same tempo.', 'Thanks for the heads-up. Lighten the day before a game: habits only.', 'Let’s cover this on your next session. I’ve added it to my notes.'] },
    users: [
      { id: 'u_head', name: 'Coach [Your Name]', email: 'head@demo.test', role: 'head', active: true },
      { id: 'u_asst', name: 'Jamie Reed', email: 'assistant@demo.test', role: 'assistant', active: true },
      { id: 'u_ops', name: 'Lee Hart', email: 'ops@demo.test', role: 'ops', active: true },
      { id: 'u_dana', name: 'Dana Pine', email: 'dana@demo.test', role: 'parent', familyId: 'f_pine', active: true },
      { id: 'u_chris', name: 'Chris Moss', email: 'chris@demo.test', role: 'parent', familyId: 'f_moss', active: true },
      { id: 'u_jo', name: 'Jo Quill', email: 'jo@demo.test', role: 'parent', familyId: 'f_quill', active: true },
      { id: 'u_ray', name: 'Ray Fable', email: 'ray@demo.test', role: 'parent', familyId: 'f_fable', active: true },
      { id: 'u_avery', name: 'Avery Pine', username: 'avery.pine', role: 'player', playerId: 'avery', familyId: 'f_pine', active: true },
      { id: 'u_riley', name: 'Riley Moss', email: 'riley@demo.test', role: 'player', playerId: 'riley', familyId: 'f_moss', active: true },
      { id: 'u_nia', name: 'Nia Fable', username: 'nia.fable', role: 'player', playerId: 'nia', familyId: 'f_fable', active: true },
      { id: 'u_sam', name: 'Sam Quill', username: 'sam.quill', role: 'player', playerId: 'sam', familyId: 'f_quill', active: true },
    ],
    drills: [...LIBRARY.map((l, i) => ({ id: `d${i + 1}`, ...l, tags: [['handles'], ['finishing'], ['shooting'], ['defense'], ['handles', 'shooting'], ['self-check']][i], createdBy: 'u_head', archived: false })),
      { id: 'd7', title: 'Pressure finish: make it to move on', reps: 4, minutes: 12, cues: ['Game speed from the first rep', 'Left hand only', 'Two misses in a row = start the set over'], tags: ['finishing', 'pressure'], createdBy: 'u_head', archived: false, pressure: { kind: 'counted', target: 'Make 4 of 5 left-hand finishes to finish the set' } },
    ],
    templates: [{ id: 't1', name: 'Weak-hand starter (4 wk)', focus: 'Weak-hand control under pressure', drillIds: ['d1', 'd2', 'd6'], createdBy: 'u_head' }, { id: 't2', name: 'Shooter’s rhythm', focus: 'Catch-and-shoot rhythm', drillIds: ['d3', 'd5'], createdBy: 'u_head' }],
    consents: ['avery', 'riley', 'sam', 'nia'].map((pid) => ({ id: `cs_${pid}`, playerId: pid, guardianName: { avery: 'Dana Pine', riley: 'Chris Moss', sam: 'Jo Quill', nia: 'Ray Fable' }[pid]!, userId: `u_${{ avery: 'dana', riley: 'chris', sam: 'jo', nia: 'ray' }[pid]}`, version: '2026-10b', text: 'Seeded consent', at: h(300) })),
    meetings: [
      { id: 'mt1', playerId: 'riley', staffId: 'u_asst', at: new Date(base.getTime() + 26 * 36e5).toISOString(), minutes: 30, kind: 'live', note: 'Weekly live session', status: 'scheduled' },
      { id: 'mt2', playerId: 'avery', staffId: 'u_head', at: new Date(base.getTime() + 72 * 36e5).toISOString(), minutes: 20, kind: 'check-in', note: 'Monthly video check-in', status: 'scheduled' },
    ],
    notifications: [], outbox: [], dataRequests: [], billingEvents: [],
    // v7: fictional game logs. Avery's focus is starting to show up in games; Riley's isn't yet (transfer cue) and confidence dipped twice (coach-only flag).
    games: [
      G('g_av1', 'avery', 20, null, 'Eastside Hawks', { pts: 4, reb: 3, ast: 2, fgm: 2, fga: 9 }, 2, 3, 3, 'Hustled back on defense every time', 'Lost the ball driving left', null, true),
      G('g_av2', 'avery', 8, 'c_avery', 'Lakeview', { pts: 6, reb: 4, ast: 3, fgm: 3, fga: 8 }, 3, 3, 4, 'Two good passes off the dribble', 'Picked up my dribble when they trapped', 'not_yet', true),
      G('g_av3', 'avery', 5, 'c_avery', 'Westbrook', { pts: 7, reb: 2, ast: 4, fgm: 3, fga: 7 }, 3, 4, 4, 'Stayed low on the press break', 'Rushed a left-hand layup', 'sometimes', true),
      G('g_av4', 'avery', 2, 'c_avery', 'North Park', { pts: 9, reb: 3, ast: 2, fgm: 4, fga: 8 }, 4, 4, 4, 'Went left twice and finished one through contact', 'A turnover on the first trap', 'yes', false),
      G('g_ri1', 'riley', 9, 'c_riley', 'Central', { pts: 11, reb: 5, ast: 1, fgm: 4, fga: 9, tpm: 2, tpa: 5 }, 4, 4, 4, 'Two catch-and-shoot threes in the first half', 'Hesitated on an open look', 'sometimes', true),
      G('g_ri2', 'riley', 6, 'c_riley', 'St. Mark', { pts: 5, reb: 6, ast: 2, fgm: 2, fga: 8, tpm: 0, tpa: 4 }, 3, 3, 3, 'Boxed out every possession', 'Passed up two open threes', 'not_yet', true),
      G('g_ri3', 'riley', 1, 'c_riley', 'Riverside', { pts: 4, reb: 4, ast: 3, fgm: 2, fga: 7, tpm: 0, tpa: 3 }, 2, 3, 3, 'Three assists off the drive', 'Feet were late on the catch again', 'not_yet', false),
    ],
    wins: [
      { id: 'w_av1', playerId: 'avery', at: h(48), kind: 'best', text: 'Personal best: 9 points vs North Park', refId: 'g_av4', by: null, key: 'best:pts:9' },
      { id: 'w_av2', playerId: 'avery', at: h(48), kind: 'focus', text: 'Took the focus into a game: Weak-hand control under pressure', refId: 'g_av4', by: null, key: 'focus:c_avery' },
      { id: 'w_av3', playerId: 'avery', at: h(40), kind: 'coach', text: 'Finished left through contact vs North Park. That’s the work showing up.', refId: 'g_av4', by: 'u_head', key: 'coach:seed1' },
      { id: 'w_av4', playerId: 'avery', at: h(100), kind: 'coach', text: 'Read the switch and stayed low: first approved rep.', refId: 'r_av1', by: 'u_head', key: 'coach:seed2' },
      { id: 'w_ri1', playerId: 'riley', at: h(72), kind: 'streak', text: '3-day habit streak', refId: null, by: null, key: 'streak:3' },
    ],
    timelineNotes: [
      { id: 'tn_av1', playerId: 'avery', kind: 'annotation', refId: 'g_av4', date: d(-2), text: 'First game the left hand showed up under pressure.', status: 'approved', by: 'u_head', at: h(40) },
      { id: 'tn_av2', playerId: 'avery', kind: 'annotation', refId: 'g_av1', date: d(-20), text: 'Before the focus: avoided the left hand all game.', status: 'approved', by: 'u_head', at: h(40) },
      { id: 'tn_av3', playerId: 'avery', kind: 'story', refId: 'c_avery', date: d(-1), text: 'Since we set the focus on weak-hand control, Avery has gone from avoiding the left hand in games to trying it in most of them, and game confidence is up from 2 to 4. Why: three slow walk-through reps before game speed gave the left hand a pattern to trust. Next: the same move when the trap comes.', status: 'approved', by: 'u_head', at: h(24) },
    ],
    // v6: Stripe test-mode subscriptions for the two paying demo families (ids are fake; nothing is charged).
    subscriptions: [
      { id: 'subn_avery', playerId: 'avery', familyId: 'f_pine', tier: 'Development', status: 'active', customerId: 'cus_test_pine', subscriptionId: 'sub_test_avery', currentPeriodEnd: new Date(base.getTime() + 18 * 864e5).toISOString(), cancelAtPeriodEnd: false, pastDueSince: null, pausedByBilling: false, startedAt: h(300), updatedAt: h(300) },
      { id: 'subn_riley', playerId: 'riley', familyId: 'f_moss', tier: 'Inner Circle', status: 'active', customerId: 'cus_test_moss', subscriptionId: 'sub_test_riley', currentPeriodEnd: new Date(base.getTime() + 9 * 864e5).toISOString(), cancelAtPeriodEnd: false, pastDueSince: null, pausedByBilling: false, startedAt: h(400), updatedAt: h(400) },
    ], clips: [{ id: 'clip_riley', playerId: 'riley', assignmentId: 'a_ri1', submissionId: 's_ri1', storageKey: DEMO_CLIP_KEY, mime: 'video/mp4', bytes: 258875, durationSec: 12, watchFor: 'My feet on the catch from the left wing', uploadedBy: 'u_riley', at: h(30), deleteAfter: new Date(new Date(h(30)).getTime() + 90 * 864e5).toISOString(), deletedAt: null }],
    reflections: [{ id: 'rf_av', playerId: 'avery', week: weekKey(new Date(h(70))), text: 'Left hand felt less scary by Thursday. Still rushing on game speed.', feel: 4, at: h(70) }], cycleReviews: [],
    families: [
      { id: 'f_pine', parentName: 'Dana Pine', email: 'dana@demo.test' }, { id: 'f_moss', parentName: 'Chris Moss', email: 'chris@demo.test' },
      { id: 'f_quill', parentName: 'Jo Quill', email: 'jo@demo.test' }, { id: 'f_fable', parentName: 'Ray Fable', email: 'ray@demo.test' }, { id: 'f_banks', parentName: 'Morgan Banks', email: 'morgan@demo.test' },
    ],
    players: [
      { id: 'avery', coachId: 'u_head', billing: 'paid', familyId: 'f_pine', name: 'Avery Pine', age: 13, position: 'Guard', tier: 'Development', state: 'Work ready', stateSince: h(50), goal: 'Make the 8th-grade A team', learnStyle: 'Watch, then try', rhythm: '4 days a week, after school', canvas: 'Competitive, quiet in groups. Responds to specific praise. After 2 misses, reset with a make.', rubric: rub(3, 2, 3, 3, 3), nextSession: d(3), rev: 3, frustration: 'Losing the ball when someone pressures my left side', proudOf: 'My right-hand finishing', aboutMe: '' },
      { id: 'riley', coachId: 'u_asst', billing: 'paid', familyId: 'f_moss', name: 'Riley Moss', age: 15, position: 'Wing', tier: 'Inner Circle', state: 'Submitted', stateSince: h(30), goal: 'Earn varsity minutes', learnStyle: 'Explain the why', rhythm: '5 days a week, mornings', canvas: 'Strong IQ, overthinks mechanics. One cue per session.', rubric: rub(3, 3, 3, 3, 4), nextSession: d(1), rev: 2, frustration: 'Shooting slumps that last a whole game', proudOf: 'My basketball IQ', aboutMe: '', tournamentDate: new Date(base.getTime() + 5 * 864e5).toISOString() },
      { id: 'sam', coachId: 'u_head', billing: 'unpaid', familyId: 'f_quill', name: 'Sam Quill', age: 12, position: 'Forward', tier: 'Foundation', state: 'Plan building', stateSince: h(30), goal: 'Dribble in traffic without panicking', learnStyle: 'Just let me try it', rhythm: '3 days a week, weekends', canvas: 'New to structured training. Growth spurt: keep volume modest.', rubric: rub(2, 2, 2, 1, 2), nextSession: d(5), rev: 1, frustration: 'Getting trapped near the sideline', proudOf: 'Hustling back on defense', aboutMe: '' },
      { id: 'nia', coachId: 'u_asst', billing: 'comp', familyId: 'f_fable', name: 'Nia Fable', age: 14, position: 'Guard', tier: 'Development', state: 'Next step ready', stateSince: h(10), goal: 'Run point for her club team', learnStyle: 'Watch, then try', rhythm: '4 days a week', canvas: 'Self-starter. Ask her to explain her own reads.', rubric: rub(3, 2, 3, 2, 3), nextSession: d(2), rev: 4, frustration: 'When the defense sags and I can’t get downhill', proudOf: 'Seeing the floor', aboutMe: '' },
      { id: 'theo', coachId: 'u_head', billing: 'unpaid', familyId: 'f_banks', name: 'Theo Banks', age: 11, position: '', tier: 'Foundation', state: 'Invited', stateSince: h(20), goal: '', learnStyle: '', rhythm: '', canvas: '', rubric: {}, nextSession: d(7), rev: 0, frustration: '', proudOf: '', aboutMe: '' },
    ],
    applications: [], invites: [{ id: 'inv_theo', playerId: 'theo', email: 'morgan@demo.test', tokenHash: sha256(DEMO_INVITE.token), codeHash: sha256(DEMO_INVITE.code), sentAt: h(20), expiresAt: new Date(base.getTime() + 6 * 864e5).toISOString(), createdBy: 'u_ops', status: 'pending' }],
    cycles: [
      { id: 'c_avery', playerId: 'avery', index: 1, focus: 'Weak-hand control under pressure', startAt: h(240), endAt: h(-432), status: 'active' },
      { id: 'c_riley', playerId: 'riley', index: 1, focus: 'Catch-and-shoot rhythm', startAt: h(200), endAt: h(-472), status: 'active' },
      { id: 'c_nia', playerId: 'nia', index: 1, focus: 'Pace changes off the dribble', startAt: h(220), endAt: h(-452), status: 'active' },
    ],
    assignments: [
      A('a_av1', 'avery', 'c_avery', 0, 0, 'approved'), A('a_av2', 'avery', 'c_avery', 1, 1, 'retry'), A('a_av3', 'avery', 'c_avery', 1.5, 1, 'open'), A('a_av4', 'avery', 'c_avery', 2, 5, 'queued'),
      A('a_ri1', 'riley', 'c_riley', 0, 2, 'submitted'), A('a_ri2', 'riley', 'c_riley', 1, 3, 'queued'),
      A('a_ni1', 'nia', 'c_nia', 0, 0, 'approved'), A('a_ni2', 'nia', 'c_nia', 1, 4, 'approved'), A('a_ni3', 'nia', 'c_nia', 2, 4, 'queued'),
    ],
    submissions: [
      { id: 's_av1', assignmentId: 'a_av1', playerId: 'avery', repsDone: 6, reflection: 'Lost it on the switch twice. Better when I stayed low.', at: h(120), dueBy: addBusinessDays(new Date(h(120)), 1).toISOString(), reviewed: true },
      { id: 's_av2', assignmentId: 'a_av2', playerId: 'avery', repsDone: 3, reflection: 'Kept bringing it back to my right hand.', at: h(60), dueBy: addBusinessDays(new Date(h(60)), 1).toISOString(), reviewed: true },
      // Riley's same-day SLA was missed (seeded) so the demo shows overdue escalation.
      { id: 's_ri1', assignmentId: 'a_ri1', playerId: 'riley', repsDone: 5, reflection: 'Made 7/10 at four spots, stuck at 5/10 on the left wing. Feet felt late.', clipId: 'clip_riley', at: h(30), dueBy: h(3), reviewed: true, shots: [[7, 10], [5, 10], [7, 10], [7, 10], [6, 10]] },
      { id: 's_ni1', assignmentId: 'a_ni1', playerId: 'nia', repsDone: 6, reflection: 'Eyes up the whole time on the last 3 sets.', at: h(150), dueBy: addBusinessDays(new Date(h(150)), 1).toISOString(), reviewed: true },
      { id: 's_ni2', assignmentId: 'a_ni2', playerId: 'nia', repsDone: 6, reflection: 'Hesitation worked better than the crossover.', at: h(30), dueBy: addBusinessDays(new Date(h(30)), 1).toISOString(), reviewed: true },
    ],
    reviews: [
      R('r_av1', 's_av1', 'avery', 'approve', 'You read it right: staying low kept the ball safe', 'Keep the same height on every switch', 'Low hips = control under pressure, which is how you make the A team', 'Weak-hand finishing ladder', h(100), 'u_head', null, 'got_it'),
      R('r_av2', 's_av2', 'avery', 'retry', 'Honest note, thank you', 'Slow it down: 3 walk-through reps before game speed', 'Your left hand needs the pattern before the speed', 'Weak-hand finishing ladder again, with the adjustment', h(50), 'u_head', null, null),
      R('r_ni1', 's_ni1', 'nia', 'approve', 'Eyes up the whole time', 'Now add tempo', 'A point guard who sees the floor at speed runs the team', 'Hesitation into pull-up', h(130), 'u_asst', 'u_head', 'got_it'),
      R('r_ni2', 's_ni2', 'nia', 'approve', 'Great discovery: the hesi beat the crossover', 'Hesi into pull-up, same tempo both sides', 'Sagging defenders bite on the hesi; that’s your way downhill', 'Hesitation into pull-up (both sides)', h(10), 'u_asst', 'u_head', null),
    ],
    messages: [
      { id: 'm1', playerId: 'avery', from: 'coach', authorId: 'u_head', readBy: {}, context: 'rep', refId: 'a_av3', text: 'This week is all left hand. One rep at a time.', at: h(48), answered: true },
      { id: 'm2', playerId: 'riley', from: 'parent', authorId: 'u_chris', readBy: {}, context: 'schedule', text: 'Riley has a tournament Saturday. Should we lighten Friday?', at: h(6), dueBy: addBusinessDays(new Date(h(6)), 0).toISOString(), answered: false },
      { id: 'm3', playerId: 'nia', from: 'player', authorId: 'u_nia', readBy: {}, context: 'feedback', refId: 'r_ni2', text: 'Can I add the pull-up from the right side too?', at: h(4), dueBy: addBusinessDays(new Date(h(4)), 1).toISOString(), answered: false },
    ],
    habits: [...habits('avery', [1, 2, 3]), ...habits('riley', [0, 1, 2, 3, 4, 5]), ...habits('nia', [1, 2])],
    milestones: [
      { id: 'ms1', playerId: 'avery', key: 'First check-in', at: h(120) }, { id: 'ms2', playerId: 'avery', key: 'First approval', at: h(100) }, { id: 'ms3', playerId: 'avery', key: 'Level 2', at: h(120) },
      { id: 'ms4', playerId: 'riley', key: '3-day streak', at: h(72) }, { id: 'ms5', playerId: 'nia', key: 'First approval', at: h(130) },
    ],
    digests: [],
    events: [
      { id: 'e1', at: h(60), role: 'player', playerId: 'avery', type: 'transition', from: 'Work ready', to: 'Submitted', detail: 'Weak-hand finishing ladder: 3/5 sets' },
      { id: 'e2', at: h(50), role: 'head', playerId: 'avery', type: 'transition', from: 'Submitted', to: 'Work ready', detail: 'Another attempt: Weak-hand finishing ladder' },
      { id: 'e3', at: h(30), role: 'parent', playerId: 'sam', type: 'transition', from: 'Onboarding', to: 'Plan building', detail: 'Onboarding complete — coach owes first plan' },
      { id: 'e4', at: h(26), role: 'player', playerId: 'riley', type: 'transition', from: 'Work ready', to: 'Submitted', detail: 'Form shooting: 5 spots · 5/5 sets' },
      { id: 'e5', at: h(20), role: 'ops', playerId: 'theo', type: 'transition', from: 'Fit review', to: 'Invited', detail: 'Invite sent (5/15 spots)' },
      { id: 'e6', at: h(10), role: 'head', playerId: 'nia', type: 'transition', from: 'Feedback due', to: 'Next step ready', detail: 'Approved: Hesitation into pull-up' },
    ],
  };
}
