import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Message, MessageContext, Player, Review, Snapshot } from '../shared/domain';
import { coachKnows, plainFeedback, repWhy, rhythmToday, RHYTHM } from '../shared/personal';
import { promiseCard } from '../shared/promises';
import { inOffice, nextOpen, relative, shortWhen, weekKey } from '../shared/time';
import { buildQueue, clock, family, first, playerCycle, tierReply, userName, OWED } from '../shared/workflow';
import { useSnap, useStore } from './store';

/* ---------- shared words ---------- */
export const STATUS_WORD = { kept: 'Kept', 'on-track': 'On track', 'at-risk': 'Being handled', missed: 'Late' } as const;
export const CTX_LABEL: Record<MessageContext, string> = { general: 'General', rep: 'About a rep', feedback: 'Feedback question', schedule: 'Schedule change', urgent: 'Urgent', gameplan: 'Game plan' };
export const threadKey = (m: Pick<Message, 'context' | 'refId'>) => `${m.context ?? 'general'}:${m.refId ?? ''}`;
const reviewTitle = (s: Snapshot, r?: Review) => s.assignments.find((a) => a.id === s.submissions.find((x) => x.id === r?.submissionId)?.assignmentId)?.title;
export function threadTitle(s: Snapshot, m: Pick<Message, 'context' | 'refId'>) {
  const ref = m.refId; const ctx = m.context ?? 'general';
  if (ctx === 'feedback' && ref) return `Feedback: ${reviewTitle(s, s.reviews.find((r) => r.id === ref)) ?? 'a rep'}`;
  if (ctx === 'rep' && ref) return `Rep: ${s.assignments.find((a) => a.id === ref)?.title ?? playerCycle(s, s.cycles.find((c) => c.id === ref)?.playerId ?? '')?.focus ?? 'plan'}`;
  return CTX_LABEL[ctx];
}
const threadLink = (_s: Snapshot, m: Pick<Message, 'context' | 'refId'>, family: boolean) => (m.context === 'feedback' && m.refId ? (family ? '/app/develop#fb-' + m.refId : '') : m.context === 'rep' && m.refId && family ? '/app#rep' : '');

/* ---------- promise card ---------- */
export function PromiseCard({ p, title = 'What you can count on' }: { p: Player; title?: string }) {
  const s = useSnap(); const rows = promiseCard(s, p);
  if (!rows.length) return null;
  return <section className="panel promises" aria-label={title} id="promises"><h3 className="display">{title}</h3><p className="small dim">{p.tier} plan. Live status, straight from the same engine your coach uses.</p>
    <ul>{rows.map(({ promise, status }) => <li key={promise.id} className={`pr pr-${status.state}`} data-promise={promise.id}><span className="prdot" aria-hidden /><span className="grow"><b>{promise.text}</b><span className="small block">{status.label}</span></span><span className="prword">{STATUS_WORD[status.state]}</span></li>)}</ul></section>;
}

/* ---------- weekly rhythm ---------- */
export function WeekRhythm({ role }: { role: 'player' | 'coach' }) {
  const s = useSnap(); const today = rhythmToday(clock(s));
  return <ol className="rhythm" aria-label="Weekly rhythm">{RHYTHM.map((r) => <li key={r.key} className={r.key === today.key ? 'on' : ''}><b>{r.label}</b><span className="small">{role === 'player' ? r.player : r.coach}</span></li>)}</ol>;
}

