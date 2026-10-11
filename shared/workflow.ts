import { TIERS, type Assignment, type Command, type LifecycleState, type Player, type Role, type Snapshot } from './domain';
import { addBusinessDays, isoDay, now, shortWhen } from './time';

/** Explicit lifecycle state machine: command -> allowed source states -> target. */
export const TRANSITIONS: { cmd: Command['type']; from: LifecycleState[]; to: LifecycleState | 'dynamic'; actor: Role; label: string }[] = [
  { cmd: 'startFitReview', from: ['Applied'], to: 'Fit review', actor: 'coach', label: 'Coach opens the application' },
  { cmd: 'decideFit', from: ['Fit review', 'Waitlist'], to: 'dynamic', actor: 'coach', label: 'Invite (if capacity) or waitlist' },
  { cmd: 'acceptInvite', from: ['Invited'], to: 'Onboarding', actor: 'parent', label: 'Family accepts invite' },
  { cmd: 'completeOnboarding', from: ['Onboarding'], to: 'Plan building', actor: 'parent', label: 'Profile, goal, learning style, rhythm' },
  { cmd: 'publishPlan', from: ['Plan building', 'Cycle review'], to: 'Plan set', actor: 'coach', label: 'Coach sets focus + reps' },
  { cmd: 'openPlan', from: ['Plan set'], to: 'Work ready', actor: 'player', label: 'Player reads the focus, first rep unlocks' },
  { cmd: 'submitRep', from: ['Work ready'], to: 'Submitted', actor: 'player', label: 'Player logs sets + reflection' },
  { cmd: 'tick', from: ['Submitted'], to: 'Feedback due', actor: 'system', label: 'After 24h without a reply' },
  { cmd: 'review', from: ['Submitted', 'Feedback due'], to: 'dynamic', actor: 'coach', label: 'Approve → Next step ready · Retry → Work ready' },
  { cmd: 'startNext', from: ['Next step ready'], to: 'dynamic', actor: 'player', label: 'Next rep → Work ready · cycle done → Cycle review' },
  { cmd: 'pause', from: ['Plan building', 'Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Next step ready', 'Cycle review'], to: 'Paused', actor: 'parent', label: 'Family pauses' },
  { cmd: 'resume', from: ['Paused'], to: 'dynamic', actor: 'parent', label: 'Back to where they left off' },
];
export function canTransition(state: LifecycleState, cmd: Command['type']) {
  const t = TRANSITIONS.filter((x) => x.cmd === cmd);
  return t.length === 0 || t.some((x) => x.from.includes(state));
}

export const ON_ROSTER: LifecycleState[] = ['Invited', 'Onboarding', 'Plan building', 'Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Next step ready', 'Cycle review', 'Paused'];
export function capacity(s: Snapshot) {
  const roster = s.players.filter((p) => ON_ROSTER.includes(p.state));
  const inner = roster.filter((p) => p.tier === 'Inner Circle').length;
  return { used: roster.length, max: s.coach.capacity, inner, innerMax: s.coach.innerCircleCap, open: s.coach.capacity - roster.length };
}
export const replyDue = (p: Player, from: Date) => addBusinessDays(from, TIERS[p.tier].replyBizDays);

