import { PRIVATE_CONTEXTS, replyLabel, type Assignment, type CommandType, type LifecycleState, type Perspective, type Player, type Role, type Snapshot } from './domain';
import { addBusinessDays, isoDay, now, shortWhen } from './time';
import { promiseRisks } from './promises';
import { confidenceDip } from './games';
import { latestSession } from './v9';

/** Explicit lifecycle state machine: command → allowed source states → target. */
export const TRANSITIONS: { cmd: CommandType; from: LifecycleState[]; to: LifecycleState | 'dynamic'; actor: Role; label: string }[] = [
  { cmd: 'startFitReview', from: ['Applied'], to: 'Fit review', actor: 'ops', label: 'Ops opens the application' },
  { cmd: 'decideFit', from: ['Applied', 'Fit review', 'Waitlist'], to: 'dynamic', actor: 'ops', label: 'Not now → Waitlist' },
  { cmd: 'createInvite', from: ['Applied', 'Fit review', 'Waitlist', 'Invited'], to: 'dynamic', actor: 'ops', label: 'Invite (if capacity) or Waitlist' },
  { cmd: 'acceptInvite', from: ['Invited'], to: 'Onboarding', actor: 'parent', label: 'Parent accepts link/code, creates account' },
  { cmd: 'completeOnboarding', from: ['Onboarding'], to: 'Plan building', actor: 'parent', label: 'Profile, goal, rhythm + consent on file' },
  { cmd: 'publishPlan', from: ['Plan building', 'Cycle review'], to: 'Plan set', actor: 'head', label: 'Assigned coach sets focus + reps' },
  { cmd: 'openPlan', from: ['Plan set'], to: 'Work ready', actor: 'player', label: 'Player reads the focus, rep 1 unlocks' },
  { cmd: 'submitRep', from: ['Work ready'], to: 'dynamic', actor: 'player', label: 'Player logs sets + reflection → Submitted (or logged → Next step ready when the week’s reviews are used)' },
  { cmd: 'sweep', from: ['Submitted'], to: 'Feedback due', actor: 'system', label: 'Cron: 24 h without a reply' },
  { cmd: 'review', from: ['Submitted', 'Feedback due'], to: 'dynamic', actor: 'assistant', label: 'Approve/Retry. Assistant + sign-off rule → Sign-off' },
  { cmd: 'signOff', from: ['Sign-off'], to: 'dynamic', actor: 'head', label: 'Head coach confirms or edits the assistant’s review' },
  { cmd: 'startNext', from: ['Next step ready'], to: 'dynamic', actor: 'player', label: 'Next rep → Work ready · cycle done or 4 weeks up → Cycle review' },
  { cmd: 'pause', from: ['Plan building', 'Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Sign-off', 'Next step ready', 'Cycle review'], to: 'Paused', actor: 'parent', label: 'Family pauses' },
  { cmd: 'resume', from: ['Paused'], to: 'dynamic', actor: 'parent', label: 'Back to where they left off' },
];
export function canTransition(state: LifecycleState, cmd: CommandType) { const t = TRANSITIONS.filter((x) => x.cmd === cmd && x.cmd !== 'sweep'); return t.length === 0 || t.some((x) => x.from.includes(state)); }

export const PRE_ROSTER: LifecycleState[] = ['Applied', 'Fit review', 'Waitlist'];
export const ON_ROSTER = (st: LifecycleState) => !PRE_ROSTER.includes(st);
export function capacity(s: Snapshot) {
  const roster = s.players.filter((p) => ON_ROSTER(p.state) && p.billing !== 'canceled'); /* a canceled subscription frees the spot */ const inner = roster.filter((p) => p.tier === 'Inner Circle').length;
  return { used: roster.length, max: s.settings.capacity, inner, innerMax: s.settings.innerCircleCap, open: s.settings.capacity - roster.length, waitlist: s.players.filter((p) => p.state === 'Waitlist').length };
}
export const replyDays = (s: Snapshot, p: Player) => s.settings.sla[p.tier];
export const replyDue = (s: Snapshot, p: Player, from: Date) => addBusinessDays(from, replyDays(s, p));
export const tierReply = (s: Snapshot, p: Player) => replyLabel(replyDays(s, p));