/* ---------- unified feedback ---------- */
export function FeedbackCard({ p, r, me, compact }: { p: Player; r: Review; me: 'player' | 'parent' | 'coach'; compact?: boolean }) {
  const s = useSnap(); const { run } = useStore(); const [ask, setAsk] = useState(false); const [q, setQ] = useState('');
  const thread = s.messages.filter((m) => m.context === 'feedback' && m.refId === r.id).sort((a, b) => a.at.localeCompare(b.at));
  const fam = me !== 'coach';
  const parts: [string, string, string][] = [['ok', 'What you did well', r.wentWell], ['adj', 'One adjustment', r.adjust], ['why', 'Why', r.why]];
  return <article className={`fb ${compact ? 'compact' : ''}`} id={`fb-${r.id}`} data-review={r.id}>
    <header className="row between wrapx"><span className="kicker">{userName(s, r.reviewerId)} · {shortWhen(r.at)}{r.signedOffBy && r.signedOffBy !== r.reviewerId ? ` · checked by ${first(userName(s, r.signedOffBy))}` : ''}</span><span className={`pill st-${r.decision === 'approve' ? 'approved' : 'retry'}`}>{r.decision === 'approve' ? 'Approved' : 'Another attempt'}</span></header>
    {r.wentWell ? <dl className="fbgrid">{parts.map(([k, l, v]) => v && <div key={k} className={`fb-${k}`}><dt>{l}</dt><dd>{v}</dd></div>)}<div className="fb-next"><dt>Next rep</dt><dd>{r.nextRep}</dd></div></dl> : <blockquote className="quote sm">{r.feedback}</blockquote>}
    {r.linkUrl && <a className="attach" href={r.linkUrl} target="_blank" rel="noreferrer noopener">🔗 {r.linkUrl.replace(/^https?:\/\//, '').slice(0, 48)}</a>}
    {fam && r.status === 'final' && <div className="react">
      {r.reaction === 'got_it' ? <span className="small">👍 You said “got it”</span> : r.reaction === 'question' ? <span className="small">❓ Question sent{thread.some((m) => m.from === 'coach') ? ' · answered' : ` · reply ${thread.at(-1)?.dueBy ? `by ${shortWhen(thread.at(-1)!.dueBy!)}` : 'coming'}`}</span> : <>
        <button className="react-b" onClick={() => run({ type: 'reactFeedback', playerId: p.id, reviewId: r.id, reaction: 'got_it' })}>👍 Got it</button>
        <button className="react-b" aria-expanded={ask} onClick={() => setAsk(!ask)}>❓ Question</button></>}</div>}
    {ask && <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'reactFeedback', playerId: p.id, reviewId: r.id, reaction: 'question', question: q })) { setAsk(false); setQ(''); } }}>
      <label className="sr" htmlFor={`q-${r.id}`}>Your question</label><input id={`q-${r.id}`} autoFocus className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What part is unclear?" /><button className="btn" disabled={q.trim().length < 3}>Ask</button></form>}
    {thread.length > 0 && !compact && <ul className="fbthread">{thread.map((m) => <li key={m.id} className={`from-${m.from}`}><b>{m.from === 'coach' ? first(userName(s, m.authorId)) : m.from === 'parent' ? family(s, p).parentName : first(p.name)}:</b> {m.text}</li>)}</ul>}
  </article>;
}
export function FeedbackTimeline({ p, me }: { p: Player; me: 'player' | 'parent' | 'coach' }) {
  const s = useSnap(); const subs = s.submissions.filter((x) => x.playerId === p.id).sort((a, b) => b.at.localeCompare(a.at));
  if (!subs.length) return <div className="empty"><b>No feedback yet.</b><p className="small">Log your first rep on Today. Your coach answers with what went well, one adjustment, why, and your next rep.</p></div>;
  return <ol className="tl">{subs.map((sub) => { const a = s.assignments.find((x) => x.id === sub.assignmentId); const r = s.reviews.find((x) => x.submissionId === sub.id && (x.status === 'final' || me === 'coach'));
    return <li key={sub.id}><span className="tldot" aria-hidden /><div className="grow"><p className="row between wrapx"><b>{a?.title}</b><span className="small dim">{shortWhen(sub.at)} · {sub.repsDone}/{a?.reps} sets</span></p><p className="small">“{sub.reflection}”</p>
      {r ? <FeedbackCard p={p} r={r} me={me} compact={me === 'coach'} /> : sub.reviewed === false ? <p className="small dim">Logged, no review this week (your plan’s weekly reviews were used).</p> : <p className="small dim">Reply due {relative(sub.dueBy, clock(s))} ({shortWhen(sub.dueBy)})</p>}</div></li>; })}</ol>;
}