// ---------- selectors ----------
export const clock = (s: Snapshot) => now(s.clockOffsetMs);
export const playerCycle = (s: Snapshot, pid: string) => s.cycles.filter((c) => c.playerId === pid).sort((a, b) => b.index - a.index)[0];
export const playerAssignments = (s: Snapshot, pid: string) => s.assignments.filter((a) => a.playerId === pid).sort((a, b) => a.order - b.order);
export const openAssignment = (s: Snapshot, pid: string): Assignment | undefined => playerAssignments(s, pid).find((a) => a.status === 'open' || a.status === 'submitted');
export const lastSubmission = (s: Snapshot, pid: string) => s.submissions.filter((x) => x.playerId === pid).sort((a, b) => b.at.localeCompare(a.at))[0];
export const lastReview = (s: Snapshot, pid: string) => s.reviews.filter((x) => x.playerId === pid).sort((a, b) => b.at.localeCompare(a.at))[0];
export const unanswered = (s: Snapshot, pid: string) => s.messages.filter((m) => m.playerId === pid && m.from !== 'coach' && !m.answered);
export function streak(s: Snapshot, pid: string) {
  const full = new Map<string, number>(); for (const h of s.habits.filter((x) => x.playerId === pid)) full.set(h.date, (full.get(h.date) ?? 0) + 1);
  const ok = (d: string) => (full.get(d) ?? 0) >= 3;
  const d = clock(s); let k = 0; if (!ok(isoDay(d))) d.setDate(d.getDate() - 1);
  while (ok(isoDay(d))) { k++; d.setDate(d.getDate() - 1); } return k;
}
export const family = (s: Snapshot, p: Player) => s.families.find((f) => f.id === p.familyId)!;
export const first = (n: string) => n.split(' ')[0];

// ---------- journey / levels ----------
export const LEVELS = [
  { n: 1, name: 'Tip-off', unlock: 'Finish onboarding' },
  { n: 2, name: 'Rookie', unlock: 'Submit your first rep' },
  { n: 3, name: 'Rotation', unlock: '3 approved reps' },
  { n: 4, name: 'Starter', unlock: 'Complete a full cycle' },
  { n: 5, name: 'Closer', unlock: '2 cycles + a 7-day habit streak' },
] as const;
export function progress(s: Snapshot, pid: string) {
  const subs = s.submissions.filter((x) => x.playerId === pid).length;
  const approved = s.reviews.filter((r) => r.playerId === pid && r.decision === 'approve').length;
  const cycles = s.cycles.filter((c) => c.playerId === pid && c.status !== 'active').length;
  const p = s.players.find((x) => x.id === pid)!;
  const onboarded = !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state);
  const st = streak(s, pid);
  const met = [onboarded, subs >= 1, approved >= 3, cycles >= 1, cycles >= 2 && st >= 7];
  let level = 0; while (level < met.length && met[level]) level++;
  const nextReq = LEVELS[level];
  const pct = [onboarded ? 1 : 0, Math.min(subs, 1), Math.min(approved / 3, 1), Math.min(cycles, 1), Math.min((cycles >= 2 ? 0.5 : cycles * 0.25) + Math.min(st / 14, 0.5), 1)][level] ?? 1;
  return { level, name: level ? LEVELS[level - 1].name : 'Not started', next: nextReq, pct, subs, approved, cycles, streak: st };
}

