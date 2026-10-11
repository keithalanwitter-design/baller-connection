// Baller Connection domain model (v3). Shared by the browser demo engine, the API server and tests.
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
}
export interface User { id: string; name: string; email?: string | null; username?: string | null; role: UserRole; familyId?: string | null; playerId?: string | null; active: boolean }
export interface Family { id: string; parentName: string; email: string; deletedAt?: string | null }
export interface Player {
  id: string; familyId: string; name: string; age: number; position: string; tier: Tier;
  state: LifecycleState; stateSince: string; pausedFrom?: LifecycleState | null;
  goal: string; learnStyle: string; rhythm: string; canvas: string; rubric: Record<string, number>;
  nextSession: string; coachId: string; billing: Billing;
}
export interface Application { id: string; at: string; playerId: string; answers: Record<string, string>; tier: Tier; fit: 'fit' | 'waitlist' | 'notyet'; next: 'apply' | 'call' | 'waitlist' }
export interface Invite { id: string; playerId: string; email: string; token: string; code: string; sentAt: string; expiresAt: string; createdBy: string; acceptedAt?: string | null; acceptedBy?: string | null; status: 'pending' | 'accepted' | 'expired' | 'revoked' }
export interface Consent { id: string; playerId: string; guardianName: string; userId: string; version: string; text: string; at: string }
export interface Cycle { id: string; playerId: string; index: number; focus: string; startAt: string; endAt: string; status: 'active' | 'review' | 'closed'; templateId?: string | null }
export interface Drill { id: string; title: string; reps: number; minutes: number; cues: string[]; tags: string[]; createdBy: string; archived: boolean }
export interface Template { id: string; name: string; focus: string; drillIds: string[]; createdBy: string }
export interface Assignment {
  id: string; cycleId: string; playerId: string; drillId?: string | null; order: number; title: string; reps: number; minutes: number; cues: string[];
  status: 'queued' | 'open' | 'submitted' | 'approved' | 'retry';
}
export interface Submission { id: string; assignmentId: string; playerId: string; repsDone: number; reflection: string; linkUrl?: string | null; at: string; dueBy: string }
export interface Review { id: string; submissionId: string; playerId: string; decision: 'approve' | 'retry'; feedback: string; at: string; reviewerId: string; status: 'final' | 'pending_signoff'; signedOffBy?: string | null; signedOffAt?: string | null }
export interface Message { id: string; playerId: string; from: 'coach' | 'player' | 'parent'; authorId: string; text: string; linkUrl?: string | null; at: string; dueBy?: string | null; answered: boolean; readBy: Record<string, string> }
export interface Habit { id: string; playerId: string; date: string; key: string }
export interface Milestone { id: string; playerId: string; key: string; at: string }
export interface Digest { id: string; playerId: string; week: string; text: string; status: 'draft' | 'approved'; approvedAt?: string | null; approvedBy?: string | null }
export interface Meeting { id: string; playerId?: string | null; staffId: string; at: string; minutes: number; kind: 'check-in' | 'live' | 'fit-call'; note: string; status: 'scheduled' | 'done' | 'cancelled' }
export type NotificationType = 'reply_due_soon' | 'overdue' | 'new_submission' | 'feedback_ready' | 'invite_accepted' | 'plan_published' | 'cycle_review' | 'signoff_needed' | 'new_application' | 'invite_expired' | 'new_message' | 'digest_ready';
export interface Notification { id: string; userId: string; type: NotificationType; text: string; playerId?: string | null; link: string; at: string; readAt?: string | null; emailedAt?: string | null; dedupe: string }
export interface OutboxEmail { id: string; to: string; subject: string; body: string; at: string; status: 'queued' | 'sent' | 'logged' | 'failed'; kind: string }
export interface DataRequest { id: string; playerId: string; familyId: string; kind: 'export' | 'delete'; requestedBy: string; at: string; status: 'open' | 'done'; doneAt?: string | null }
export interface DomainEvent { id: string; at: string; role: Role; actorId?: string | null; playerId?: string | null; type: string; from?: string | null; to?: string | null; detail: string }

export interface Snapshot {
  version: number; clockOffsetMs: number; settings: Settings;
  users: User[]; families: Family[]; players: Player[]; applications: Application[]; invites: Invite[]; consents: Consent[];
  cycles: Cycle[]; drills: Drill[]; templates: Template[]; assignments: Assignment[]; submissions: Submission[]; reviews: Review[];
  messages: Message[]; habits: Habit[]; milestones: Milestone[]; digests: Digest[]; meetings: Meeting[];
  notifications: Notification[]; outbox: OutboxEmail[]; dataRequests: DataRequest[]; events: DomainEvent[];
}
export const TABLES = ['users', 'families', 'players', 'applications', 'invites', 'consents', 'cycles', 'drills', 'templates', 'assignments', 'submissions', 'reviews', 'messages', 'habits', 'milestones', 'digests', 'meetings', 'notifications', 'outbox', 'dataRequests', 'events'] as const;
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
export const CONSENT_VERSION = '2026-10';
export const CONSENT_TEXT = 'I am the parent or legal guardian of this player. I consent to Baller Connection storing the player’s name, age, goals, practice logs and messages to provide coaching, and to the coach contacting the player through the app. I can request an export or deletion at any time.';

export type Command =
  | { type: 'submitApplication'; playerName: string; parentName: string; email?: string; answers: Record<string, string>; next: Application['next'] }
  | { type: 'startFitReview'; playerId: string }
  | { type: 'scheduleFitCall'; playerId: string; at: string }
  | { type: 'decideFit'; playerId: string; accept: boolean }
  | { type: 'createInvite'; playerId: string; email?: string }
  | { type: 'revokeInvite'; playerId: string }
  | { type: 'acceptInvite'; token?: string; code?: string; parentName?: string; email?: string; userId?: string }
  | { type: 'recordConsent'; playerId: string; guardianName: string; agreed: boolean }
  | { type: 'completeOnboarding'; playerId: string; position: string; goal: string; learnStyle: string; rhythm: string }
  | { type: 'setPlayerLogin'; playerId: string; username: string; userId?: string }
  | { type: 'assignCoach'; playerId: string; coachId: string }
  | { type: 'setBilling'; playerId: string; billing: Billing }
  | { type: 'publishPlan'; playerId: string; focus: string; drillIds: string[]; templateId?: string }
  | { type: 'openPlan'; playerId: string }
  | { type: 'submitRep'; playerId: string; repsDone: number; reflection: string; linkUrl?: string }
  | { type: 'review'; playerId: string; decision: 'approve' | 'retry'; feedback: string }
  | { type: 'signOff'; playerId: string; approve: boolean; feedback?: string }
  | { type: 'startNext'; playerId: string }
  | { type: 'pause'; playerId: string }
  | { type: 'resume'; playerId: string }
  | { type: 'sendMessage'; playerId: string; text: string; linkUrl?: string }
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
