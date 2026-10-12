// Baller Connection domain model (v5). Shared by the browser demo engine, the API server and tests.
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
export type Billing = 'unpaid' | 'paid' | 'comp';

export interface Settings {
  programName: string; accent: string; availability: string;
  sla: Record<Tier, number>; capacity: number; innerCircleCap: number;
  requireSignoff: boolean; dueSoonHours: number; inviteDays: number;
  /** Written reviews per week by tier (99 = every submission). */ reviewsPerWeek: Record<Tier, number>;
  /** Office hours (local): days 0=Sun..6=Sat, hours 0-23. Outside them the coach's alerts are held and families see "replies resume …". */ officeHours: { days: number[]; start: number; end: number };
  urgentReplyHours: number; savedReplies: string[]; cycleWeeks: number;
}
export interface User { id: string; name: string; email?: string | null; username?: string | null; role: UserRole; familyId?: string | null; playerId?: string | null; active: boolean }
export interface Family { id: string; parentName: string; email: string; deletedAt?: string | null }
export interface Player {
  id: string; familyId: string; name: string; age: number; position: string; tier: Tier;
  state: LifecycleState; stateSince: string; pausedFrom?: LifecycleState | null;
  goal: string; learnStyle: string; rhythm: string; canvas: string; rubric: Record<string, number>;
  nextSession: string; coachId: string; billing: Billing;
  /** Optimistic-concurrency version: bumped on every state change. */ rev: number;
  frustration: string; proudOf: string; /** "Coach knows you": the player's own words, editable by the player. */ aboutMe: string; tournamentDate?: string | null;
  /** “What I’m working on”: one sentence in the player’s words, renewed weekly. */ workingOn?: string | null; workingOnWeek?: string | null;
}
export interface Application { id: string; at: string; playerId: string; answers: Record<string, string>; tier: Tier; fit: 'fit' | 'waitlist' | 'notyet'; next: 'apply' | 'call' | 'waitlist' }
export interface Invite { id: string; playerId: string; email: string; /** sha256 of the link token; plaintext only ever appears in the sent email */ tokenHash: string; codeHash: string; sentAt: string; expiresAt: string; createdBy: string; acceptedAt?: string | null; acceptedBy?: string | null; status: 'pending' | 'accepted' | 'expired' | 'revoked' }
export interface Consent { id: string; playerId: string; guardianName: string; userId: string; version: string; text: string; at: string }
export interface Cycle { id: string; playerId: string; index: number; focus: string; startAt: string; endAt: string; status: 'active' | 'review' | 'closed'; templateId?: string | null; /** last mid-cycle plan adjustment (promise: plan adjusted every 2 weeks) */ adjustedAt?: string | null }
export interface Drill { id: string; title: string; reps: number; minutes: number; cues: string[]; tags: string[]; createdBy: string; archived: boolean; /** Coach’s reusable feedback starter for this drill. */ fbTemplate?: { wentWell: string; adjust: string; why: string } | null }
export interface Template { id: string; name: string; focus: string; drillIds: string[]; createdBy: string }
export interface Assignment {
  id: string; cycleId: string; playerId: string; drillId?: string | null; order: number; title: string; reps: number; minutes: number; cues: string[];
  status: 'queued' | 'open' | 'submitted' | 'approved' | 'retry' | 'logged';
}
export interface Submission { id: string; assignmentId: string; playerId: string; repsDone: number; reflection: string; linkUrl?: string | null; /** v5 short clip (≤30 s) */ clipId?: string | null; at: string; dueBy: string; /** false = over this week's review allowance: logged, no review owed */ reviewed: boolean }
/** One feedback format everywhere: what went well, one adjustment, why, the next rep (+ optional link). `feedback` is the composed plain text. */
export interface Review { id: string; submissionId: string; playerId: string; decision: 'approve' | 'retry'; wentWell: string; adjust: string; why: string; nextRep: string; linkUrl?: string | null; feedback: string; reaction?: 'got_it' | 'question' | null; reactedAt?: string | null; /** v5: tap-to-timestamp notes on the clip */ notes?: TimedNote[] | null; /** coach time on this review */ secondsSpent?: number | null; /** gentle 48 h acknowledgment nudge sent */ nudgedAt?: string | null; at: string; reviewerId: string; status: 'final' | 'pending_signoff'; signedOffBy?: string | null; signedOffAt?: string | null }
export interface TimedNote { t: number; text: string }
/** A short practice clip. Visible to the player, their parent(s) and assigned coaches only; removed after 90 days or on request. */
export interface Clip { id: string; playerId: string; assignmentId?: string | null; submissionId?: string | null; storageKey: string; mime: string; bytes: number; durationSec: number; watchFor: string; uploadedBy: string; at: string; deleteAfter: string; deletedAt?: string | null }
export type MessageContext = 'general' | 'rep' | 'feedback' | 'schedule' | 'urgent' | 'gameplan';
export interface Message { id: string; playerId: string; from: 'coach' | 'player' | 'parent'; authorId: string; context: MessageContext; /** assignment / review / meeting id the thread is about */ refId?: string | null; text: string; linkUrl?: string | null; at: string; dueBy?: string | null; answered: boolean; readBy: Record<string, string> }
export interface Habit { id: string; playerId: string; date: string; key: string }
export interface Milestone { id: string; playerId: string; key: string; at: string }
export interface Digest { id: string; playerId: string; week: string; text: string; status: 'draft' | 'approved'; approvedAt?: string | null; approvedBy?: string | null }
export interface Meeting { id: string; playerId?: string | null; staffId: string; at: string; minutes: number; kind: 'check-in' | 'live' | 'fit-call' | 'goal-review'; note: string; status: 'scheduled' | 'done' | 'cancelled' }
export type NotificationType = 'promise_risk' | 'rhythm' | 'question' | 'reply_due_soon' | 'overdue' | 'new_submission' | 'feedback_ready' | 'invite_accepted' | 'plan_published' | 'cycle_review' | 'signoff_needed' | 'new_application' | 'invite_expired' | 'new_message' | 'digest_ready';
export interface Notification { id: string; userId: string; type: NotificationType; text: string; playerId?: string | null; link: string; at: string; readAt?: string | null; emailedAt?: string | null; dedupe: string }
export interface OutboxEmail { id: string; to: string; subject: string; body: string; at: string; status: 'queued' | 'sent' | 'logged' | 'failed'; kind: string }
export interface DataRequest { id: string; playerId: string; familyId: string; kind: 'export' | 'delete'; requestedBy: string; at: string; status: 'open' | 'done'; doneAt?: string | null }
export interface Reflection { id: string; playerId: string; week: string; text: string; feel: number; at: string }
export interface CycleReview { id: string; cycleId: string; playerId: string; improved?: string | null; hardest?: string | null; wantNext?: string | null; playerAt?: string | null; summary?: string | null; ratingsBefore?: Record<string, number> | null; ratingsAfter?: Record<string, number> | null; nextFocus?: string | null; coachAt?: string | null }
export interface DomainEvent { id: string; at: string; role: Role; actorId?: string | null; playerId?: string | null; type: string; from?: string | null; to?: string | null; detail: string }