// ---------- selectors ----------
export const clock = (s: Snapshot) => now(s.clockOffsetMs);
export const playerCycle = (s: Snapshot, pid: string) => s.cycles.filter((c) => c.playerId === pid).sort((a, b) => b.index - a.index)[0];
export const playerAssignments = (s: Snapshot, pid: string) => s.assignments.filter((a) => a.playerId === pid).sort((a, b) => a.order - b.order);
export const openAssignment = (s: Snapshot, pid: string): Assignment | undefined => playerAssignments(s, pid).find((a) => a.status === 'open' || a.status === 'submitted');
export const lastSubmission = (s: Snapshot, pid: string) => s.submissions.filter((x) => x.playerId === pid).sort((a, b) => b.at.localeCompare(a.at))[0];
export const lastReview = (s: Snapshot, pid: string, finalOnly = true) => s.reviews.filter((x) => x.playerId === pid && (!finalOnly || x.status === 'final')).sort((a, b) => b.at.localeCompare(a.at))[0];
export const pendingReview = (s: Snapshot, pid: string) => s.reviews.find((x) => x.playerId === pid && x.status === 'pending_signoff');
export const unanswered = (s: Snapshot, pid: string) => s.messages.filter((m) => m.playerId === pid && m.from !== 'coach' && !m.answered);
export const userName = (s: Snapshot, id?: string | null) => s.users.find((u) => u.id === id)?.name ?? (id === 'system' ? 'System' : 'Unassigned');
export const headCoach = (s: Snapshot) => s.users.find((u) => u.role === 'head');
export const staff = (s: Snapshot) => s.users.filter((u) => ['head', 'assistant', 'ops'].includes(u.role) && u.active);
export function streak(s: Snapshot, pid: string) {
  const full = new Map<string, number>(); for (const h of s.habits.filter((x) => x.playerId === pid)) full.set(h.date, (full.get(h.date) ?? 0) + 1);
  const ok = (d: string) => (full.get(d) ?? 0) >= 3; const d = clock(s); let k = 0; if (!ok(isoDay(d))) d.setDate(d.getDate() - 1);
  while (ok(isoDay(d))) { k++; d.setDate(d.getDate() - 1); } return k;
}
export const family = (s: Snapshot, p: Player) => s.families.find((f) => f.id === p.familyId) ?? { id: p.familyId, parentName: 'Parent', email: '' };
export const first = (n: string) => n.split(' ')[0];

// ---------- journey / levels ----------
export const LEVELS = [
  { n: 1, name: 'Tip-off', unlock: 'Finish onboarding' }, { n: 2, name: 'Rookie', unlock: 'Submit your first rep' },
  { n: 3, name: 'Rotation', unlock: '3 approved reps' }, { n: 4, name: 'Starter', unlock: 'Complete a full cycle' }, { n: 5, name: 'Closer', unlock: '2 cycles + a 7-day habit streak' },
] as const;
export function progress(s: Snapshot, pid: string) {
  const subs = s.submissions.filter((x) => x.playerId === pid).length;
  const approved = s.reviews.filter((r) => r.playerId === pid && r.decision === 'approve' && r.status === 'final').length;
  const cycles = s.cycles.filter((c) => c.playerId === pid && c.status !== 'active').length;
  const p = s.players.find((x) => x.id === pid); const onboarded = !!p && !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state);
  const st = streak(s, pid); const met = [onboarded, subs >= 1, approved >= 3, cycles >= 1, cycles >= 2 && st >= 7];
  let level = 0; while (level < met.length && met[level]) level++;
  const pct = [onboarded ? 1 : 0, Math.min(subs, 1), Math.min(approved / 3, 1), Math.min(cycles, 1), Math.min((cycles >= 2 ? 0.5 : cycles * 0.25) + Math.min(st / 14, 0.5), 1)][level] ?? 1;
  return { level, name: level ? LEVELS[level - 1].name : 'Not started', next: LEVELS[level], pct, subs, approved, cycles, streak: st };
}

