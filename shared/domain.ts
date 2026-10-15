// Baller Connection domain model (v7). Shared by the browser demo engine, the API server and tests.
export type Tier = 'Foundation' | 'Development' | 'Inner Circle';
/** Account roles. `system` is the cron/scheduler. */
export type UserRole = 'head' | 'assistant' | 'ops' | 'parent' | 'player';
export type Role = UserRole | 'system' | 'public';
/** The UI perspective a screen is written for (same states, role-appropriate words). */
export type Perspective = 'player' | 'parent' | 'coach' | 'ops';
export const STAFF: UserRole[] = ['head', 'assistant', 'ops'];
export const COACHES: UserRole[] = ['head', 'assistant'];

export const LIFECYCLE = [
  'Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Plan building', 'Plan set',
  'Work ready', 'Submitted', 'Feedback due', 'Sign-off', 'Next step ready', 'Cycle review', 'Paused',
] as const;
export type LifecycleState = (typeof LIFECYCLE)[number];
/** unpaid → paid (Stripe active) → past_due (grace) → canceled (access ended). comp = complimentary (no Stripe). */
export type Billing = 'unpaid' | 'paid' | 'comp' | 'past_due' | 'canceled';

export interface Settings {
  programName: string; accent: string; availability: string;
  sla: Record<Tier, number>; capacity: number; innerCircleCap: number;
  requireSignoff: boolean; dueSoonHours: number; inviteDays: number;
  /** Written reviews per week by tier (99 = every submission). */ reviewsPerWeek: Record<Tier, number>;
  /** Office hours (local): days 0=Sun..6=Sat, hours 0-23. Outside them the coach's alerts are held and families see "replies resume …". */ officeHours: { days: number[]; start: number; end: number };
  urgentReplyHours: number; savedReplies: string[]; cycleWeeks: number;
  /** v6: families pay before onboarding finishes (comp players skip). */ requirePayment?: boolean;
  /** v6: days of coaching after a failed payment before the player is paused. */ graceDays?: number;
  /** v6: hours a waitlisted family has to claim an open spot. */ offerHours?: number;
  /** v6: IANA zone for quiet hours and email times. */ timezone?: string;
  /** v9: the coach's own words, shown on “Meet your coach”. Placeholder text until Keith writes his. */ coachProfile?: CoachProfile;
}
export interface CoachProfile { intro: string; why: string; how: string; /** one-line promise of what he sees in a new player after the first look */ lookFor: string }
/** v6 per-user email preferences. Essential mail (sign-in links, invites, consent, payments, spot offers) always sends. */
export interface EmailPrefs { coaching: boolean; /** parents only: also get a notification for each clip’s feedback. Off unless a parent turns it on. */ parentCopy?: boolean; digest: boolean; updates: boolean; /** local hour quiet time starts (0–23); equal start/end = off */ quietStart: number; quietEnd: number }
export const DEFAULT_PREFS: EmailPrefs = { coaching: true, parentCopy: false, digest: true, updates: true, quietStart: 21, quietEnd: 7 };
export interface User { id: string; name: string; email?: string | null; username?: string | null; role: UserRole; familyId?: string | null; playerId?: string | null; active: boolean; prefs?: EmailPrefs | null }
export interface Family { id: string; parentName: string; email: string; deletedAt?: string | null }
export interface Player {
  id: string; familyId: string; name: string; age: number; position: string; tier: Tier;
  state: LifecycleState; stateSince: string; pausedFrom?: LifecycleState | null;
  goal: string; learnStyle: string; rhythm: string; canvas: string; rubric: Record<string, number>;
  nextSession: string; coachId: string; billing: Billing;
  /** Optimistic-concurrency version: bumped on every state change. */ rev: number;
  frustration: string; proudOf: string; /** "Coach knows you": the player's own words, editable by the player. */ aboutMe: string; tournamentDate?: string | null;
  /** “What I’m working on”: one sentence in the player’s words, renewed weekly. */ workingOn?: string | null; workingOnWeek?: string | null;
  /** v7: the player's own pre-game affirmation (game plan card). */ affirmation?: string | null;
  /** v7: shareable Player Card, controlled by the parent. Off by default; never shows stats. */ card?: CardSettings | null;
  /** v9: the rhythm the player agreed to (reps a week, clip day). Theirs to change. */ rhythmPlan?: RhythmPlan | null;
  /** v9: what the coach saw in the intake clip or first session, and the first focus it led to. */ firstLook?: FirstLook | null;
  /** v9: the parent–player roles agreement, recorded at onboarding. */ agreement?: { at: string; by: string } | null;
  /** v9: streaks, levels and points are OFF unless the player turns them on. */ gamify?: boolean | null;
  /** v9: a “show me again” request from the coach: the same drill, a fresh clip, on a later date. */ probe?: Probe | null;
  /** v9: the coach's one sentence for the parent this week. */ parentNote?: ParentNote | null;
  /** v9: how the player chose to handle a rough week. */ weekChoice?: WeekChoice | null;
}
export interface RhythmPlan { repsPerWeek: number; clipDay: string }
export interface FirstLook { saw: string; source: 'clip' | 'session'; at: string; by: string }
export interface Probe { title: string; drillId?: string | null; dueOn: string; by: string; note: string; status: 'requested' | 'open' | 'done'; requestedAt: string }
export interface ParentNote { week: string; text: string; by: string; at: string }
export interface WeekChoice { week: string; choice: 'light' | 'reset' | 'talk'; at: string }
/** v9: an in-person (or video) session the coach logs; the note sets the next focus, shown to the player as “From your session on Tue”. */
export interface Session { id: string; playerId: string; coachId: string; date: string; note: string; focus: string; cue?: string | null; at: string }
export interface Application { id: string; at: string; playerId: string; answers: Record<string, string>; tier: Tier; fit: 'fit' | 'waitlist' | 'notyet'; next: 'apply' | 'call' | 'waitlist' }
export interface Invite { id: string; playerId: string; email: string; /** sha256 of the link token; plaintext only ever appears in the sent email */ tokenHash: string; codeHash: string; sentAt: string; expiresAt: string; createdBy: string; acceptedAt?: string | null; acceptedBy?: string | null; status: 'pending' | 'accepted' | 'expired' | 'revoked'; /** v6: 'offer' = a waitlist spot offer with a short expiry */ kind?: 'invite' | 'offer' | null }
export interface Consent { id: string; playerId: string; guardianName: string; userId: string; version: string; text: string; at: string }
export interface Cycle { id: string; playerId: string; index: number; focus: string; startAt: string; endAt: string; status: 'active' | 'review' | 'closed'; templateId?: string | null; /** last mid-cycle plan adjustment (promise: plan adjusted every 2 weeks) */ adjustedAt?: string | null }
/** v7 pressure rep: game-like constraints that bridge practice and games. */
export interface Pressure { kind: 'counted' | 'timed' | 'defender' | 'fatigue'; target: string }
export const PRESSURE_LABEL: Record<Pressure['kind'], string> = { counted: 'Counted (make it to move on)', timed: 'On the clock', defender: 'With a defender (or a chair + closeout)', fatigue: 'Tired legs (after sprints)' };
export interface Drill { /** v7 */ pressure?: Pressure | null; id: string; title: string; reps: number; minutes: number; cues: string[]; tags: string[]; createdBy: string; archived: boolean; /** Coach’s reusable feedback starter for this drill. */ fbTemplate?: { wentWell: string; adjust: string; why: string } | null }
export interface Template { id: string; name: string; focus: string; drillIds: string[]; createdBy: string }
export interface Assignment {
  id: string; cycleId: string; playerId: string; drillId?: string | null; order: number; title: string; reps: number; minutes: number; cues: string[]; /** v7 */ pressure?: Pressure | null;
  status: 'queued' | 'open' | 'submitted' | 'approved' | 'retry' | 'logged';
}
export interface Submission { id: string; assignmentId: string; playerId: string; repsDone: number; reflection: string; linkUrl?: string | null; /** v5 short clip (≤30 s) */ clipId?: string | null; at: string; dueBy: string; /** false = over this week's review allowance: logged, no review owed */ reviewed: boolean; /** v7 5-spot shooting log: [made, attempts] for left corner, left wing, top, right wing, right corner */ shots?: number[][] | null }
/** One feedback format everywhere: what went well, one adjustment, why, the next rep (+ optional link). `feedback` is the composed plain text. */
export interface Review { id: string; submissionId: string; playerId: string; decision: 'approve' | 'retry'; wentWell: string; adjust: string; why: string; nextRep: string; linkUrl?: string | null; feedback: string; reaction?: 'got_it' | 'question' | null; reactedAt?: string | null; /** v9: the player's teach-back in their own words, and the coach's read of it. */ teachBack?: TeachBack | null; /** v5: tap-to-timestamp notes on the clip */ notes?: TimedNote[] | null; /** coach time on this review */ secondsSpent?: number | null; /** gentle 48 h acknowledgment nudge sent */ nudgedAt?: string | null; at: string; reviewerId: string; status: 'final' | 'pending_signoff'; signedOffBy?: string | null; signedOffAt?: string | null }
export interface TeachBack { change: string; notice: string; at: string; mark?: 'got-it' | 'clarify' | null; markedAt?: string | null; markedBy?: string | null; note?: string | null }
export interface TimedNote { t: number; text: string }
/** A short practice clip. Visible to the player, their parent(s) and assigned coaches only; removed after 90 days or on request. */
export interface Clip { id: string; playerId: string; assignmentId?: string | null; submissionId?: string | null; storageKey: string; mime: string; bytes: number; durationSec: number; watchFor: string; uploadedBy: string; at: string; deleteAfter: string; deletedAt?: string | null }
export type MessageContext = 'general' | 'rep' | 'feedback' | 'schedule' | 'urgent' | 'gameplan' | 'stuck' | 'checkin';
/** v9: threads between a player and the coach only. Parents don’t see them. */
export const PRIVATE_CONTEXTS: MessageContext[] = ['stuck', 'checkin'];
export interface Message { id: string; playerId: string; from: 'coach' | 'player' | 'parent'; authorId: string; context: MessageContext; /** assignment / review / meeting id the thread is about */ refId?: string | null; text: string; linkUrl?: string | null; at: string; dueBy?: string | null; answered: boolean; readBy: Record<string, string> }
export interface Habit { id: string; playerId: string; date: string; key: string }
export interface Milestone { id: string; playerId: string; key: string; at: string }
export interface Digest { id: string; playerId: string; week: string; text: string; status: 'draft' | 'approved'; approvedAt?: string | null; approvedBy?: string | null }
export interface Meeting { id: string; playerId?: string | null; staffId: string; at: string; minutes: number; kind: 'check-in' | 'live' | 'fit-call' | 'goal-review'; note: string; status: 'scheduled' | 'done' | 'cancelled' }
export type NotificationType = 'promise_risk' | 'rhythm' | 'question' | 'reply_due_soon' | 'overdue' | 'new_submission' | 'feedback_ready' | 'invite_accepted' | 'plan_published' | 'cycle_review' | 'signoff_needed' | 'new_application' | 'invite_expired' | 'new_message' | 'digest_ready' | 'billing' | 'game' | 'confidence' | 'gameday' | 'stuck' | 'teachback' | 'session';
export interface Notification { id: string; userId: string; type: NotificationType; text: string; playerId?: string | null; link: string; at: string; readAt?: string | null; emailedAt?: string | null; dedupe: string }
/** Outbox row: text + HTML, category for preferences, retry bookkeeping. dead = gave up after 5 attempts (dead-letter list). */
export interface OutboxEmail { id: string; to: string; subject: string; body: string; at: string; status: 'queued' | 'sent' | 'logged' | 'failed' | 'dead'; kind: string; html?: string | null; category?: EmailCategory | null; userId?: string | null; attempts?: number | null; sendAfter?: string | null; lastError?: string | null }
export type EmailCategory = 'essential' | 'coaching' | 'digest' | 'updates';
/** v6 Stripe-backed subscription, one per player. Stripe is the source of truth; webhooks update this row. */
export interface Subscription { id: string; playerId: string; familyId: string; tier: Tier; status: 'incomplete' | 'active' | 'past_due' | 'canceled' | 'paused'; customerId?: string | null; subscriptionId?: string | null; currentPeriodEnd?: string | null; cancelAtPeriodEnd?: boolean; pastDueSince?: string | null; /** coaching paused by billing (grace ran out / canceled / paused in portal) */ pausedByBilling?: boolean; startedAt: string; updatedAt: string }
/** Processed webhook event ids (idempotency). */
export interface BillingEvent { id: string; kind: string; at: string; playerId?: string | null }
export type BillingEventKind = 'checkout_completed' | 'subscription_updated' | 'subscription_deleted' | 'invoice_paid' | 'invoice_failed';
/** v7 game log + post-game check-in. Stats are optional; the check-in (1–5) and one line are the point. */
export type FocusTried = 'yes' | 'sometimes' | 'not_yet';
export interface GameStats { min?: number | null; pts?: number | null; fgm?: number | null; fga?: number | null; tpm?: number | null; tpa?: number | null; ftm?: number | null; fta?: number | null; reb?: number | null; ast?: number | null; stl?: number | null; tov?: number | null }
export interface GameReply { wentWell: string; adjust: string; why: string; feedback: string; by: string; at: string }
export interface Game { id: string; playerId: string; date: string; at: string; opponent?: string | null; stats: GameStats; confidence: number; focus: number; energy: number; wellDone: string; replay: string; focusTried?: FocusTried | null; cycleId?: string | null; focusText?: string | null; wantsReply: boolean; dueBy?: string | null; seenAt?: string | null; seenBy?: string | null; reply?: GameReply | null; /** v9: the player's game note: what carried over from practice, and what didn't */ carried?: string | null; missed?: string | null; /** v9: the coach's read after reading the note */ mark?: GameMark | null; markNote?: string | null; markedAt?: string | null }
export type GameMark = 'carried' | 'partly' | 'not-yet';
export const GAME_MARK_LABEL: Record<GameMark, string> = { carried: 'Carried over', partly: 'Partly', 'not-yet': 'Not yet' };
/** v7 Wins wall: coach-tagged moments, personal bests, focus confirmed in a game, streaks, rubric gains. key dedupes automatic wins. */
export interface Win { id: string; playerId: string; at: string; kind: 'coach' | 'best' | 'focus' | 'streak' | 'growth'; text: string; refId?: string | null; by?: string | null; key: string }
/** v7 timeline notes: one-line coach annotations, the coach-approved "what changed and why" story (per cycle), and dismissed transfer cues. */
export interface TimelineNote { id: string; playerId: string; kind: 'annotation' | 'story' | 'cue'; refId?: string | null; date: string; text: string; status: 'draft' | 'approved'; by: string; at: string; drafted?: boolean }
export interface CardSettings { enabled: boolean; token?: string | null; showStats: boolean; momentId?: string | null; updatedAt?: string | null }
export interface DataRequest { id: string; playerId: string; familyId: string; kind: 'export' | 'delete'; requestedBy: string; at: string; status: 'open' | 'done'; doneAt?: string | null }
export interface Reflection { id: string; playerId: string; week: string; text: string; feel: number; at: string }
export interface CycleReview { id: string; cycleId: string; playerId: string; improved?: string | null; hardest?: string | null; wantNext?: string | null; playerAt?: string | null; summary?: string | null; ratingsBefore?: Record<string, number> | null; ratingsAfter?: Record<string, number> | null; nextFocus?: string | null; coachAt?: string | null }
export interface DomainEvent { id: string; at: string; role: Role; actorId?: string | null; playerId?: string | null; type: string; from?: string | null; to?: string | null; detail: string }

