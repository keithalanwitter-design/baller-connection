import type { Player, Snapshot, Tier } from './domain';
import { addBusinessDays, shortWhen, weekKey } from './time';
import { capacity, clock, lastSubmission, playerCycle, unanswered } from './workflow';

/**
 * The promise ledger. Every promise the product makes in public copy, onboarding or email lives here,
 * with the engine rule that enforces it, the family screen where it is seen kept, and the coach alert raised before it is at risk.
 * tests/promises.test.ts fails if any promise lacks an enforcement test or a status/risk function.
 */
export type PromiseState = 'kept' | 'on-track' | 'at-risk' | 'missed';
export interface PromiseStatus { state: PromiseState; label: string }
export interface PromiseRisk { what: string; dueBy?: string }
export interface ProgramPromise {
  id: string; text: string; sources: string[]; tiers: Tier[]; kind: 'engine' | 'policy';
  rule: string; familyScreen: string; coachAlert: string;
  /** Shown on the family "What you can count on" card. null = not applicable right now. */
  status: (s: Snapshot, p: Player) => PromiseStatus | null;
  /** Non-null when the promise needs coach/ops action soon. Feeds the coach queue ("Promise" items) and sweep alerts. */
  risk: (s: Snapshot, p: Player) => PromiseRisk | null;
}
const ALL: Tier[] = ['Foundation', 'Development', 'Inner Circle']; const UP: Tier[] = ['Development', 'Inner Circle']; const IC: Tier[] = ['Inner Circle'];
const ACTIVE = (p: Player) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Paused'].includes(p.state);
const D = 864e5; const t = (s: Snapshot) => clock(s).getTime(); const ms = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
const meet = (s: Snapshot, p: Player, kind: string) => s.meetings.filter((m) => m.playerId === p.id && m.kind === kind && m.status !== 'cancelled');
const near = (s: Snapshot, p: Player, kind: string, days: number) => meet(s, p, kind).some((m) => Math.abs(ms(m.at) - t(s)) <= days * D);
const ok = (label: string): PromiseStatus => ({ state: 'kept', label }); const on = (label: string): PromiseStatus => ({ state: 'on-track', label });
export const reviewsAllowed = (s: Snapshot, p: Player) => s.settings.reviewsPerWeek?.[p.tier] ?? 99;
export const reviewedThisWeek = (s: Snapshot, p: Player) => { const wk = weekKey(clock(s)); return s.submissions.filter((x) => x.playerId === p.id && x.reviewed !== false && weekKey(new Date(x.at)) === wk).length; };
const pendingSub = (s: Snapshot, p: Player) => (['Submitted', 'Feedback due', 'Sign-off'].includes(p.state) ? lastSubmission(s, p.id) : undefined);
const dueState = (s: Snapshot, iso: string): PromiseState => (ms(iso) < t(s) ? 'missed' : ms(iso) - t(s) < s.settings.dueSoonHours * 36e5 ? 'at-risk' : 'on-track');

