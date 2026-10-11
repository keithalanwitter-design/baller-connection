// Baller Connection domain model. Shared by the browser engine, the API server and tests.
export type Tier = 'Foundation' | 'Development' | 'Inner Circle';
export type Role = 'player' | 'parent' | 'coach' | 'system';

export const LIFECYCLE = [
  'Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Plan building', 'Plan set',
  'Work ready', 'Submitted', 'Feedback due', 'Next step ready', 'Cycle review', 'Paused',
] as const;
export type LifecycleState = (typeof LIFECYCLE)[number];

export interface Coach { id: string; name: string; capacity: number; innerCircleCap: number }
export interface Family { id: string; parentName: string; email: string }
export interface Player {
  id: string; familyId: string; name: string; age: number; position: string; tier: Tier;
  state: LifecycleState; stateSince: string; pausedFrom?: LifecycleState | null;
  goal: string; learnStyle: string; rhythm: string; canvas: string; rubric: Record<string, number>;
  nextSession: string;
}
export interface Application { id: string; at: string; playerId: string; answers: Record<string, string>; tier: Tier; fit: 'fit' | 'waitlist' | 'notyet'; next: 'apply' | 'call' | 'waitlist' }
export interface Invite { id: string; playerId: string; code: string; sentAt: string; acceptedAt?: string | null }
export interface Cycle { id: string; playerId: string; index: number; focus: string; startAt: string; endAt: string; status: 'active' | 'review' | 'closed' }
export interface Assignment {
  id: string; cycleId: string; playerId: string; order: number; title: string; reps: number; minutes: number; cues: string[];
  status: 'queued' | 'open' | 'submitted' | 'approved' | 'retry';
}
export interface Submission { id: string; assignmentId: string; playerId: string; repsDone: number; reflection: string; at: string; dueBy: string }
export interface Review { id: string; submissionId: string; playerId: string; decision: 'approve' | 'retry'; feedback: string; at: string }
export interface Message { id: string; playerId: string; from: Exclude<Role, 'system'>; text: string; at: string; dueBy?: string | null; answered: boolean }
export interface Habit { id: string; playerId: string; date: string; key: string }
export interface Milestone { id: string; playerId: string; key: string; at: string }
export interface Digest { id: string; playerId: string; week: string; text: string; status: 'draft' | 'approved'; approvedAt?: string | null }
export interface DomainEvent { id: string; at: string; role: Role; playerId?: string | null; type: string; from?: string | null; to?: string | null; detail: string }

export interface Snapshot {
  version: number; clockOffsetMs: number;
  coach: Coach; families: Family[]; players: Player[]; applications: Application[]; invites: Invite[];
  cycles: Cycle[]; assignments: Assignment[]; submissions: Submission[]; reviews: Review[];
  messages: Message[]; habits: Habit[]; milestones: Milestone[]; digests: Digest[]; events: DomainEvent[];
}
export const TABLES = ['families', 'players', 'applications', 'invites', 'cycles', 'assignments', 'submissions', 'reviews', 'messages', 'habits', 'milestones', 'digests', 'events'] as const;
export type TableName = (typeof TABLES)[number];

export const TIERS: Record<Tier, { price: number; replyBizDays: number; replyLabel: string; reviewsPerWeek: string }> = {
  Foundation: { price: 69, replyBizDays: 2, replyLabel: 'within 2 business days', reviewsPerWeek: '1' },
  Development: { price: 139, replyBizDays: 1, replyLabel: 'within 1 business day', reviewsPerWeek: 'up to 3' },
  'Inner Circle': { price: 229, replyBizDays: 0, replyLabel: 'same business day', reviewsPerWeek: 'every submission' },
};
export const HABITS = ['Handles 10 min', 'Form shots 25', 'Sleep 9 h'];

export type Command =
  | { type: 'submitApplication'; playerName: string; parentName: string; answers: Record<string, string> ; next: Application['next'] }
  | { type: 'startFitReview'; playerId: string }
  | { type: 'decideFit'; playerId: string; accept: boolean }
  | { type: 'acceptInvite'; playerId: string; code: string }
  | { type: 'completeOnboarding'; playerId: string; position: string; goal: string; learnStyle: string; rhythm: string }
  | { type: 'publishPlan'; playerId: string; focus: string; assignments: number[] }
  | { type: 'openPlan'; playerId: string }
  | { type: 'submitRep'; playerId: string; repsDone: number; reflection: string }
  | { type: 'review'; playerId: string; decision: 'approve' | 'retry'; feedback: string }
  | { type: 'startNext'; playerId: string }
  | { type: 'pause'; playerId: string }
  | { type: 'resume'; playerId: string }
  | { type: 'sendMessage'; playerId: string; from: Message['from']; text: string }
  | { type: 'toggleHabit'; playerId: string; key: string }
  | { type: 'updateCanvas'; playerId: string; canvas: string }
  | { type: 'rateSkill'; playerId: string; skill: string; value: number }
  | { type: 'approveDigest'; playerId: string; text: string }
  | { type: 'advanceClock'; hours: number }
  | { type: 'tick' };
