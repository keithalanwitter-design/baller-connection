import type { Command, CommandType, Player, Role, Snapshot, UserRole } from './domain';

export interface Actor { id: string; role: Role; familyId?: string | null; playerId?: string | null }
export const SYSTEM: Actor = { id: 'system', role: 'system' };
export const PUBLIC: Actor = { id: 'public', role: 'public' };

const H: Role[] = ['head']; const COACH: Role[] = ['head', 'assistant']; const OPS: Role[] = ['head', 'ops'];
const FAMILY: Role[] = ['parent', 'player'];
/** Who may run each command. Scope (own family / own player / assigned players) is checked separately. */
export const COMMAND_ROLES: Record<CommandType, Role[]> = {
  submitApplication: ['public', 'head', 'ops'], acceptInvite: ['public', 'parent'],
  startFitReview: OPS, scheduleFitCall: OPS, decideFit: OPS, createInvite: OPS, revokeInvite: OPS, assignCoach: OPS, setBilling: OPS,
  recordConsent: ['parent'], completeOnboarding: ['parent'], setPlayerLogin: ['parent', 'head'],
  publishPlan: COACH, review: COACH, signOff: H, updateCanvas: COACH, rateSkill: COACH, approveDigest: COACH,
  saveDrill: COACH, archiveDrill: COACH, saveTemplate: COACH,
  openPlan: FAMILY, submitRep: FAMILY, startNext: FAMILY, toggleHabit: FAMILY,
  pause: ['parent', 'head', 'ops'], resume: ['parent', 'head', 'ops'],
  sendMessage: ['head', 'assistant', 'parent', 'player'], markRead: ['head', 'assistant', 'parent', 'player'],
  scheduleSession: ['head', 'assistant', 'ops'], cancelSession: ['head', 'assistant', 'ops'],
  updateSettings: H, inviteStaff: H, markNotificationsRead: ['head', 'assistant', 'ops', 'parent', 'player'],
  requestData: ['parent'], completeDataRequest: OPS,
  reactFeedback: FAMILY, weeklyReflection: FAMILY, updateAboutMe: FAMILY, cycleReflection: FAMILY, setTournament: ['parent', 'player', 'head', 'assistant'],
  completeCycleReview: COACH, adjustPlan: COACH, approveDigests: COACH,
  sweep: ['system'], generateDigests: ['system', 'head'], advanceClock: ['system'],
};
/** Commands an assistant may only run on players assigned to them. */
const ASSIGNED_ONLY: CommandType[] = ['publishPlan', 'review', 'updateCanvas', 'rateSkill', 'approveDigest', 'sendMessage', 'markRead', 'scheduleSession', 'completeCycleReview', 'adjustPlan', 'setTournament'];

export class PermissionError extends Error {}
const pid = (c: Command): string | undefined => ('playerId' in c ? (c as { playerId?: string }).playerId : undefined);

export function canRun(s: Snapshot, a: Actor, c: Command): true | string {
  if (!COMMAND_ROLES[c.type].includes(a.role)) return `${a.role} can’t ${c.type}`;
  const id = pid(c); if (!id) return true;
  const p = s.players.find((x) => x.id === id); if (!p) return true; // engine reports unknown player
  if (a.role === 'parent' && p.familyId !== a.familyId) return 'Not your player';
  if (a.role === 'player' && a.playerId !== p.id) return 'Not your account';
  if (a.role === 'assistant' && ASSIGNED_ONLY.includes(c.type) && p.coachId !== a.id) return 'Player is assigned to another coach';
  return true;
}
export function assertCan(s: Snapshot, a: Actor, c: Command) { const r = canRun(s, a, c); if (r !== true) throw new PermissionError(r); }

export function canSeePlayer(a: Actor, p: Player) {
  switch (a.role) { case 'head': case 'ops': case 'system': return true; case 'assistant': return p.coachId === a.id; case 'parent': return p.familyId === a.familyId; case 'player': return p.id === a.playerId; default: return false; }
}

/** Server-side read filter: each role only receives what it may see. */
export function scopeSnapshot(s: Snapshot, a: Actor): Snapshot {
  if (a.role === 'head' || a.role === 'system') return s;
  const players = s.players.filter((p) => canSeePlayer(a, p)); const ids = new Set(players.map((p) => p.id)); const by = <T extends { playerId?: string | null }>(xs: T[]) => xs.filter((x) => x.playerId && ids.has(x.playerId));
  const coaching = a.role === 'assistant'; const family = a.role === 'parent' || a.role === 'player';
  return {
    ...s,
    users: s.users.filter((u) => ['head', 'assistant', 'ops'].includes(u.role) || u.id === a.id || (a.role === 'parent' && u.familyId === a.familyId) || (coaching && u.playerId && ids.has(u.playerId))).map((u) => (family && u.id !== a.id ? { ...u, email: null } : u)),
    families: s.families.filter((f) => players.some((p) => p.familyId === f.id)),
    players: players.map((p) => (coaching ? p : { ...p, canvas: '' })),
    applications: a.role === 'ops' ? s.applications : by(s.applications),
    invites: by(s.invites).map((i) => (a.role === 'ops' ? i : { ...i, tokenHash: '', codeHash: '' })),
    consents: by(s.consents), cycles: by(s.cycles), assignments: by(s.assignments), submissions: by(s.submissions),
    reviews: by(s.reviews).filter((r) => !family || r.status === 'final'),
    messages: a.role === 'ops' ? [] : by(s.messages), reflections: by(s.reflections), cycleReviews: by(s.cycleReviews), habits: by(s.habits), milestones: by(s.milestones),
    digests: by(s.digests).filter((d) => !family || d.status === 'approved'),
    meetings: s.meetings.filter((m) => (m.playerId ? ids.has(m.playerId) : a.role === 'ops' || m.staffId === a.id)),
    drills: family || a.role === 'ops' ? s.drills.filter(() => !family) : s.drills, templates: coaching ? s.templates : [],
    notifications: s.notifications.filter((n) => n.userId === a.id),
    outbox: a.role === 'ops' ? s.outbox : [],
    dataRequests: a.role === 'ops' ? s.dataRequests : by(s.dataRequests),
    events: s.events.filter((e) => (a.role === 'ops' ? true : !!e.playerId && ids.has(e.playerId))).map((e) => (family && e.type === 'rubric' ? { ...e, detail: 'Rubric updated' } : e)),
  };
}

/** HTTP endpoint matrix. Enforced by server/app.ts and exercised by tests/permissions.test.ts. */
export type Endpoint = 'snapshot' | 'commands' | 'export' | 'outbox' | 'team' | 'audit' | 'calendar' | 'notifications' | 'staff';
export const ENDPOINT_ROLES: Record<Endpoint, UserRole[]> = {
  snapshot: ['head', 'assistant', 'ops', 'parent', 'player'], commands: ['head', 'assistant', 'ops', 'parent', 'player'],
  export: ['head', 'ops', 'parent'], outbox: ['head', 'ops'], team: ['head', 'ops'], audit: ['head', 'ops'],
  calendar: ['head', 'assistant', 'ops', 'parent', 'player'], notifications: ['head', 'assistant', 'ops', 'parent', 'player'], staff: ['head'],
};