export interface Snapshot {
  version: number; clockOffsetMs: number; settings: Settings;
  users: User[]; families: Family[]; players: Player[]; applications: Application[]; invites: Invite[]; consents: Consent[];
  cycles: Cycle[]; drills: Drill[]; templates: Template[]; assignments: Assignment[]; submissions: Submission[]; reviews: Review[];
  messages: Message[]; habits: Habit[]; milestones: Milestone[]; digests: Digest[]; meetings: Meeting[];
  notifications: Notification[]; outbox: OutboxEmail[]; dataRequests: DataRequest[]; reflections: Reflection[]; cycleReviews: CycleReview[]; clips: Clip[]; subscriptions: Subscription[]; billingEvents: BillingEvent[]; games: Game[]; wins: Win[]; timelineNotes: TimelineNote[]; sessions: Session[]; events: DomainEvent[];
}
export const TABLES = ['users', 'families', 'players', 'applications', 'invites', 'consents', 'cycles', 'drills', 'templates', 'assignments', 'submissions', 'reviews', 'messages', 'habits', 'milestones', 'digests', 'meetings', 'notifications', 'outbox', 'dataRequests', 'reflections', 'cycleReviews', 'clips', 'subscriptions', 'billingEvents', 'games', 'wins', 'timelineNotes', 'sessions', 'events'] as const;
export type TableName = (typeof TABLES)[number];

