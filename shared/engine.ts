import type { Command, DomainEvent, LifecycleState, Player, Role, Snapshot, Tier } from './domain';
import { LIBRARY } from './library';
import { addBusinessDays, isoDay } from './time';
import { canTransition, capacity, clock, lastSubmission, openAssignment, playerAssignments, playerCycle, progress, replyDue } from './workflow';

export class WorkflowError extends Error {}
let seq = 0; export const id = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const ROLE: Record<Command['type'], Role> = { submitApplication: 'parent', startFitReview: 'coach', decideFit: 'coach', acceptInvite: 'parent', completeOnboarding: 'parent', publishPlan: 'coach', openPlan: 'player', submitRep: 'player', review: 'coach', startNext: 'player', pause: 'parent', resume: 'parent', sendMessage: 'player', toggleHabit: 'player', updateCanvas: 'coach', rateSkill: 'coach', approveDigest: 'coach', advanceClock: 'system', tick: 'system' };

export function suggestTier(a: Record<string, string>): { fit: 'fit' | 'waitlist' | 'notyet'; tier: Tier; why: string } {
  if (a.need === 'In-person team practice' || a.need === 'Full game-film breakdown') return { fit: 'notyet', tier: 'Foundation', why: `We don’t offer ${a.need.toLowerCase()}. Better to say so now than take your money.` };
  if (a.age === 'Under 10' || a.days === '0–1 days') return { fit: 'notyet', tier: 'Foundation', why: 'The loop works when a player can rep alone 2+ days a week, from about age 10.' };
  if (a.want === 'Mostly mine (parent)') return { fit: 'fit', tier: 'Foundation', why: 'Start light. Foundation lets your player try the loop without a big commitment.' };
  const tier: Tier = a.need === 'Weekly live coaching' ? 'Inner Circle' : a.need === 'Plan + regular feedback' || a.days === '5+ days' ? 'Development' : 'Foundation';
  return { fit: 'fit', tier, why: `${a.days} a week and wanting ${a.need?.toLowerCase()} → ${tier} is the right starting plan.` };
}