// ---------- the "Your path" guide: what / why / who / when / unlocks ----------
export interface Guide { stage: string; what: string; why: string; who: Role; whoLabel: string; byWhen?: string; unlocks: string; action?: { label: string; to?: string; cmd?: Command } }
export function guide(s: Snapshot, p: Player, role: Role): Guide {
  const fn = first(p.name); const parent = family(s, p)?.parentName ?? 'Parent'; const a = openAssignment(s, p.id); const sub = lastSubmission(s, p.id); const cyc = playerCycle(s, p.id);
  const me = role === 'player' ? 'You' : role === 'parent' ? 'You' : fn;
  const due = sub?.dueBy ? shortWhen(sub.dueBy) : undefined;
  const coachPlanBy = shortWhen(addBusinessDays(new Date(p.stateSince), 2).toISOString());
  switch (p.state) {
    case 'Applied': return { stage: p.state, what: 'Application received.', why: 'The coach reads every application personally to keep the roster a real fit.', who: 'coach', whoLabel: 'Coach', byWhen: shortWhen(addBusinessDays(new Date(p.stateSince), 2).toISOString()), unlocks: 'Fit decision: invite or waitlist.', action: role === 'coach' ? { label: 'Open application', cmd: { type: 'startFitReview', playerId: p.id } } : undefined };
    case 'Fit review': return { stage: p.state, what: 'Coach is reviewing fit and capacity.', why: `Roster is capped at ${s.coach.capacity} so every rep gets a reply.`, who: 'coach', whoLabel: 'Coach', unlocks: 'An invite with your plan, or a waitlist spot.', action: role === 'coach' ? { label: 'Send invite', cmd: { type: 'decideFit', playerId: p.id, accept: true } } : undefined };
    case 'Waitlist': return { stage: p.state, what: 'On the waitlist.', why: 'Every spot is full. Waiting beats a coach who can’t answer.', who: 'coach', whoLabel: 'Coach', byWhen: 'When a spot opens', unlocks: 'An invite.', action: role === 'coach' ? { label: 'Invite if capacity', cmd: { type: 'decideFit', playerId: p.id, accept: true } } : undefined };
    case 'Invited': return { stage: p.state, what: `${fn} has a spot. The invite is waiting.`, why: 'Onboarding tells the coach the goal and weekly rhythm, so the plan fits real life.', who: 'parent', whoLabel: parent, byWhen: 'Invite expires in 7 days', unlocks: 'Onboarding (5 short screens).', action: role !== 'coach' ? { label: 'Accept invite', to: '/welcome' } : undefined };
    case 'Onboarding': return { stage: p.state, what: 'Setting up profile, goal and rhythm.', why: 'The coach builds the first plan from these answers.', who: 'parent', whoLabel: parent, unlocks: 'Coach starts building the first plan.', action: role !== 'coach' ? { label: 'Continue setup', to: '/welcome' } : undefined };
    case 'Plan building': return { stage: p.state, what: 'Coach is building the plan.', why: `One focus for the next 2–4 weeks, chosen from ${fn}’s goal: “${p.goal}”.`, who: 'coach', whoLabel: 'Coach', byWhen: coachPlanBy, unlocks: 'Your focus and first rep.', action: role === 'coach' ? { label: 'Build plan', to: `/coach/plan/${p.id}` } : role === 'player' ? { label: 'Do today’s habits', to: '/app#habits' } : undefined };
    case 'Plan set': return { stage: p.state, what: `New plan: ${cyc?.focus}.`, why: 'Knowing the focus first makes every rep count toward one thing.', who: 'player', whoLabel: fn, byWhen: 'Today', unlocks: 'Your first rep.', action: role === 'player' ? { label: 'Read my focus & unlock rep 1', cmd: { type: 'openPlan', playerId: p.id } } : undefined };
    case 'Work ready': return { stage: p.state, what: `Next rep: ${a?.title ?? 'assigned work'}.`, why: `It builds the focus: ${cyc?.focus}.`, who: 'player', whoLabel: me, byWhen: 'Before next session', unlocks: `A coach reply ${TIERS[p.tier].replyLabel}.`, action: role === 'player' ? { label: 'Log practice', to: '/app#rep' } : undefined };
    case 'Submitted': return { stage: p.state, what: `${a?.title} submitted.`, why: 'The coach reads your reflection and gives one cue for the next rep.', who: 'coach', whoLabel: 'Coach', byWhen: due, unlocks: 'Feedback, then the next rep.', action: role === 'coach' ? { label: 'Review now', to: `/coach/review/${p.id}` } : undefined };
    case 'Feedback due': return { stage: p.state, what: 'Coach reply is due.', why: 'Replies are promised on your plan’s window.', who: 'coach', whoLabel: 'Coach', byWhen: due, unlocks: 'Feedback, then the next rep.', action: role === 'coach' ? { label: 'Review now', to: `/coach/review/${p.id}` } : undefined };
    case 'Next step ready': return { stage: p.state, what: 'New coach feedback is in.', why: 'Read the cue before the next rep so it sticks.', who: 'player', whoLabel: me, byWhen: 'Today', unlocks: 'The next rep (or your cycle wrap-up).', action: role === 'player' ? { label: 'Read feedback & start next rep', cmd: { type: 'startNext', playerId: p.id } } : undefined };
    case 'Cycle review': return { stage: p.state, what: `Cycle ${cyc?.index} complete.`, why: 'The coach updates the rubric and picks the next focus from what the reps showed.', who: 'coach', whoLabel: 'Coach', byWhen: coachPlanBy, unlocks: 'Cycle ' + ((cyc?.index ?? 0) + 1) + ' with a new focus.', action: role === 'coach' ? { label: 'Plan next cycle', to: `/coach/plan/${p.id}` } : undefined };
    case 'Paused': return { stage: p.state, what: 'Plan is paused.', why: 'No reps are due and no billing in the demo. Progress is saved.', who: 'parent', whoLabel: parent, unlocks: `Back to “${p.pausedFrom}”.`, action: role !== 'coach' ? { label: 'Resume', cmd: { type: 'resume', playerId: p.id } } : undefined };
  }
}