export const PROMISES: ProgramPromise[] = [
  {
    id: 'reply-window', text: 'Reviewed check-ins get a written reply by a set time: same business day (Inner Circle), 1 business day (Development), 2 (Foundation).', sources: ['Home hero', 'Home pricing', 'FAQ', 'Today'], tiers: ALL, kind: 'engine',
    rule: 'submitRep stamps dueBy = replyDue(tier); sweep escalates Submitted → Feedback due and notifies owner + head coach when due soon / overdue.', familyScreen: 'Today status card (“Reply due by …”) + promise card', coachAlert: 'Queue “Work ready” with dueBy; overdue sorts first; due-soon + overdue notifications',
    status: (s, p) => { const sub = pendingSub(s, p); if (sub) { const st = dueState(s, sub.dueBy); return { state: st, label: st === 'missed' ? `Reply was due ${shortWhen(sub.dueBy)}. Your coach has been alerted.` : `Reply due by ${shortWhen(sub.dueBy)}` }; } return ACTIVE(p) ? ok('Every reviewed check-in so far got its reply') : null; },
    risk: (s, p) => { const sub = pendingSub(s, p); return sub && dueState(s, sub.dueBy) !== 'on-track' ? { what: `Reply to ${p.name}’s check-in`, dueBy: sub.dueBy } : null; },
  },
  {
    id: 'reviews-per-week', text: 'Foundation: 1 written review a week. Development: up to 3 a week.', sources: ['Home pricing'], tiers: ['Foundation', 'Development'], kind: 'engine',
    rule: 'submitRep counts reviewed submissions this week against settings.reviewsPerWeek; extra check-ins are logged (no review owed) and the next rep unlocks.', familyScreen: 'Promise card (“1 of 3 reviews used this week”) + log confirmation', coachAlert: 'Only reviewed check-ins enter the queue, so the queue never holds more than the plan promises',
    status: (s, p) => (ACTIVE(p) ? on(`${reviewedThisWeek(s, p)} of ${reviewsAllowed(s, p)} review${reviewsAllowed(s, p) === 1 ? '' : 's'} used this week`) : null), risk: () => null,
  },
  {
    id: 'every-submission', text: 'Inner Circle: a review on every submission.', sources: ['Home pricing'], tiers: IC, kind: 'engine',
    rule: 'settings.reviewsPerWeek[Inner Circle] = 99, so every submission is reviewed=true and owes a reply.', familyScreen: 'Promise card', coachAlert: 'Every IC submission becomes a “Work ready” queue item',
    status: (s, p) => (ACTIVE(p) ? ok(`${reviewedThisWeek(s, p)} submission(s) this week, all reviewed`) : null), risk: () => null,
  },
  {
    id: 'first-plan', text: 'Your first plan lands within 2 business days of onboarding.', sources: ['Home how-it-works', 'Welcome message', 'Onboarding'], tiers: ALL, kind: 'engine',
    rule: 'completeOnboarding → Plan building; plan due = addBusinessDays(stateSince, 2).', familyScreen: 'Today (“Plan lands by …”) + promise card', coachAlert: 'Queue “Plan needed” with that due date; Promise risk when < 1 day left',
    status: (s, p) => { if (p.state !== 'Plan building') return null; const due = addBusinessDays(new Date(p.stateSince), 2).toISOString(); const st = dueState(s, due); return { state: st, label: `Plan lands by ${shortWhen(due)}` }; },
    risk: (s, p) => { if (p.state !== 'Plan building') return null; const due = addBusinessDays(new Date(p.stateSince), 2).toISOString(); return ms(due) - t(s) < D ? { what: `First plan for ${p.name}`, dueBy: due } : null; },
  },
  {
    id: 'plan-adjust', text: 'Development and Inner Circle: the plan is adjusted every 2 weeks.', sources: ['Home pricing'], tiers: UP, kind: 'engine',
    rule: 'adjustPlan stamps cycle.adjustedAt; promise risk when 12+ days since the cycle start or last adjustment.', familyScreen: 'Promise card (“Last adjusted …”)', coachAlert: 'Queue “Promise: adjust plan” at day 12, due day 14',
    status: (s, p) => { const c = playerCycle(s, p.id); if (!c || c.status !== 'active' || !ACTIVE(p)) return null; const last = c.adjustedAt ?? c.startAt; const due = new Date(ms(last) + 14 * D).toISOString(); return { state: dueState(s, due) === 'missed' ? 'missed' : 'on-track', label: `${c.adjustedAt ? 'Adjusted' : 'Plan set'} ${shortWhen(last)} · next check by ${shortWhen(due)}` }; },
    risk: (s, p) => { const c = playerCycle(s, p.id); if (!c || c.status !== 'active' || !ACTIVE(p)) return null; const last = ms(c.adjustedAt ?? c.startAt); return t(s) - last >= 12 * D ? { what: `Adjust ${p.name}’s plan (2-week check)`, dueBy: new Date(last + 14 * D).toISOString() } : null; },
  },
  {
    id: 'monthly-video', text: 'Development: one 20-minute video check-in a month.', sources: ['Home pricing', 'FAQ'], tiers: ['Development'], kind: 'engine',
    rule: 'A scheduled/done check-in meeting must exist within ±30 days.', familyScreen: 'Promise card + Today (next session)', coachAlert: 'Queue “Promise: book video check-in” when none is within 30 days',
    status: (s, p) => { if (!ACTIVE(p)) return null; const m = meet(s, p, 'check-in').sort((a, b) => b.at.localeCompare(a.at))[0]; return near(s, p, 'check-in', 30) ? on(m && ms(m.at) > t(s) ? `Video check-in ${shortWhen(m.at)}` : 'This month’s check-in is done') : { state: 'at-risk', label: 'Your coach is booking this month’s check-in' }; },
    risk: (s, p) => (ACTIVE(p) && !near(s, p, 'check-in', 30) ? { what: `Book ${p.name}’s monthly video check-in` } : null),
  },
  {
    id: 'weekly-live', text: 'Inner Circle: a weekly 30-minute live session.', sources: ['Home pricing', 'FAQ'], tiers: IC, kind: 'engine',
    rule: 'A live meeting must exist within ±7 days.', familyScreen: 'Promise card + Today', coachAlert: 'Queue “Promise: book live session” when none is within 7 days',
    status: (s, p) => { if (!ACTIVE(p)) return null; const m = meet(s, p, 'live').filter((x) => ms(x.at) > t(s)).sort((a, b) => a.at.localeCompare(b.at))[0]; return near(s, p, 'live', 7) ? on(m ? `Live session ${shortWhen(m.at)}` : 'This week’s session is done') : { state: 'at-risk', label: 'Your coach is booking this week’s session' }; },
    risk: (s, p) => (ACTIVE(p) && !near(s, p, 'live', 7) ? { what: `Book ${p.name}’s weekly live session` } : null),
  },
  {
    id: 'rubric-cycle', text: 'Development and Inner Circle: the skill rubric is updated every cycle.', sources: ['Home pricing'], tiers: UP, kind: 'engine',
    rule: 'publishPlan from Cycle review is refused until completeCycleReview records new ratings.', familyScreen: 'Progress rubric + cycle review summary', coachAlert: 'Queue “Cycle review” item',
    status: (s, p) => { const r = s.cycleReviews.filter((x) => x.playerId === p.id && x.coachAt).sort((a, b) => (b.coachAt ?? '').localeCompare(a.coachAt ?? ''))[0]; return p.state === 'Cycle review' ? { state: 'on-track', label: 'Cycle review in progress: new ratings coming' } : r ? ok(`Rated at the end of the last cycle (${shortWhen(r.coachAt!)})`) : ACTIVE(p) ? on('First rating at the end of this cycle') : null; },
    risk: (s, p) => (p.state === 'Cycle review' && !s.cycleReviews.some((x) => x.cycleId === playerCycle(s, p.id)?.id && x.coachAt) ? { what: `Rate ${p.name}’s rubric for the cycle review`, dueBy: addBusinessDays(new Date(p.stateSince), 2).toISOString() } : null),
  },
  {
    id: 'tournament-plan', text: 'Inner Circle: a pre-tournament game plan.', sources: ['Home pricing'], tiers: IC, kind: 'engine',
    rule: 'setTournament stores the date; a coach message with context “gameplan” keeps it. Risk inside 7 days.', familyScreen: 'Promise card + Inbox (Game plan thread)', coachAlert: 'Queue “Promise: send game plan” from 7 days out',
    status: (s, p) => { if (!p.tournamentDate) return ACTIVE(p) ? on('Add your next tournament date to get a game plan') : null; const sent = s.messages.some((m) => m.playerId === p.id && m.context === 'gameplan' && m.from === 'coach' && ms(m.at) > ms(p.tournamentDate!) - 21 * D); return sent ? ok('Game plan sent') : { state: ms(p.tournamentDate) - t(s) < 3 * D ? 'at-risk' : 'on-track', label: `Game plan before ${shortWhen(p.tournamentDate)}` }; },
    risk: (s, p) => { if (!p.tournamentDate || ms(p.tournamentDate) < t(s)) return null; const sent = s.messages.some((m) => m.playerId === p.id && m.context === 'gameplan' && m.from === 'coach' && ms(m.at) > ms(p.tournamentDate!) - 21 * D); return !sent && ms(p.tournamentDate) - t(s) < 7 * D ? { what: `Send ${p.name}’s pre-tournament game plan`, dueBy: new Date(ms(p.tournamentDate) - D).toISOString() } : null; },
  },
  {
    id: 'season-goal-review', text: 'Inner Circle: a season goal review with parents.', sources: ['Home pricing'], tiers: IC, kind: 'engine',
    rule: 'A goal-review meeting must exist every 90 days on the roster.', familyScreen: 'Promise card', coachAlert: 'Queue “Promise: book goal review” when none in 90 days',
    status: (s, p) => (!ACTIVE(p) ? null : near(s, p, 'goal-review', 90) ? on('Season goal review booked/held') : { state: 'at-risk', label: 'Your coach is booking a season goal review' }),
    risk: (s, p) => (ACTIVE(p) && !near(s, p, 'goal-review', 90) ? { what: `Book ${p.name}’s season goal review with parents` } : null),
  },
  {
    id: 'parent-summary', text: 'Parents get a one-minute weekly summary.', sources: ['Home hero', 'Home pricing'], tiers: ALL, kind: 'engine',
    rule: 'Sunday cron generateDigests drafts one per active player; coach approves (batch) and it is emailed.', familyScreen: 'Parent home (“This week”) + promise card', coachAlert: 'Queue “Promise: approve digest” for drafts older than 24 h',
    status: (s, p) => { if (!ACTIVE(p)) return null; const d = s.digests.filter((x) => x.playerId === p.id && x.status === 'approved').sort((a, b) => b.week.localeCompare(a.week))[0]; return d ? ok(`Last summary: week of ${d.week}`) : on('First summary arrives Sunday'); },
    risk: (s, p) => { const d = s.digests.find((x) => x.playerId === p.id && x.status === 'draft'); return d ? { what: `Approve ${p.name}’s weekly summary`, dueBy: new Date(ms(d.week + 'T12:00') + 2 * D).toISOString() } : null; },
  },
  {
    id: 'capacity', text: 'One coach and 15 players in total; Inner Circle is capped (4 spots).', sources: ['Home', 'FAQ'], tiers: ALL, kind: 'engine',
    rule: 'createInvite waitlists instead of inviting when the roster or Inner Circle cap is full.', familyScreen: 'Promise card (“Roster: N/15”)', coachAlert: 'Ops queue Waitlist; Team load',
    status: (s, p) => { const c = capacity(s); return ACTIVE(p) ? ok(`Roster capped: ${c.used}/${c.max} players`) : null; }, risk: () => null,
  },
  {
    id: 'overdue-first', text: 'If a coach is late, the overdue item goes to the top of the queue and the deadline shows on Today.', sources: ['FAQ'], tiers: ALL, kind: 'engine',
    rule: 'buildQueue ranks overdue items before everything else; Today shows dueBy.', familyScreen: 'Today status card', coachAlert: 'Queue order + head coach copied on overdue alerts',
    status: (s, p) => { const sub = pendingSub(s, p); return sub && ms(sub.dueBy) < t(s) ? { state: 'missed', label: 'Late. It’s at the top of your coach’s list.' } : null; }, risk: () => null,
  },
  {
    id: 'message-reply', text: 'Messages get a reply in the same window as your plan (urgent: within 4 hours during office hours).', sources: ['Inbox', 'FAQ'], tiers: ALL, kind: 'engine',
    rule: 'sendMessage stamps dueBy (tier window, or urgentReplyHours); sweep alerts; every unanswered family message is a “Reply needed” queue item.', familyScreen: 'Inbox (expected reply under each message) + promise card', coachAlert: 'Queue “Reply needed” with SLA',
    status: (s, p) => { const m = unanswered(s, p.id)[0]; if (!m?.dueBy) return null; const st = dueState(s, m.dueBy); return { state: st, label: `Reply to your message by ${shortWhen(m.dueBy)}` }; },
    risk: () => null,
  },
  {
    id: 'pause-anytime', text: 'No contracts. Pause anytime; progress is saved.', sources: ['FAQ'], tiers: ALL, kind: 'engine',
    rule: 'pause/resume commands, allowed for parents from any active state; resume returns to the saved state.', familyScreen: 'Parent Account', coachAlert: 'Paused players leave the owed queue',
    status: (_s, p) => (p.state === 'Paused' ? ok('Paused. Nothing is due.') : null), risk: () => null,
  },
  {
    id: 'links-only', text: 'Links only, no uploads or full game film.', sources: ['FAQ', 'Log rep'], tiers: ALL, kind: 'policy',
    rule: 'submitRep and sendMessage only accept http(s) links; there is no upload endpoint.', familyScreen: 'Log rep form', coachAlert: 'None needed',
    status: () => null, risk: () => null,
  },
  {
    id: 'one-cue', text: 'Every review gives one clear adjustment and the next rep.', sources: ['Home', 'How it works'], tiers: ALL, kind: 'engine',
    rule: 'review requires wentWell + adjust + why; nextRep is filled from the plan.', familyScreen: 'Feedback card', coachAlert: 'Composer refuses to send without them',
    status: () => null, risk: () => null,
  },
  {
    id: 'next-rep', text: 'Feedback unlocks the next rep.', sources: ['Home', 'How it works'], tiers: ALL, kind: 'engine',
    rule: 'approve → Next step ready → startNext opens the next queued rep; retry re-opens the rep.', familyScreen: 'Today', coachAlert: 'None needed',
    status: () => null, risk: () => null,
  },
  {
    id: 'cycle-review', text: 'Every 4 weeks: a cycle review of what improved, new ratings and the next focus.', sources: ['How it works', 'Develop'], tiers: ALL, kind: 'engine',
    rule: 'Cycles last settings.cycleWeeks; at the end startNext/sweep moves to Cycle review; completeCycleReview is required before the next plan.', familyScreen: 'Develop → Cycle review', coachAlert: 'Queue “Cycle review”',
    status: (s, p) => { const c = playerCycle(s, p.id); if (!c || !ACTIVE(p)) return null; return p.state === 'Cycle review' ? on('Cycle review: your turn and your coach’s') : on(`Cycle ${c.index} review on ${shortWhen(c.endAt)}`); },
    risk: (s, p) => { const c = playerCycle(s, p.id); return c && c.status === 'active' && ACTIVE(p) && p.state !== 'Cycle review' && ms(c.endAt) < t(s) ? { what: `${p.name}’s cycle ${c.index} has ended. Start the cycle review.`, dueBy: c.endAt } : null; },
  },
  {
    id: 'application-reply', text: 'A person reads every application and replies within 2 business days; the fit result shows instantly.', sources: ['Apply', 'Application email'], tiers: ALL, kind: 'engine',
    rule: 'suggestTier returns the fit result immediately; the ops queue item is due in 2 business days.', familyScreen: 'Apply result screen', coachAlert: 'Ops queue “New application” with dueBy',
    status: () => null, risk: () => null,
  },
  {
    id: 'data-30d', text: 'Export or delete requests are completed within 30 days.', sources: ['Privacy', 'Parent Account'], tiers: ALL, kind: 'engine',
    rule: 'requestData creates an ops queue item due in 30 days.', familyScreen: 'Parent Account', coachAlert: 'Ops queue “Data request”',
    status: (s, p) => { const r = s.dataRequests.find((x) => x.playerId === p.id && x.status === 'open'); return r ? on(`${r.kind === 'delete' ? 'Deletion' : 'Export'} by ${shortWhen(new Date(ms(r.at) + 30 * D).toISOString())}`) : null; }, risk: () => null,
  },
  {
    id: 'real-coach', text: 'A real coach you know by name writes every plan, review and reply, never an AI. Assistant reviews are checked by the head coach.', sources: ['Home'], tiers: ALL, kind: 'engine',
    rule: 'Reviews/plans/messages carry a staff authorId; assistant reviews go to Sign-off when requireSignoff is on. No generated feedback exists in the code.', familyScreen: 'Feedback card shows the coach’s name', coachAlert: 'Queue “Sign-off” for the head coach',
    status: (s, p) => (ACTIVE(p) ? ok(`Your coach: ${s.users.find((u) => u.id === p.coachId)?.name ?? 'assigned soon'}`) : null), risk: () => null,
  },
];
export const promiseById = (id: string) => PROMISES.find((x) => x.id === id)!;
/** Promises that apply to this player, with live status. */
export function promiseCard(s: Snapshot, p: Player) {
  return PROMISES.filter((x) => x.tiers.includes(p.tier)).map((x) => ({ promise: x, status: x.status(s, p) })).filter((x): x is { promise: ProgramPromise; status: PromiseStatus } => !!x.status);
}
/** Promise risks for this player, excluding the ones already covered by a regular queue item (reply / first plan / cycle review). */
export function promiseRisks(s: Snapshot, p: Player) {
  return PROMISES.filter((x) => x.tiers.includes(p.tier)).map((x) => ({ promise: x, risk: x.risk(s, p) })).filter((x): x is { promise: ProgramPromise; risk: PromiseRisk } => !!x.risk);
}

