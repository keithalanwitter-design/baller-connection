import type { Assignment, Snapshot } from './domain';
import { LIBRARY } from './library';
export const DEMO_PASSWORD = 'demo-pass-123'; export const DEMO_PIN = '1234';
export const DEMO_USERS = { head: 'u_head', assistant: 'u_asst', ops: 'u_ops' };
import { addBusinessDays, isoDay, weekKey } from './time';
import { sha256 } from './sha256';
import { composeFeedback } from './personal';
/** Demo-only plaintext (the stored invite holds hashes). */ export const DEMO_INVITE = { token: 'demo-theo-token', code: '246810' };

/** Fictional demo data. Times are relative to `base` so the demo always looks current. */
export function seed(base = new Date()): Snapshot {
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
    drills: LIBRARY.map((l, i) => ({ id: `d${i + 1}`, ...l, tags: [['handles'], ['finishing'], ['shooting'], ['defense'], ['handles', 'shooting'], ['self-check']][i], createdBy: 'u_head', archived: false })),
    templates: [{ id: 't1', name: 'Weak-hand starter (4 wk)', focus: 'Weak-hand control under pressure', drillIds: ['d1', 'd2', 'd6'], createdBy: 'u_head' }, { id: 't2', name: 'Shooter’s rhythm', focus: 'Catch-and-shoot rhythm', drillIds: ['d3', 'd5'], createdBy: 'u_head' }],
    consents: ['avery', 'riley', 'sam', 'nia'].map((pid) => ({ id: `cs_${pid}`, playerId: pid, guardianName: { avery: 'Dana Pine', riley: 'Chris Moss', sam: 'Jo Quill', nia: 'Ray Fable' }[pid]!, userId: `u_${{ avery: 'dana', riley: 'chris', sam: 'jo', nia: 'ray' }[pid]}`, version: '2026-10', text: 'Seeded consent', at: h(300) })),
    meetings: [
      { id: 'mt1', playerId: 'riley', staffId: 'u_asst', at: new Date(base.getTime() + 26 * 36e5).toISOString(), minutes: 30, kind: 'live', note: 'Weekly live session', status: 'scheduled' },
      { id: 'mt2', playerId: 'avery', staffId: 'u_head', at: new Date(base.getTime() + 72 * 36e5).toISOString(), minutes: 20, kind: 'check-in', note: 'Monthly video check-in', status: 'scheduled' },
    ],
    notifications: [], outbox: [], dataRequests: [], reflections: [{ id: 'rf_av', playerId: 'avery', week: weekKey(new Date(h(70))), text: 'Left hand felt less scary by Thursday. Still rushing on game speed.', feel: 4, at: h(70) }], cycleReviews: [],
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
      { id: 's_ri1', assignmentId: 'a_ri1', playerId: 'riley', repsDone: 5, reflection: 'Made 7/10 at four spots, stuck at 5/10 on the left wing. Feet felt late.', at: h(30), dueBy: h(3), reviewed: true },
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