// ---------- the guide: what / why / who / by when / unlocks ----------
export interface Guide { stage: string; what: string; why: string; who: Role; whoLabel: string; byWhen?: string; unlocks: string; action: { label: string; to?: string; cmd?: import('./domain').Command } }
/** Every state × perspective gets exactly one primary action (tested). When it isn't your move, the action is the most useful thing you can do while you wait. */
export function guide(s: Snapshot, p: Player, view: Perspective): Guide {
  const g = guideRaw(s, p, view);
  const fallback = view === 'player' ? { label: 'Message your coach', to: '/inbox' } : view === 'parent' ? { label: 'Message the coach', to: '/inbox' } : view === 'ops' ? { label: 'Open record', to: `/ops/player/${p.id}` } : { label: 'Open profile', to: `/coach/player/${p.id}` };
  return { ...g, action: g.action ?? fallback };
}
function guideRaw(s: Snapshot, p: Player, view: Perspective): Omit<Guide, 'action'> & { action?: Guide['action'] } {
  const fn = first(p.name); const parent = family(s, p).parentName; const a = openAssignment(s, p.id); const sub = lastSubmission(s, p.id); const cyc = playerCycle(s, p.id);
  const coach = userName(s, p.coachId); const due = sub?.dueBy ? shortWhen(sub.dueBy) : undefined;
  const planBy = shortWhen(addBusinessDays(new Date(p.stateSince), 2).toISOString()); const isCoach = view === 'coach'; const isOps = view === 'ops'; const fam = view === 'player' || view === 'parent';
  const inv = s.invites.filter((i) => i.playerId === p.id).sort((x, y) => y.sentAt.localeCompare(x.sentAt))[0];
  const plr = view === 'player'; const youOr = (you: string, them: string) => (plr ? you : them);
  switch (p.state) {
    case 'Applied': return { stage: p.state, what: 'Application received.', why: 'A person reads every application so the roster stays a real fit.', who: 'ops', whoLabel: 'Ops', byWhen: planBy, unlocks: 'An invite, or a waitlist spot.', action: isOps ? { label: 'Open application', cmd: { type: 'startFitReview', playerId: p.id } } : undefined };
    case 'Fit review': return { stage: p.state, what: 'Reading the application.', why: `The roster stops at ${s.settings.capacity} so every clip gets a real reply.`, who: 'ops', whoLabel: 'Ops', unlocks: 'An invite, or a waitlist spot.', action: isOps ? { label: 'Send invite', cmd: { type: 'createInvite', playerId: p.id } } : undefined };
    case 'Waitlist': return { stage: p.state, what: 'On the waitlist.', why: 'Every spot is taken right now. A short wait beats a coach who can’t reply.', who: 'ops', whoLabel: 'Ops', byWhen: 'When a spot opens', unlocks: 'An invite.', action: isOps ? { label: 'Invite if there’s room', cmd: { type: 'createInvite', playerId: p.id } } : undefined };
    case 'Invited': return { stage: p.state, what: `${fn} has a spot. The invite is waiting.`, why: 'A parent creates the account and gives consent before coaching starts.', who: 'parent', whoLabel: parent, byWhen: inv ? `Link expires ${shortWhen(inv.expiresAt)}` : undefined, unlocks: 'Setup: meet your coach, goal, rhythm, consent.', action: fam ? { label: 'Accept the invite', to: '/invite' } : isOps ? { label: 'Resend invite', cmd: { type: 'createInvite', playerId: p.id } } : undefined };
    case 'Onboarding': return { stage: p.state, what: 'Setting up.', why: `${coach} uses your goal and your first clip to decide what to work on first.`, who: 'parent', whoLabel: parent, unlocks: `${coach} takes a first look.`, action: view === 'parent' ? { label: 'Continue setup', to: '/welcome' } : undefined };
    case 'Plan building': return { stage: p.state, what: `${coach} is taking a first look.`, why: `He watches your clip, or uses his session notes, and picks one thing to start with. Your goal: “${p.goal}”.`, who: 'head', whoLabel: coach, byWhen: planBy, unlocks: 'What he saw, your first focus, and rep 1.', action: isCoach ? { label: 'Do the first look', to: `/coach/plan/${p.id}` } : plr ? { label: 'Add a clip while you wait', to: '/app#rep' } : undefined };
    case 'Plan set': return { stage: p.state, what: `Your focus: ${cyc?.focus}.`, why: p.firstLook ? `${coach} saw: ${p.firstLook.saw.slice(0, 120)}` : 'One focus makes every rep count toward one thing.', who: 'player', whoLabel: youOr('You', fn), byWhen: 'When you’re ready', unlocks: 'Rep 1.', action: plr ? { label: 'Read my focus and open rep 1', cmd: { type: 'openPlan', playerId: p.id } } : undefined };
    case 'Work ready': return { stage: p.state, what: `Next up: ${a?.title ?? 'your next rep'}.`, why: `It builds your focus: ${cyc?.focus}.`, who: 'player', whoLabel: youOr('You', fn), byWhen: p.rhythmPlan ? `Your clip day: ${p.rhythmPlan.clipDay}` : undefined, unlocks: `${coach} replies ${tierReply(s, p)}.`, action: plr ? { label: 'Send a clip', to: '/app#rep' } : undefined };
    case 'Submitted': return { stage: p.state, what: `${a?.title ?? 'Your clip'} is with ${coach}.`, why: `He watches it and gives you one adjustment.`, who: 'head', whoLabel: coach, byWhen: due, unlocks: 'One adjustment, then the next rep.', action: isCoach ? { label: 'Review now', to: `/coach/review/${p.id}` } : undefined };
    case 'Feedback due': return { stage: p.state, what: 'The reply is due.', why: `Replies come ${tierReply(s, p)} on the ${p.tier} plan.`, who: 'head', whoLabel: coach, byWhen: due, unlocks: 'One adjustment, then the next rep.', action: isCoach ? { label: 'Review now', to: `/coach/review/${p.id}` } : undefined };
    case 'Sign-off': { const pr = pendingReview(s, p.id); return { stage: p.state, what: fam ? 'Your feedback is written. One last look before it reaches you.' : `${userName(s, pr?.reviewerId)}’s review needs a second look.`, why: 'Assistant reviews get a second look so every cue stays consistent.', who: 'head', whoLabel: userName(s, headCoach(s)?.id), byWhen: due, unlocks: 'The feedback and the next rep.', action: isCoach ? { label: 'Sign off', to: `/coach/review/${p.id}` } : undefined }; }
    case 'Next step ready': { const logged = sub && sub.reviewed === false; const lr = lastReview(s, p.id); const tb = !logged && lr && !lr.teachBack; return { stage: p.state, what: logged ? 'Saved. Your next rep is open.' : `New from ${coach}.`, why: logged ? `Your coach still sees every clip. This week’s written reviews on ${p.tier} are used.` : 'Read the one adjustment, then say it back in your words. It takes a sentence.', who: 'player', whoLabel: youOr('You', fn), byWhen: 'When you’re ready', unlocks: 'The next rep.', action: plr ? (tb ? { label: 'Say it in my words', to: '/app#teachback' } : { label: 'Start the next rep', cmd: { type: 'startNext', playerId: p.id } }) : undefined }; }
    case 'Cycle review': { const cr = s.cycleReviews.find((x) => x.cycleId === cyc?.id); const coachDone = !!cr?.coachAt; return { stage: p.state, what: `Your ${s.settings.cycleWeeks ?? 4}-week re-check.`, why: coachDone ? `Next focus: “${cr?.nextFocus}”. ${coach} is setting it up.` : `${youOr('You', fn)} say what changed since week 1. ${coach} compares your clips and picks what’s next.`, who: coachDone || cr?.playerAt ? 'head' : 'player', whoLabel: coachDone || cr?.playerAt ? coach : youOr('You', fn), byWhen: planBy, unlocks: 'Your next focus.', action: isCoach ? (coachDone ? { label: 'Set the next focus', to: `/coach/plan/${p.id}` } : { label: 'Do the re-check', to: `/coach/cycle/${p.id}` }) : plr && !cr?.playerAt ? { label: 'Do my re-check', to: '/app/develop#cycle' } : view === 'parent' ? { label: 'See the re-check', to: '/parent#cycle' } : undefined }; }
    case 'Paused': if ((s.subscriptions ?? []).some((x) => x.playerId === p.id && x.pausedByBilling)) return { stage: p.state, what: 'Paused for billing.', why: 'A payment didn’t go through and the grace period ended. Progress is saved.', who: 'parent', whoLabel: parent, unlocks: `Back to where ${fn} left off once the card is updated.`, action: view === 'parent' ? { label: 'Update card', to: `/parent?p=${p.id}&tab=billing` } : undefined };
      return { stage: p.state, what: 'Paused.', why: 'Nothing is due. Progress is saved.', who: 'parent', whoLabel: parent, unlocks: 'Pick up where you left off.', action: view === 'parent' ? { label: 'Resume', cmd: { type: 'resume', playerId: p.id } } : undefined };
  }
}

