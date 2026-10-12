import { CONSENT_TEXT, CONSENT_VERSION, DEFAULT_PREFS, TIER_INFO, replyLabel, type Command, type Notification, type Subscription, type DomainEvent, type LifecycleState, type MessageContext, type NotificationType, type Player, type Snapshot, type Tier } from './domain';
import { composeFeedback, plainFeedback, rhythmToday } from './personal';
import { promiseRisks, reviewsAllowed, reviewedThisWeek } from './promises';
import { sha256 } from './sha256';
import { CLIP_RETENTION_DAYS, clipError, clipExpired, fmtT } from './clips';
import { assertCan, type Actor } from './permissions';
import { CATEGORY, quietUntil, render, wants, type EmailData, type EmailKind } from './emails';
import { PRICE_CENTS, graceEnds, isPaid, subscriptionOf } from './billing';
import { addBusinessDays, isoDay, officeDue, shortWhen, weekKey } from './time';
import { lastReview, canTransition, capacity, clock, first, headCoach, lastSubmission, openAssignment, pendingReview, playerAssignments, playerCycle, progress, replyDue, staff, userName } from './workflow';

export class WorkflowError extends Error {}
/** Optimistic concurrency: someone else changed this player since you loaded it. Mapped to HTTP 409. */
export class ConflictError extends WorkflowError {}
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

export interface Result { snapshot: Snapshot; events: DomainEvent[]; created?: { inviteToken?: string; inviteCode?: string; userId?: string; playerId?: string; duplicate?: boolean } }