export const TIER_INFO: Record<Tier, { price: number; reviewsPerWeek: string }> = {
  Foundation: { price: 69, reviewsPerWeek: '1' }, Development: { price: 139, reviewsPerWeek: 'up to 3' }, 'Inner Circle': { price: 229, reviewsPerWeek: 'every clip' },
};
export const replyLabel = (days: number) => (days === 0 ? 'same business day' : `within ${days} business day${days === 1 ? '' : 's'}`);
/** Back-compat helper for the public pages (default SLA rules). */
export const TIERS: Record<Tier, { price: number; replyBizDays: number; replyLabel: string }> = {
  Foundation: { price: 69, replyBizDays: 2, replyLabel: replyLabel(2) }, Development: { price: 139, replyBizDays: 1, replyLabel: replyLabel(1) }, 'Inner Circle': { price: 229, replyBizDays: 1, replyLabel: replyLabel(1) },
};
export const HABITS = ['Handles 10 min', 'Form shots 25', 'Sleep 9 h'];
export const CONSENT_VERSION = '2026-10b';
export const CONSENT_TEXT = 'I am the parent or legal guardian of this player. I consent to Baller Connection storing the player’s name, age, goals, practice logs, messages and short practice clips (30 seconds max, visible only to our family and the player’s assigned coaches, deleted after 90 days or when I ask) to provide coaching, and to the coach contacting the player through the app. I can request an export or deletion at any time.';