// ---------- coach queue (routed to an owner) ----------
export type QueueKind = 'Reply needed' | 'Check in' | 'Sign-off' | 'Clip to review' | 'Teach-back' | 'First look' | 'Plan needed' | 'Re-check' | 'Due soon' | 'Game note' | 'Upcoming';
export const QUEUE_KINDS: QueueKind[] = ['Reply needed', 'Check in', 'Sign-off', 'Clip to review', 'Teach-back', 'First look', 'Re-check', 'Plan needed', 'Due soon', 'Game note', 'Upcoming'];
/** Owed work, never “Upcoming”. A game note is a light read, not owed. */
export const OWED = (k: QueueKind) => k !== 'Upcoming' && k !== 'Game note';
export interface QueueItem { key: string; kind: QueueKind; player: Player; ownerId: string; ownerName: string; what: string; why: string; unlocks: string; dueBy?: string; overdue: boolean; to: string }
export function buildQueue(s: Snapshot, ownerId?: string): QueueItem[] {
  const t = clock(s).getTime(); const q: QueueItem[] = []; const head = headCoach(s)?.id ?? '';
  const add = (kind: QueueKind, player: Player, owner: string, what: string, why: string, unlocks: string, to: string, dueBy?: string, key?: string) => q.push({ key: key ?? kind + player.id, kind, player, ownerId: owner, ownerName: userName(s, owner), what, why, unlocks, to, dueBy, overdue: !!dueBy && new Date(dueBy).getTime() < t });
  for (const p of s.players) {
    const c = p.coachId; const um = unanswered(s, p.id); const fn = first(p.name);
    const threads = new Map<string, typeof um>(); for (const m of um) { const k = `${m.context ?? 'general'}:${m.refId ?? ''}`; threads.set(k, [...(threads.get(k) ?? []), m]); }
    for (const [k, ms] of threads) { const m = ms[0]; const ctx = m.context ?? 'general'; const priv = PRIVATE_CONTEXTS.includes(ctx); add(priv ? 'Check in' : 'Reply needed', p, ctx === 'urgent' ? head : c, `${ctx === 'urgent' ? 'Urgent · ' : ctx === 'feedback' ? 'On your feedback · ' : ctx === 'schedule' ? 'Schedule · ' : ctx === 'stuck' ? 'I’m stuck · ' : ctx === 'checkin' ? 'Rough week · ' : ''}${m.from === 'parent' ? family(s, p).parentName : fn}: “${m.text.replace(/\n/g, ' · ').slice(0, 72)}”${ms.length > 1 ? ` (+${ms.length - 1})` : ''}`, priv ? `Private to ${fn}. Warm and specific beats fast and clever. ${tierReply(s, p)}.` : `Replies go out ${tierReply(s, p)} on ${p.tier}.`, priv ? `${fn} hears from you, not a template.` : 'Clears when you reply in this thread.', `/coach/player/${p.id}?tab=messages&t=${encodeURIComponent(k)}`, m.dueBy ?? undefined, `reply:${p.id}:${k}`); }
    if (p.state === 'Sign-off') { const r = pendingReview(s, p.id); add('Sign-off', p, head, `${userName(s, r?.reviewerId)} reviewed: ${r?.decision === 'approve' ? 'moving on' : 'same rep again'}`, 'Assistant reviews get a second look before the player sees them.', `${fn} gets the feedback.`, `/coach/review/${p.id}`, lastSubmission(s, p.id)?.dueBy); }
    if (p.state === 'Submitted' || p.state === 'Feedback due') { const sub = lastSubmission(s, p.id); const a = s.assignments.find((x) => x.id === sub?.assignmentId); add('Clip to review', p, c, `${a?.title}${sub?.clipId ? ' · clip' : ''} · “${(sub?.reflection ?? '').slice(0, 56)}”`, `Reply ${tierReply(s, p)} on ${p.tier}.`, `${fn} gets one adjustment and the next rep.`, `/coach/review/${p.id}`, sub?.dueBy); }
    const cyc = playerCycle(s, p.id); const crDone = p.state === 'Cycle review' && s.cycleReviews.some((x) => x.cycleId === cyc?.id && x.coachAt);
    if (p.state === 'Cycle review' && !crDone) { const cr = s.cycleReviews.find((x) => x.cycleId === cyc?.id); add('Re-check', p, c, `${fn}’s ${(s.settings.cycleWeeks ?? 4)}-week re-check${cr?.playerAt ? ` · “${(cr.improved ?? '').slice(0, 48)}”` : ' · their reflection is pending'}.`, 'Compare week 1 with now, then pick the next focus.', `${fn} → next focus.`, `/coach/cycle/${p.id}`, addBusinessDays(new Date(p.stateSince), 2).toISOString()); }
    if (p.state === 'Plan building' && !cyc) { const sess = latestSession(s, p.id, 30); add('First look', p, c, `${fn}’s first look. ${sess ? `You logged a session on ${shortWhen(sess.at)}.` : `Goal: “${p.goal}”.`}`, 'Watch the intake clip (or use your session notes), say what you saw, and set the first focus.', `${fn} meets their focus and gets rep 1.`, `/coach/plan/${p.id}`, addBusinessDays(new Date(p.stateSince), 2).toISOString()); }
    else if (p.state === 'Plan building' || crDone) add('Plan needed', p, c, crDone ? `Re-check done. Set the next focus for ${fn}.` : `Set ${fn}’s next focus.`, 'The next stretch starts when you set the focus.', `${fn} → new focus → rep 1.`, `/coach/plan/${p.id}`, addBusinessDays(new Date(p.stateSince), 2).toISOString());
    for (const r of s.reviews.filter((x) => p.state !== 'Paused' && x.playerId === p.id && x.status === 'final' && x.teachBack && !x.teachBack.mark)) add('Teach-back', p, c, `${fn}, in their words: “${r.teachBack!.change.slice(0, 72)}”`, `Read it: does it match the cue (“${r.adjust.slice(0, 40)}”)? Mark got it, or start a short clarifying thread.`, `${fn} knows you read it.`, `/coach/player/${p.id}?tab=feedback`, addBusinessDays(new Date(r.teachBack!.at), replyDays(s, p)).toISOString(), `tb:${r.id}`);
    const covered = new Set(['reply-window', 'first-look', 'cycle-review', 'teach-back', 'stuck-reply']);
    for (const { promise, risk } of promiseRisks(s, p)) if (!covered.has(promise.id)) add('Due soon', p, c, risk.what, `Promise: ${promise.text}`, 'Keeps the promise on the family’s card.', `/coach/player/${p.id}`, risk.dueBy, `promise:${promise.id}:${p.id}`);
    // v7: game logs (light unless the player asked), a gentle confidence flag, and the practice-to-game transfer cue.
    const coaching = p.state !== 'Paused';
    if (coaching) for (const g of (s.games ?? []).filter((x) => x.playerId === p.id && !x.mark)) add('Game note', p, c, `${fn}${g.opponent ? ` vs ${g.opponent}` : ''}${g.carried ? ` · carried: “${g.carried.slice(0, 56)}”` : ''}${g.missed ? ` · didn’t: “${g.missed.slice(0, 40)}”` : ''}`, 'A light read. Mark it carried over, partly or not yet, so the player sees you read it.', `${fn} sees you watched the games, not just the drills.`, `/coach/player/${p.id}?tab=games`, undefined, `game:${g.id}`);
    const dip = confidenceDip(s, p.id); if (coaching && dip && !dip.last.markedAt) add('Check in', p, c, `Games have felt rougher two in a row (${dip.values.join(' → ')}).`, 'Coach-only. A short, specific note on something they did well usually helps more than a fix.', `${fn} hears from you before the next game.`, `/coach/player/${p.id}?tab=games`, undefined, `conf:${dip.last.id}`);
    if (['Plan set', 'Work ready', 'Next step ready', 'Paused'].includes(p.state)) add('Upcoming', p, c, `${p.state}: ${fn} acts next.`, 'Nothing owed by you right now.', `Session ${new Date(p.nextSession + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.`, `/coach/player/${p.id}`);
  }
  const rank = (x: QueueItem) => (x.overdue ? 0 : 1) * 10 + QUEUE_KINDS.indexOf(x.kind);
  return q.filter((x) => !ownerId || x.ownerId === ownerId).sort((a, b) => rank(a) - rank(b) || (a.dueBy ?? 'z').localeCompare(b.dueBy ?? 'z'));
}