/** Pure command handler. Checks permissions, guards transitions, emits events + notifications + outbox mail. */
export function dispatch(input: Snapshot, cmd: Command, actor: Actor): Result {
  assertCan(input, actor, cmd);
  const s: Snapshot = structuredClone(input); const t = clock(s); const at = t.toISOString(); const events: DomainEvent[] = []; const created: Result['created'] = {};
  const log = (type: string, detail: string, playerId?: string | null, from?: string, to?: string) => events.push({ id: id('ev'), at, role: actor.role, actorId: actor.id, playerId, type, from, to, detail });
  const P = (pid: string) => { const p = s.players.find((x) => x.id === pid); if (!p) throw new WorkflowError('Unknown player'); return p; };
  const move = (p: Player, to: LifecycleState, why: string) => { const from = p.state; p.state = to; p.stateSince = at; p.rev = (p.rev ?? 0) + 1; log('transition', why, p.id, from, to); };
  const checkRev = (p: Player, rev?: number) => { if (rev !== undefined && rev !== (p.rev ?? 0)) throw new ConflictError(`${p.name} changed since you opened this (someone else acted). Reload to see the latest.`); };
  const guard = (p: Player) => { if (!canTransition(p.state, cmd.type)) throw new WorkflowError(`“${cmd.type}” is not allowed while ${p.name} is “${p.state}”.`); };
  const notify = (userIds: (string | undefined | null)[], type: NotificationType, text: string, link: string, playerId?: string, dedupe?: string) => {
    const out: Notification[] = [];
    for (const u of new Set(userIds.filter(Boolean) as string[])) { const key = `${u}:${dedupe ?? id('n')}`; if (s.notifications.some((n) => n.dedupe === key)) continue; const nn = { id: id('nt'), userId: u, type, text, link, playerId, at, dedupe: key }; s.notifications.push(nn); out.push(nn); }
    return out;
  };
  const famUsers = (p: Player) => s.users.filter((u) => (u.role === 'parent' && u.familyId === p.familyId) || (u.role === 'player' && u.playerId === p.id)).map((u) => u.id);
  const ops = () => s.users.filter((u) => u.role === 'ops' && u.active).map((u) => u.id); const head = () => headCoach(s)?.id;
  /** v6: templated email (text + HTML). Respects the recipient's preferences (essential mail always goes) and quiet hours (non-essential waits). */
  const sendMail = (kind: EmailKind, to: string | null | undefined, data: EmailData, userId?: string | null) => {
    if (!to) return false; const u = (userId ? s.users.find((x) => x.id === userId) : undefined) ?? s.users.find((x) => x.email === to && x.active); const cat = CATEGORY[kind];
    if (!wants(u?.prefs, cat)) return false; const r = render(kind, { program: s.settings.programName, ...data });
    s.outbox.push({ id: id('em'), to, subject: r.subject, body: r.text, html: r.html, at, status: 'queued', kind, category: cat, userId: u?.id ?? null, attempts: 0, sendAfter: quietUntil(t, u?.prefs, cat, s.settings.timezone), lastError: null }); return true;
  };
  /** Email these users (if they have an address and want this category). Returns who was emailed, so their in-app notification isn't emailed again in the roundup. */
  const emailUsers = (userIds: (string | null | undefined)[], kind: EmailKind, data: EmailData) => { const done: string[] = []; for (const uid of new Set(userIds.filter(Boolean) as string[])) { const u = s.users.find((x) => x.id === uid && x.active); if (u?.email && sendMail(kind, u.email, { name: first(u.name), ...data }, u.id)) done.push(u.id); } return done; };
  const markEmailed = (ns: Notification[], userIds: string[]) => { for (const x of ns) if (userIds.includes(x.userId)) x.emailedAt = at; };
  const milestone = (p: Player, key: string) => { if (!s.milestones.some((m) => m.playerId === p.id && m.key === key)) { s.milestones.push({ id: id('ms'), playerId: p.id, key, at }); log('milestone', key, p.id); } };
  const levelCheck = (p: Player, before: number) => { const after = progress(s, p.id).level; if (after > before) milestone(p, `Level ${after}`); };
  const applyReview = (p: Player, decision: 'approve' | 'retry', feedback: string, reviewerId: string) => {
    const sub = lastSubmission(s, p.id); const a = s.assignments.find((x) => x.id === sub?.assignmentId)!; const b = progress(s, p.id).level;
    if (decision === 'approve') { a.status = 'approved'; move(p, 'Next step ready', `Approved: ${a.title}`); if (s.reviews.filter((r) => r.playerId === p.id && r.decision === 'approve' && r.status === 'final').length === 1) milestone(p, 'First approval'); }
    else { a.status = 'retry'; s.assignments.push({ ...a, id: id('as'), order: a.order + 0.5, status: 'open' }); move(p, 'Work ready', `Another attempt: ${a.title}`); milestone(p, 'Honest retry'); }
    const snippet = feedback.split('\n')[0].replace(/^✓ /, '').slice(0, 60); const ns = notify(famUsers(p), 'feedback_ready', `${userName(s, reviewerId)} on ${a.title}: “${snippet}”`, '/app', p.id);
    markEmailed(ns, emailUsers(ns.map((x) => x.userId), 'feedback-ready', { player: first(p.name), coach: userName(s, reviewerId), rep: a.title, snippet })); levelCheck(p, b);
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
    const wk = weekKey(clock(s)); const r = rhythmToday(clock(s));
    for (const p of s.players.filter((x) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Paused'].includes(x.state))) {
      for (const { promise, risk } of promiseRisks(s, p)) notify([p.coachId], 'promise_risk', `Promise at risk: ${risk.what}.`, `/coach/player/${p.id}`, p.id, `risk:${promise.id}:${p.id}:${wk}`);
      const subs = s.submissions.filter((x) => x.playerId === p.id && weekKey(new Date(x.at)) === wk).length;
      if (r.key === 'plan-drop') { const ns = notify(famUsers(p), 'rhythm', `Plan drop: this week’s reps are on Today.`, '/app', p.id, `rhythm:plan:${p.id}:${wk}`); markEmailed(ns, emailUsers(ns.map((x) => x.userId), 'plan-drop', { playerFirst: first(p.name), focus: playerCycle(s, p.id)?.focus })); }
      if (r.key === 'midweek' && subs === 0) { notify(famUsers(p).filter((u) => s.users.find((x) => x.id === u)?.role === 'player'), 'rhythm', `Mid-week check-in: log one rep tonight.`, '/app', p.id, `rhythm:mid:${p.id}:${wk}`); notify([p.coachId], 'rhythm', `${p.name} has no check-in yet this week.`, `/coach/player/${p.id}`, p.id, `rhythm:midc:${p.id}:${wk}`); }
      if (r.key === 'wrap' && !s.reflections.some((x) => x.playerId === p.id && x.week === wk)) notify(famUsers(p).filter((u) => s.users.find((x) => x.id === u)?.role === 'player'), 'rhythm', `Friday wrap: two lines on your week.`, '/app', p.id, `rhythm:wrap:${p.id}:${wk}`);
    }
    for (const r of s.reviews.filter((x) => x.status === 'final' && !x.reaction && !x.nudgedAt)) {
      const p = s.players.find((x) => x.id === r.playerId); const since = new Date(r.signedOffAt ?? r.at).getTime(); if (!p || p.state === 'Paused' || n - since < 48 * 36e5) continue;
      r.nudgedAt = clock(s).toISOString(); log('feedback', 'Gentle nudge: feedback not confirmed after 48 h', p.id);
      const ns = notify(famUsers(p), 'rhythm', `Quick check: does ${first(userName(s, r.reviewerId))}’s note make sense? Tap “Got it” or ask a question.`, '/app', p.id, `nudge:${r.id}`);
      markEmailed(ns, emailUsers(ns.map((x) => x.userId), 'focus-nudge', { player: first(p.name), coachFirst: first(userName(s, r.reviewerId)) }));
    }
    const expired = s.clips.filter((c) => clipExpired(c, clock(s))); if (expired.length) { s.clips = s.clips.filter((c) => !expired.includes(c)); for (const c of expired) log('clip', `Clip removed after ${CLIP_RETENTION_DAYS} days`, c.playerId); }
    for (const inv of s.invites.filter((i) => i.status === 'pending' && new Date(i.expiresAt).getTime() < n)) {
      inv.status = 'expired'; log('invite', `${inv.kind === 'offer' ? 'Spot offer' : 'Invite'} expired (${inv.email})`, inv.playerId); notify(ops(), 'invite_expired', `${inv.kind === 'offer' ? 'Spot offer' : 'Invite'} expired for ${userNameOfPlayer(inv.playerId)}.`, `/ops/player/${inv.playerId}`, inv.playerId, `expired:${inv.id}`);
      const ip = s.players.find((x) => x.id === inv.playerId); if (inv.kind === 'offer' && ip?.state === 'Invited') move(ip, 'Waitlist', 'Spot offer expired: back on the waitlist; offering the next family');
    }
    // v6 billing: grace → pause; cancel-at-period-end → access ends at period end (also covers a missed Stripe webhook).
    const grace = (s.settings.graceDays ?? 7) * 864e5;
    for (const sub of s.subscriptions ?? []) {
      const p = s.players.find((x) => x.id === sub.playerId); if (!p) continue;
      if (sub.status === 'past_due' && !sub.pausedByBilling && sub.pastDueSince && n - new Date(sub.pastDueSince).getTime() >= grace) billingPause(p, sub, `payment still failing after the ${s.settings.graceDays ?? 7}-day grace`);
      if (sub.status === 'active' && sub.cancelAtPeriodEnd && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() <= n) endAccess(p, sub, 'canceled; access ended at the end of the paid period');
    }
    offerNext();
  };
  /** Pause coaching for billing (progress saved). */
  const billingPause = (p: Player, sub: Subscription, reason: string) => {
    sub.pausedByBilling = true; sub.updatedAt = at; log('billing', `Coaching paused: ${reason}`, p.id);
    if (p.state !== 'Paused' && !['Invited', 'Onboarding', 'Waitlist', 'Applied', 'Fit review'].includes(p.state)) { p.pausedFrom = p.state; move(p, 'Paused', `Billing: ${reason}`); }
    const par = s.users.find((u) => u.role === 'parent' && u.familyId === p.familyId); sendMail('access-ended', par?.email ?? family(p).email, { player: first(p.name), reason }, par?.id);
    notify([...famUsers(p), ...ops()], 'billing', `${p.name}’s coaching is paused: ${reason}.`, '/parent?tab=billing', p.id);
  };
  const billingResume = (p: Player, sub: Subscription, why: string) => {
    if (!sub.pausedByBilling) return; sub.pausedByBilling = false;
    if (p.state === 'Paused') { const to = p.pausedFrom ?? 'Plan building'; p.pausedFrom = null; move(p, to, `Billing: ${why}, coaching resumed`); notify([p.coachId, ...famUsers(p)], 'billing', `${p.name} is back: ${why}.`, `/coach/player/${p.id}`, p.id); }
  };
  /** Access ends (canceled at period end / deleted): the roster spot is freed and the next waitlisted family is offered it. */
  const endAccess = (p: Player, sub: Subscription, reason: string) => { sub.status = 'canceled'; sub.cancelAtPeriodEnd = false; p.billing = 'canceled'; billingPause(p, sub, reason); offerNext(); };
  const issueInvite = (p: Player, to: string, kind: 'invite' | 'offer') => {
    s.invites.filter((i) => i.playerId === p.id && i.status === 'pending').forEach((i) => (i.status = 'revoked'));
    const token = randomToken(); const code = code6(); const hours = kind === 'offer' ? s.settings.offerHours ?? 48 : s.settings.inviteDays * 24; const expiresAt = new Date(t.getTime() + hours * 36e5).toISOString();
    s.invites.push({ id: id('inv'), playerId: p.id, email: to, tokenHash: sha256(token), codeHash: sha256(code), sentAt: at, expiresAt, createdBy: actor.id, status: 'pending', kind });
    family(p).email = to; created.inviteToken = token; created.inviteCode = code;
    sendMail(kind === 'offer' ? 'waitlist-open' : 'invite', to, { player: p.name, tier: p.tier, price: TIER_INFO[p.tier].price, token, code, expires: shortWhen(expiresAt) }); return expiresAt;
  };
  /** A spot is open: offer it to the longest-waiting family (Inner Circle only if that cap has room), time-limited. */
  const offerNext = () => {
    for (let k = 0; k < 20; k++) {
      const c = capacity(s); if (c.open <= 0) return;
      const nx = s.players.filter((x) => x.state === 'Waitlist' && family(x)?.email && (x.tier !== 'Inner Circle' || c.inner < c.innerMax)).sort((a, b) => a.stateSince.localeCompare(b.stateSince))[0]; if (!nx) return;
      const exp = issueInvite(nx, family(nx).email, 'offer'); move(nx, 'Invited', `Spot opened (${c.used + 1}/${c.max}): offer held until ${shortWhen(exp)}`);
      notify(ops(), 'billing', `Spot offered to ${nx.name}’s family (held until ${shortWhen(exp)}).`, `/ops/player/${nx.id}`, nx.id);
    }
  };
  const startNext = (p: Player) => {
      const cy = playerCycle(s, p.id); const ended = !!cy && new Date(cy.endAt) < t; const q = ended ? undefined : playerAssignments(s, p.id).find((a) => a.status === 'queued');
      if (q) { q.status = 'open'; move(p, 'Work ready', `Unlocked: ${q.title}`); }
      else { const c = playerCycle(s, p.id); const b = progress(s, p.id).level; if (c) c.status = 'review'; move(p, 'Cycle review', `Cycle ${c?.index} complete`); milestone(p, `Cycle ${c?.index} complete`); levelCheck(p, b); notify([p.coachId], 'cycle_review', `${p.name} finished cycle ${c?.index}. Do the cycle review.`, `/coach/cycle/${p.id}`, p.id); notify(famUsers(p), 'cycle_review', `Cycle ${c?.index} done! Tell your coach what improved.`, '/app/develop#cycle', p.id); }
  };
  const userNameOfPlayer = (pid: string) => s.players.find((p) => p.id === pid)?.name ?? 'player';

  switch (cmd.type) {
    case 'submitApplication': {
      const r = suggestTier(cmd.answers); const fam = { id: id('fam'), parentName: cmd.parentName || 'Parent', email: (cmd.email || '').trim().toLowerCase() };
      const p: Player = { id: id('pl'), familyId: fam.id, name: cmd.playerName || 'New Player', age: AGE[cmd.answers.age] ?? 13, position: '', tier: r.tier, state: 'Applied', stateSince: at, goal: cmd.answers.goal ?? '', learnStyle: '', rhythm: cmd.answers.days ?? '', canvas: '', rubric: {}, nextSession: isoDay(addBusinessDays(t, 5)), coachId: head() ?? '', billing: 'unpaid', rev: 0, frustration: '', proudOf: '', aboutMe: '' };
      s.families.push(fam); s.players.push(p); s.applications.push({ id: id('app'), at, playerId: p.id, answers: cmd.answers, tier: r.tier, fit: r.fit, next: cmd.next });
      log('application', `${p.name} applied (${r.fit}, suggested ${r.tier}, wants ${cmd.next})`, p.id, undefined, 'Applied');
      notify(ops(), 'new_application', `New application: ${p.name} (${r.tier}${cmd.next === 'call' ? ', wants a call' : ''}).`, `/ops/player/${p.id}`, p.id);
      if (fam.email) sendMail('application', fam.email, { parent: fam.parentName, player: p.name });
      created.playerId = p.id; break;
    }
    case 'startFitReview': { const p = P(cmd.playerId); guard(p); move(p, 'Fit review', 'Ops opened the application'); break; }
    case 'scheduleFitCall': { const p = P(cmd.playerId); s.meetings.push({ id: id('mt'), playerId: p.id, staffId: actor.id, at: cmd.at, minutes: 15, kind: 'fit-call', note: 'Intro / fit call', status: 'scheduled' }); log('schedule', `Fit call booked for ${shortWhen(cmd.at)}`, p.id); sendMail('fit-call', family(p).email, { when: shortWhen(cmd.at) }); break; }
    case 'decideFit': { const p = P(cmd.playerId); guard(p); if (cmd.accept) return dispatch(input, { type: 'createInvite', playerId: p.id }, actor); move(p, 'Waitlist', 'Waitlisted by ops'); break; }
    case 'createInvite': {
      const p = P(cmd.playerId); guard(p); const c = capacity(s); const fam = family(p); const email = (cmd.email || fam.email || '').trim().toLowerCase();
      if (!email) throw new WorkflowError('An invite needs the parent’s email.');
      if (p.state !== 'Invited' && (c.open <= 0 || (p.tier === 'Inner Circle' && c.inner >= c.innerMax))) { move(p, 'Waitlist', c.open <= 0 ? `Roster full (${c.used}/${c.max})` : `Inner Circle full (${c.inner}/${c.innerMax})`); break; }
      issueInvite(p, email, 'invite');
      if (p.state === 'Invited') log('invite', `Invite re-sent to ${email}`, p.id); else move(p, 'Invited', `Invite sent to ${email} (${c.used + 1}/${c.max} spots)`); break;
    }
    case 'revokeInvite': { s.invites.filter((i) => i.playerId === cmd.playerId && i.status === 'pending').forEach((i) => (i.status = 'revoked')); log('invite', 'Invite revoked', cmd.playerId); break; }
    case 'acceptInvite': {
      const th = cmd.token ? sha256(cmd.token) : null; const ch = cmd.code ? sha256(cmd.code.trim()) : null; const hit = (i: { tokenHash: string; codeHash: string }) => (!!th && i.tokenHash === th) || (!!ch && i.codeHash === ch);
      const inv = s.invites.find((i) => i.status === 'pending' && hit(i));
      if (!inv) { const old = s.invites.find(hit); throw new WorkflowError(old?.status === 'expired' || (old && new Date(old.expiresAt) < t) ? 'This invite has expired. Ask us to resend it.' : 'That invite link or code isn’t valid.'); }
      if (new Date(inv.expiresAt) < t) { inv.status = 'expired'; throw new WorkflowError('This invite has expired. Ask us to resend it.'); }
      const p = P(inv.playerId); guard(p); const fam = family(p);
      let user = s.users.find((u) => u.role === 'parent' && u.familyId === p.familyId);
      if (!user) { user = { id: cmd.userId ?? id('usr'), name: cmd.parentName || fam.parentName, email: (cmd.email || inv.email).toLowerCase(), role: 'parent', familyId: p.familyId, active: true }; s.users.push(user); }
      if (cmd.parentName) fam.parentName = cmd.parentName;
      inv.status = 'accepted'; inv.acceptedAt = at; inv.acceptedBy = user.id; created.userId = user.id; created.playerId = p.id;
      move(p, 'Onboarding', `${fam.parentName} accepted the invite`);
      if (!s.consents.some((c) => c.playerId === p.id) || !isPaid(p)) sendMail('consent-request', user.email, { player: first(p.name), playerId: p.id }, user.id);
      notify([p.coachId, ...ops()], 'invite_accepted', `${fam.parentName} accepted ${p.name}’s invite.`, `/coach/player/${p.id}`, p.id); break;
    }
    case 'recordConsent': {
      const p = P(cmd.playerId); if (!cmd.agreed || cmd.guardianName.trim().length < 3) throw new WorkflowError('Consent needs the guardian’s full name and a checked box.');
      s.consents.push({ id: id('cs'), playerId: p.id, guardianName: cmd.guardianName.trim(), userId: actor.id, version: CONSENT_VERSION, text: CONSENT_TEXT, at }); log('consent', `Parental consent recorded by ${cmd.guardianName.trim()} (v${CONSENT_VERSION})`, p.id); break;
    }
    case 'completeOnboarding': {
      const p = P(cmd.playerId); guard(p); if (!cmd.goal.trim() || !cmd.rhythm.trim()) throw new WorkflowError('Goal and weekly rhythm are required.');
      if (s.settings.requirePayment !== false && !isPaid(p)) throw new WorkflowError('Choose the plan and pay first (secure Stripe checkout; cancel anytime).');
      if (!s.consents.some((c) => c.playerId === p.id)) throw new WorkflowError('Parental consent is required before coaching starts.');
      Object.assign(p, { position: cmd.position, goal: cmd.goal.trim(), learnStyle: cmd.learnStyle, rhythm: cmd.rhythm, frustration: (cmd.frustration ?? '').trim(), proudOf: (cmd.proudOf ?? '').trim(), rubric: { 'Ball security': 1, Finishing: 1, Defense: 1, 'Shot form': 1, Confidence: 1 } });
      const b = progress(s, p.id).level; move(p, 'Plan building', 'Onboarding complete: coach owes first plan'); levelCheck(p, b);
      s.messages.push({ id: id('msg'), playerId: p.id, from: 'coach', authorId: p.coachId, context: 'general', text: `Welcome, ${first(p.name)}! I read your goal: “${p.goal}”${p.proudOf ? ` and that you’re proud of ${p.proudOf.replace(/[.!]$/, '')}` : ''}. Your first plan lands by ${addBusinessDays(t, 2).toLocaleDateString('en-US', { weekday: 'long' })}.`, at, answered: true, readBy: {} });
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
      const p = P(cmd.playerId); guard(p); checkRev(p, cmd.rev); if (!cmd.focus.trim()) throw new WorkflowError('A plan needs one focus.');
      if (p.state === 'Cycle review' && !s.cycleReviews.some((r) => r.cycleId === playerCycle(s, p.id)?.id && r.coachAt)) throw new WorkflowError('Finish the cycle review (new ratings + next focus) before the next plan.'); if (!cmd.drillIds.length) throw new WorkflowError('Assign at least one rep.');
      const prev = playerCycle(s, p.id); if (prev) prev.status = 'closed';
      const cyc = { id: id('cyc'), playerId: p.id, index: (prev?.index ?? 0) + 1, focus: cmd.focus.trim(), startAt: at, endAt: new Date(t.getTime() + (s.settings.cycleWeeks ?? 4) * 7 * 864e5).toISOString(), status: 'active' as const, templateId: cmd.templateId ?? null, adjustedAt: null };
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
      const clip = cmd.clipId ? s.clips.find((c) => c.id === cmd.clipId && c.playerId === p.id && !c.deletedAt) : undefined; if (cmd.clipId && !clip) throw new WorkflowError('That clip isn’t available. Upload it again.'); if (clip?.submissionId) throw new WorkflowError('That clip is already attached to another check-in.');
      const b = progress(s, p.id).level; const dueBy = replyDue(s, p, t).toISOString(); const allowed = reviewsAllowed(s, p); const reviewed = reviewedThisWeek(s, p) < allowed;
      s.submissions.push({ id: id('sub'), assignmentId: a.id, playerId: p.id, repsDone: cmd.repsDone, reflection: cmd.reflection.trim(), linkUrl: cmd.linkUrl?.trim() || null, clipId: clip?.id ?? null, at, dueBy, reviewed });
      if (clip) { clip.submissionId = s.submissions[s.submissions.length - 1].id; clip.assignmentId = a.id; if (cmd.watchFor !== undefined) clip.watchFor = cmd.watchFor.trim().slice(0, 200); }
      if (reviewed) {
        a.status = 'submitted'; move(p, 'Submitted', `${a.title}: ${cmd.repsDone}/${a.reps} sets${clip ? ` + ${Math.round(clip.durationSec)} s clip` : ''} · reply due ${shortWhen(dueBy)}`);
        notify([p.coachId], 'new_submission', `${p.name} submitted ${a.title}${clip ? ' with a clip' : ''}. Reply by ${shortWhen(dueBy)}.`, `/coach/review/${p.id}`, p.id);
      } else {
        a.status = 'logged'; move(p, 'Next step ready', `${a.title}: logged (this week’s ${allowed} review${allowed === 1 ? '' : 's'} used)`);
        notify(famUsers(p), 'feedback_ready', `Logged ${a.title}. You’ve used this week’s ${allowed} review${allowed === 1 ? '' : 's'} on ${p.tier}; your coach still sees it. Next rep is unlocked.`, '/app', p.id);
      }
      milestone(p, 'First check-in'); levelCheck(p, b); break;
    }
    case 'review': {
      const p = P(cmd.playerId); guard(p); checkRev(p, cmd.rev); const sub = lastSubmission(s, p.id); if (!sub) throw new WorkflowError('No submission to review.');
      const f = { wentWell: (cmd.wentWell ?? '').trim(), adjust: (cmd.adjust ?? '').trim(), why: (cmd.why ?? '').trim() };
      if (f.wentWell.length < 3 || f.adjust.length < 3) throw new WorkflowError('Feedback needs what went well and one adjustment.'); if (f.why.length < 3) throw new WorkflowError('Add one line on why.');
      if (!isUrl(cmd.linkUrl)) throw new WorkflowError('Links must start with http:// or https://');
      const notes = (cmd.notes ?? []).map((n) => ({ t: Math.max(0, Math.round(Number(n.t) * 10) / 10), text: String(n.text ?? '').trim().slice(0, 140) })).filter((n) => n.text && Number.isFinite(n.t)).sort((x, y) => x.t - y.t).slice(0, 12);
      if (notes.length && !sub.clipId) throw new WorkflowError('Timestamp notes need a clip.');
      const a = s.assignments.find((x) => x.id === sub.assignmentId); const nq = playerAssignments(s, p.id).find((x) => x.status === 'queued');
      const nextRep = cmd.decision === 'retry' ? `${a?.title} again, with the adjustment` : nq ? nq.title : 'Cycle wrap-up and review';
      const needsSignoff = actor.role === 'assistant' && s.settings.requireSignoff;
      s.reviews.push({ id: id('rev'), submissionId: sub.id, playerId: p.id, decision: cmd.decision, ...f, nextRep, linkUrl: cmd.linkUrl?.trim() || null, feedback: composeFeedback(p, { ...f, nextRep }) + (notes.length ? `\n${notes.map((n) => `${fmtT(n.t)} ${n.text}`).join('\n')}` : ''), notes, secondsSpent: cmd.secondsSpent && cmd.secondsSpent > 0 ? Math.round(Math.min(cmd.secondsSpent, 3600)) : null, reaction: null, at, reviewerId: actor.id, status: needsSignoff ? 'pending_signoff' : 'final' });
      if (needsSignoff) { move(p, 'Sign-off', `${userName(s, actor.id)} reviewed (${cmd.decision}); awaiting head-coach sign-off`); notify([head()], 'signoff_needed', `Sign-off needed: ${userName(s, actor.id)} reviewed ${p.name}.`, `/coach/review/${p.id}`, p.id); }
      else applyReview(p, cmd.decision, s.reviews[s.reviews.length - 1].feedback, actor.id); break;
    }
    case 'signOff': {
      const p = P(cmd.playerId); guard(p); checkRev(p, cmd.rev); const r = pendingReview(s, p.id); if (!r) throw new WorkflowError('No review waiting for sign-off.');
      const edited = !!cmd.edit && Object.values(cmd.edit).some((v) => v?.trim());
      r.signedOffBy = actor.id; r.signedOffAt = at; r.status = 'final'; if (edited) { for (const k of ['wentWell', 'adjust', 'why'] as const) if (cmd.edit?.[k]?.trim()) r[k] = cmd.edit[k]!.trim(); } if (!cmd.approve) r.decision = r.decision === 'approve' ? 'retry' : 'approve';
      if (!cmd.approve) { const a = s.assignments.find((x) => x.id === s.submissions.find((y) => y.id === r.submissionId)?.assignmentId); const nq = playerAssignments(s, p.id).find((x) => x.status === 'queued'); r.nextRep = r.decision === 'retry' ? `${a?.title} again, with the adjustment` : nq ? nq.title : 'Cycle wrap-up and review'; }
      r.feedback = composeFeedback(p, r) + (r.notes?.length ? `\n${r.notes.map((n) => `${fmtT(n.t)} ${n.text}`).join('\n')}` : '');
      log('signoff', `Head coach signed off ${userName(s, r.reviewerId)}’s review${cmd.approve ? '' : ' (decision changed)'}${edited ? ' with edits' : ''}`, p.id);
      applyReview(p, r.decision, r.feedback, r.reviewerId); notify([r.reviewerId], 'feedback_ready', `Your review of ${p.name} was signed off.`, `/coach/player/${p.id}`, p.id); break;
    }
    case 'startNext': { const p = P(cmd.playerId); guard(p); startNext(p); break; }
    case 'pause': { const p = P(cmd.playerId); guard(p); p.pausedFrom = p.state; move(p, 'Paused', 'Paused'); break; }
    case 'resume': { const p = P(cmd.playerId); guard(p); const bs = subscriptionOf(s, p.id); if (bs?.pausedByBilling && !['head', 'ops', 'system'].includes(actor.role)) throw new WorkflowError('Coaching is paused for billing. Update the payment (or restart the plan) in Billing and it resumes automatically.'); const to = p.pausedFrom ?? 'Plan building'; p.pausedFrom = null; move(p, to, 'Resumed'); break; }
    case 'sendMessage': {
      const p = P(cmd.playerId); if (!cmd.text.trim()) throw new WorkflowError('Empty message.'); if (!isUrl(cmd.linkUrl)) throw new WorkflowError('Links must start with http:// or https://');
      const from = actor.role === 'parent' ? 'parent' : actor.role === 'player' ? 'player' : 'coach'; const context: MessageContext = cmd.context ?? 'general';
      const inThread = (c: MessageContext) => s.messages.some((m) => m.playerId === p.id && m.context === c && (m.refId ?? null) === (cmd.refId ?? null));
      if (context === 'urgent' && from === 'player') throw new WorkflowError('Urgent is for parents (schedule changes, injuries, emergencies).');
      if (context === 'urgent' && from === 'coach' && !inThread('urgent')) throw new WorkflowError('Urgent is for parents (schedule changes, injuries, emergencies).');
      if (context === 'gameplan' && from !== 'coach' && !inThread('gameplan')) throw new WorkflowError('Game plans come from the coach.');
      const msg = addMessage(p, from, context, cmd.text.trim(), cmd.refId ?? null, cmd.linkUrl);
      log('message', `${from} → ${from === 'coach' ? 'family' : 'coach'} [${context}]: “${cmd.text.trim().slice(0, 50)}”`, p.id);
      const ns = notify(from === 'coach' ? famUsers(p) : context === 'urgent' ? [p.coachId, head()] : [p.coachId], context === 'urgent' && from !== 'coach' ? 'overdue' : 'new_message', `${context === 'urgent' && from !== 'coach' ? 'URGENT · ' : ''}${userName(s, actor.id)}: “${cmd.text.trim().slice(0, 60)}”`, from === 'coach' ? `/inbox?t=${msg.thread}` : `/coach/player/${p.id}?tab=messages`, p.id);
      if (from !== 'coach') markEmailed(ns, emailUsers(ns.map((x) => x.userId), 'reply-needed', { player: p.name, from: userName(s, actor.id), due: msg.dueBy ? shortWhen(msg.dueBy) : 'soon', snippet: cmd.text.trim().slice(0, 140), playerId: p.id })); break;
    }
    case 'markRead': { s.messages.forEach((m) => { if (m.playerId === cmd.playerId && m.authorId !== actor.id && !m.readBy[actor.id]) m.readBy = { ...m.readBy, [actor.id]: at }; }); break; }
    case 'toggleHabit': {
      const p = P(cmd.playerId); const d = isoDay(t); const ex = s.habits.find((h) => h.playerId === p.id && h.date === d && h.key === cmd.key);
      const b = progress(s, p.id).level; const before = progress(s, p.id).streak;
      s.habits = ex ? s.habits.filter((h) => h !== ex) : [...s.habits, { id: id('hab'), playerId: p.id, date: d, key: cmd.key }];
      const st = progress(s, p.id).streak; if (st > before) log('habit', `Streak ${st} days`, p.id); for (const k of [3, 7, 14]) if (st >= k) milestone(p, `${k}-day streak`); levelCheck(p, b); break;
    }
    case 'reactFeedback': {
      const p = P(cmd.playerId); const r = s.reviews.find((x) => x.id === cmd.reviewId && x.playerId === p.id && x.status === 'final'); if (!r) throw new WorkflowError('Feedback not found.');
      if (r.reaction === 'got_it' && cmd.reaction === 'got_it') break;
      r.reaction = cmd.reaction; r.reactedAt = at; log('feedback', cmd.reaction === 'got_it' ? `Committed: “${r.adjust.slice(0, 60)}” → ${r.nextRep}` : 'Question ❓', p.id);
      if (cmd.reaction === 'got_it') { const latest = lastReview(s, p.id); if (latest?.id === r.id && p.state === 'Next step ready') startNext(p); }
      if (cmd.reaction === 'question') { const q = (cmd.question ?? '').trim(); if (q.length < 3) throw new WorkflowError('Type your question.'); const from = actor.role === 'parent' ? 'parent' : 'player'; addMessage(p, from, 'feedback', q, r.id); notify([r.reviewerId === p.coachId ? p.coachId : p.coachId], 'question', `${userName(s, actor.id)} has a question on your feedback: “${q.slice(0, 60)}”`, `/coach/player/${p.id}?tab=messages`, p.id); }
      break;
    }
    case 'weeklyReflection': {
      const p = P(cmd.playerId); if (cmd.text.trim().length < 3) throw new WorkflowError('Two lines is plenty, but write something.'); const wk = weekKey(t); const ex = s.reflections.find((x) => x.playerId === p.id && x.week === wk); const feel = Math.max(1, Math.min(5, Math.round(cmd.feel || 3)));
      if (ex) Object.assign(ex, { text: cmd.text.trim(), feel, at }); else s.reflections.push({ id: id('rf'), playerId: p.id, week: wk, text: cmd.text.trim(), feel, at }); log('reflection', `Weekly wrap (${feel}/5)`, p.id); break;
    }
    case 'updateAboutMe': { const p = P(cmd.playerId); p.aboutMe = cmd.aboutMe.trim().slice(0, 600); if (cmd.proudOf !== undefined) p.proudOf = cmd.proudOf.trim(); if (cmd.frustration !== undefined) p.frustration = cmd.frustration.trim(); log('profile', '“Coach knows you” updated', p.id); notify([p.coachId], 'new_message', `${p.name} updated “Coach knows you”.`, `/coach/player/${p.id}`, p.id); break; }
    case 'setTournament': { const p = P(cmd.playerId); if (cmd.date && Number.isNaN(new Date(cmd.date).getTime())) throw new WorkflowError('Pick a date.'); p.tournamentDate = cmd.date ? new Date(cmd.date).toISOString() : null; log('schedule', cmd.date ? `Tournament ${shortWhen(p.tournamentDate!)}` : 'Tournament cleared', p.id); if (cmd.date) notify([p.coachId], 'new_message', `${p.name} has a tournament ${shortWhen(p.tournamentDate!)}.`, `/coach/player/${p.id}`, p.id); break; }
    case 'cycleReflection': {
      const p = P(cmd.playerId); if (p.state !== 'Cycle review') throw new WorkflowError('The cycle review opens when the cycle ends.'); const c = playerCycle(s, p.id)!; if (!cmd.improved.trim()) throw new WorkflowError('What improved?');
      const cr = cycleReviewFor(p, c.id); Object.assign(cr, { improved: cmd.improved.trim(), hardest: cmd.hardest.trim(), wantNext: cmd.wantNext.trim(), playerAt: at }); log('cycle', 'Player cycle reflection', p.id);
      notify([p.coachId], 'cycle_review', `${p.name} finished their cycle reflection.`, `/coach/cycle/${p.id}`, p.id); break;
    }
    case 'completeCycleReview': {
      const p = P(cmd.playerId); if (p.state !== 'Cycle review') throw new WorkflowError('No cycle to review.'); const c = playerCycle(s, p.id)!; if (!cmd.summary.trim() || !cmd.nextFocus.trim()) throw new WorkflowError('Write a summary and pick the next focus.');
      const cr = cycleReviewFor(p, c.id); const before = { ...p.rubric }; const after = { ...p.rubric }; for (const [k, v] of Object.entries(cmd.ratings)) after[k] = Math.max(1, Math.min(5, Math.round(v)));
      Object.assign(cr, { summary: cmd.summary.trim(), nextFocus: cmd.nextFocus.trim(), ratingsBefore: before, ratingsAfter: after, coachAt: at }); p.rubric = after; p.rev = (p.rev ?? 0) + 1;
      log('cycle', `Cycle ${c.index} reviewed · next focus “${cmd.nextFocus.trim()}”`, p.id); notify(famUsers(p), 'cycle_review', `Cycle ${c.index} review is in: next focus “${cmd.nextFocus.trim()}”.`, '/app/develop#cycle', p.id); break;
    }
    case 'adjustPlan': {
      const p = P(cmd.playerId); const c = playerCycle(s, p.id); if (!c || c.status !== 'active') throw new WorkflowError('No active plan to adjust.'); if (cmd.note.trim().length < 3) throw new WorkflowError('Say what changed and why.');
      (cmd.addDrillIds ?? []).forEach((did, i) => { const d = s.drills.find((x) => x.id === did); if (!d) throw new WorkflowError('Unknown drill'); s.assignments.push({ id: id('as'), cycleId: c.id, playerId: p.id, drillId: d.id, order: 100 * c.index + 50 + i + Math.random(), title: d.title, reps: d.reps, minutes: d.minutes, cues: d.cues, status: 'queued' }); });
      c.adjustedAt = at; addMessage(p, 'coach', 'rep', `Plan adjusted: ${cmd.note.trim()}`, c.id); log('plan', `Plan adjusted: ${cmd.note.trim().slice(0, 60)}`, p.id); notify(famUsers(p), 'plan_published', `Plan adjusted: ${cmd.note.trim().slice(0, 60)}`, '/app', p.id); break;
    }
    case 'approveDigests': { for (const it of cmd.items) { const r = dispatch(s, { type: 'approveDigest', playerId: it.playerId, text: it.text }, actor); Object.assign(s, r.snapshot); } break; }
    case 'registerClip': {
      const p = P(cmd.playerId); const err = clipError({ mime: cmd.mime, bytes: cmd.bytes, durationSec: cmd.durationSec }); if (err) throw new WorkflowError(err);
      if (!videoConsent(p)) throw new WorkflowError(`${first(p.name)} is under 13: a parent needs to OK clips (updated consent) first.`);
      if (s.clips.some((c) => c.id === cmd.clipId)) throw new WorkflowError('Clip already registered.');
      s.clips.push({ id: cmd.clipId, playerId: p.id, assignmentId: openAssignment(s, p.id)?.id ?? null, submissionId: null, storageKey: cmd.storageKey, mime: cmd.mime, bytes: cmd.bytes, durationSec: Math.round(cmd.durationSec * 100) / 100, watchFor: (cmd.watchFor ?? '').trim().slice(0, 200), uploadedBy: actor.id, at, deleteAfter: new Date(t.getTime() + CLIP_RETENTION_DAYS * 864e5).toISOString(), deletedAt: null });
      log('clip', `Clip added (${Math.round(cmd.durationSec)} s)`, p.id); break;
    }
    case 'deleteClip': {
      const p = P(cmd.playerId); const c = s.clips.find((x) => x.id === cmd.clipId && x.playerId === p.id); if (!c) throw new WorkflowError('Clip not found.');
      if (actor.role === 'assistant' && p.coachId !== actor.id) throw new WorkflowError('Player is assigned to another coach');
      s.clips = s.clips.filter((x) => x !== c); log('clip', `Clip deleted on request by ${actor.role}`, p.id); break;
    }
    case 'setWorkingOn': { const p = P(cmd.playerId); const txt = cmd.text.trim(); if (txt.length < 3) throw new WorkflowError('One sentence, in your words.'); p.workingOn = txt.slice(0, 160); p.workingOnWeek = weekKey(t); log('profile', `Working on: “${p.workingOn.slice(0, 60)}”`, p.id); break; }
    case 'saveDrillFeedback': { const dr = s.drills.find((x) => x.id === cmd.drillId); if (!dr) throw new WorkflowError('Unknown drill'); const f = cmd.fbTemplate; dr.fbTemplate = { wentWell: f.wentWell.trim(), adjust: f.adjust.trim(), why: f.why.trim() }; log('library', `Feedback template saved for “${dr.title}”`); break; }
    case 'updateCanvas': { P(cmd.playerId).canvas = cmd.canvas; break; }
    case 'rateSkill': { const p = P(cmd.playerId); p.rubric = { ...p.rubric, [cmd.skill]: Math.max(1, Math.min(5, cmd.value)) }; log('rubric', `${cmd.skill} → ${cmd.value}/5`, p.id); break; }
    case 'approveDigest': {
      const p = P(cmd.playerId); const wk = weekKey(t); const ex = s.digests.find((d) => d.playerId === p.id && d.week === wk);
      if (ex) Object.assign(ex, { text: cmd.text, status: 'approved', approvedAt: at, approvedBy: actor.id }); else s.digests.push({ id: id('dg'), playerId: p.id, week: wk, text: cmd.text, status: 'approved', approvedAt: at, approvedBy: actor.id });
      log('digest', 'Weekly digest approved for parent', p.id); const fam = family(p); const par = s.users.find((u) => u.role === 'parent' && u.familyId === p.familyId); sendMail('parent-digest', par?.email ?? fam.email, { playerFirst: first(p.name), text: cmd.text }, par?.id); break;
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
      sendMail('staff', email, { name: u.name, role: cmd.role }, u.id); log('account', `Staff added: ${u.name} (${cmd.role})`); break;
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
        Object.assign(s, { players: s.players.filter((p) => p.id !== pid), applications: keep(s.applications), invites: keep(s.invites), consents: keep(s.consents), cycles: keep(s.cycles), assignments: keep(s.assignments), submissions: keep(s.submissions), reviews: keep(s.reviews), messages: keep(s.messages), reflections: keep(s.reflections), cycleReviews: keep(s.cycleReviews), clips: keep(s.clips), habits: keep(s.habits), milestones: keep(s.milestones), digests: keep(s.digests), meetings: keep(s.meetings), notifications: keep(s.notifications) });
        s.users = s.users.map((u) => (u.playerId === pid ? { ...u, active: false, name: 'Deleted player', username: null, playerId: null } : u));
        s.events = s.events.map((e) => (e.playerId === pid ? { ...e, detail: '[deleted]' } : e)); log('privacy', 'Player data deleted on request', pid);
      } else log('privacy', 'Export delivered', r.playerId); break;
    }
    case 'sweep': { runSweep(); break; }
    case 'billingEvent': {
      s.subscriptions = s.subscriptions ?? []; s.billingEvents = s.billingEvents ?? [];
      if (s.billingEvents.some((e) => e.id === cmd.eventId)) { created.duplicate = true; break; } // Stripe retries / replays: process each event once
      const known = s.subscriptions.find((x) => (cmd.subscriptionId && x.subscriptionId === cmd.subscriptionId) || (!cmd.playerId && cmd.customerId && x.customerId === cmd.customerId));
      const p = s.players.find((x) => x.id === (cmd.playerId ?? known?.playerId)); s.billingEvents.push({ id: cmd.eventId, kind: cmd.kind, at, playerId: p?.id ?? null });
      if (!p) { log('billing', `Stripe ${cmd.kind} ignored: no matching player`); break; }
      let sub = subscriptionOf(s, p.id); if (!sub) { sub = { id: id('subn'), playerId: p.id, familyId: p.familyId, tier: cmd.tier ?? p.tier, status: 'incomplete', customerId: null, subscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null, pausedByBilling: false, startedAt: at, updatedAt: at }; s.subscriptions.push(sub); }
      const bsub: Subscription = sub;
      if (cmd.customerId) bsub.customerId = cmd.customerId; if (cmd.subscriptionId) bsub.subscriptionId = cmd.subscriptionId; if (cmd.periodEnd) bsub.currentPeriodEnd = cmd.periodEnd; bsub.updatedAt = at;
      const par = s.users.find((u) => u.role === 'parent' && u.familyId === p.familyId); const to = par?.email ?? family(p).email; const price = (x: Tier) => `$${TIER_INFO[x].price}/mo`;
      const perWeek = (x: Tier) => { const rv = s.settings.reviewsPerWeek?.[x] ?? 99; return rv >= 99 ? 'every submission reviewed' : `${rv} review${rv === 1 ? '' : 's'}/week`; };
      const changeTier = (nt?: Tier | null) => {
        if (!nt) return; bsub.tier = nt; if (nt === p.tier) return; const from = p.tier; p.tier = nt; p.rev = (p.rev ?? 0) + 1;
        log('billing', `Plan changed ${from} → ${nt} (${price(nt)}): ${perWeek(nt)}, replies ${replyLabel(s.settings.sla[nt])}`, p.id);
        notify([p.coachId, ...famUsers(p)], 'billing', `${p.name} is now on ${nt}: ${perWeek(nt)}, replies ${replyLabel(s.settings.sla[nt])}.`, '/parent?tab=billing', p.id);
      };
      const recover = (why: string) => { const was = bsub.status; bsub.status = 'active'; bsub.pastDueSince = null; p.billing = 'paid'; billingResume(p, bsub, why); return was; };
      switch (cmd.kind) {
        case 'checkout_completed': { changeTier(cmd.tier); bsub.cancelAtPeriodEnd = false; bsub.currentPeriodEnd = bsub.currentPeriodEnd ?? new Date(t.getTime() + 30 * 864e5).toISOString(); recover('payment set up'); log('billing', `Checkout complete: ${p.tier} ${price(p.tier)} via Stripe`, p.id); notify([...ops(), ...(par ? [par.id] : [])], 'billing', `Payment set up for ${p.name} (${p.tier}, ${price(p.tier)}).`, '/parent?tab=billing', p.id); break; }
        case 'invoice_paid': { if (cmd.amount === 0) break; const was = recover('payment received'); log('billing', `Payment received${cmd.amount ? ` $${(cmd.amount / 100).toFixed(2)}` : ''}${was === 'past_due' ? ' (past-due balance cleared)' : ''}`, p.id); sendMail('payment-receipt', to, { player: first(p.name), tier: p.tier, amount: cmd.amount ?? PRICE_CENTS[p.tier], next: bsub.currentPeriodEnd ? shortWhen(bsub.currentPeriodEnd) : '' }, par?.id); break; }
        case 'invoice_failed': {
          bsub.status = 'past_due'; bsub.pastDueSince = bsub.pastDueSince ?? at; p.billing = 'past_due'; const ge = graceEnds(s, bsub)!;
          log('billing', `Payment failed: ${s.settings.graceDays ?? 7}-day grace until ${shortWhen(ge)}, then coaching pauses`, p.id);
          sendMail('payment-failed', to, { player: first(p.name), tier: p.tier, graceEnds: shortWhen(ge), graceDays: s.settings.graceDays ?? 7 }, par?.id);
          notify([...(par ? [par.id] : []), ...ops()], 'billing', `Payment failed for ${p.name}. Coaching continues until ${shortWhen(ge)}; update the card to keep going.`, '/parent?tab=billing', p.id); break;
        }
        case 'subscription_updated': {
          changeTier(cmd.tier); const st = cmd.status ?? 'active';
          if (st === 'canceled' || st === 'incomplete_expired') { endAccess(p, bsub, 'subscription canceled'); break; }
          if (st === 'past_due' || st === 'unpaid') { bsub.status = 'past_due'; bsub.pastDueSince = bsub.pastDueSince ?? at; p.billing = 'past_due'; }
          else if (cmd.paused) { if (bsub.status !== 'paused') { bsub.status = 'paused'; billingPause(p, bsub, 'billing paused by the family'); } }
          else if ((st === 'active' || st === 'trialing') && bsub.status !== 'active') recover(bsub.status === 'paused' ? 'billing resumed' : 'payment received');
          if (cmd.cancelAtPeriodEnd !== undefined && !!cmd.cancelAtPeriodEnd !== !!bsub.cancelAtPeriodEnd) {
            bsub.cancelAtPeriodEnd = !!cmd.cancelAtPeriodEnd; const end = bsub.currentPeriodEnd ? shortWhen(bsub.currentPeriodEnd) : 'the end of the paid period';
            log('billing', bsub.cancelAtPeriodEnd ? `Canceled: coaching continues until ${end}` : 'Cancellation undone', p.id);
            notify([p.coachId, ...ops(), ...(par ? [par.id] : [])], 'billing', bsub.cancelAtPeriodEnd ? `${p.name}’s plan is canceled; coaching continues until ${end}.` : `${p.name}’s cancellation was undone.`, '/parent?tab=billing', p.id);
          }
          break;
        }
        case 'subscription_deleted': { endAccess(p, bsub, 'subscription canceled'); break; }
      }
      break;
    }
    case 'joinWaitlist': { const p = P(cmd.playerId); if (!(p.state === 'Paused' && p.billing === 'canceled')) throw new WorkflowError('Only a canceled player can rejoin the waitlist.'); p.pausedFrom = null; move(p, 'Waitlist', 'Rejoined the waitlist (returning family)'); notify(ops(), 'billing', `${p.name}’s family rejoined the waitlist.`, `/ops/player/${p.id}`, p.id); break; }
    case 'setEmailPrefs': {
      const uid = cmd.userId && (actor.role === 'system' || actor.role === 'head') ? cmd.userId : actor.id; const u = s.users.find((x) => x.id === uid); if (!u) throw new WorkflowError('Unknown user');
      const next = { ...DEFAULT_PREFS, ...(u.prefs ?? {}), ...cmd.prefs }; for (const h of [next.quietStart, next.quietEnd]) if (!Number.isInteger(h) || h < 0 || h > 23) throw new WorkflowError('Quiet hours are whole hours 0–23.');
      u.prefs = next; log('account', `Email settings: coaching ${next.coaching ? 'on' : 'off'}, digest ${next.digest ? 'on' : 'off'}, updates ${next.updates ? 'on' : 'off'}, quiet ${next.quietStart}:00–${next.quietEnd}:00${actor.role === 'system' ? ' (one-click unsubscribe)' : ''}`, u.playerId ?? null); break;
    }

    case 'generateDigests': {
      const wk = weekKey(t); const cut = t.getTime() - 7 * 864e5; let n = 0;
      for (const p of s.players.filter((x) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(x.state))) {
        if (s.digests.some((d) => d.playerId === p.id && d.week === wk)) continue;
        const done = s.submissions.filter((x) => x.playerId === p.id && new Date(x.at).getTime() > cut).length; const r = s.reviews.filter((x) => x.playerId === p.id && x.status === 'final').sort((a, b) => b.at.localeCompare(a.at))[0]; const pr = progress(s, p.id);
        s.digests.push({ id: id('dg'), playerId: p.id, week: wk, status: 'draft', text: `${first(p.name)} logged ${done} check-in${done === 1 ? '' : 's'} this week, is on a ${pr.streak}-day habit streak, and is at Level ${pr.level} (${pr.name}). Focus: ${playerCycle(s, p.id)?.focus ?? 'first plan coming'}.${r && r.wentWell ? ` ${plainFeedback(p, r)}` : ''}${(() => { const rf = s.reflections.find((x) => x.playerId === p.id && x.week === wk); return rf ? ` In ${first(p.name)}’s words: “${rf.text}”` : ''; })()}` }); n++;
        notify([p.coachId], 'digest_ready', `Weekly digest draft ready for ${p.name}.`, '/coach/digest', p.id, `digest:${p.id}:${wk}`);
      }
      log('digest', `Generated ${n} digest draft(s)`); break;
    }
    case 'advanceClock': { s.clockOffsetMs += cmd.hours * 36e5; log('clock', `Demo clock +${cmd.hours}h`); runSweep(); break; }
  }
  s.version++; s.events = [...s.events, ...events];
  return { snapshot: s, events, created };
  function videoConsent(p: Player) { return p.age >= 13 || s.consents.some((c) => c.playerId === p.id && c.version >= '2026-10b'); }
  function family(p: Player) { return s.families.find((f) => f.id === p.familyId)!; }
  function cycleReviewFor(p: Player, cycleId: string) { let cr = s.cycleReviews.find((x) => x.cycleId === cycleId); if (!cr) { cr = { id: id('cr'), cycleId, playerId: p.id }; s.cycleReviews.push(cr); } return cr; }
  /** One message builder for every thread: context + refId, reply-by from tier window (urgent: office-hours clock), answering the thread when the coach replies. */
  function addMessage(p: Player, from: 'coach' | 'player' | 'parent', context: MessageContext, text: string, refId: string | null, linkUrl?: string) {
    if (from === 'coach') s.messages.forEach((m) => { if (m.playerId === p.id && m.from !== 'coach' && (!refId || m.refId === refId || context === 'general')) m.answered = true; });
    const dueBy = from === 'coach' ? null : context === 'urgent' ? officeDue(t, s.settings.urgentReplyHours ?? 4, s.settings.officeHours ?? { days: [1, 2, 3, 4, 5], start: 15, end: 20 }).toISOString() : replyDue(s, p, t).toISOString();
    const m = { id: id('msg'), playerId: p.id, from, authorId: from === 'coach' && !['head', 'assistant'].includes(actor.role) ? p.coachId : actor.id, context, refId, text, linkUrl: linkUrl?.trim() || null, at, dueBy, answered: from === 'coach', readBy: { [actor.id]: at } };
    s.messages.push(m); return { ...m, thread: `${context}:${refId ?? ''}` };
  }
}
export const allStaff = staff;