/* ---------- coach knows you ---------- */
export function CoachKnows({ p, editable }: { p: Player; editable?: boolean }) {
  const { run } = useStore(); const [edit, setEdit] = useState(false); const [t, setT] = useState(''); const summary = coachKnows(p);
  return <section className="panel knows" aria-label="Coach knows you"><div className="row between"><h3 className="display">{editable ? 'Coach knows you' : `${first(p.name)} in their words`}</h3>{editable && !edit && <button className="chip" onClick={() => { setT(summary); setEdit(true); }}>Edit</button>}</div>
    {edit ? <form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'updateAboutMe', playerId: p.id, aboutMe: t })) setEdit(false); }}><label className="sr" htmlFor="ab">About you</label><textarea id="ab" className="input" rows={3} maxLength={600} value={t} onChange={(e) => setT(e.target.value)} /><div className="row gap"><button className="btn sm">Save</button><button type="button" className="link" onClick={() => setEdit(false)}>Cancel</button></div></form>
      : <p>{summary || <span className="dim">Nothing yet. Add a line about how you like to be coached.</span>}</p>}
    {editable && <p className="small dim">Your coach reads this before every review. Change it whenever it stops being true.</p>}
    {!editable && <dl className="dl"><div><dt>Goal</dt><dd>{p.goal || '—'}</dd></div><div><dt>Proud of</dt><dd>{p.proudOf || '—'}</dd></div><div><dt>Frustrated by</dt><dd>{p.frustration || '—'}</dd></div><div><dt>Learns by</dt><dd>{p.learnStyle || '—'}</dd></div>{p.tournamentDate && <div><dt>Tournament</dt><dd>{shortWhen(p.tournamentDate)}</dd></div>}</dl>}
  </section>;
}
export const WhyLine = ({ p }: { p: Player }) => { const s = useSnap(); return <p className="why">{repWhy(p, { title: '' }, playerCycle(s, p.id)?.focus)}</p>; };

/* ---------- reflections, tournament, cycle review (player side) ---------- */
export function ReflectionCard({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const wk = weekKey(clock(s)); const ex = s.reflections.find((r) => r.playerId === p.id && r.week === wk);
  const [t, setT] = useState(ex?.text ?? ''); const [feel, setFeel] = useState(ex?.feel ?? 3); const [ok, setOk] = useState(false);
  return <section className="panel reflect" id="wrap"><h3 className="display">Friday wrap</h3><p className="small dim">Two lines on your week. It goes in your parent’s Sunday summary, in your words.</p>
    <form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'weeklyReflection', playerId: p.id, text: t, feel })) setOk(true); }}>
      <div className="feel" role="radiogroup" aria-label="How did the week feel">{['😩', '😕', '😐', '🙂', '🔥'].map((x, i) => <button type="button" role="radio" aria-checked={feel === i + 1} key={x} className={feel === i + 1 ? 'on' : ''} onClick={() => setFeel(i + 1)}>{x}</button>)}</div>
      <label className="sr" htmlFor="wr">Your week</label><textarea id="wr" className="input" rows={2} maxLength={280} value={t} onChange={(e) => setT(e.target.value)} placeholder="What clicked? What’s still hard?" />
      <button className="btn" disabled={t.trim().length < 3}>{ex ? 'Update wrap' : 'Save wrap'}</button>{(ok || ex) && <span className="small"> ✓ Saved for this week</span>}</form></section>;
}
export function TournamentBox({ p }: { p: Player }) {
  const { run } = useStore(); const [d, setD] = useState('');
  return <section className="panel"><h3 className="display">Next tournament</h3>{p.tournamentDate ? <p>{shortWhen(p.tournamentDate)} <button className="link small" onClick={() => run({ type: 'setTournament', playerId: p.id, date: null })}>Clear</button></p> : <p className="small dim">Add it so your coach can plan around it{p.tier === 'Inner Circle' ? ' and send your pre-tournament game plan' : ''}.</p>}
    <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (d) run({ type: 'setTournament', playerId: p.id, date: new Date(d + 'T09:00').toISOString() }).then(() => setD('')); }}><label className="sr" htmlFor="td">Tournament date</label><input id="td" className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} style={{ maxWidth: 200 }} /><button className="btn sm ghost" disabled={!d}>Save date</button></form></section>;
}
export function CycleReviewPlayer({ p, me }: { p: Player; me: 'player' | 'parent' }) {
  const s = useSnap(); const { run } = useStore(); const c = playerCycle(s, p.id); const cr = s.cycleReviews.filter((x) => x.playerId === p.id).sort((a, b) => (b.coachAt ?? b.playerAt ?? '').localeCompare(a.coachAt ?? a.playerAt ?? ''))[0];
  const [f, setF] = useState({ improved: '', hardest: '', wantNext: '' }); const open = p.state === 'Cycle review' && !s.cycleReviews.find((x) => x.cycleId === c?.id)?.playerAt;
  return <section className="panel cyclerev" id="cycle"><h3 className="display">Cycle review</h3>
    {open && me === 'player' ? <form onSubmit={(e) => { e.preventDefault(); run({ type: 'cycleReflection', playerId: p.id, ...f }); }}>
      <p className="small dim">Cycle {c?.index} (“{c?.focus}”) is done. Three quick answers, then your coach re-rates your skills and you pick the next focus together.</p>
      <label htmlFor="ci">What improved?</label><input id="ci" className="input" value={f.improved} onChange={(e) => setF({ ...f, improved: e.target.value })} />
      <label htmlFor="ch">What was hardest?</label><input id="ch" className="input" value={f.hardest} onChange={(e) => setF({ ...f, hardest: e.target.value })} />
      <label htmlFor="cw">What do you want to work on next?</label><input id="cw" className="input" value={f.wantNext} onChange={(e) => setF({ ...f, wantNext: e.target.value })} />
      <button className="btn lg" disabled={!f.improved.trim()}>Send to my coach</button></form>
      : cr ? <div className="crsum">{cr.playerAt && <p><b>{me === 'player' ? 'You' : first(p.name)}:</b> improved “{cr.improved}” · hardest “{cr.hardest}” · next “{cr.wantNext}”</p>}
        {cr.coachAt ? <><p><b>{userName(s, p.coachId)}:</b> {cr.summary}</p><p>Next focus: <b>{cr.nextFocus}</b></p><ul className="ratings">{Object.entries(cr.ratingsAfter ?? {}).map(([k, v]) => { const b = cr.ratingsBefore?.[k] ?? v; return <li key={k}>{k} <b>{b} → {v}</b>{v > b ? ' ▲' : ''}</li>; })}</ul></> : <p className="dim">Your coach is re-rating your skills and picking the next focus (within 2 business days).</p>}</div>
      : <div className="empty"><b>Every 4 weeks.</b><p className="small">{c ? `Cycle ${c.index} review on ${shortWhen(c.endAt)} (or after your last rep).` : 'Starts after your first plan.'} You’ll say what improved; your coach re-rates your skills and picks the next focus with you.</p></div>}
  </section>;
}