export interface Snapshot {
  version: number; clockOffsetMs: number; settings: Settings;
  users: User[]; families: Family[]; players: Player[]; applications: Application[]; invites: Invite[]; consents: Consent[];
  cycles: Cycle[]; drills: Drill[]; templates: Template[]; assignments: Assignment[]; submissions: Submission[]; reviews: Review[];
  messages: Message[]; habits: Habit[]; milestones: Milestone[]; digests: Digest[]; meetings: Meeting[];
  notifications: Notification[]; outbox: OutboxEmail[]; dataRequests: DataRequest[]; reflections: Reflection[]; cycleReviews: CycleReview[]; clips: Clip[]; events: DomainEvent[];
}
export const TABLES = ['users', 'families', 'players', 'applications', 'invites', 'consents', 'cycles', 'drills', 'templates', 'assignments', 'submissions', 'reviews', 'messages', 'habits', 'milestones', 'digests', 'meetings', 'notifications', 'outbox', 'dataRequests', 'reflections', 'cycleReviews', 'clips', 'events'] as const;
export type TableName = (typeof TABLES)[number];

export const TIER_INFO: Record<Tier, { price: number; reviewsPerWeek: string }> = {
  Foundation: { price: 69, reviewsPerWeek: '1' }, Development: { price: 139, reviewsPerWeek: 'up to 3' }, 'Inner Circle': { price: 229, reviewsPerWeek: 'every submission' },
};
export const replyLabel = (days: number) => (days === 0 ? 'same business day' : `within ${days} business day${days === 1 ? '' : 's'}`);
/** Back-compat helper for the public pages (default SLA rules). */
export const TIERS: Record<Tier, { price: number; replyBizDays: number; replyLabel: string }> = {
  Foundation: { price: 69, replyBizDays: 2, replyLabel: replyLabel(2) }, Development: { price: 139, replyBizDays: 1, replyLabel: replyLabel(1) }, 'Inner Circle': { price: 229, replyBizDays: 0, replyLabel: replyLabel(0) },
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
  | { type: 'completeOnboarding'; playerId: string; position: string; goal: string; learnStyle: string; rhythm: string; frustration?: string; proudOf?: string }
  | { type: 'setPlayerLogin'; playerId: string; username: string; userId?: string }
  | { type: 'assignCoach'; playerId: string; coachId: string }
  | { type: 'setBilling'; playerId: string; billing: Billing }
  | { type: 'publishPlan'; playerId: string; focus: string; drillIds: string[]; templateId?: string; rev?: number }
  | { type: 'adjustPlan'; playerId: string; note: string; addDrillIds?: string[] }
  | { type: 'openPlan'; playerId: string }
  | { type: 'submitRep'; playerId: string; repsDone: number; reflection: string; linkUrl?: string; clipId?: string; watchFor?: string }
  /** Server-only (the upload endpoint runs it after checking the bytes); the browser demo runs it with the measured metadata. */
  | { type: 'registerClip'; playerId: string; clipId: string; storageKey: string; mime: string; bytes: number; durationSec: number; watchFor?: string }
  | { type: 'deleteClip'; playerId: string; clipId: string }
  | { type: 'setWorkingOn'; playerId: string; text: string }
  | { type: 'saveDrillFeedback'; drillId: string; fbTemplate: { wentWell: string; adjust: string; why: string } }
  | { type: 'review'; playerId: string; decision: 'approve' | 'retry'; wentWell: string; adjust: string; why: string; linkUrl?: string; notes?: TimedNote[]; secondsSpent?: number; rev?: number }
  | { type: 'signOff'; playerId: string; approve: boolean; edit?: { wentWell?: string; adjust?: string; why?: string }; rev?: number }
  | { type: 'reactFeedback'; playerId: string; reviewId: string; reaction: 'got_it' | 'question'; question?: string }
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
  | { type: 'sweep' }
  | { type: 'generateDigests' }
  | { type: 'advanceClock'; hours: number };
export type CommandType = Command['type'];

/** v4 settings defaults (merged over stored settings so older databases pick them up). */
export const SETTINGS_DEFAULTS: Pick<Settings, 'reviewsPerWeek' | 'officeHours' | 'urgentReplyHours' | 'savedReplies' | 'cycleWeeks'> = {
  reviewsPerWeek: { Foundation: 1, Development: 3, 'Inner Circle': 99 }, officeHours: { days: [1, 2, 3, 4, 5, 6], start: 9, end: 20 }, urgentReplyHours: 4, cycleWeeks: 4,
  savedReplies: ['Great question. Short answer: yes, same reps, same tempo.', 'Thanks for the heads-up. Lighten the day before a game: habits only.', 'Let’s cover this on your next session. I’ve added it to my notes.'],
};