export type Command =
  | { type: 'submitApplication'; playerName: string; parentName: string; email?: string; answers: Record<string, string>; next: Application['next'] }
  | { type: 'startFitReview'; playerId: string }
  | { type: 'scheduleFitCall'; playerId: string; at: string }
  | { type: 'decideFit'; playerId: string; accept: boolean }
  | { type: 'createInvite'; playerId: string; email?: string }
  | { type: 'revokeInvite'; playerId: string }
  | { type: 'acceptInvite'; token?: string; code?: string; parentName?: string; email?: string; userId?: string }
  | { type: 'recordConsent'; playerId: string; guardianName: string; agreed: boolean }
  | { type: 'completeOnboarding'; playerId: string; position: string; goal: string; learnStyle: string; rhythm: string; frustration?: string; proudOf?: string; /** v9: the roles agreement, ticked by the parent */ agreed: boolean; repsPerWeek?: number; clipDay?: string; /** v9: the player's own words on why they want this */ playerWords?: string }
  | { type: 'setPlayerLogin'; playerId: string; username: string; userId?: string }
  | { type: 'assignCoach'; playerId: string; coachId: string }
  | { type: 'setBilling'; playerId: string; billing: Billing }
  | { type: 'publishPlan'; playerId: string; focus: string; drillIds: string[]; templateId?: string; rev?: number; /** v9: the first look: what the coach saw, and where (required for the first plan) */ saw?: string; source?: 'clip' | 'session' }
  | { type: 'adjustPlan'; playerId: string; note: string; addDrillIds?: string[] }
  | { type: 'openPlan'; playerId: string }
  | { type: 'submitRep'; playerId: string; repsDone: number; reflection: string; shots?: number[][]; linkUrl?: string; clipId?: string; watchFor?: string }
  /** Server-only (the upload endpoint runs it after checking the bytes); the browser demo runs it with the measured metadata. */
  | { type: 'registerClip'; playerId: string; clipId: string; storageKey: string; mime: string; bytes: number; durationSec: number; watchFor?: string }
  | { type: 'deleteClip'; playerId: string; clipId: string }
  | { type: 'setWorkingOn'; playerId: string; text: string }
  | { type: 'saveDrillFeedback'; drillId: string; fbTemplate: { wentWell: string; adjust: string; why: string } }
  | { type: 'review'; playerId: string; decision: 'approve' | 'retry'; wentWell: string; adjust: string; why: string; linkUrl?: string; notes?: TimedNote[]; secondsSpent?: number; rev?: number }
  | { type: 'signOff'; playerId: string; approve: boolean; edit?: { wentWell?: string; adjust?: string; why?: string }; rev?: number }
  | { type: 'reactFeedback'; playerId: string; reviewId: string; reaction: 'got_it' | 'question'; question?: string }
  /** v9 */
  | { type: 'teachBack'; playerId: string; reviewId: string; change: string; notice?: string }
  | { type: 'markTeachBack'; playerId: string; reviewId: string; mark: 'got-it' | 'clarify'; note?: string }
  | { type: 'logSession'; playerId: string; date?: string; note: string; focus: string; cue?: string }
  | { type: 'setRhythm'; playerId: string; repsPerWeek: number; clipDay: string }
  | { type: 'roughWeek'; playerId: string; choice: WeekChoice['choice']; note?: string }
  | { type: 'sendStuck'; playerId: string; happened?: string; want?: string; feeling?: string }
  | { type: 'sendCheckIn'; playerId: string; text: string }
  | { type: 'setGamify'; playerId: string; on: boolean }
  | { type: 'requestProbe'; playerId: string; title: string; drillId?: string; dueOn: string; note?: string }
  | { type: 'setParentNote'; playerId: string; text: string }
  | { type: 'markGame'; playerId: string; gameId: string; mark: GameMark; note?: string }
  | { type: 'weeklyReflection'; playerId: string; text: string; feel: number }
  | { type: 'updateAboutMe'; playerId: string; aboutMe: string; proudOf?: string; frustration?: string }
  | { type: 'setTournament'; playerId: string; date: string | null }
  | { type: 'cycleReflection'; playerId: string; improved: string; hardest: string; wantNext: string }
  | { type: 'completeCycleReview'; playerId: string; summary: string; ratings: Record<string, number>; nextFocus: string }
  | { type: 'approveDigests'; items: { playerId: string; text: string }[] }
  | { type: 'startNext'; playerId: string }
  | { type: 'pause'; playerId: string }
  | { type: 'resume'; playerId: string }
  | { type: 'sendMessage'; playerId: string; text: string; linkUrl?: string; context?: MessageContext; refId?: string }
  | { type: 'markRead'; playerId: string }
  | { type: 'toggleHabit'; playerId: string; key: string }
  | { type: 'updateCanvas'; playerId: string; canvas: string }
  | { type: 'rateSkill'; playerId: string; skill: string; value: number }
  | { type: 'approveDigest'; playerId: string; text: string }
  | { type: 'saveDrill'; drill: Omit<Drill, 'createdBy' | 'archived' | 'id'> & { id?: string } }
  | { type: 'archiveDrill'; drillId: string }
  | { type: 'saveTemplate'; template: Omit<Template, 'createdBy' | 'id'> & { id?: string } }
  | { type: 'scheduleSession'; playerId?: string; at: string; minutes: number; kind: Meeting['kind']; note: string; staffId?: string }
  | { type: 'cancelSession'; meetingId: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'markNotificationsRead'; ids?: string[] }
  | { type: 'requestData'; playerId: string; kind: DataRequest['kind'] }
  | { type: 'completeDataRequest'; requestId: string }
  | { type: 'inviteStaff'; name: string; email: string; role: 'assistant' | 'ops'; userId?: string }
  /** v6, server/system only: a verified Stripe webhook (or the test-mode simulator) translated into one engine command. Idempotent by eventId. */
  | { type: 'billingEvent'; eventId: string; kind: BillingEventKind; playerId?: string | null; customerId?: string | null; subscriptionId?: string | null; tier?: Tier | null; status?: string | null; periodEnd?: string | null; cancelAtPeriodEnd?: boolean; paused?: boolean; amount?: number | null }
  | { type: 'joinWaitlist'; playerId: string }
  | { type: 'setEmailPrefs'; prefs: Partial<EmailPrefs>; userId?: string }
  /** v7 */
  | { type: 'logGame'; playerId: string; date?: string; opponent?: string; stats?: GameStats; /** how it felt, 1–5 (private to the coach) */ confidence?: number; focus?: number; energy?: number; /** v9: one line each. `carried` is required. */ carried?: string; missed?: string; wellDone?: string; replay?: string; focusTried?: FocusTried; wantsReply?: boolean }
  | { type: 'addNote'; playerId: string; kind: TimelineNote['kind']; text: string; refId?: string; date?: string; approve?: boolean; drafted?: boolean }
  | { type: 'tagWin'; playerId: string; text: string; refId?: string }
  | { type: 'setAffirmation'; playerId: string; text: string }
  | { type: 'setCard'; playerId: string; enabled?: boolean; showStats?: boolean; momentId?: string | null; newLink?: boolean }
  | { type: 'sweep' }
  | { type: 'generateDigests' }
  | { type: 'advanceClock'; hours: number };
