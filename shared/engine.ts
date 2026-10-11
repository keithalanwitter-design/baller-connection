import { CONSENT_TEXT, CONSENT_VERSION, type Command, type DomainEvent, type LifecycleState, type NotificationType, type Player, type Snapshot, type Tier } from './domain';
import { assertCan, type Actor } from './permissions';
import { addBusinessDays, isoDay, shortWhen, weekKey } from './time';
import { canTransition, capacity, clock, first, headCoach, lastSubmission, openAssignment, pendingReview, playerAssignments, playerCycle, progress, replyDue, staff, userName } from './workflow';

export class WorkflowError extends Error {}
let seq = 0; export const id = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const randomToken = (bytes = 24) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
const code6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
export const isUrl = (u?: string) => !u || /^https?:\/\/[^\s]+$/i.test(u.trim());

export function suggestTier(a: Record<string, string>): { fit: 'fit' | 'waitlist' | 'notyet'; tier: Tier; why: string } {
  if (a.need === 'In-person team practice' || a.need === 'Full game-film breakdown') return { fit: 'notyet', tier: 'Foundation', why: `We don’t offer ${a.need.toLowerCase()}. Better to say so now than take your money.` };
  if (a.age === 'Under 10' || a.days === '0–1 days') return { fit: 'notyet', tier: 'Foundation', why: 'The loop works when a player can rep alone 2+ days a week, from about age 10.' };
  if (a.want === 'Mostly mine (parent)') return { fit: 'fit', tier: 'Foundation', why: 'Start light. Foundation lets your player try the loop without a big commitment.' };
  const tier: Tier = a.need === 'Weekly live coaching' ? 'Inner Circle' : a.need === 'Plan + regular feedback' || a.days === '5+ days' ? 'Development' : 'Foundation';
  return { fit: 'fit', tier, why: `${a.days} a week and wanting ${a.need?.toLowerCase()} → ${tier} is the right starting plan.` };
}
const AGE: Record<string, number> = { 'Under 10': 9, '10–12': 11, '13–14': 13, '15–16': 15, '17+': 17 };

export interface Result { snapshot: Snapshot; events: DomainEvent[]; created?: { inviteToken?: string; inviteCode?: string; userId?: string; playerId?: string } }

