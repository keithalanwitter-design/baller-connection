import type { Player, Snapshot, Tier } from './domain';
import { addBusinessDays, shortWhen, weekKey } from './time';
import { CLIP_MAX_MB, CLIP_MAX_SEC, CLIP_RETENTION_DAYS } from './clips';
import { capacity, clock, lastSubmission, playerCycle, unanswered } from './workflow';
import { subscriptionOf } from './billing';

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
const ALL: Tier[] = ['Foundation', 'Development', 'Inner Circle']; const IC: Tier[] = ['Inner Circle'];
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
    id: 'reply-window', text: 'Your coach writes back himself: within 2 business days on Foundation, within 1 business day on Development and Inner Circle. One number per plan, for clips and for messages.', sources: ['Home', 'Plans', 'FAQ', 'Today', 'Inbox'], tiers: ALL, kind: 'engine',
    rule: 'submitRep stamps dueBy = replyDue(tier); sweep escalates Submitted → Feedback due and notifies owner + head coach when due soon / overdue.', familyScreen: 'Today status card (“Reply due by …”) + promise card', coachAlert: 'Queue “Work ready” with dueBy; overdue sorts first; due-soon + overdue notifications',
    status: (s, p) => { const sub = pendingSub(s, p); if (sub) { const st = dueState(s, sub.dueBy); return { state: st, label: st === 'missed' ? `Reply was due ${shortWhen(sub.dueBy)}. Your coach has been alerted.` : `Reply due by ${shortWhen(sub.dueBy)}` }; } return ACTIVE(p) ? ok('Every reviewed check-in so far got its reply') : null; },
    risk: (s, p) => { const sub = pendingSub(s, p); return sub && dueState(s, sub.dueBy) !== 'on-track' ? { what: `Reply to ${p.name}’s check-in`, dueBy: sub.dueBy } : null; },
  },
  {
    id: 'reviews-per-week', text: 'Foundation: 1 written review a week. Development: up to 3 a week. Inner Circle: every clip. A check-in with a clip counts as one.', sources: ['Home pricing'], tiers: ALL, kind: 'engine',
    rule: 'submitRep counts reviewed submissions this week against settings.reviewsPerWeek; extra check-ins are logged (no review owed) and the next rep unlocks.', familyScreen: 'Promise card (“1 of 3 reviews used this week”) + log confirmation', coachAlert: 'Only reviewed check-ins enter the queue, so the queue never holds more than the plan promises',
    status: (s, p) => (ACTIVE(p) ? on(`${reviewedThisWeek(s, p)} of ${reviewsAllowed(s, p)} review${reviewsAllowed(s, p) === 1 ? '' : 's'} used this week`) : null), risk: () => null,
  },
  {
    id: 'first-look', text: 'Within 2 business days of setup, your coach takes a first look and tells you what he saw and what to work on first.', sources: ['Home', 'Meet your coach', 'Welcome', 'Today'], tiers: ALL, kind: 'engine',
    rule: 'completeOnboarding → Plan building; the first publishPlan is refused until the coach writes what he saw (firstLook); due = addBusinessDays(stateSince, 2).', familyScreen: 'Today (“Your coach is taking a first look · by …”) then the first-look card', coachAlert: 'Queue “First look” with that due date; “Due soon” when < 1 day left',
    status: (s, p) => { if (p.state !== 'Plan building') return null; const due = addBusinessDays(new Date(p.stateSince), 2).toISOString(); const st = dueState(s, due); return { state: st, label: `First look by ${shortWhen(due)}` }; },
    risk: (s, p) => { if (p.state !== 'Plan building') return null; const due = addBusinessDays(new Date(p.stateSince), 2).toISOString(); return ms(due) - t(s) < D ? { what: `First look for ${p.name}`, dueBy: due } : null; },
  },
  {
    id: 'teach-back', text: 'After each review you can say the adjustment back in your own words. Your coach reads it within your reply window and marks it “got it” or starts a short thread to clarify. It’s optional, and the next rep never waits on it.', sources: ['Today', 'Method', 'FAQ'], tiers: ALL, kind: 'engine',
    rule: 'teachBack stores the player’s words on the review; markTeachBack records got-it / clarify (clarify opens a thread); startNext stays available without one.', familyScreen: 'Today → In your words, then “Your coach read this”', coachAlert: 'Queue “Teach-back” with dueBy = reply window',
    status: (s, p) => { const r = s.reviews.filter((x) => x.playerId === p.id && x.teachBack && !x.teachBack.mark).sort((a, b) => b.at.localeCompare(a.at))[0]; return r ? { state: dueState(s, addBusinessDays(new Date(r.teachBack!.at), s.settings.sla[p.tier]).toISOString()), label: 'Your coach will read what you wrote' } : null; },
    risk: (s, p) => { const r = s.reviews.find((x) => x.playerId === p.id && x.teachBack && !x.teachBack.mark && ms(addBusinessDays(new Date(x.teachBack.at), s.settings.sla[p.tier]).toISOString()) < t(s)); return r ? { what: `Read ${p.name}’s teach-back`, dueBy: addBusinessDays(new Date(r.teachBack!.at), s.settings.sla[p.tier]).toISOString() } : null; },
  },
  {
    id: 'stuck-reply', text: 'An “I’m stuck” note goes only to your coach. He writes back himself within your reply window. He may talk with a parent if something needs a grown-up.', sources: ['Today', 'Method', 'FAQ', 'Parent'], tiers: ALL, kind: 'engine',
    rule: 'sendStuck creates a private thread (context “stuck”) that scopeSnapshot never gives to a parent; dueBy = replyDue(tier); the coach queue shows it as “Check in”; the sweep escalates it like any message.', familyScreen: 'The “I’m stuck” button on every player screen', coachAlert: 'Queue “Check in” with dueBy; overdue sorts first',
    status: (s, p) => { const m = unanswered(s, p.id).find((x) => x.context === 'stuck' || x.context === 'checkin'); if (!m?.dueBy) return null; const st = dueState(s, m.dueBy); return { state: st, label: `Your coach writes back by ${shortWhen(m.dueBy)}` }; },
    risk: (s, p) => { const m = unanswered(s, p.id).find((x) => (x.context === 'stuck' || x.context === 'checkin') && x.dueBy && dueState(s, x.dueBy) !== 'on-track'); return m ? { what: `Write back to ${p.name} (private note)`, dueBy: m.dueBy! } : null; },
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
    id: 'cycle-review', text: 'Every 4 weeks: a re-check. Your coach compares your clips from week 1 with now, tells you what changed, and sets the next focus.', sources: ['Method', 'Develop'], tiers: ALL, kind: 'engine',
    rule: 'Cycles last settings.cycleWeeks; at the end startNext/sweep moves to Cycle review; completeCycleReview is required before the next plan.', familyScreen: 'Develop → Cycle review', coachAlert: 'Queue “Cycle review”',
    status: (s, p) => { const c = playerCycle(s, p.id); if (!c || !ACTIVE(p)) return null; return p.state === 'Cycle review' ? on('Cycle review: your turn and your coach’s') : on(`Cycle ${c.index} review on ${shortWhen(c.endAt)}`); },
    risk: (s, p) => { const c = playerCycle(s, p.id); return c && c.status === 'active' && ACTIVE(p) && p.state !== 'Cycle review' && ms(c.endAt) < t(s) ? { what: `${p.name}’s cycle ${c.index} has ended. Start the cycle review.`, dueBy: c.endAt } : null; },
  },
  {
    id: 'parent-summary', text: 'Parents get one short weekly summary and a timeline. No per-clip notifications unless they turn them on.', sources: ['Home', 'Plans', 'Parent'], tiers: ALL, kind: 'engine',
    rule: 'Sunday cron generateDigests drafts one per active player; coach approves (batch) and it is emailed.', familyScreen: 'Parent home (“This week”) + promise card', coachAlert: 'Queue “Promise: approve digest” for drafts older than 24 h',
    status: (s, p) => { if (!ACTIVE(p)) return null; const d = s.digests.filter((x) => x.playerId === p.id && x.status === 'approved').sort((a, b) => b.week.localeCompare(a.week))[0]; return d ? ok(`Last summary: week of ${d.week}`) : on('First summary arrives Sunday'); },
    risk: (s, p) => { const d = s.digests.find((x) => x.playerId === p.id && x.status === 'draft'); return d ? { what: `Approve ${p.name}’s weekly summary`, dueBy: new Date(ms(d.week + 'T12:00') + 2 * D).toISOString() } : null; },
  },
  {
    id: 'real-coach', text: 'A real coach you know by name writes every first look, review and reply. Never an AI. Assistant reviews get a second look from the head coach.', sources: ['Home'], tiers: ALL, kind: 'engine',
    rule: 'Reviews/plans/messages carry a staff authorId; assistant reviews go to Sign-off when requireSignoff is on. No generated feedback exists in the code.', familyScreen: 'Feedback card shows the coach’s name', coachAlert: 'Queue “Sign-off” for the head coach',
    status: (s, p) => (ACTIVE(p) ? ok(`Your coach: ${s.users.find((u) => u.id === p.coachId)?.name ?? 'assigned soon'}`) : null), risk: () => null,
  },
  {
    id: 'capacity', text: 'One coach and 15 players in total; Inner Circle is capped (4 spots).', sources: ['Home', 'FAQ'], tiers: ALL, kind: 'engine',
    rule: 'createInvite waitlists instead of inviting when the roster or Inner Circle cap is full.', familyScreen: 'Promise card (“Roster: N/15”)', coachAlert: 'Ops queue Waitlist; Team load',
    status: (s, p) => { const c = capacity(s); return ACTIVE(p) ? ok(`Roster capped: ${c.used}/${c.max} players`) : null; }, risk: () => null,
  },
  {
    id: 'short-clips', text: `Short practice clips only: up to ${CLIP_MAX_SEC} seconds and ${CLIP_MAX_MB} MB (MP4, MOV or WebM), or a link. No full-game film breakdown.`, sources: ['FAQ', 'Log rep', 'How it works'], tiers: ALL, kind: 'engine',
    rule: 'clipError() runs in the browser (video metadata) and again on the server, which reads the container duration (MP4/MOV mvhd, WebM Info) and rejects >30 s, >50 MB or other types before storing anything; registerClip re-checks. Links must be http(s).', familyScreen: 'Log rep form (limits + trim hint)', coachAlert: 'None needed: oversize clips never reach the queue',
    status: () => null, risk: () => null,
  },
  {
    id: 'clip-privacy', text: `Clips are seen only by the player, their parent(s) and assigned coaches, never shared, and deleted after ${CLIP_RETENTION_DAYS} days or when you ask. Under 13: only with a parent’s OK.`, sources: ['Privacy', 'Log rep', 'Parent Account', 'Consent'], tiers: ALL, kind: 'engine',
    rule: 'canSeeClip() gates scopeSnapshot and GET /api/clips/:id (404 otherwise; ops never sees clips); the bucket is private and every byte is served through the API; sweep removes clips past deleteAfter; deleteClip and data deletion remove the bytes; registerClip refuses under-13 players without the clip consent version.', familyScreen: 'Parent Account → Clips (auto-delete date + Delete clip)', coachAlert: 'None needed',
    status: (s, p) => { const cs = (s.clips ?? []).filter((c) => c.playerId === p.id); if (!cs.length) return null; const next = cs.map((c) => c.deleteAfter).sort()[0]; return ok(`${cs.length} clip${cs.length === 1 ? '' : 's'} stored privately · next auto-delete ${shortWhen(next)}`); },
    risk: () => null,
  },
  {
    id: 'card-private', text: 'Player Cards are private: no link exists until a parent turns it on, the parent can turn it off or replace it anytime, under-13s show a first name only, and a card never shows stats.', sources: ['Parent', 'Privacy'], tiers: ALL, kind: 'engine',
    rule: 'setCard is parent-only; the token lives on the player (redacted for everyone but the parent); GET /api/card/:token answers 404 unless enabled; publicCard() never includes stats and uses first name only under 13.', familyScreen: 'Parent → Player Card', coachAlert: '—',
    status: (_s, p) => (ACTIVE(p) ? ok(p.card?.enabled ? 'Card link on · no stats' : 'Player Card is private (no link)') : null), risk: () => null,
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
    id: 'pause-anytime', text: 'No contracts. Pause coaching anytime; progress is saved. (Pausing coaching doesn’t stop billing: to stop paying, cancel in Billing.)', sources: ['FAQ', 'Parent billing'], tiers: ALL, kind: 'engine',
    rule: 'pause/resume commands, allowed for parents from any active state; resume returns to the saved state. A billing pause can only be lifted by paying (or by staff).', familyScreen: 'Parent Account + Billing', coachAlert: 'Paused players leave the owed queue',
    status: (_s, p) => (p.state === 'Paused' ? ok('Paused. Nothing is due.') : null), risk: () => null,
  },
  {
    id: 'cancel-anytime', text: 'Cancel anytime in Billing (Stripe’s secure portal). Coaching continues to the end of the month you paid for; no refunds for partial months, no fees.', sources: ['Home pricing', 'FAQ', 'Invite', 'Receipt email'], tiers: ALL, kind: 'engine',
    rule: 'customer.subscription.updated with cancel_at_period_end keeps access; customer.subscription.deleted (or the sweep at period end) sets billing canceled, pauses coaching and frees the spot.', familyScreen: 'Parent Billing (“Ends <date>”)', coachAlert: 'Billing view status; notification on cancel',
    status: (s, p) => { const sub = subscriptionOf(s, p.id); return sub?.cancelAtPeriodEnd && sub.currentPeriodEnd ? on(`Canceled. Coaching continues until ${shortWhen(sub.currentPeriodEnd)}`) : sub?.status === 'canceled' ? ok('Canceled. Nothing more is charged.') : null; }, risk: () => null,
  },
];
export const promiseById = (id: string) => PROMISES.find((x) => x.id === id)!;
/** Promises that apply to this player, with live status. */
export function promiseCard(s: Snapshot, p: Player) {
  return PROMISES.filter((x) => x.tiers.includes(p.tier)).map((x) => ({ promise: x, status: x.status(s, p) })).filter((x): x is { promise: ProgramPromise; status: PromiseStatus } => !!x.status);
}
/** Promise risks for this player, excluding the ones already covered by a regular queue item (reply / first look / teach-back / re-check). */
export function promiseRisks(s: Snapshot, p: Player) {
  return PROMISES.filter((x) => x.tiers.includes(p.tier)).map((x) => ({ promise: x, risk: x.risk(s, p) })).filter((x): x is { promise: ProgramPromise; risk: PromiseRisk } => !!x.risk);
}