export type CommandType = Command['type'];

/** v4 settings defaults (merged over stored settings so older databases pick them up). */
/** v9 coach voice: warm, direct, respectful. No scolding on a missed week. Used as saved replies and check-in starters. */
export const SAVED_REPLIES = [
  'Good question. Short answer: yes, same reps, same tempo.',
  'Thanks for telling me. Lighten the day before a game and I’ll see you next session.',
  'Rough week happens. We’ll keep it light and pick back up when you’re ready. Nothing to make up.',
  'Checking in on you, not your reps. How are you feeling about basketball right now?',
  'I saw the clip. One thing carried over from last week: the eyes-up catch. Keep that, and we’ll sharpen the next piece.',
];
export const CHECKIN_STARTERS = [
  'Checking in on you, not your reps. How’s basketball feeling this week?',
  'I noticed it’s been a few days. No catching up needed. Want a lighter week, or a reset on the focus?',
  'That game sounded tough. One thing I saw you do well last week: [specific]. Want to talk about it?',
];
export const DEFAULT_COACH_PROFILE: CoachProfile = {
  intro: '[Coach: write your own 2–3 sentences here. Who you are, how long you’ve coached, who you coach.]',
  why: '[Coach: why you built this. What happens to players after the session ends.]',
  how: 'You send one clip of 30 seconds or less. I tell you one thing to change. You tell me back in your own words. Your next clip shows me if it landed.',
  lookFor: 'After your first look I’ll tell you one thing you already do well and the one thing we’ll work on first.',
};
export const SETTINGS_DEFAULTS: Pick<Settings, 'coachProfile' | 'reviewsPerWeek' | 'officeHours' | 'urgentReplyHours' | 'savedReplies' | 'cycleWeeks' | 'requirePayment' | 'graceDays' | 'offerHours' | 'timezone'> = {
  coachProfile: DEFAULT_COACH_PROFILE, requirePayment: true, graceDays: 7, offerHours: 48, timezone: 'America/Chicago',
  reviewsPerWeek: { Foundation: 1, Development: 3, 'Inner Circle': 99 }, officeHours: { days: [1, 2, 3, 4, 5, 6], start: 9, end: 20 }, urgentReplyHours: 4, cycleWeeks: 4,
  savedReplies: SAVED_REPLIES,
};