// ---------- coach queue ----------
export type QueueKind = 'Reply needed' | 'Work ready' | 'Plan needed' | 'Activation' | 'Upcoming';
export const QUEUE_KINDS: QueueKind[] = ['Reply needed', 'Work ready', 'Plan needed', 'Activation', 'Upcoming'];
export interface QueueItem { key: string; kind: QueueKind; player: Player; reason: string; dueBy?: string; overdue: boolean; to: string }
export function buildQueue(s: Snapshot): QueueItem[] {
  const t = clock(s).getTime(); const q: QueueItem[] = [];
  const add = (kind: QueueKind, player: Player, reason: string, to: string, dueBy?: string) => q.push({ key: kind + player.id, kind, player, reason, to, dueBy, overdue: !!dueBy && new Date(dueBy).getTime() < t });
  for (const p of s.players) {
    const um = unanswered(s, p.id); if (um.length) { const m = um[0]; add('Reply needed', p, `${m.from === 'parent' ? family(s, p).parentName : first(p.name)} asked: “${m.text.slice(0, 64)}”${um.length > 1 ? ` (+${um.length - 1})` : ''}`, `/coach/player/${p.id}?tab=messages`, m.dueBy ?? undefined); }
    if (p.state === 'Submitted' || p.state === 'Feedback due') { const sub = lastSubmission(s, p.id); const a = s.assignments.find((x) => x.id === sub?.assignmentId); add('Work ready', p, `${a?.title} · ${sub?.repsDone}/${a?.reps} sets. Reply promised ${TIERS[p.tier].replyLabel} (${p.tier}).`, `/coach/review/${p.id}`, sub?.dueBy); }
    if (p.state === 'Plan building' || p.state === 'Cycle review') add('Plan needed', p, p.state === 'Cycle review' ? `Cycle ${playerCycle(s, p.id)?.index} done. Pick the next focus.` : `Onboarded. Goal: “${p.goal}”. First plan due in 2 business days.`, `/coach/plan/${p.id}`, addBusinessDays(new Date(p.stateSince), 2).toISOString());
    if (['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state)) add('Activation', p, p.state === 'Invited' ? `Invite not accepted by ${family(s, p).parentName}. Nudge after 3 days.` : p.state === 'Onboarding' ? 'Family is mid-onboarding.' : `${p.state}: decide invite or waitlist (${capacity(s).open} spots open).`, `/coach/player/${p.id}`, p.state === 'Applied' || p.state === 'Fit review' ? addBusinessDays(new Date(p.stateSince), 2).toISOString() : p.state === 'Invited' ? new Date(new Date(p.stateSince).getTime() + 3 * 864e5).toISOString() : undefined);
    if (['Plan set', 'Work ready', 'Next step ready', 'Paused'].includes(p.state)) add('Upcoming', p, `${p.state}: ${first(p.name)} acts next. Session ${new Date(p.nextSession + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`, `/coach/player/${p.id}`);
  }
  const rank = (x: QueueItem) => (x.overdue ? 0 : 1) * 10 + QUEUE_KINDS.indexOf(x.kind);
  return q.sort((a, b) => rank(a) - rank(b) || (a.dueBy ?? 'z').localeCompare(b.dueBy ?? 'z'));
}