/** Pure command handler. Returns a new snapshot plus the events it produced, or throws WorkflowError when a guard fails. */
export function dispatch(input: Snapshot, cmd: Command, roleOverride?: Role): { snapshot: Snapshot; events: DomainEvent[] } {
  const s: Snapshot = structuredClone(input); const t = clock(s); const at = t.toISOString(); const events: DomainEvent[] = [];
  const role = cmd.type === 'sendMessage' ? cmd.from : roleOverride ?? ROLE[cmd.type];
  const log = (type: string, detail: string, playerId?: string, from?: string, to?: string) => events.push({ id: id('ev'), at, role, playerId, type, from, to, detail });
  const P = (pid: string) => { const p = s.players.find((x) => x.id === pid); if (!p) throw new WorkflowError('Unknown player'); return p; };
  const move = (p: Player, to: LifecycleState, why: string) => { const from = p.state; p.state = to; p.stateSince = at; log('transition', why, p.id, from, to); };
  const guard = (p: Player) => { if (!canTransition(p.state, cmd.type)) throw new WorkflowError(`“${cmd.type}” is not allowed while ${p.name} is “${p.state}”.`); };
  const milestone = (p: Player, key: string) => { if (!s.milestones.some((m) => m.playerId === p.id && m.key === key)) { s.milestones.push({ id: id('ms'), playerId: p.id, key, at }); log('milestone', key, p.id); } };
  const runTick = () => { const n = clock(s).getTime(); for (const p of s.players) if (p.state === 'Submitted') { const sub = lastSubmission(s, p.id); if (sub && n - new Date(sub.at).getTime() >= 24 * 36e5) move(p, 'Feedback due', '24h without a reply — escalated'); } };
  const levelCheck = (p: Player, before: number) => { const after = progress(s, p.id).level; if (after > before) milestone(p, `Level ${after}`); };

  switch (cmd.type) {
    case 'submitApplication': {
      const r = suggestTier(cmd.answers); const fam = { id: id('fam'), parentName: cmd.parentName || 'Applicant parent', email: 'demo@example.com' };
      const p: Player = { id: id('pl'), familyId: fam.id, name: cmd.playerName || 'New Player', age: 13, position: '', tier: r.tier, state: 'Applied', stateSince: at, goal: cmd.answers.goal ?? '', learnStyle: '', rhythm: cmd.answers.days ?? '', canvas: '', rubric: {}, nextSession: isoDay(addBusinessDays(t, 5)) };
      s.families.push(fam); s.players.push(p);
      s.applications.push({ id: id('app'), at, playerId: p.id, answers: cmd.answers, tier: r.tier, fit: r.fit, next: cmd.next });
      log('application', `${p.name} applied (${r.fit}, suggested ${r.tier}, wants ${cmd.next})`, p.id, undefined, 'Applied'); break;
    }
    case 'startFitReview': { const p = P(cmd.playerId); guard(p); move(p, 'Fit review', 'Coach opened the application'); break; }
    case 'decideFit': {
      const p = P(cmd.playerId); guard(p); const c = capacity(s);
      if (!cmd.accept || c.open <= 0 || (p.tier === 'Inner Circle' && c.inner >= c.innerMax)) { move(p, 'Waitlist', !cmd.accept ? 'Coach waitlisted' : c.open <= 0 ? `Roster full (${c.used}/${c.max})` : `Inner Circle full (${c.inner}/${c.innerMax})`); break; }
      s.invites.push({ id: id('inv'), playerId: p.id, code: `${p.name.split(' ')[0].toUpperCase()}-2026`, sentAt: at }); move(p, 'Invited', `Invite sent (${c.used + 1}/${c.max} spots)`); break;
    }
    case 'acceptInvite': {
      const p = P(cmd.playerId); guard(p); const inv = s.invites.find((i) => i.playerId === p.id && !i.acceptedAt);
      if (!inv || inv.code.toUpperCase() !== cmd.code.trim().toUpperCase()) throw new WorkflowError('That invite code doesn’t match.');
      inv.acceptedAt = at; move(p, 'Onboarding', 'Family accepted the invite'); break;
    }
    case 'completeOnboarding': {
      const p = P(cmd.playerId); guard(p); if (!cmd.goal.trim() || !cmd.rhythm.trim()) throw new WorkflowError('Goal and weekly rhythm are required.');
      Object.assign(p, { position: cmd.position, goal: cmd.goal.trim(), learnStyle: cmd.learnStyle, rhythm: cmd.rhythm, rubric: { 'Ball security': 1, Finishing: 1, Defense: 1, 'Shot form': 1, Confidence: 1 } });
      const b = progress(s, p.id).level; move(p, 'Plan building', 'Onboarding complete — coach owes first plan'); levelCheck(p, b);
      s.messages.push({ id: id('msg'), playerId: p.id, from: 'coach', text: `Welcome, ${p.name.split(' ')[0]}! I read your goal: “${p.goal}”. Your first plan lands by ${addBusinessDays(t, 2).toLocaleDateString('en-US', { weekday: 'long' })}.`, at, answered: true }); break;
    }
    case 'publishPlan': {
      const p = P(cmd.playerId); guard(p); if (!cmd.focus.trim()) throw new WorkflowError('A plan needs one focus.'); if (!cmd.assignments.length) throw new WorkflowError('Assign at least one rep.');
      const prev = playerCycle(s, p.id); if (prev) prev.status = 'closed';
      const cyc = { id: id('cyc'), playerId: p.id, index: (prev?.index ?? 0) + 1, focus: cmd.focus.trim(), startAt: at, endAt: new Date(t.getTime() + 21 * 864e5).toISOString(), status: 'active' as const };
      s.cycles.push(cyc);
      cmd.assignments.forEach((li, i) => { const L = LIBRARY[li]; s.assignments.push({ id: id('as'), cycleId: cyc.id, playerId: p.id, order: (prev ? 100 * cyc.index : 0) + i, title: L.title, reps: L.reps, minutes: L.minutes, cues: L.cues, status: 'queued' }); });
      move(p, 'Plan set', `Cycle ${cyc.index}: “${cyc.focus}” with ${cmd.assignments.length} rep(s)`); break;
    }
    case 'openPlan': { const p = P(cmd.playerId); guard(p); const q = playerAssignments(s, p.id).find((a) => a.status === 'queued'); if (!q) throw new WorkflowError('No reps in this plan.'); q.status = 'open'; move(p, 'Work ready', `Unlocked: ${q.title}`); break; }
    case 'submitRep': {
      const p = P(cmd.playerId); guard(p); const a = openAssignment(s, p.id); if (!a) throw new WorkflowError('Nothing open to submit.');
      if (cmd.repsDone < 1 || cmd.repsDone > a.reps) throw new WorkflowError('Tap at least one finished set.'); if (cmd.reflection.trim().length < 5) throw new WorkflowError('Add one honest sentence.');
      const b = progress(s, p.id).level; a.status = 'submitted';
      const dueBy = replyDue(p, t).toISOString();
      s.submissions.push({ id: id('sub'), assignmentId: a.id, playerId: p.id, repsDone: cmd.repsDone, reflection: cmd.reflection.trim(), at, dueBy });
      move(p, 'Submitted', `${a.title}: ${cmd.repsDone}/${a.reps} sets · reply due ${new Date(dueBy).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })}`);
      milestone(p, 'First check-in'); levelCheck(p, b); break;
    }
    case 'tick': { runTick(); break; }
    case 'review': {
      const p = P(cmd.playerId); guard(p); const sub = lastSubmission(s, p.id); const a = s.assignments.find((x) => x.id === sub?.assignmentId);
      if (!sub || !a) throw new WorkflowError('No submission to review.'); if (cmd.feedback.trim().length < 5) throw new WorkflowError('Feedback needs one observation and one cue.');
      const b = progress(s, p.id).level; s.reviews.push({ id: id('rev'), submissionId: sub.id, playerId: p.id, decision: cmd.decision, feedback: cmd.feedback.trim(), at });
      if (cmd.decision === 'approve') { a.status = 'approved'; move(p, 'Next step ready', `Approved: ${a.title}`); if (s.reviews.filter((r) => r.playerId === p.id && r.decision === 'approve').length === 1) milestone(p, 'First approval'); }
      else { a.status = 'retry'; s.assignments.push({ ...a, id: id('as'), order: a.order + 0.5, status: 'open' }); move(p, 'Work ready', `Another attempt: ${a.title}`); milestone(p, 'Honest retry'); }
      levelCheck(p, b); break;
    }
    case 'startNext': {
      const p = P(cmd.playerId); guard(p); const q = playerAssignments(s, p.id).find((a) => a.status === 'queued');
      if (q) { q.status = 'open'; move(p, 'Work ready', `Unlocked: ${q.title}`); }
      else { const c = playerCycle(s, p.id); const b = progress(s, p.id).level; if (c) c.status = 'review'; move(p, 'Cycle review', `Cycle ${c?.index} complete`); milestone(p, `Cycle ${c?.index} complete`); levelCheck(p, b); }
      break;
    }
    case 'pause': { const p = P(cmd.playerId); guard(p); p.pausedFrom = p.state; move(p, 'Paused', 'Family paused'); break; }
    case 'resume': { const p = P(cmd.playerId); guard(p); const to = p.pausedFrom ?? 'Plan building'; p.pausedFrom = null; move(p, to, 'Resumed'); break; }
    case 'sendMessage': {
      const p = P(cmd.playerId); if (!cmd.text.trim()) throw new WorkflowError('Empty message.');
      if (cmd.from === 'coach') s.messages.forEach((m) => { if (m.playerId === p.id && m.from !== 'coach') m.answered = true; });
      s.messages.push({ id: id('msg'), playerId: p.id, from: cmd.from, text: cmd.text.trim(), at, dueBy: cmd.from === 'coach' ? null : replyDue(p, t).toISOString(), answered: cmd.from === 'coach' });
      log('message', `${cmd.from} → ${cmd.from === 'coach' ? 'family' : 'coach'}: “${cmd.text.trim().slice(0, 50)}”`, p.id); break;
    }
    case 'toggleHabit': {
      const p = P(cmd.playerId); const d = isoDay(t); const ex = s.habits.find((h) => h.playerId === p.id && h.date === d && h.key === cmd.key);
      const b = progress(s, p.id).level; const before = progress(s, p.id).streak;
      s.habits = ex ? s.habits.filter((h) => h !== ex) : [...s.habits, { id: id('hab'), playerId: p.id, date: d, key: cmd.key }];
      const st = progress(s, p.id).streak; if (st > before) log('habit', `Streak ${st} days`, p.id); for (const k of [3, 7, 14]) if (st >= k) milestone(p, `${k}-day streak`); levelCheck(p, b); break;
    }
    case 'updateCanvas': { P(cmd.playerId).canvas = cmd.canvas; break; }
    case 'rateSkill': { const p = P(cmd.playerId); p.rubric = { ...p.rubric, [cmd.skill]: Math.max(1, Math.min(5, cmd.value)) }; log('rubric', `${cmd.skill} → ${cmd.value}/5`, p.id); break; }
    case 'approveDigest': {
      const p = P(cmd.playerId); const wk = (() => { const x = new Date(t); x.setDate(x.getDate() - x.getDay()); return isoDay(x); })();
      s.digests = s.digests.filter((d) => !(d.playerId === p.id && d.week === wk)); s.digests.push({ id: id('dg'), playerId: p.id, week: wk, text: cmd.text, status: 'approved', approvedAt: at });
      log('digest', 'Weekly digest approved for parent', p.id); break;
    }
    case 'advanceClock': { s.clockOffsetMs += cmd.hours * 36e5; log('clock', `Demo clock +${cmd.hours}h`); runTick(); break; }
  }
  s.version++; s.events = [...s.events, ...events].slice(-400);
  return { snapshot: s, events };
}