/* ---------- unified inbox: messages + notifications in one list ---------- */
type Filter = 'all' | 'messages' | 'feedback' | 'schedule' | 'alerts';
const ICON: Record<string, string> = { reply_due_soon: '⏳', overdue: '🚨', new_submission: '📥', feedback_ready: '✅', invite_accepted: '🤝', plan_published: '🗺️', cycle_review: '🔁', signoff_needed: '✍️', new_application: '📝', invite_expired: '⌛', new_message: '✉️', digest_ready: '📰', promise_risk: '🛡️', rhythm: '🗓️', question: '❓' };
const QUICK = ['Got it 👍', 'Yes, do that.', 'Good question. Let’s cover it at your next session.'];
export function ReplyExpectation({ p, m }: { p: Player; m: Message }) {
  const s = useSnap(); if (m.from === 'coach' || m.answered || !m.dueBy) return null; const t = clock(s); const oh = s.settings.officeHours;
  return <span className="expect small">⏱ Coach replies by <b>{shortWhen(m.dueBy)}</b> ({m.context === 'urgent' ? `urgent: ${s.settings.urgentReplyHours} office hours` : `${p.tier}: ${tierReply(s, p)}`}){oh && !inOffice(t, oh) ? ` · coach is off now, back ${shortWhen(nextOpen(t, oh).toISOString())}` : ''}</span>;
}
export function UnifiedInbox({ players, me, fixedPlayer }: { players: Player[]; me: 'player' | 'parent' | 'coach' | 'ops'; fixedPlayer?: boolean }) {
  const s = useSnap(); const { as, run } = useStore(); const [sp, setSp] = useSearchParams(); const nav = useNavigate(); const t = clock(s);
  const [f, setF] = useState<Filter>((sp.get('f') as Filter) || 'all'); const ids = new Set(players.map((p) => p.id)); const fam = me === 'player' || me === 'parent';
  const threads = useMemo(() => { const m = new Map<string, Message[]>(); for (const x of s.messages.filter((y) => ids.has(y.playerId)).sort((a, b) => a.at.localeCompare(b.at))) { const k = `${x.playerId}|${threadKey(x)}`; m.set(k, [...(m.get(k) ?? []), x]); } return [...m.entries()].map(([k, ms]) => ({ k, ms, last: ms.at(-1)!, p: players.find((p) => p.id === ms[0].playerId)!, waiting: ms.filter((x) => x.from !== 'coach' && !x.answered), unread: ms.filter((x) => as && x.authorId !== as.id && !x.readBy?.[as.id]).length })); }, [s, players, as]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = s.notifications.filter((n) => n.userId === as?.id && (!n.playerId || ids.has(n.playerId) || !fixedPlayer)).sort((a, b) => b.at.localeCompare(a.at));
  const ctxOf = (x: (typeof threads)[number]) => x.last.context ?? 'general';
  const shownThreads = threads.filter((x) => f === 'all' || f === 'messages' || (f === 'feedback' && ['feedback', 'rep', 'gameplan'].includes(ctxOf(x))) || (f === 'schedule' && ['schedule', 'urgent'].includes(ctxOf(x)))).sort((a, b) => (b.waiting.length - a.waiting.length) || b.last.at.localeCompare(a.last.at));
  const shownNotes = f === 'all' || f === 'alerts' ? notes.filter((n) => f === 'alerts' || !n.readAt) : [];
  const selKey = sp.get('t') ? `${sp.get('p') ?? players[0]?.id}|${sp.get('t')}` : null; const sel = threads.find((x) => x.k === selKey) ?? (selKey ? null : null);
  const pick = (k: string | null) => { const n = new URLSearchParams(sp); if (k) { const [pid, tk] = k.split('|'); n.set('p', pid); n.set('t', tk); } else { n.delete('t'); } setSp(n); };
  const fix = (link: string) => (me === 'parent' && link.startsWith('/app') ? link.replace(/^\/app(\/(inbox|messages))?/, '/parent') : link);
  return <div className="uinbox">
    <div className="chips" role="group" aria-label="Filter inbox">{([['all', 'All'], ['messages', 'Messages'], ['feedback', 'Feedback & reps'], ['schedule', 'Schedule'], ['alerts', 'Alerts']] as const).map(([k, l]) => <button key={k} aria-pressed={f === k} className={`chip ${f === k ? 'on' : ''}`} onClick={() => setF(k)}>{l}{k === 'alerts' && notes.some((n) => !n.readAt) ? <b>{notes.filter((n) => !n.readAt).length}</b> : null}</button>)}
      {notes.some((n) => !n.readAt) && <button className="chip" onClick={() => run({ type: 'markNotificationsRead' })}>Mark alerts read</button>}</div>
    <div className="ugrid">
      <ol className="ulist" aria-label="Conversations and alerts">
        {shownThreads.map((x) => <li key={x.k}><button className={`urow ${sel?.k === x.k ? 'on' : ''} ${x.waiting.length ? 'waiting' : ''} c-${ctxOf(x)}`} onClick={() => pick(x.k)}>
          <span className="uicon" aria-hidden>{ctxOf(x) === 'urgent' ? '🚨' : ctxOf(x) === 'feedback' ? '❓' : ctxOf(x) === 'schedule' ? '🗓️' : ctxOf(x) === 'gameplan' ? '🏆' : '✉️'}</span>
          <span className="grow"><b>{threadTitle(s, x.last)}</b>{!fixedPlayer && players.length > 1 && <span className="small"> · {x.p.name}</span>}<span className="small block dim">{x.last.from === 'coach' ? first(userName(s, x.last.authorId)) : x.last.from === 'parent' ? family(s, x.p).parentName : first(x.p.name)}: {x.last.text.slice(0, 70)}</span></span>
          <span className="small">{x.waiting.length ? (me === 'coach' ? <span className={`sla ${new Date(x.waiting[0].dueBy ?? '').getTime() < t.getTime() ? 'late' : ''}`}><b>Reply</b>{relative(x.waiting[0].dueBy ?? t.toISOString(), t)}</span> : <span className="dim">reply {relative(x.waiting[0].dueBy ?? t.toISOString(), t)}</span>) : relative(x.last.at, t)}{x.unread > 0 && <i className="dotn" aria-label="unread" />}</span></button></li>)}
        {shownNotes.map((n) => <li key={n.id}><Link className={`urow note ${n.readAt ? '' : 'unread'}`} to={fix(n.link)} onClick={() => !n.readAt && run({ type: 'markNotificationsRead', ids: [n.id] })}><span className="uicon" aria-hidden>{ICON[n.type] ?? '•'}</span><span className="grow">{n.text}<span className="small block dim">{relative(n.at, t)}{n.emailedAt ? ' · emailed' : ''}</span></span></Link></li>)}
        {shownThreads.length + shownNotes.length === 0 && <li className="empty"><b>{f === 'alerts' ? 'No alerts.' : 'Nothing here yet.'}</b><p className="small">{fam ? `Start a conversation below. ${s.users.find((u) => u.id === players[0]?.coachId)?.name ?? 'Your coach'} replies ${players[0] ? tierReply(s, players[0]) : ''}, and every message shows when to expect it.` : 'Family messages land here with their reply-by time, and in your Action Center.'}</p></li>}
      </ol>
      <div className="uthread">{sel ? <ThreadView key={sel.k} p={sel.p} me={me === 'ops' ? 'coach' : me} ms={sel.ms} onBack={() => pick(null)} />
        : me !== 'ops' && players[0] && <NewThread p={sp.get('p') ? players.find((x) => x.id === sp.get('p')) ?? players[0] : players[0]} me={me === 'coach' ? 'coach' : me} players={players} onSent={(k) => pick(k)} />}
        {sel && threadLink(s, sel.last, fam) && <button className="link small" onClick={() => nav(threadLink(s, sel.last, fam))}>Open the {sel.last.context === 'feedback' ? 'feedback' : 'rep'} this is about →</button>}</div>
    </div></div>;
}
function ThreadView({ p, me, ms, onBack }: { p: Player; me: 'player' | 'parent' | 'coach'; ms: Message[]; onBack: () => void }) {
  const s = useSnap(); const { run, as } = useStore(); const [t, setT] = useState(''); const [link, setLink] = useState(''); const [showLink, setShowLink] = useState(false); const head = ms[0];
  const unread = ms.some((m) => as && m.authorId !== as.id && !m.readBy?.[as.id]);
  useEffect(() => { if (unread) run({ type: 'markRead', playerId: p.id }); }, [unread, p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = (m: Message) => (m.from === 'coach' ? userName(s, m.authorId) : m.from === 'parent' ? family(s, p).parentName : p.name);
  const seen = (m: Message) => Object.keys(m.readBy ?? {}).filter((u) => u !== m.authorId).map((u) => first(userName(s, u))).filter((n) => n !== 'Unassigned');
  const sendCtx = (text: string) => run({ type: 'sendMessage', playerId: p.id, text, linkUrl: link.trim() || undefined, context: head.context ?? 'general', refId: head.refId ?? undefined }).then((r) => { if (r) { setT(''); setLink(''); setShowLink(false); } });
  const fb = head.context === 'feedback' ? s.reviews.find((r) => r.id === head.refId) : undefined;
  return <div className="thread"><div className="row between"><button className="link small" onClick={onBack}>← All</button><span className="kicker">{threadTitle(s, head)} · {p.name}</span></div>
    {fb && <FeedbackCard p={p} r={fb} me={me} compact />}
    <ul aria-live="polite">{ms.map((m) => <li key={m.id} className={`msg ${m.from === me || (me === 'coach' && m.from === 'coach') ? 'mine' : ''} from-${m.from}`}><span className="small muted">{who(m)} · {shortWhen(m.at)}{m.context === 'urgent' ? ' · URGENT' : ''}</span><p>{m.text}</p>
      {m.linkUrl && <a className="attach" href={m.linkUrl} target="_blank" rel="noreferrer noopener">🔗 {m.linkUrl.replace(/^https?:\/\//, '').slice(0, 48)}</a>}
      <ReplyExpectation p={p} m={m} />{(m.from === me || (me === 'coach' && m.from === 'coach')) && <span className="receipt small">{seen(m).length ? `✓✓ Seen by ${seen(m).join(', ')}` : '✓ Sent'}</span>}</li>)}</ul>
    {me === 'coach' && <div className="row wrapx quick">{[...QUICK, ...(s.settings.savedReplies ?? [])].map((x) => <button key={x} className="chip" onClick={() => setT(x)}>{x.length > 34 ? x.slice(0, 32) + '…' : x}</button>)}</div>}
    <form className="composer" onSubmit={(e) => { e.preventDefault(); if (t.trim()) sendCtx(t.trim()); }}>
      <div className="row gap"><label className="sr" htmlFor="msg">Reply</label><input id="msg" className="input grow" value={t} onChange={(e) => setT(e.target.value)} placeholder="Write a reply" />
        <button type="button" className="chip" aria-pressed={showLink} onClick={() => setShowLink(!showLink)} title="Attach a link">🔗</button><button className="btn" disabled={!t.trim()}>Send</button></div>
      {showLink && <input aria-label="Link URL" className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (links only, no uploads)" />}</form></div>;
}
function NewThread({ p: p0, me, players, onSent }: { p: Player; me: 'player' | 'parent' | 'coach'; players: Player[]; onSent: (k: string) => void }) {
  const s = useSnap(); const { run } = useStore(); const [pid, setPid] = useState(p0.id); const p = players.find((x) => x.id === pid) ?? p0; const [t, setT] = useState('');
  const opts: MessageContext[] = me === 'parent' ? ['general', 'schedule', 'urgent'] : me === 'coach' ? ['general', 'schedule', 'gameplan'] : ['general', 'schedule'];
  const [ctx, setCtx] = useState<MessageContext>('general'); const t0 = clock(s); const oh = s.settings.officeHours;
  return <form className="panel newthread" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'sendMessage', playerId: p.id, text: t, context: ctx })) { setT(''); onSent(`${p.id}|${ctx}:`); } }}>
    <h3 className="display">New message{me === 'coach' ? '' : ` to ${userName(s, p.coachId)}`}</h3>
    {me === 'coach' && players.length > 1 && <label className="picker small">To <select value={pid} onChange={(e) => setPid(e.target.value)}>{players.map((x) => <option key={x.id} value={x.id}>{x.name} & family</option>)}</select></label>}
    <div className="seg light" role="radiogroup" aria-label="Message type">{opts.map((o) => <button type="button" role="radio" aria-checked={ctx === o} key={o} className={ctx === o ? 'on' : ''} onClick={() => setCtx(o)}>{CTX_LABEL[o]}</button>)}</div>
    <label className="sr" htmlFor="nm">Message</label><textarea id="nm" className="input" rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder={ctx === 'urgent' ? 'Injury, emergency, or a change today' : ctx === 'schedule' ? 'e.g. Away this weekend, back Tuesday' : ctx === 'gameplan' ? 'Pre-tournament game plan' : 'Write a message'} />
    {me !== 'coach' && <p className="small dim">⏱ {ctx === 'urgent' ? `Urgent: reply within ${s.settings.urgentReplyHours} office hours; the head coach is alerted too.` : `Reply ${tierReply(s, p)} on ${p.tier}.`}{oh && !inOffice(t0, oh) ? ` Coach is off now; back ${shortWhen(nextOpen(t0, oh).toISOString())}.` : ''}</p>}
    <button className="btn" disabled={!t.trim()}>Send</button></form>;
}

/* ---------- coach: next queue item ---------- */
export function useNextItem(skipKey?: string) { const s = useSnap(); const { as } = useStore(); return buildQueue(s, as?.id).filter((x) => OWED(x.kind) && x.key !== skipKey)[0]; }
export function useNextShortcut() {
  const next = useNextItem(); const nav = useNavigate();
  useEffect(() => { const h = (e: KeyboardEvent) => { const el = e.target as HTMLElement; if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return; if (next) { e.preventDefault(); nav(next.to); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [next, nav]);
  return next;
}
export const plain = plainFeedback;