/** Pure command handler. Checks permissions, guards transitions, emits events + notifications + outbox mail. */
export function dispatch(input: Snapshot, cmd: Command, actor: Actor): Result {
  assertCan(input, actor, cmd);
  const s: Snapshot = structuredClone(input); const t = clock(s); const at = t.toISOString(); const events: DomainEvent[] = []; const created: Result['created'] = {};
  const log = (type: string, detail: string, playerId?: string | null, from?: string, to?: string) => events.push({ id: id('ev'), at, role: actor.role, actorId: actor.id, playerId, type, from, to, detail });
  const P = (pid: string) => { const p = s.players.find((x) => x.id === pid); if (!p) throw new WorkflowError('Unknown player'); return p; };
  const move = (p: Player, to: LifecycleState, why: string) => { const from = p.state; p.state = to; p.stateSince = at; log('transition', why, p.id, from, to); };
  const guard = (p: Player) => { if (!canTransition(p.state, cmd.type)) throw new WorkflowError(`“${cmd.type}” is not allowed while ${p.name} is “${p.state}”.`); };
  const notify = (userIds: (string | undefined | null)[], type: NotificationType, text: string, link: string, playerId?: string, dedupe?: string) => {
    for (const u of new Set(userIds.filter(Boolean) as string[])) { const key = `${u}:${dedupe ?? id('n')}`; if (s.notifications.some((n) => n.dedupe === key)) continue; s.notifications.push({ id: id('nt'), userId: u, type, text, link, playerId, at, dedupe: key }); }
  };
  const famUsers = (p: Player) => s.users.filter((u) => (u.role === 'parent' && u.familyId === p.familyId) || (u.role === 'player' && u.playerId === p.id)).map((u) => u.id);
  const ops = () => s.users.filter((u) => u.role === 'ops' && u.active).map((u) => u.id); const head = () => headCoach(s)?.id;
  const mail = (to: string, subject: string, body: string, kind: string) => s.outbox.push({ id: id('em'), to, subject, body, at, status: 'queued', kind });
  const milestone = (p: Player, key: string) => { if (!s.milestones.some((m) => m.playerId === p.id && m.key === key)) { s.milestones.push({ id: id('ms'), playerId: p.id, key, at }); log('milestone', key, p.id); } };
  const levelCheck = (p: Player, before: number) => { const after = progress(s, p.id).level; if (after > before) milestone(p, `Level ${after}`); };
  const applyReview = (p: Player, decision: 'approve' | 'retry', feedback: string) => {
    const sub = lastSubmission(s, p.id); const a = s.assignments.find((x) => x.id === sub?.assignmentId)!; const b = progress(s, p.id).level;
    if (decision === 'approve') { a.status = 'approved'; move(p, 'Next step ready', `Approved: ${a.title}`); if (s.reviews.filter((r) => r.playerId === p.id && r.decision === 'approve' && r.status === 'final').length === 1) milestone(p, 'First approval'); }
    else { a.status = 'retry'; s.assignments.push({ ...a, id: id('as'), order: a.order + 0.5, status: 'open' }); move(p, 'Work ready', `Another attempt: ${a.title}`); milestone(p, 'Honest retry'); }
    notify(famUsers(p), 'feedback_ready', `Feedback on ${a.title}: “${feedback.slice(0, 60)}”`, '/app', p.id); levelCheck(p, b);
  };
  const runSweep = () => {
    const n = clock(s).getTime(); const soon = s.settings.dueSoonHours * 36e5;
    for (const p of s.players) {
      const sub = lastSubmission(s, p.id);
      if (p.state === 'Submitted' && sub && n - new Date(sub.at).getTime() >= 24 * 36e5) move(p, 'Feedback due', 'Cron: 24 h without a reply');
      if (sub && ['Submitted', 'Feedback due', 'Sign-off'].includes(p.state)) {
        const due = new Date(sub.dueBy).getTime(); const owner = p.state === 'Sign-off' ? head() : p.coachId;
        if (due < n) notify([owner, head()], 'overdue', `OVERDUE: ${p.name}’s review was due ${shortWhen(sub.dueBy)}.`, `/coach/review/${p.id}`, p.id, `overdue:${sub.id}`);
        else if (due - n < soon) notify([owner], 'reply_due_soon', `Reply due soon: ${p.name} by ${shortWhen(sub.dueBy)}.`, `/coach/review/${p.id}`, p.id, `soon:${sub.id}`);
      }
      for (const m of s.messages.filter((x) => x.playerId === p.id && !x.answered && x.dueBy)) { const due = new Date(m.dueBy!).getTime(); if (due < n) notify([p.coachId], 'overdue', `OVERDUE: reply to ${p.name}’s family.`, `/coach/player/${p.id}?tab=messages`, p.id, `overdue:${m.id}`); else if (due - n < soon) notify([p.coachId], 'reply_due_soon', `Message reply due soon: ${p.name}.`, `/coach/player/${p.id}?tab=messages`, p.id, `soon:${m.id}`); }
    }
    for (const inv of s.invites.filter((i) => i.status === 'pending' && new Date(i.expiresAt).getTime() < n)) { inv.status = 'expired'; log('invite', `Invite expired (${inv.email})`, inv.playerId); notify(ops(), 'invite_expired', `Invite expired for ${userNameOfPlayer(inv.playerId)}.`, `/ops/player/${inv.playerId}`, inv.playerId, `expired:${inv.id}`); }
  };
  const userNameOfPlayer = (pid: string) => s.players.find((p) => p.id === pid)?.name ?? 'player';

  switch (cmd.type) {
    case 'submitApplication': {
      const r = suggestTier(cmd.answers); const fam = { id: id('fam'), parentName: cmd.parentName || 'Parent', email: (cmd.email || '').trim().toLowerCase() };
      const p: Player = { id: id('pl'), familyId: fam.id, name: cmd.playerName || 'New Player', age: AGE[cmd.answers.age] ?? 13, position: '', tier: r.tier, state: 'Applied', stateSince: at, goal: cmd.answers.goal ?? '', learnStyle: '', rhythm: cmd.answers.days ?? '', canvas: '', rubric: {}, nextSession: isoDay(addBusinessDays(t, 5)), coachId: head() ?? '', billing: 'unpaid' };
      s.families.push(fam); s.players.push(p); s.applications.push({ id: id('app'), at, playerId: p.id, answers: cmd.answers, tier: r.tier, fit: r.fit, next: cmd.next });
      log('application', `${p.name} applied (${r.fit}, suggested ${r.tier}, wants ${cmd.next})`, p.id, undefined, 'Applied');
      notify(ops(), 'new_application', `New application: ${p.name} (${r.tier}${cmd.next === 'call' ? ', wants a call' : ''}).`, `/ops/player/${p.id}`, p.id);
      if (fam.email) mail(fam.email, 'We got your application', `Hi ${fam.parentName}, thanks for applying for ${p.name}. A person reads every application and replies within 2 business days.`, 'application');
      created.playerId = p.id; break;
    }
    case 'startFitReview': { const p = P(cmd.playerId); guard(p); move(p, 'Fit review', 'Ops opened the application'); break; }
    case 'scheduleFitCall': { const p = P(cmd.playerId); s.meetings.push({ id: id('mt'), playerId: p.id, staffId: actor.id, at: cmd.at, minutes: 15, kind: 'fit-call', note: 'Intro / fit call', status: 'scheduled' }); log('schedule', `Fit call booked for ${shortWhen(cmd.at)}`, p.id); if (family(p).email) mail(family(p).email, 'Your intro call', `Your 15-minute call is booked for ${shortWhen(cmd.at)}.`, 'fit-call'); break; }
    case 'decideFit': { const p = P(cmd.playerId); guard(p); if (cmd.accept) return dispatch(input, { type: 'createInvite', playerId: p.id }, actor); move(p, 'Waitlist', 'Waitlisted by ops'); break; }
    case 'createInvite': {
      const p = P(cmd.playerId); guard(p); const c = capacity(s); const fam = family(p); const email = (cmd.email || fam.email || '').trim().toLowerCase();
      if (!email) throw new WorkflowError('An invite needs the parent’s email.');
      if (p.state !== 'Invited' && (c.open <= 0 || (p.tier === 'Inner Circle' && c.inner >= c.innerMax))) { move(p, 'Waitlist', c.open <= 0 ? `Roster full (${c.used}/${c.max})` : `Inner Circle full (${c.inner}/${c.innerMax})`); break; }
      s.invites.filter((i) => i.playerId === p.id && i.status === 'pending').forEach((i) => (i.status = 'revoked'));
      const token = randomToken(); const code = code6(); const expiresAt = new Date(t.getTime() + s.settings.inviteDays * 864e5).toISOString();
      s.invites.push({ id: id('inv'), playerId: p.id, email, token, code, sentAt: at, expiresAt, createdBy: actor.id, status: 'pending' });
      fam.email = email; created.inviteToken = token; created.inviteCode = code;
      mail(email, `${p.name} has a spot at ${s.settings.programName}`, `Hi ${fam.parentName},\n\n${p.name} has a spot on the ${p.tier} plan.\nAccept: /invite?token=${token}\nOr enter code ${code} at /invite.\nThis link expires ${shortWhen(expiresAt)}.`, 'invite');
      if (p.state === 'Invited') log('invite', `Invite re-sent to ${email}`, p.id); else move(p, 'Invited', `Invite sent to ${email} (${c.used + 1}/${c.max} spots)`); break;
    }
    case 'revokeInvite': { s.invites.filter((i) => i.playerId === cmd.playerId && i.status === 'pending').forEach((i) => (i.status = 'revoked')); log('invite', 'Invite revoked', cmd.playerId); break; }
    case 'acceptInvite': {
      const inv = s.invites.find((i) => i.status === 'pending' && ((cmd.token && i.token === cmd.token) || (cmd.code && i.code === cmd.code.trim())));
      if (!inv) { const old = s.invites.find((i) => (cmd.token && i.token === cmd.token) || (cmd.code && i.code === cmd.code?.trim())); throw new WorkflowError(old?.status === 'expired' || (old && new Date(old.expiresAt) < t) ? 'This invite has expired. Ask us to resend it.' : 'That invite link or code isn’t valid.'); }
      if (new Date(inv.expiresAt) < t) { inv.status = 'expired'; throw new WorkflowError('This invite has expired. Ask us to resend it.'); }
      const p = P(inv.playerId); guard(p); const fam = family(p);
      let user = s.users.find((u) => u.role === 'parent' && u.familyId === p.familyId);
      if (!user) { user = { id: cmd.userId ?? id('usr'), name: cmd.parentName || fam.parentName, email: (cmd.email || inv.email).toLowerCase(), role: 'parent', familyId: p.familyId, active: true }; s.users.push(user); }
      if (cmd.parentName) fam.parentName = cmd.parentName;
      inv.status = 'accepted'; inv.acceptedAt = at; inv.acceptedBy = user.id; created.userId = user.id; created.playerId = p.id;
      move(p, 'Onboarding', `${fam.parentName} accepted the invite`);
      notify([p.coachId, ...ops()], 'invite_accepted', `${fam.parentName} accepted ${p.name}’s invite.`, `/coach/player/${p.id}`, p.id); break;
    }
    case 'recordConsent': {
      const p = P(cmd.playerId); if (!cmd.agreed || cmd.guardianName.trim().length < 3) throw new WorkflowError('Consent needs the guardian’s full name and a checked box.');
      s.consents.push({ id: id('cs'), playerId: p.id, guardianName: cmd.guardianName.trim(), userId: actor.id, version: CONSENT_VERSION, text: CONSENT_TEXT, at }); log('consent', `Parental consent recorded by ${cmd.guardianName.trim()} (v${CONSENT_VERSION})`, p.id); break;
    }
    case 'completeOnboarding': {
      const p = P(cmd.playerId); guard(p); if (!cmd.goal.trim() || !cmd.rhythm.trim()) throw new WorkflowError('Goal and weekly rhythm are required.');
      if (!s.consents.some((c) => c.playerId === p.id)) throw new WorkflowError('Parental consent is required before coaching starts.');
      Object.assign(p, { position: cmd.position, goal: cmd.goal.trim(), learnStyle: cmd.learnStyle, rhythm: cmd.rhythm, rubric: { 'Ball security': 1, Finishing: 1, Defense: 1, 'Shot form': 1, Confidence: 1 } });
      const b = progress(s, p.id).level; move(p, 'Plan building', 'Onboarding complete: coach owes first plan'); levelCheck(p, b);
      s.messages.push({ id: id('msg'), playerId: p.id, from: 'coach', authorId: p.coachId, text: `Welcome, ${first(p.name)}! I read your goal: “${p.goal}”. Your first plan lands by ${addBusinessDays(t, 2).toLocaleDateString('en-US', { weekday: 'long' })}.`, at, answered: true, readBy: {} });
      notify([p.coachId], 'invite_accepted', `${p.name} finished onboarding. Plan due in 2 business days.`, `/coach/plan/${p.id}`, p.id); break;
    }
    case 'setPlayerLogin': {
      const p = P(cmd.playerId); const uname = cmd.username.trim().toLowerCase(); if (!/^[a-z0-9.\-_]{3,30}$/.test(uname)) throw new WorkflowError('Username: 3–30 letters, numbers, dots or dashes.');
      if (s.users.some((u) => u.username === uname && u.playerId !== p.id)) throw new WorkflowError('That username is taken.');
      let u = s.users.find((x) => x.role === 'player' && x.playerId === p.id);
      if (!u) { u = { id: cmd.userId ?? id('usr'), name: p.name, role: 'player', username: uname, playerId: p.id, familyId: p.familyId, active: true }; s.users.push(u); } else u.username = uname;
      created.userId = u.id; log('account', `Player login set (${uname})`, p.id); break;
    }
    case 'assignCoach': {
      const p = P(cmd.playerId); const c = s.users.find((u) => u.id === cmd.coachId && (u.role === 'head' || u.role === 'assistant')); if (!c) throw new WorkflowError('Pick a head or assistant coach.');
      const from = p.coachId; p.coachId = c.id; log('handoff', `Reassigned ${userName(s, from)} → ${c.name}`, p.id);
      notify([c.id], 'new_submission', `${p.name} is now assigned to you (${p.state}).`, `/coach/player/${p.id}`, p.id); break;
    }
    case 'setBilling': { const p = P(cmd.playerId); const was = p.billing; p.billing = cmd.billing; log('billing', `Billing ${was} → ${cmd.billing}`, p.id); break; }
    case 'publishPlan': {
      const p = P(cmd.playerId); guard(p); if (!cmd.focus.trim()) throw new WorkflowError('A plan needs one focus.'); if (!cmd.drillIds.length) throw new WorkflowError('Assign at least one rep.');
      const prev = playerCycle(s, p.id); if (prev) prev.status = 'closed';
      const cyc = { id: id('cyc'), playerId: p.id, index: (prev?.index ?? 0) + 1, focus: cmd.focus.trim(), startAt: at, endAt: new Date(t.getTime() + 21 * 864e5).toISOString(), status: 'active' as const, templateId: cmd.templateId ?? null };
      s.cycles.push(cyc);
      cmd.drillIds.forEach((did, i) => { const d = s.drills.find((x) => x.id === did); if (!d) throw new WorkflowError('Unknown drill'); s.assignments.push({ id: id('as'), cycleId: cyc.id, playerId: p.id, drillId: d.id, order: 100 * cyc.index + i, title: d.title, reps: d.reps, minutes: d.minutes, cues: d.cues, status: 'queued' }); });
      move(p, 'Plan set', `Cycle ${cyc.index}: “${cyc.focus}” with ${cmd.drillIds.length} rep(s)`);
      notify(famUsers(p), 'plan_published', `New plan: ${cyc.focus}. Open Today to unlock rep 1.`, '/app', p.id); break;
    }
    case 'openPlan': { const p = P(cmd.playerId); guard(p); const q = playerAssignments(s, p.id).find((a) => a.status === 'queued'); if (!q) throw new WorkflowError('No reps in this plan.'); q.status = 'open'; move(p, 'Work ready', `Unlocked: ${q.title}`); break; }
    case 'submitRep': {
      const p = P(cmd.playerId); guard(p); const a = openAssignment(s, p.id); if (!a) throw new WorkflowError('Nothing open to submit.');
      if (cmd.repsDone < 1 || cmd.repsDone > a.reps) throw new WorkflowError('Tap at least one finished set.'); if (cmd.reflection.trim().length < 5) throw new WorkflowError('Add one honest sentence.');
      if (!isUrl(cmd.linkUrl)) throw new WorkflowError('Links must start with http:// or https://');
      const b = progress(s, p.id).level; a.status = 'submitted'; const dueBy = replyDue(s, p, t).toISOString();
      s.submissions.push({ id: id('sub'), assignmentId: a.id, playerId: p.id, repsDone: cmd.repsDone, reflection: cmd.reflection.trim(), linkUrl: cmd.linkUrl?.trim() || null, at, dueBy });
      move(p, 'Submitted', `${a.title}: ${cmd.repsDone}/${a.reps} sets · reply due ${shortWhen(dueBy)}`);
      notify([p.coachId], 'new_submission', `${p.name} submitted ${a.title}. Reply by ${shortWhen(dueBy)}.`, `/coach/review/${p.id}`, p.id);
      milestone(p, 'First check-in'); levelCheck(p, b); break;
    }
    case 'review': {
      const p = P(cmd.playerId); guard(p); const sub = lastSubmission(s, p.id); if (!sub) throw new WorkflowError('No submission to review.'); if (cmd.feedback.trim().length < 5) throw new WorkflowError('Feedback needs one observation and one cue.');
      const needsSignoff = actor.role === 'assistant' && s.settings.requireSignoff;
      s.reviews.push({ id: id('rev'), submissionId: sub.id, playerId: p.id, decision: cmd.decision, feedback: cmd.feedback.trim(), at, reviewerId: actor.id, status: needsSignoff ? 'pending_signoff' : 'final' });
      if (needsSignoff) { move(p, 'Sign-off', `${userName(s, actor.id)} reviewed (${cmd.decision}); awaiting head-coach sign-off`); notify([head()], 'signoff_needed', `Sign-off needed: ${userName(s, actor.id)} reviewed ${p.name}.`, `/coach/review/${p.id}`, p.id); }
      else applyReview(p, cmd.decision, cmd.feedback.trim()); break;
    }
    case 'signOff': {
      const p = P(cmd.playerId); guard(p); const r = pendingReview(s, p.id); if (!r) throw new WorkflowError('No review waiting for sign-off.');
      r.signedOffBy = actor.id; r.signedOffAt = at; r.status = 'final'; if (cmd.feedback?.trim()) r.feedback = cmd.feedback.trim(); if (!cmd.approve) r.decision = r.decision === 'approve' ? 'retry' : 'approve';
      log('signoff', `Head coach signed off ${userName(s, r.reviewerId)}’s review${cmd.approve ? '' : ' (decision changed)'}${cmd.feedback?.trim() ? ' with edits' : ''}`, p.id);
      applyReview(p, r.decision, r.feedback); notify([r.reviewerId], 'feedback_ready', `Your review of ${p.name} was signed off.`, `/coach/player/${p.id}`, p.id); break;
    }
    case 'startNext': {
      const p = P(cmd.playerId); guard(p); const q = playerAssignments(s, p.id).find((a) => a.status === 'queued');
      if (q) { q.status = 'open'; move(p, 'Work ready', `Unlocked: ${q.title}`); }
      else { const c = playerCycle(s, p.id); const b = progress(s, p.id).level; if (c) c.status = 'review'; move(p, 'Cycle review', `Cycle ${c?.index} complete`); milestone(p, `Cycle ${c?.index} complete`); levelCheck(p, b); notify([p.coachId], 'cycle_review', `${p.name} finished cycle ${c?.index}. Plan the next one.`, `/coach/plan/${p.id}`, p.id); }
      break;
    }
    case 'pause': { const p = P(cmd.playerId); guard(p); p.pausedFrom = p.state; move(p, 'Paused', 'Paused'); break; }
    case 'resume': { const p = P(cmd.playerId); guard(p); const to = p.pausedFrom ?? 'Plan building'; p.pausedFrom = null; move(p, to, 'Resumed'); break; }
    case 'sendMessage': {
      const p = P(cmd.playerId); if (!cmd.text.trim()) throw new WorkflowError('Empty message.'); if (!isUrl(cmd.linkUrl)) throw new WorkflowError('Links must start with http:// or https://');
      const from = actor.role === 'parent' ? 'parent' : actor.role === 'player' ? 'player' : 'coach';
      if (from === 'coach') s.messages.forEach((m) => { if (m.playerId === p.id && m.from !== 'coach') m.answered = true; });
      s.messages.push({ id: id('msg'), playerId: p.id, from, authorId: actor.id, text: cmd.text.trim(), linkUrl: cmd.linkUrl?.trim() || null, at, dueBy: from === 'coach' ? null : replyDue(s, p, t).toISOString(), answered: from === 'coach', readBy: { [actor.id]: at } });
      log('message', `${from} → ${from === 'coach' ? 'family' : 'coach'}: “${cmd.text.trim().slice(0, 50)}”`, p.id);
      notify(from === 'coach' ? famUsers(p) : [p.coachId], 'new_message', `${userName(s, actor.id)}: “${cmd.text.trim().slice(0, 60)}”`, from === 'coach' ? '/app/messages' : `/coach/player/${p.id}?tab=messages`, p.id); break;
    }
    case 'markRead': { s.messages.forEach((m) => { if (m.playerId === cmd.playerId && m.authorId !== actor.id && !m.readBy[actor.id]) m.readBy = { ...m.readBy, [actor.id]: at }; }); break; }
    case 'toggleHabit': {
      const p = P(cmd.playerId); const d = isoDay(t); const ex = s.habits.find((h) => h.playerId === p.id && h.date === d && h.key === cmd.key);
      const b = progress(s, p.id).level; const before = progress(s, p.id).streak;
      s.habits = ex ? s.habits.filter((h) => h !== ex) : [...s.habits, { id: id('hab'), playerId: p.id, date: d, key: cmd.key }];
      const st = progress(s, p.id).streak; if (st > before) log('habit', `Streak ${st} days`, p.id); for (const k of [3, 7, 14]) if (st >= k) milestone(p, `${k}-day streak`); levelCheck(p, b); break;
    }
    case 'updateCanvas': { P(cmd.playerId).canvas = cmd.canvas; break; }
    case 'rateSkill': { const p = P(cmd.playerId); p.rubric = { ...p.rubric, [cmd.skill]: Math.max(1, Math.min(5, cmd.value)) }; log('rubric', `${cmd.skill} → ${cmd.value}/5`, p.id); break; }
    case 'approveDigest': {
      const p = P(cmd.playerId); const wk = weekKey(t); const ex = s.digests.find((d) => d.playerId === p.id && d.week === wk);
      if (ex) Object.assign(ex, { text: cmd.text, status: 'approved', approvedAt: at, approvedBy: actor.id }); else s.digests.push({ id: id('dg'), playerId: p.id, week: wk, text: cmd.text, status: 'approved', approvedAt: at, approvedBy: actor.id });
      log('digest', 'Weekly digest approved for parent', p.id); const fam = family(p); if (fam.email) mail(fam.email, `${first(p.name)}’s week`, cmd.text, 'digest'); break;
    }
    case 'saveDrill': {
      const d = cmd.drill; if (!d.title.trim() || d.reps < 1 || d.minutes < 1) throw new WorkflowError('A drill needs a title, sets and minutes.');
      const cues = d.cues.map((c) => c.trim()).filter(Boolean); const ex = d.id ? s.drills.find((x) => x.id === d.id) : undefined;
      if (ex) Object.assign(ex, { title: d.title.trim(), reps: d.reps, minutes: d.minutes, cues, tags: d.tags }); else s.drills.push({ id: id('dr'), title: d.title.trim(), reps: d.reps, minutes: d.minutes, cues, tags: d.tags, createdBy: actor.id, archived: false });
      log('library', `${ex ? 'Edited' : 'Created'} drill “${d.title.trim()}”`); break;
    }
    case 'archiveDrill': { const d = s.drills.find((x) => x.id === cmd.drillId); if (d) { d.archived = !d.archived; log('library', `${d.archived ? 'Archived' : 'Restored'} “${d.title}”`); } break; }
    case 'saveTemplate': {
      const tp = cmd.template; if (!tp.name.trim() || !tp.drillIds.length) throw new WorkflowError('A template needs a name and at least one drill.');
      const ex = tp.id ? s.templates.find((x) => x.id === tp.id) : undefined; if (ex) Object.assign(ex, { name: tp.name.trim(), focus: tp.focus, drillIds: tp.drillIds }); else s.templates.push({ id: id('tp'), name: tp.name.trim(), focus: tp.focus, drillIds: tp.drillIds, createdBy: actor.id });
      log('library', `Saved template “${tp.name.trim()}”`); break;
    }
    case 'scheduleSession': {
      if (Number.isNaN(new Date(cmd.at).getTime())) throw new WorkflowError('Pick a date and time.');
      const staffId = cmd.staffId ?? (cmd.playerId ? (['head', 'assistant'].includes(actor.role) ? actor.id : P(cmd.playerId).coachId) : actor.id);
      s.meetings.push({ id: id('mt'), playerId: cmd.playerId ?? null, staffId, at: new Date(cmd.at).toISOString(), minutes: cmd.minutes, kind: cmd.kind, note: cmd.note, status: 'scheduled' });
      if (cmd.playerId) { const p = P(cmd.playerId); p.nextSession = isoDay(new Date(cmd.at)); notify(famUsers(p), 'plan_published', `${cmd.kind === 'live' ? 'Live session' : 'Check-in'} scheduled ${shortWhen(cmd.at)}.`, '/app', p.id); }
      log('schedule', `${cmd.kind} scheduled ${shortWhen(cmd.at)}`, cmd.playerId); break;
    }
    case 'cancelSession': { const m = s.meetings.find((x) => x.id === cmd.meetingId); if (m) { m.status = 'cancelled'; log('schedule', `${m.kind} on ${shortWhen(m.at)} cancelled`, m.playerId); } break; }
    case 'updateSettings': {
      const n = { ...s.settings, ...cmd.patch, sla: { ...s.settings.sla, ...(cmd.patch.sla ?? {}) } };
      if (n.capacity < 1 || n.innerCircleCap < 0 || n.innerCircleCap > n.capacity) throw new WorkflowError('Caps must be positive and Inner Circle ≤ roster.');
      if (Object.values(n.sla).some((x) => x < 0 || x > 5)) throw new WorkflowError('Reply windows are 0–5 business days.');
      s.settings = n; log('settings', `Settings updated: ${Object.keys(cmd.patch).join(', ')}`); break;
    }
    case 'inviteStaff': {
      const email = cmd.email.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) throw new WorkflowError('Enter a valid email.'); if (s.users.some((u) => u.email === email)) throw new WorkflowError('That email already has an account.');
      const u = { id: cmd.userId ?? id('usr'), name: cmd.name.trim(), email, role: cmd.role, active: true }; s.users.push(u); created.userId = u.id;
      mail(email, `You’ve been added to ${s.settings.programName}`, `Hi ${u.name}, you were added as ${cmd.role}. Set your password from the sign-in page with “Forgot / first time”.`, 'staff'); log('account', `Staff added: ${u.name} (${cmd.role})`); break;
    }
    case 'markNotificationsRead': { s.notifications.forEach((n) => { if (n.userId === actor.id && !n.readAt && (!cmd.ids || cmd.ids.includes(n.id))) n.readAt = at; }); break; }
    case 'requestData': {
      const p = P(cmd.playerId); if (s.dataRequests.some((r) => r.playerId === p.id && r.kind === cmd.kind && r.status === 'open')) throw new WorkflowError('That request is already open.');
      s.dataRequests.push({ id: id('dr'), playerId: p.id, familyId: p.familyId, kind: cmd.kind, requestedBy: actor.id, at, status: 'open' }); log('privacy', `${cmd.kind === 'delete' ? 'Deletion' : 'Export'} requested`, p.id); break;
    }
    case 'completeDataRequest': {
      const r = s.dataRequests.find((x) => x.id === cmd.requestId); if (!r || r.status !== 'open') throw new WorkflowError('Request not found.'); r.status = 'done'; r.doneAt = at;
      if (r.kind === 'delete') {
        const pid = r.playerId; const keep = <T extends { playerId?: string | null }>(xs: T[]) => xs.filter((x) => x.playerId !== pid);
        Object.assign(s, { players: s.players.filter((p) => p.id !== pid), applications: keep(s.applications), invites: keep(s.invites), consents: keep(s.consents), cycles: keep(s.cycles), assignments: keep(s.assignments), submissions: keep(s.submissions), reviews: keep(s.reviews), messages: keep(s.messages), habits: keep(s.habits), milestones: keep(s.milestones), digests: keep(s.digests), meetings: keep(s.meetings), notifications: keep(s.notifications) });
        s.users = s.users.map((u) => (u.playerId === pid ? { ...u, active: false, name: 'Deleted player', username: null, playerId: null } : u));
        s.events = s.events.map((e) => (e.playerId === pid ? { ...e, detail: '[deleted]' } : e)); log('privacy', 'Player data deleted on request', pid);
      } else log('privacy', 'Export delivered', r.playerId); break;
    }
    case 'sweep': { runSweep(); break; }
    case 'generateDigests': {
      const wk = weekKey(t); const cut = t.getTime() - 7 * 864e5; let n = 0;
      for (const p of s.players.filter((x) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(x.state))) {
        if (s.digests.some((d) => d.playerId === p.id && d.week === wk)) continue;
        const done = s.submissions.filter((x) => x.playerId === p.id && new Date(x.at).getTime() > cut).length; const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final').sort((a, b) => b.at.localeCompare(a.at))[0]; const pr = progress(s, p.id);
        s.digests.push({ id: id('dg'), playerId: p.id, week: wk, status: 'draft', text: `${first(p.name)} logged ${done} check-in${done === 1 ? '' : 's'} this week, is on a ${pr.streak}-day habit streak, and is at Level ${pr.level} (${pr.name}). Focus: ${playerCycle(s, p.id)?.focus ?? 'first plan coming'}. Status: ${p.state}.${r ? ` Coach note: ${r.feedback}` : ''}` }); n++;
        notify([p.coachId], 'digest_ready', `Weekly digest draft ready for ${p.name}.`, '/coach/digest', p.id, `digest:${p.id}:${wk}`);
      }
      log('digest', `Generated ${n} digest draft(s)`); break;
    }
    case 'advanceClock': { s.clockOffsetMs += cmd.hours * 36e5; log('clock', `Demo clock +${cmd.hours}h`); runSweep(); break; }
  }
  s.version++; s.events = [...s.events, ...events];
  return { snapshot: s, events, created };
  function family(p: Player) { return s.families.find((f) => f.id === p.familyId)!; }
}
export const allStaff = staff;