// ---------- ops queue (intake, invites, billing, capacity) ----------
export type OpsKind = 'New application' | 'Fit call to book' | 'Invite expired' | 'Invite pending' | 'Payment' | 'Data request' | 'Waitlist';
export const OPS_KINDS: OpsKind[] = ['New application', 'Fit call to book', 'Invite expired', 'Invite pending', 'Payment', 'Data request', 'Waitlist'];
export interface OpsItem { key: string; kind: OpsKind; player: Player; what: string; why: string; unlocks: string; dueBy?: string; overdue: boolean; to: string }
export function buildOpsQueue(s: Snapshot): OpsItem[] {
  const t = clock(s).getTime(); const q: OpsItem[] = [];
  const add = (kind: OpsKind, player: Player, what: string, why: string, unlocks: string, dueBy?: string) => q.push({ key: kind + player.id, kind, player, what, why, unlocks, dueBy, overdue: !!dueBy && new Date(dueBy).getTime() < t, to: `/ops/player/${player.id}` });
  for (const p of s.players) {
    const app = s.applications.find((a) => a.playerId === p.id); const inv = s.invites.filter((i) => i.playerId === p.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    const call = s.meetings.some((m) => m.playerId === p.id && m.kind === 'fit-call' && m.status !== 'cancelled');
    if (p.state === 'Applied' || p.state === 'Fit review') {
      if (app?.next === 'call' && !call) add('Fit call to book', p, `${family(s, p).parentName} asked for a 15-min call.`, 'Families who ask for a call shouldn’t get an invite first.', 'Fit decision after the call.', addBusinessDays(new Date(app.at), 1).toISOString());
      else add('New application', p, `${p.tier} suggested · ${app?.answers.days ?? ''} · “${app?.answers.goal ?? p.goal}”`, `${capacity(s).open} spots open.`, 'Invite or waitlist.', addBusinessDays(new Date(p.stateSince), 2).toISOString());
    }
    if (p.state === 'Invited' && inv) { if (inv.status === 'expired' || new Date(inv.expiresAt).getTime() < t) add('Invite expired', p, `Sent ${shortWhen(inv.sentAt)} to ${inv.email}.`, 'The spot is held but the link no longer works.', 'Resend a fresh link.', inv.expiresAt); else add('Invite pending', p, `Link + code sent to ${inv.email}. (Stored hashed; resend to get a new one.)`, 'Nudge after 3 days.', 'Onboarding.', inv.expiresAt); }
    if (ON_ROSTER(p.state) && p.state !== 'Invited' && p.billing === 'unpaid') add('Payment', p, `${p.tier} · $${({ Foundation: 69, Development: 139, 'Inner Circle': 229 })[p.tier]}/mo marked unpaid.`, 'Payment runs through Stripe checkout; the family sees “Choose plan & pay”.', 'Nudge the family, or mark comp.');
    if (p.state === 'Waitlist') add('Waitlist', p, `Waiting since ${shortWhen(p.stateSince)}.`, capacity(s).open > 0 ? `${capacity(s).open} spot(s) are open now.` : 'Roster is full.', 'Invite when a spot opens.');
  }
  for (const r of s.dataRequests.filter((x) => x.status === 'open')) { const p = s.players.find((x) => x.id === r.playerId); if (p) add('Data request', p, `${r.kind === 'delete' ? 'Deletion' : 'Export'} requested ${shortWhen(r.at)}.`, 'Privacy requests are answered within 30 days.', r.kind === 'delete' ? 'Player data is removed.' : 'CSV sent to the parent.', new Date(new Date(r.at).getTime() + 30 * 864e5).toISOString()); }
  const rank = (x: OpsItem) => (x.overdue ? 0 : 1) * 10 + OPS_KINDS.indexOf(x.kind);
  return q.sort((a, b) => rank(a) - rank(b) || (a.dueBy ?? 'z').localeCompare(b.dueBy ?? 'z'));
}

export function teamLoad(s: Snapshot) {
  const q = buildQueue(s); const ops = buildOpsQueue(s);
  return staff(s).map((u) => {
    const mine = u.role === 'ops' ? ops : q.filter((x) => x.ownerId === u.id && OWED(x.kind));
    return { user: u, players: s.players.filter((p) => p.coachId === u.id && ON_ROSTER(p.state)).length, open: mine.length, overdue: mine.filter((x) => x.overdue).length };
  });
}
