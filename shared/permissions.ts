import { canSeeClip } from './clips';
import { PRIVATE_CONTEXTS, type Command, type CommandType, type Player, type Role, type Snapshot, type UserRole } from './domain';

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
  registerClip: FAMILY, deleteClip: ['parent', 'player', 'head', 'assistant'], setWorkingOn: FAMILY, saveDrillFeedback: COACH,
  billingEvent: ['system'], joinWaitlist: ['parent', 'head', 'ops'], setEmailPrefs: ['head', 'assistant', 'ops', 'parent', 'player', 'system'],
  logGame: FAMILY, setAffirmation: FAMILY, markGame: COACH, addNote: COACH, tagWin: COACH, setCard: ['parent'],
  /** v9 */ teachBack: ['player'], markTeachBack: COACH, logSession: COACH, setRhythm: FAMILY, roughWeek: FAMILY, sendStuck: ['player'], sendCheckIn: COACH, setGamify: FAMILY, requestProbe: COACH, setParentNote: COACH,
  sweep: ['system'], generateDigests: ['system', 'head'], advanceClock: ['system'],
};
/** Commands an assistant may only run on players assigned to them. */
const ASSIGNED_ONLY: CommandType[] = ['publishPlan', 'review', 'updateCanvas', 'rateSkill', 'approveDigest', 'sendMessage', 'markRead', 'scheduleSession', 'completeCycleReview', 'adjustPlan', 'setTournament', 'deleteClip', 'markGame', 'addNote', 'tagWin', 'markTeachBack', 'logSession', 'sendCheckIn', 'requestProbe', 'setParentNote'];

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
  if (a.role === 'system') return s;
  /** v7: the Player Card link token is the parent's to share; nobody else (head coach included) receives it. */
  if (a.role === 'head') return { ...s, players: s.players.map((p) => (p.card?.token ? { ...p, card: { ...p.card, token: null } } : p)) };
  const players = s.players.filter((p) => canSeePlayer(a, p)); const ids = new Set(players.map((p) => p.id)); const by = <T extends { playerId?: string | null }>(xs: T[]) => xs.filter((x) => x.playerId && ids.has(x.playerId));
  const coaching = a.role === 'assistant'; const family = a.role === 'parent' || a.role === 'player';
  return {
    ...s,
    users: s.users.filter((u) => ['head', 'assistant', 'ops'].includes(u.role) || u.id === a.id || (a.role === 'parent' && u.familyId === a.familyId) || (coaching && u.playerId && ids.has(u.playerId))).map((u) => (family && u.id !== a.id ? { ...u, email: null } : u)),
    families: s.families.filter((f) => players.some((p) => p.familyId === f.id)),
    players: players.map((p) => { const q = coaching ? p : { ...p, canvas: '' }; return a.role === 'parent' || !q.card ? q : { ...q, card: { ...q.card, token: null } }; }),
    applications: a.role === 'ops' ? s.applications : by(s.applications),
    invites: by(s.invites).map((i) => (a.role === 'ops' ? i : { ...i, tokenHash: '', codeHash: '' })),
    consents: by(s.consents), cycles: by(s.cycles), assignments: by(s.assignments), submissions: by(s.submissions),
    reviews: by(s.reviews).filter((r) => !family || r.status === 'final'),
    messages: a.role === 'ops' ? [] : by(s.messages).filter((m) => a.role !== 'parent' || !PRIVATE_CONTEXTS.includes(m.context)), reflections: by(s.reflections), cycleReviews: by(s.cycleReviews), clips: a.role === 'ops' ? [] : by(s.clips ?? []).filter((c) => canSeeClip(a, players.find((p) => p.id === c.playerId), c)), habits: by(s.habits), milestones: by(s.milestones),
    digests: by(s.digests).filter((d) => !family || d.status === 'approved'),
    meetings: s.meetings.filter((m) => (m.playerId ? ids.has(m.playerId) : a.role === 'ops' || m.staffId === a.id)),
    drills: family || a.role === 'ops' ? s.drills.filter(() => !family) : s.drills, templates: coaching ? s.templates : [],
    notifications: s.notifications.filter((n) => n.userId === a.id),
    outbox: a.role === 'ops' ? s.outbox : [],
    dataRequests: a.role === 'ops' ? s.dataRequests : by(s.dataRequests),
    subscriptions: a.role === 'ops' ? s.subscriptions ?? [] : family ? by(s.subscriptions ?? []) : [], billingEvents: [],
    sessions: a.role === 'ops' ? [] : by(s.sessions ?? []),
    games: a.role === 'ops' ? [] : by(s.games ?? []), wins: a.role === 'ops' ? [] : by(s.wins ?? []),
    timelineNotes: a.role === 'ops' ? [] : by(s.timelineNotes ?? []).filter((n) => !family || (n.status === 'approved' && n.kind !== 'cue')),
    events: s.events.filter((e) => (a.role === 'ops' ? true : !!e.playerId && ids.has(e.playerId))).map((e) => (family && e.type === 'rubric' ? { ...e, detail: 'Rubric updated' } : e)),
  };
}

/** HTTP endpoint matrix. Enforced by server/app.ts and exercised by tests/permissions.test.ts. */
export type Endpoint = 'snapshot' | 'commands' | 'export' | 'outbox' | 'team' | 'audit' | 'calendar' | 'notifications' | 'staff' | 'clips' | 'billing' | 'account';
export const ENDPOINT_ROLES: Record<Endpoint, UserRole[]> = {
  snapshot: ['head', 'assistant', 'ops', 'parent', 'player'], commands: ['head', 'assistant', 'ops', 'parent', 'player'],
  export: ['head', 'ops', 'parent'], outbox: ['head', 'ops'], team: ['head', 'ops'], audit: ['head', 'ops'],
  calendar: ['head', 'assistant', 'ops', 'parent', 'player'], notifications: ['head', 'assistant', 'ops', 'parent', 'player'], staff: ['head'], clips: ['head', 'assistant', 'parent', 'player'],
  /** v6: checkout / portal (parent), billing overview + test-mode simulator (head, ops) */ billing: ['head', 'ops', 'parent'], account: ['head', 'assistant', 'ops', 'parent', 'player'],
};
