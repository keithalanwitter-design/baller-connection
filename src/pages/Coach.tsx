import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { perspective, useSnap, useStore } from '../store';
import { TIER_INFO, replyLabel, type TimedNote, type Billing, type Drill, type Player, type Settings, type Tier } from '../../shared/domain';
import { relative, shortWhen, weekKey } from '../../shared/time';
import { OPS_KINDS, QUEUE_KINDS, buildOpsQueue, buildQueue, capacity, clock, family, first, guide, lastSubmission, pendingReview, playerAssignments, playerCycle, staff, teamLoad, tierReply, userName, type OpsKind, type QueueKind } from '../../shared/workflow';
import { playerCsv, calendarIcs } from '../../server/export';
import { ActionButton, Back, Moments, PathPanel, Pill, Rubric, Track, UserMenu } from '../ui';
import SystemLog from './Log';
import Inbox from './Inbox';
import { CoachKnows, FeedbackCard, FeedbackTimeline, PromiseCard, UnifiedInbox, WeekRhythm, useNextItem, useNextShortcut } from '../v4';
import { coachKnows, feedbackTemplate, repWhy } from '../../shared/personal';
import { promiseRisks } from '../../shared/promises';
import { sha256 } from '../../shared/sha256';
import { DEMO_INVITE } from '../../shared/seed';
import { lastReview, OWED } from '../../shared/workflow';
import { ClipPlayer, NoteList, fmtSpent, useReviewTimer } from '../v5';
import { fmtT } from '../../shared/clips';
import { CoachBilling, Outbox } from '../v6';
import { PressureBadge, ShotSummary, StoryEditor, WinsWall } from '../v7';
import { shotsFor } from '../../shared/games';
import { CheckInForm, GameNotes, ParentNoteForm, ProbeForm, SessionForm, SinceWeek1 } from '../v9';
import { latestSession, parentSentence, sessionLine } from '../../shared/v9';
import { DEFAULT_COACH_PROFILE, PRESSURE_LABEL, type Pressure } from '../../shared/domain';

const k = (x: string) => x.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
const download = (name: string, text: string, type = 'text/csv') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
function useBase() { const { as } = useStore(); return as?.role === 'ops' ? '/ops' : '/coach'; }

function Capacity() {
  const s = useSnap(); const c = capacity(s);
  return <div className="capacity" aria-label={`Roster ${c.used} of ${c.max}`}><div className="row between small"><span>Roster <b>{c.used}/{c.max}</b></span><span>Inner Circle <b>{c.inner}/{c.innerMax}</b></span>{c.waitlist > 0 && <span>Waitlist <b>{c.waitlist}</b></span>}</div><div className="capbar">{Array.from({ length: c.max }, (_, i) => <i key={i} className={i < c.used ? 'on' : ''} />)}</div></div>;
}
/** Every queue row answers: what · why · who (owner) · by when · what unlocks. */
function QRow({ i, to, name, kind, state, what, why, owner, unlocks, dueBy, overdue }: { i: number; to: string; name: string; kind: string; state: string; what: string; why: string; owner?: string; unlocks: string; dueBy?: string; overdue: boolean }) {
  const s = useSnap(); const t = clock(s);
  return <li><Link to={to} className={`qrow k-${k(kind)} ${overdue ? 'overdue' : ''}`}>
    <span className="rank">{i + 1}</span>
    <span className="grow"><span className="row gap wrapx"><strong>{name}</strong><span className="kind">{kind}</span><Pill state={state} />{owner && <span className="owner">→ {owner}</span>}</span>
      <span className="small block">{what}</span><span className="small dim block qwhy">Why: {why} · Unlocks: {unlocks}</span></span>
    {dueBy ? <span className={`sla ${overdue ? 'late' : ''}`}><b>{overdue ? 'OVERDUE' : 'Due'}</b>{relative(dueBy, t)}</span> : <span className="sla soft"><b>No SLA</b>—</span>}<span aria-hidden className="chev">›</span></Link></li>;
}

function ActionCenter() {
  const s = useSnap(); const { as } = useStore(); const isHead = as?.role === 'head'; const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const q = buildQueue(s, scope === 'mine' || !isHead ? as?.id : undefined); const [f, setF] = useState<QueueKind | 'All'>('All'); const t = clock(s);
  const urgent = q.filter((x) => OWED(x.kind)).length; const overdue = q.filter((x) => x.overdue).length; const rows = q.filter((x) => f === 'All' || x.kind === f); const { run } = useStore(); const next = useNextItem();
  const safeSign = q.filter((x) => x.kind === 'Sign-off' && pendingReview(s, x.player.id)?.decision === 'approve');
  return (<>
    <div className="row between wrapx"><div><p className="kicker">{t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · {as?.name}</p><h1 className="display">Action Center</h1>
      <p className="lead sm">{urgent === 0 ? 'You’re clear. Nobody is waiting on you.' : <>{urgent} {urgent === 1 ? 'thing needs' : 'things need'} you{overdue ? <>, <b className="overdue-t">{overdue} overdue</b></> : ''}. Most urgent first.</>}</p></div><Capacity /></div>
    {next && <Link className="nextbar" to={next.to}><span className="kicker">Next up · press N</span><b>{next.player.name}: {next.kind}</b><span className="small">{next.what}</span><span className="btn sm">Open →</span></Link>}
    {isHead && safeSign.length > 1 && <button className="btn sm ghost" onClick={async () => { for (const x of safeSign) await run({ type: 'signOff', playerId: x.player.id, approve: true }); }}>Sign off all {safeSign.length} approvals as written</button>}
    <WeekRhythm role="coach" />
    {(() => { const wk = weekKey(t); const mine = s.reviews.filter((r) => r.reviewerId === as?.id && r.secondsSpent && weekKey(new Date(r.at)) === wk); const avg = mine.length ? Math.round(mine.reduce((x, r) => x + (r.secondsSpent ?? 0), 0) / mine.length) : 0; return mine.length ? <p className="small dim" id="avgtime">⏱ Your reviews this week: {mine.length}, average {fmtSpent(avg)} (target under 5:00).</p> : null; })()}
    <div className="row gap wrapx">
      {isHead && <div className="seg light" role="group" aria-label="Whose queue"><button aria-pressed={scope === 'mine'} className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>Mine</button><button aria-pressed={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Whole team</button></div>}
      <div className="chips" role="group" aria-label="Filter queue">
        <button aria-pressed={f === 'All'} className={`chip ${f === 'All' ? 'on' : ''}`} onClick={() => setF('All')}>All <b>{q.length}</b></button>
        {QUEUE_KINDS.filter((kind) => f === kind || q.some((x) => x.kind === kind)).map((kind) => <button key={kind} aria-pressed={f === kind} className={`chip k-${k(kind)} ${f === kind ? 'on' : ''}`} onClick={() => setF(kind)}>{kind} <b>{q.filter((x) => x.kind === kind).length}</b></button>)}
      </div></div>
    <ol className="queue">{rows.map((x, i) => <QRow key={x.key} i={i} to={x.to} name={x.player.name} kind={x.kind} state={x.player.state} what={x.what} why={x.why} owner={scope === 'all' ? x.ownerName : undefined} unlocks={x.unlocks} dueBy={x.dueBy} overdue={x.overdue} />)}
      {rows.length === 0 && <li className="panel dim">Nothing in this lane.</li>}</ol>
    <p className="small dim">Routed to the assigned coach; assistant reviews go to the head coach. “Due soon” items appear before a promise to a family is at risk. Press <kbd>N</kbd> anywhere to open the next item.</p>
  </>);
}

function OpsQueue() {
  const s = useSnap(); const q = buildOpsQueue(s); const [f, setF] = useState<OpsKind | 'All'>('All'); const rows = q.filter((x) => f === 'All' || x.kind === f); const t = clock(s);
  return (<>
    <div className="row between wrapx"><div><p className="kicker">{t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · Ops</p><h1 className="display">Ops queue</h1><p className="lead sm">Intake, invites, billing status, scheduling and privacy requests. No coaching calls here.</p></div><Capacity /></div>
    <div className="chips" role="group" aria-label="Filter ops queue"><button aria-pressed={f === 'All'} className={`chip ${f === 'All' ? 'on' : ''}`} onClick={() => setF('All')}>All <b>{q.length}</b></button>
      {OPS_KINDS.filter((kind) => f === kind || q.some((x) => x.kind === kind)).map((kind) => <button key={kind} aria-pressed={f === kind} className={`chip ${f === kind ? 'on' : ''}`} onClick={() => setF(kind)}>{kind} <b>{q.filter((x) => x.kind === kind).length}</b></button>)}</div>
    <ol className="queue">{rows.map((x, i) => <QRow key={x.key} i={i} to={x.to} name={x.player.name} kind={x.kind} state={x.player.state} what={x.what} why={x.why} unlocks={x.unlocks} dueBy={x.dueBy} overdue={x.overdue} />)}
      {rows.length === 0 && <li className="panel dim">Nothing in this lane.</li>}</ol>
  </>);
}

function Review() {
  const { id } = useParams(); const s = useSnap(); const { run, as } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const sub = p && lastSubmission(s, p.id); const a = sub && s.assignments.find((x) => x.id === sub.assignmentId);
  const pend = p && pendingReview(s, p.id); const [f, setF] = useState({ wentWell: '', adjust: '', why: '', linkUrl: '' }); const [edit, setEdit] = useState<{ wentWell?: string; adjust?: string; why?: string }>({});
  const next = useNextItem(); const [focused, setFocused] = useState<'wentWell' | 'adjust' | 'why'>('adjust'); const [notes, setNotes] = useState<TimedNote[]>([]); const [prefilled, setPrefilled] = useState('');
  const vid = useRef<HTMLVideoElement | null>(null); const secs = useReviewTimer(sub?.id ?? '');
  const drill = a?.drillId ? s.drills.find((x) => x.id === a.drillId) : undefined; const clip = sub?.clipId ? s.clips.find((c) => c.id === sub.clipId) : undefined;
  const mine = s.reviews.filter((r) => r.reviewerId === as?.id && r.wentWell).sort((x, y) => y.at.localeCompare(x.at))[0];
  // Prefill once per submission: the drill's saved template, else the player's current focus as the "why" anchor.
  useEffect(() => { if (!sub || prefilled === sub.id) return; setPrefilled(sub.id); setNotes([]); const cy = p && playerCycle(s, p.id); if (drill?.fbTemplate) setF({ ...drill.fbTemplate, linkUrl: '' }); else setF({ wentWell: '', adjust: '', why: cy && p?.goal ? `It builds your focus (${cy.focus}) toward your goal: ${p.goal.toLowerCase()}.` : '', linkUrl: '' }); }, [sub?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = f.wentWell.trim().length >= 3 && f.adjust.trim().length >= 3 && f.why.trim().length >= 3;
  const goNext = () => { const q = buildQueue(s, as?.id).filter((x) => OWED(x.kind) && x.player.id !== p?.id)[0]; nav(q ? q.to : '/coach'); };
  const act = async (decision: 'approve' | 'retry') => { if (!p || !ready) return; if (await run({ type: 'review', playerId: p.id, decision, wentWell: f.wentWell, adjust: f.adjust, why: f.why, linkUrl: f.linkUrl.trim() || undefined, notes: notes.filter((n) => n.text.trim()), secondsSpent: secs, rev: p.rev })) goNext(); };
  // Keyboard: J/K frame step (outside text fields), ⌘/Ctrl+Enter approve, ⌘/Ctrl+Shift+Enter same rep again. N (next item) is global.
  useEffect(() => { const h = (e: KeyboardEvent) => { const el = e.target as HTMLElement; const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && p?.state !== 'Sign-off') { e.preventDefault(); act(e.shiftKey ? 'retry' : 'approve'); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return; const v = vid.current; if (!v) return; const k = e.key.toLowerCase();
    if (k === 'j' || k === 'k') { e.preventDefault(); v.pause(); v.currentTime = Math.max(0, v.currentTime + (k === 'j' ? -1 : 1) / 30); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); });
  if (!p || !sub || !a || !['Submitted', 'Feedback due', 'Sign-off'].includes(p.state)) return <div className="panel"><h2 className="display">Nothing to review</h2><p>This work was already reviewed.</p><div className="row gap">{next && <Link className="btn" to={next.to}>Next: {next.player.name} · {next.kind} →</Link>}<Link className="btn ghost" to="/coach">Action Center</Link></div></div>;
  const queued = playerAssignments(s, p.id).filter((x) => x.status === 'queued'); const late = new Date(sub.dueBy) < clock(s); const tpl = feedbackTemplate(p); const prev = lastReview(s, p.id); const cyc = playerCycle(s, p.id);
  const sign = async (approve: boolean) => { if (await run({ type: 'signOff', playerId: p.id, approve, edit, rev: p.rev })) goNext(); };
  const signoffRule = s.settings.requireSignoff && as?.role === 'assistant';
  const cues = [...new Set([...a.cues, ...(cyc ? [`Focus: ${cyc.focus}`] : []), ...(prev?.adjust ? [`Last time: ${prev.adjust}`] : [])])];
  const LABEL = { wentWell: 'What they did well', adjust: 'One adjustment', why: 'Why (tie it to their goal)' } as const;
  const addNote = (t: number) => { setNotes((n) => [...n, { t, text: '' }].sort((x, y) => x.t - y.t)); setTimeout(() => (document.querySelector('.tnote-edit input:placeholder-shown') as HTMLInputElement | null)?.focus(), 30); };
  return (
    <div className="review review5">
      <Back to="/coach">Action Center</Back>
      <div className="row between wrapx"><h1 className="display">{p.state === 'Sign-off' ? 'Sign-off' : 'Review'}: {p.name}</h1>
        <div className="row gap"><span className={`rtimer ${secs > 300 ? 'over' : ''}`} aria-label="Time on this review" title="Target: under 5 minutes">⏱ {fmtSpent(secs) === '—' ? '0:00' : fmtSpent(secs)}<small> / 5:00</small></span><span className={`sla big ${late ? 'late' : ''}`}><b>{late ? 'OVERDUE' : 'Reply by'}</b>{shortWhen(sub.dueBy)}</span></div></div>
      <p className="dim">Focus: {cyc?.focus} · {p.tier} (replies {tierReply(s, p)}) · Age {p.age} · Learns by “{p.learnStyle}”: {tpl.label}{p.age < 13 ? ' · under 13: short sentences, one idea' : ''}</p>
      <div className="reviewgrid">
        <section className="panel rv-left"><p className="kicker">Submitted {shortWhen(sub.at)} · {a.title} · <b>{sub.repsDone}/{a.reps}</b> sets</p>
          {clip ? <ClipPlayer clip={clip} onNote={p.state === 'Sign-off' ? undefined : addNote} playerRef={vid} /> : sub.clipId ? <p className="small dim">🎥 Clip removed.</p> : <p className="small dim">No clip this time: reps and reflection only.</p>}
          <blockquote className="quote sm">“{sub.reflection}”</blockquote><PressureBadge pr={a.pressure} /><ShotSummary shots={sub.shots} />{sub.linkUrl && <a className="attach" href={sub.linkUrl} target="_blank" rel="noreferrer noopener">🔗 {sub.linkUrl}</a>}
          <p className="small"><b>In their words:</b> {coachKnows(p) || '—'}</p>{p.canvas && <p className="small dim"><b>Your canvas:</b> {p.canvas}</p>}
          {prev && <details><summary className="small">Previous feedback ({shortWhen(prev.at)})</summary><FeedbackCard p={p} r={prev} me="coach" compact /></details>}
        </section>
        {p.state === 'Sign-off' && pend ? (
        <section className="panel signoff"><p className="kicker">{userName(s, pend.reviewerId)} · {shortWhen(pend.at)} · proposed: <b>{pend.decision === 'approve' ? 'Move on' : 'Same rep again'}</b>{pend.secondsSpent ? ` · ⏱ ${fmtSpent(pend.secondsSpent)}` : ''}</p>
          {as?.role === 'head' ? <>
            {(['wentWell', 'adjust', 'why'] as const).map((k) => <div key={k}><label htmlFor={`ed-${k}`} className="strong">{LABEL[k]}</label><input id={`ed-${k}`} className="input" value={edit[k] ?? pend[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>)}
            {pend.notes && pend.notes.length > 0 && <NoteList notes={pend.notes} />}
            <p className="small dim">Next rep: {pend.nextRep}</p>
            <div className="outcomes"><button className="outcome ok" onClick={() => sign(true)}><b>Sign off{Object.keys(edit).length ? ' with edits' : ''}</b><span>{first(p.name)} → {pend.decision === 'approve' ? 'Next step ready' : 'Work ready (same rep again)'}.</span></button>
              <button className="outcome retry" onClick={() => sign(false)}><b>Flip to {pend.decision === 'approve' ? 'Same rep again' : 'Move on'}</b><span>Overrides the assistant’s call. Logged.</span></button></div>
          </> : <><FeedbackCard p={p} r={pend} me="coach" compact /><p className="dim">Waiting for {userName(s, s.users.find((u) => u.role === 'head')?.id)} to sign off. The family sees “head coach checking it”.</p></>}
        </section>) : (
        <section className="panel composer4 rv-right">
          <div className="row between wrapx"><p className="kicker">Feedback · same parts every time</p><span className="row gap">
            {mine && <button type="button" id="reuse" className="chip" onClick={() => setF({ wentWell: mine.wentWell, adjust: mine.adjust, why: mine.why, linkUrl: '' })} title="Copy the structure of your last review, then edit">↺ Reuse last structure</button>}
            {drill && <button type="button" id="savetpl" className="chip" disabled={!ready} onClick={() => run({ type: 'saveDrillFeedback', drillId: drill.id, fbTemplate: { wentWell: f.wentWell, adjust: f.adjust, why: f.why } })}>☆ Save as “{drill.title}” template</button>}</span></div>
          {drill?.fbTemplate && <p className="small dim">Prefilled from your “{drill.title}” template. Edit to fit this rep.</p>}
          {tpl.order.map((k) => <div key={k}><label htmlFor={`f-${k}`} className="strong">{LABEL[k]}</label><textarea rows={k === 'why' ? 2 : 1} id={`f-${k}`} className="input" value={f[k]} onFocus={() => setFocused(k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={tpl.hint[k]} /></div>)}
          <div className="row wrapx" aria-label="Quick-pick cues"><span className="small dim">Tap a cue → {LABEL[focused].toLowerCase()}:</span>{cues.map((x) => <button key={x} type="button" className="chip" onClick={() => setF((v) => ({ ...v, [focused]: v[focused] ? `${v[focused]} ${x.replace(/^(Focus|Last time): /, '')}` : x.replace(/^(Focus|Last time): /, '') }))}>+ {x}</button>)}</div>
          {clip && <div className="tnote-edit"><p className="strong small">Clip notes {notes.length ? `(${notes.length})` : ''}<span className="dim"> · pause and tap “📍 Note” on the clip</span></p>
            {notes.map((n, i) => <div key={i} className="row gap"><button type="button" className="tstamp" onClick={() => { if (vid.current) { vid.current.currentTime = n.t; vid.current.pause(); } }}>{fmtT(n.t)}</button><input aria-label={`Note at ${fmtT(n.t)}`} className="input grow" value={n.text} placeholder="hips high on gather" onChange={(e) => setNotes(notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /><button type="button" className="link small" aria-label="Remove note" onClick={() => setNotes(notes.filter((_, j) => j !== i))}>✕</button></div>)}</div>}
          <p className="small"><b>Next rep (automatic):</b> {queued.length ? queued[0].title : 'Cycle wrap-up and review'} · or the same rep again if you pick that.</p>
          <details className="small"><summary>Add a link (optional)</summary><label htmlFor="f-link" className="sr">Link</label><input id="f-link" className="input" type="url" value={f.linkUrl} onChange={(e) => setF({ ...f, linkUrl: e.target.value })} placeholder="https://" /></details>
          {signoffRule && <p className="note">Your reviews go to the head coach for sign-off before {first(p.name)} sees them.</p>}
          <div className="outcomes">
            <button className="outcome ok" disabled={!ready} onClick={() => act('approve')}><b>Approve</b><span>{signoffRule ? 'After sign-off: ' : ''}{first(p.name)} says the adjustment back (optional) → {queued.length ? `${queued[0].title} is next` : 're-check'}. <kbd>⌘/Ctrl ↵</kbd></span></button>
            <button className="outcome retry" disabled={!ready} onClick={() => act('retry')}><b>Same rep again</b><span>{signoffRule ? 'After sign-off: ' : ''}{first(p.name)} → same rep with your adjustment. <kbd>⌘/Ctrl ⇧ ↵</kbd></span></button>
          </div>
          <p className="small dim">Keys: <kbd>J</kbd>/<kbd>K</kbd> frame step · <kbd>N</kbd> next item. After you send, the next item opens.</p>
        </section>)}
      </div>
    </div>
  );
}

function AdjustPlan({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const c = playerCycle(s, p.id); const [open, setOpen] = useState(false); const [note, setNote] = useState(''); const [add, setAdd] = useState('');
  if (!c || c.status !== 'active' || !['Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Sign-off', 'Next step ready'].includes(p.state)) return null;
  return <section className="panel" id="adjust"><div className="row between"><h3 className="display">Plan</h3><span className="small dim">{c.adjustedAt ? `Adjusted ${shortWhen(c.adjustedAt)}` : `Set ${shortWhen(c.startAt)}`} · cycle review {shortWhen(c.endAt)}</span></div>
    {!open ? <button className="btn sm ghost" onClick={() => setOpen(true)}>Adjust plan</button> : <form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'adjustPlan', playerId: p.id, note, addDrillIds: add ? [add] : [] })) { setOpen(false); setNote(''); setAdd(''); } }}>
      <label htmlFor="an">What changed and why (the family sees this)</label><input id="an" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adding tempo work: control is there now" />
      <label htmlFor="ad">Add a rep (optional)</label><select id="ad" className="input" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">— none —</option>{s.drills.filter((d) => !d.archived).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
      <div className="row gap"><button className="btn sm" disabled={note.trim().length < 3}>Save adjustment</button><button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button></div></form>}</section>;
}

function CycleReviewCoach() {
  const { id } = useParams(); const s = useSnap(); const { run } = useStore(); const nav = useNavigate(); const p = s.players.find((x) => x.id === id);
  const c = p && playerCycle(s, p.id); const cr = c && s.cycleReviews.find((x) => x.cycleId === c.id);
  const [r, setR] = useState<Record<string, number>>(p?.rubric ?? {}); const [sum, setSum] = useState(''); const [nf, setNf] = useState(cr?.wantNext ?? '');
  if (!p || !c) return <p>Player not found.</p>;
  if (p.state !== 'Cycle review') return <><Back to={`/coach/player/${p.id}`}>{p.name}</Back><div className="panel"><h2 className="display">No cycle review open</h2><p>Cycle {c.index} review is due {shortWhen(c.endAt)}. It opens when the cycle ends or the last rep is done.</p></div></>;
  const subs = s.submissions.filter((x) => x.playerId === p.id && s.assignments.find((a) => a.id === x.assignmentId)?.cycleId === c.id); const appr = s.reviews.filter((x) => x.playerId === p.id && x.decision === 'approve' && x.status === 'final' && subs.some((y) => y.id === x.submissionId)).length;
  const done = !!cr?.coachAt;
  return (<>
    <Back to={`/coach/player/${p.id}`}>{p.name}</Back>
    <h1 className="display">Cycle {c.index} review: {p.name}</h1>
    <p className="dim">Focus was “{c.focus}” · {subs.length} check-ins · {appr} approved · {shortWhen(c.startAt)} → {shortWhen(c.endAt)}</p>
    <SinceWeek1 p={p} me="coach" />
    <section className="panel"><p className="kicker">Did it show up in games?</p><GameNotes p={p} me="coach" /></section>
    <div className="grid2">
      <section className="panel"><p className="kicker">{first(p.name)}’s reflection</p>{cr?.playerAt ? <dl className="dl"><div><dt>Improved</dt><dd>{cr.improved}</dd></div><div><dt>Hardest</dt><dd>{cr.hardest}</dd></div><div><dt>Wants next</dt><dd>{cr.wantNext}</dd></div></dl> : <p className="dim">Not in yet. {first(p.name)} sees “Do my cycle review” on Today. You can go ahead without it.</p>}
        <p className="kicker">In their words</p><p>{coachKnows(p)}</p></section>
      <section className="panel"><p className="kicker">What improved: re-rate</p>
        {done ? <ul className="ratings">{Object.entries(cr!.ratingsAfter ?? {}).map(([k, v]) => <li key={k}>{k} <b>{cr!.ratingsBefore?.[k]} → {v}</b></li>)}</ul> :
        <ul className="rubric">{Object.keys(p.rubric).map((k) => <li key={k}><span>{k}</span><span className="small dim">was {p.rubric[k]}</span><span className="row"><button className="mini" aria-label={`Lower ${k}`} onClick={() => setR({ ...r, [k]: Math.max(1, (r[k] ?? p.rubric[k]) - 1) })}>−</button><b>{r[k] ?? p.rubric[k]}</b><button className="mini" aria-label={`Raise ${k}`} onClick={() => setR({ ...r, [k]: Math.min(5, (r[k] ?? p.rubric[k]) + 1) })}>+</button></span></li>)}</ul>}</section>
    </div>
    {done ? <div className="panel"><p>Summary sent: “{cr!.summary}” · Next focus <b>{cr!.nextFocus}</b></p><Link className="btn" to={`/coach/plan/${p.id}`}>Build cycle {c.index + 1} →</Link></div> :
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'completeCycleReview', playerId: p.id, summary: sum, ratings: r, nextFocus: nf })) nav(`/coach/plan/${p.id}`); }}>
      <label htmlFor="cs" className="strong">Summary for {first(p.name)} and family</label><textarea id="cs" className="input" rows={2} value={sum} onChange={(e) => setSum(e.target.value)} placeholder="What changed this cycle, in one or two lines" />
      <label htmlFor="cf" className="strong">Next focus</label><input id="cf" className="input" value={nf} onChange={(e) => setNf(e.target.value)} placeholder={cr?.wantNext || 'One focus for the next 4 weeks'} />
      <button className="btn lg" disabled={!sum.trim() || !nf.trim()}>Complete review → build cycle {c.index + 1}</button></form>}
  </>);
}

function Roster() {
  const s = useSnap(); const base = useBase(); const [who, setWho] = useState('all');
  const list = s.players.filter((p) => who === 'all' || p.coachId === who);
  return (<><div className="row between wrapx"><h1 className="display">Roster</h1><Capacity /></div>
    <label className="picker">Coach <select value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Everyone</option>{staff(s).filter((u) => u.role !== 'ops').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    <div className="table" role="table" aria-label="Roster">{list.map((p) => { const ls = lastSubmission(s, p.id); return (
      <Link key={p.id} to={`${base}/player/${p.id}`} className="trow r5" role="row"><span role="cell"><strong>{p.name}</strong><span className="small dim block">{p.age} · {p.position || '—'} · {p.tier}</span></span><span role="cell"><Pill state={p.state} /></span><span role="cell" className="small">{playerCycle(s, p.id)?.focus || <span className="dim">No focus yet</span>}</span><span role="cell" className="small">{first(userName(s, p.coachId))} · <span className={`bill b-${p.billing}`}>{p.billing}</span></span><span role="cell" className="small">{ls ? `Clip ${relative(ls.at, clock(s))}` : 'No clip yet'}</span></Link>); })}</div></>);
}

function StaffBox({ p }: { p: Player }) {
  const s = useSnap(); const { run, as, mode, api } = useStore(); const canAssign = as?.role === 'head' || as?.role === 'ops';
  const [when, setWhen] = useState(''); const [kind, setKind] = useState<'check-in' | 'live' | 'goal-review'>('check-in');
  const exportCsv = () => (mode === 'live' ? window.open(api.url(`/api/players/${p.id}/export.csv`)) : download(`${p.name.replace(/\W+/g, '-')}.csv`, playerCsv(s, p.id)));
  const inv = s.invites.filter((i) => i.playerId === p.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]; const consent = s.consents.find((c) => c.playerId === p.id);
  return <section className="panel"><h3 className="display">Staff</h3><dl className="dl">
    <div><dt>Coach</dt><dd>{canAssign ? <select aria-label="Assigned coach" value={p.coachId} onChange={(e) => run({ type: 'assignCoach', playerId: p.id, coachId: e.target.value })}>{staff(s).filter((u) => u.role !== 'ops').map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select> : userName(s, p.coachId)}</dd></div>
    <div><dt>Billing</dt><dd>{canAssign ? <select aria-label="Billing" value={p.billing} onChange={(e) => run({ type: 'setBilling', playerId: p.id, billing: e.target.value as Billing })}>{['unpaid', 'paid', 'comp'].map((b) => <option key={b}>{b}</option>)}</select> : p.billing} <span className="small dim">${TIER_INFO[p.tier].price}/mo · manual</span></dd></div>
    <div><dt>Consent</dt><dd>{consent ? `${consent.guardianName} · ${shortWhen(consent.at)} · v${consent.version}` : <span className="overdue-t">Not on file</span>}</dd></div>
    {inv && <div><dt>Invite</dt><dd>{inv.status} · {inv.email} · expires {shortWhen(inv.expiresAt)} <span className="small dim">(link + code stored hashed)</span></dd></div>}
  </dl>
    <form className="row gap wrapx" onSubmit={(e) => { e.preventDefault(); if (when) run({ type: 'scheduleSession', playerId: p.id, at: new Date(when).toISOString(), minutes: kind === 'check-in' ? 20 : 30, kind, note: kind === 'live' ? 'Live session' : kind === 'goal-review' ? 'Season goal review with parents' : 'Video check-in' }).then(() => setWhen('')); }}>
      <label className="sr" htmlFor="sw">Session time</label><input id="sw" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 230 }} />
      <select aria-label="Session kind" value={kind} onChange={(e) => setKind(e.target.value as 'check-in' | 'live' | 'goal-review')}><option value="check-in">Video check-in (20)</option><option value="live">Live session (30)</option><option value="goal-review">Season goal review</option></select><button className="btn sm" disabled={!when}>Schedule</button></form>
    <div className="row gap wrapx">{(p.state === 'Applied' || p.state === 'Fit review' || p.state === 'Waitlist' || p.state === 'Invited') && canAssign && <><button className="btn sm" onClick={() => run({ type: 'createInvite', playerId: p.id })}>{p.state === 'Invited' ? 'Resend invite' : 'Send invite'}</button>{p.state !== 'Waitlist' && p.state !== 'Invited' && <button className="btn sm ghost" onClick={() => run({ type: 'decideFit', playerId: p.id, accept: false })}>Waitlist</button>}</>}
      {p.state === 'Invited' && mode === 'demo' && inv?.tokenHash === sha256(DEMO_INVITE.token) && <Link className="btn sm ghost" to={`/invite?token=${DEMO_INVITE.token}`}>Open family invite</Link>}
      {(as?.role === 'head' || as?.role === 'ops') && <button className="btn sm ghost" onClick={exportCsv}>Export CSV</button>}</div>
  </section>;
}

function GamesTab({ p }: { p: Player }) {
  const s = useSnap(); const logs = shotsFor(s, p.id).slice(-3).reverse();
  return <>
    <section className="panel"><div className="row between wrapx"><h3 className="display">Game notes</h3><span className="small dim">Read each one, then mark: carried over, partly, or not yet. A carried mark lands on {first(p.name)}’s wall.</span></div><GameNotes p={p} me="coach" /></section>
    {logs.length > 0 && <section className="panel"><h3 className="display">Shooting logs</h3>{logs.map((x) => <ShotSummary key={x.id} shots={x.shots} title={`${s.assignments.find((a) => a.id === x.assignmentId)?.title ?? 'Rep'} · ${shortWhen(x.at)}`} />)}</section>}
  </>;
}

function Profile() {
  const { id } = useParams(); const [sp, setSp] = useSearchParams(); const s = useSnap(); const { run, as } = useStore(); const base = useBase(); const view = perspective(as?.role);
  const p = s.players.find((x) => x.id === id); const tab = sp.get('tab') || 'overview';
  if (!p) return <p>Player not found. <Link to={`${base}/roster`}>Roster</Link></p>;
  const app = s.applications.find((a) => a.playerId === p.id); const tabs = view === 'ops' ? ['overview', 'timeline'] : ['overview', 'feedback', 'games', 'progress', 'messages', 'canvas', 'timeline'];
  return (<>
    <Back to={`${base}/roster`}>Roster</Back>
    <div className="row between wrapx"><div><h1 className="display">{p.name}</h1><p className="dim">{p.age} · {p.position || '—'} · {p.tier} · Parent: {family(s, p).parentName} · Coach: {userName(s, p.coachId)}</p></div><Pill state={p.state} /></div>
    <Track state={p.state} />
    <div className="seg light" role="tablist">{tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setSp({ tab: t })}>{t === 'canvas' ? 'Player canvas' : t === 'feedback' ? 'Feedback history' : t === 'timeline' ? 'Activity log' : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {view !== 'ops' && promiseRisks(s, p).length > 0 && <section className="panel riskbox"><p className="kicker">Promises to keep</p><ul className="plain">{promiseRisks(s, p).map(({ promise, risk }) => <li key={promise.id}>🛡️ <b>{risk.what}</b>{risk.dueBy ? ` · by ${shortWhen(risk.dueBy)}` : ''} <span className="small dim">({promise.text})</span></li>)}</ul></section>}
    {tab === 'overview' && <div className="grid2">
      <div><PathPanel p={p} role={view} />{view === 'coach' && <><SessionForm p={p} /><AdjustPlan p={p} /><ParentNoteForm p={p} /><ProbeForm p={p} /><CheckInForm p={p} /></>}<StaffBox p={p} />
        {app && <section className="panel"><h3 className="display">Application</h3><dl className="dl">{Object.entries(app.answers).filter(([q]) => q !== 'names').map(([q, v]) => <div key={q}><dt>{q}</dt><dd>{v}</dd></div>)}</dl></section>}</div>
      <div><section className="panel"><dl className="dl"><div><dt>Focus</dt><dd>{playerCycle(s, p.id)?.focus || '—'}</dd></div><div><dt>Goal</dt><dd>{p.goal || '—'}</dd></div><div><dt>Learns by</dt><dd>{p.learnStyle || '—'}</dd></div><div><dt>Rhythm</dt><dd>{p.rhythm || '—'}</dd></div><div><dt>Next session</dt><dd>{p.nextSession}</dd></div>{p.tournamentDate && <div><dt>Tournament</dt><dd>{shortWhen(p.tournamentDate)}</dd></div>}</dl></section>{view === 'coach' && <CoachKnows p={p} />}{view === 'coach' && <PromiseCard p={p} title="What the family sees: promises" />}
        {view === 'coach' && <section className="panel"><h3 className="display">Skill rubric</h3><Rubric p={p} edit /></section>}</div></div>}
    {tab === 'canvas' && <section className="panel canvas"><p className="kicker">Coach only. Never shown to the family or ops.</p><label htmlFor="cv" className="strong">How {first(p.name)} ticks</label><textarea id="cv" className="input" rows={6} defaultValue={p.canvas} onBlur={(e) => run({ type: 'updateCanvas', playerId: p.id, canvas: e.target.value })} placeholder="Motivation, triggers, what cues land, family context…" /><p className="small dim">Saves when you leave the field.</p></section>}
    {tab === 'messages' && <UnifiedInbox players={[p]} me="coach" fixedPlayer />}
    {tab === 'feedback' && <FeedbackTimeline p={p} me="coach" />}
    {tab === 'games' && <GamesTab p={p} />}
    {tab === 'progress' && <><SinceWeek1 p={p} me="coach" /><StoryEditor p={p} /><WinsWall p={p} me="coach" /></>}
    {tab === 'timeline' && <ol className="events">{s.events.filter((e) => e.playerId === p.id).slice().reverse().map((e) => <li key={e.id} className="ev"><time>{shortWhen(e.at)}</time><span className={`who-tag ${e.role}`}>{e.actorId ? first(userName(s, e.actorId)) : e.role}</span><span className="grow">{e.from && e.to ? <span className="tr">{e.from} → <b>{e.to}</b> </span> : <b>{e.type} </b>}<span className="dim">{e.detail}</span></span></li>)}</ol>}
  </>);
}

function PlanBuilder() {
  const { id } = useParams(); const s = useSnap(); const { run } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const prev = p && playerCycle(s, p.id);
  const cr = p && s.cycleReviews.find((x) => x.cycleId === prev?.id && x.coachAt); const [focus, setFocus] = useState(cr?.nextFocus ?? ''); const [pick, setPick] = useState<string[]>([]); const [tpl, setTpl] = useState<string | undefined>(); const [tname, setTname] = useState(''); const [saw, setSaw] = useState('');
  if (!p) return <p>Player not found.</p>;
  if (!['Plan building', 'Cycle review'].includes(p.state)) return (<><Back to={`/coach/player/${p.id}`}>{p.name}</Back><div className="panel"><h2 className="display">{p.name} isn’t waiting on a plan</h2><p>Current state: <Pill state={p.state} />. Plans can be published from <b>Plan building</b> or <b>Cycle review</b>.</p><ActionButton g={guide(s, p, 'coach')} /></div></>);
  if (p.state === 'Cycle review' && !cr) return (<><Back to={`/coach/player/${p.id}`}>{p.name}</Back><div className="panel"><h2 className="display">Cycle review first</h2><p>Re-rate the rubric and pick the next focus, then build cycle {(prev?.index ?? 0) + 1}.</p><Link className="btn" to={`/coach/cycle/${p.id}`}>Do cycle review →</Link></div></>);
  const isFirst = !prev; const submitted = new Set(s.submissions.map((x) => x.clipId).filter(Boolean)); const intake = s.clips.filter((c) => c.playerId === p.id && !c.deletedAt && !submitted.has(c.id)); const ses = latestSession(s, p.id, 30);
  const publish = async () => { if (await run({ type: 'publishPlan', playerId: p.id, focus, drillIds: pick, templateId: tpl, saw: isFirst ? saw : undefined, source: isFirst ? (intake.length ? 'clip' : 'session') : undefined, rev: p.rev })) nav('/coach'); };
  const drills = s.drills.filter((d) => !d.archived);
  return (<>
    <Back to={`/coach/player/${p.id}`}>{p.name}</Back>
    <h1 className="display">{p.state === 'Cycle review' ? `Cycle ${(prev?.index ?? 0) + 1}` : 'First look'}: {p.name}</h1>
    <p className="dim">Goal: {p.goal || '—'} · Learns by: {p.learnStyle || '—'} · {p.rhythm || '—'}{prev ? ` · Last focus: ${prev.focus}` : ''}</p>
    {s.templates.length > 0 && <section className="panel"><p className="strong">Start from a template</p><div className="row wrapx">{s.templates.map((t) => <button key={t.id} aria-pressed={tpl === t.id} className={`chip ${tpl === t.id ? 'on' : ''}`} onClick={() => { setTpl(t.id); setFocus(t.focus); setPick(t.drillIds.filter((d) => drills.some((x) => x.id === d))); }}>{t.name}</button>)}</div></section>}
    {isFirst && <section className="panel firstlook" id="firstlook"><p className="kicker orange">What you saw</p>
      {intake.map((c) => <ClipPlayer key={c.id} clip={c} />)}
      {ses && <p className="small"><b>{sessionLine(ses)}:</b> {ses.note} {ses.focus ? <>Focus you set then: <i>{ses.focus}</i>.</> : null}</p>}
      {!intake.length && !ses && <p className="small dim">No intake clip or session note yet. Ask {first(p.name)} for a 30-second clip, or log your in-person session on the Overview tab.</p>}
      <label htmlFor="saw" className="strong">In a sentence or two: what did you see in {first(p.name)}? {first(p.name)} reads this first.</label><textarea id="saw" className="input" rows={3} value={saw} onChange={(e) => setSaw(e.target.value)} placeholder="Quick hands and good eyes. Under pressure the ball drifts away from the body on the cross-over." /></section>}
    <section className="panel"><p className="why">{repWhy(p, null)}</p><label htmlFor="fo" className="strong">1 · One focus for the next 4 weeks</label><input id="fo" className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Dribbling in traffic with eyes up" /></section>
    <section className="panel"><p className="strong">2 · Queue the reps in order {pick.length > 0 && <span className="dim">({pick.length} queued, unlocked one at a time)</span>} <Link className="small" to="/coach/library">Edit library →</Link></p>
      <div className="lib">{drills.map((l) => { const n = pick.indexOf(l.id); return <button key={l.id} aria-pressed={n >= 0} className={`opt ${n >= 0 ? 'on' : ''}`} onClick={() => setPick(n >= 0 ? pick.filter((x) => x !== l.id) : [...pick, l.id])}>{n >= 0 && <span className="order">{n + 1}</span>}<strong>{l.title}</strong><span className="small block dim">{l.reps} sets · {l.minutes} min · {l.cues[0]}</span></button>; })}</div>
      <div className="row gap wrapx"><input aria-label="Template name" className="input" style={{ maxWidth: 260 }} value={tname} onChange={(e) => setTname(e.target.value)} placeholder="Save these as a template…" /><button className="btn sm ghost" disabled={!tname.trim() || !pick.length} onClick={() => run({ type: 'saveTemplate', template: { name: tname, focus, drillIds: pick } }).then(() => setTname(''))}>Save template</button></div></section>
    <div className="row gap"><button className="btn lg" disabled={!focus.trim() || !pick.length || (isFirst && saw.trim().length < 10)} onClick={publish}>{isFirst ? 'Send first look + plan' : 'Publish plan'}</button><span className="small dim">{first(p.name)} gets your words and the focus, then rep 1 unlocks.</span></div>
  </>);
}

function Digest() {
  const s = useSnap(); const { run } = useStore(); const wk = weekKey(clock(s)); const [edits, setEdits] = useState<Record<string, string>>({});
  const active = s.players.filter((p) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state));
  const fallback = (p: Player) => parentSentence(s, p).text;
  const drafts = active.filter((p) => s.digests.some((x) => x.playerId === p.id && x.week === wk && x.status === 'draft'));
  return (<><h1 className="display">Weekly digest</h1><p className="dim">Sunday’s job drafts one per player: clips sent, this week’s one-sentence read for the parent, and the last game note. Add a line in your own voice, then approve. The parent gets it in-app and by email.</p>
    {drafts.length > 1 && <button className="btn" onClick={() => run({ type: 'approveDigests', items: drafts.map((p) => ({ playerId: p.id, text: edits[p.id] ?? s.digests.find((x) => x.playerId === p.id && x.week === wk)!.text })) })}>Approve all {drafts.length} drafts</button>}
    {active.length === 0 && <p className="dim">No active players yet.</p>}
    {active.map((p) => { const d = s.digests.find((x) => x.playerId === p.id && x.week === wk); const sent = d?.status === 'approved'; const txt = edits[p.id] ?? d?.text ?? fallback(p);
      return <section key={p.id} className="panel"><div className="row between"><strong>{p.name} → {family(s, p).parentName}</strong>{sent ? <span className="pill st-approved">Approved</span> : <span className="pill">{d ? 'Draft (auto)' : 'Draft'}</span>}</div>
        <label className="sr" htmlFor={`d-${p.id}`}>Digest for {p.name}</label><textarea id={`d-${p.id}`} className="input" rows={3} value={sent ? d!.text : txt} disabled={sent} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
        {!sent && <button className="btn sm" onClick={() => run({ type: 'approveDigest', playerId: p.id, text: txt })}>Approve & send</button>}</section>; })}</>);
}

function Library() {
  const s = useSnap(); const { run } = useStore(); const blank = { title: '', reps: 3, minutes: 10, cues: [''], tags: [] as string[], pressure: null as Pressure | null }; const [f, setF] = useState<typeof blank & { id?: string }>(blank); const [arch, setArch] = useState(false);
  const save = async () => { if (await run({ type: 'saveDrill', drill: { ...f, cues: f.cues.filter((c) => c.trim()) } })) setF(blank); };
  const edit = (d: Drill) => setF({ id: d.id, title: d.title, reps: d.reps, minutes: d.minutes, cues: [...d.cues, ''], tags: d.tags, pressure: d.pressure ?? null });
  return (<><h1 className="display">Drill library</h1><p className="dim">Reusable reps for every plan. Editing a drill changes future plans only; reps already assigned keep their wording.</p>
    <div className="grid2">
      <div>{s.drills.filter((d) => d.archived === arch).map((d) => <section key={d.id} className="panel drill"><div className="row between"><strong>{d.title}</strong><span className="small dim">{d.reps} sets · {d.minutes} min</span></div><ul className="cues">{d.cues.map((c) => <li key={c}>{c}</li>)}</ul><PressureBadge pr={d.pressure} />
        <div className="row gap"><span className="small dim grow">{d.tags.map((t) => `#${t}`).join(' ')} · by {first(userName(s, d.createdBy))} · used {s.assignments.filter((a) => a.drillId === d.id).length}×</span><button className="chip" onClick={() => edit(d)}>Edit</button><button className="chip" onClick={() => run({ type: 'archiveDrill', drillId: d.id })}>{d.archived ? 'Restore' : 'Archive'}</button></div></section>)}
        <button className="link small" onClick={() => setArch(!arch)}>{arch ? '← Active drills' : 'Show archived'}</button></div>
      <div><form className="panel sticky" onSubmit={(e) => { e.preventDefault(); save(); }}><h3 className="display">{f.id ? 'Edit drill' : 'New drill'}</h3>
        <label htmlFor="dt">Title</label><input id="dt" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="row gap"><label>Sets <input className="input" type="number" min={1} max={20} value={f.reps} onChange={(e) => setF({ ...f, reps: +e.target.value })} /></label><label>Minutes <input className="input" type="number" min={1} max={90} value={f.minutes} onChange={(e) => setF({ ...f, minutes: +e.target.value })} /></label></div>
        <p className="strong">Cues</p>{f.cues.map((c, i) => <input key={i} aria-label={`Cue ${i + 1}`} className="input" value={c} onChange={(e) => { const cues = f.cues.map((x, j) => (j === i ? e.target.value : x)); if (i === cues.length - 1 && e.target.value) cues.push(''); setF({ ...f, cues }); }} placeholder="One short cue" />)}
        <label htmlFor="pk">Pressure rep (bridges practice and games)</label><select id="pk" className="input" value={f.pressure?.kind ?? ''} onChange={(e) => setF({ ...f, pressure: e.target.value ? { kind: e.target.value as Pressure['kind'], target: f.pressure?.target ?? '' } : null })}><option value="">Regular rep</option>{(Object.keys(PRESSURE_LABEL) as Pressure['kind'][]).map((k) => <option key={k} value={k}>{PRESSURE_LABEL[k]}</option>)}</select>
        {f.pressure && <><label htmlFor="pt">Target</label><input id="pt" className="input" value={f.pressure.target} onChange={(e) => setF({ ...f, pressure: { ...f.pressure!, target: e.target.value } })} placeholder="Make 7 of 10 before moving on · 30 seconds per set · after 2 sprints" /></>}
        <label htmlFor="tg">Tags (comma separated)</label><input id="tg" className="input" value={f.tags.join(', ')} onChange={(e) => setF({ ...f, tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
        <div className="row gap"><button className="btn" disabled={!f.title.trim()}>{f.id ? 'Save changes' : 'Add to library'}</button>{f.id && <button type="button" className="link" onClick={() => setF(blank)}>Cancel</button>}</div></form>
        <section className="panel"><h3 className="display">Plan templates</h3>{s.templates.map((t) => <p key={t.id}><strong>{t.name}</strong><span className="small dim block">{t.focus} · {t.drillIds.map((d) => s.drills.find((x) => x.id === d)?.title).filter(Boolean).join(' → ')}</span></p>)}<p className="small dim">Save a template from the plan builder.</p></section></div>
    </div></>);
}

function Calendar() {
  const s = useSnap(); const { run, api, mode } = useStore(); const [link, setLink] = useState(''); const t = clock(s);
  const [f, setF] = useState({ playerId: '', at: '', kind: 'check-in' as 'check-in' | 'live' | 'fit-call', minutes: 15, note: '' });
  useEffect(() => { if (mode === 'live') api.get<{ url: string }>('/api/calendar-link').then((r) => setLink(r.url)).catch(() => {}); }, [api, mode]);
  const up = s.meetings.filter((m) => m.status === 'scheduled' && new Date(m.at).getTime() > t.getTime() - 36e5).sort((a, b) => a.at.localeCompare(b.at));
  const days = [...new Set(up.map((m) => new Date(m.at).toDateString()))];
  return (<><div className="row between wrapx"><h1 className="display">Calendar</h1>{mode === 'live' ? (link && <a className="chip" href={link}>📅 Subscribe (iCal)</a>) : <button className="chip" onClick={() => download('baller-connection.ics', calendarIcs(s), 'text/calendar')}>📅 Download .ics</button>}</div>
    <p className="dim">Check-ins, live sessions and fit calls. Your availability: {s.settings.availability}.</p>
    <div className="grid2"><div>{days.length === 0 && <p className="dim">Nothing scheduled.</p>}{days.map((d) => <section key={d} className="panel"><p className="kicker">{new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
      {up.filter((m) => new Date(m.at).toDateString() === d).map((m) => <div key={m.id} className="row gap calrow"><b>{new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</b><span className="grow">{m.kind === 'live' ? 'Live session' : m.kind === 'fit-call' ? 'Fit call' : 'Check-in'} · {s.players.find((p) => p.id === m.playerId)?.name ?? '—'} <span className="small dim">· {m.minutes} min · {first(userName(s, m.staffId))}{m.note ? ` · ${m.note}` : ''}</span></span><button className="chip" onClick={() => run({ type: 'cancelSession', meetingId: m.id })}>Cancel</button></div>)}</section>)}</div>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); run({ type: 'scheduleSession', playerId: f.playerId || undefined, at: new Date(f.at).toISOString(), kind: f.kind, minutes: f.minutes, note: f.note }).then((r) => r && setF({ ...f, at: '', note: '' })); }}><h3 className="display">Schedule</h3>
        <label htmlFor="cp">Player</label><select id="cp" className="input" value={f.playerId} onChange={(e) => setF({ ...f, playerId: e.target.value })}><option value="">— none (staff block) —</option>{s.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <label htmlFor="ca">When</label><input id="ca" className="input" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
        <div className="row gap"><label>Kind <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}><option value="check-in">Check-in</option><option value="live">Live session</option><option value="fit-call">Fit call</option></select></label><label>Minutes <input className="input" type="number" min={5} max={120} value={f.minutes} onChange={(e) => setF({ ...f, minutes: +e.target.value })} /></label></div>
        <label htmlFor="cn">Note</label><input id="cn" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /><button className="btn" disabled={!f.at}>Add to calendar</button></form></div></>);
}

function Team() {
  const s = useSnap(); const { run, api, mode, as } = useStore(); const [f, setF] = useState({ name: '', email: '', role: 'assistant' as 'assistant' | 'ops' }); const [msg, setMsg] = useState('');
  const rows = teamLoad(s);
  const add = async () => { try { if (mode === 'live') await api.post('/api/staff', f); else await run({ type: 'inviteStaff', ...f }); setMsg(`Added ${f.name}. A set-password email is in the outbox.`); setF({ name: '', email: '', role: 'assistant' }); } catch (e) { setMsg((e as Error).message); } };
  return (<><h1 className="display">Team</h1><p className="dim">Who owns what right now. Overdue counts come from the same queues each person sees.</p>
    <div className="teamgrid">{rows.map((r) => <section key={r.user.id} className={`panel tcard ${r.overdue ? 'late' : ''}`}><p className="kicker">{r.user.role === 'head' ? 'Head coach' : r.user.role === 'assistant' ? 'Assistant coach' : 'Ops'}</p><h3 className="display">{r.user.name}</h3>
      <div className="stats light"><div><b>{r.user.role === 'ops' ? '—' : r.players}</b><span>players</span></div><div><b>{r.open}</b><span>open items</span></div><div><b className={r.overdue ? 'overdue-t' : ''}>{r.overdue}</b><span>overdue</span></div></div>
      {r.user.role !== 'ops' && <p className="small dim">{s.players.filter((p) => p.coachId === r.user.id).map((p) => first(p.name)).join(', ') || 'No players'}</p>}</section>)}</div>
    <section className="panel"><h3 className="display">Recent handoffs</h3><ol className="events">{s.events.filter((e) => e.type === 'handoff').slice(-6).reverse().map((e) => <li key={e.id} className="ev"><time>{shortWhen(e.at)}</time><span className="grow"><b>{s.players.find((p) => p.id === e.playerId)?.name}</b> <span className="dim">{e.detail} · by {userName(s, e.actorId)}</span></span></li>)}</ol></section>
    {as?.role === 'head' && <form className="panel" onSubmit={(e) => { e.preventDefault(); add(); }}><h3 className="display">Add staff</h3><div className="row gap wrapx"><input aria-label="Name" className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><input aria-label="Email" className="input" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><select aria-label="Role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'assistant' | 'ops' })}><option value="assistant">Assistant coach</option><option value="ops">Ops staff</option></select><button className="btn" disabled={!f.name || !f.email}>Add</button></div>{msg && <p className="small">{msg}</p>}</form>}
  </>);
}

function SettingsPage() {
  const s = useSnap(); const { run, as } = useStore(); const [f, setF] = useState<Settings>(s.settings); const [saved, setSaved] = useState(false); const head = as?.role === 'head';
  const num = (k: keyof Settings, label: string, min: number, max: number, hint?: string) => <label className="setrow"><span>{label}{hint && <span className="small dim block">{hint}</span>}</span><input className="input" type="number" min={min} max={max} disabled={!head} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: +e.target.value })} /></label>;
  return (<form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'updateSettings', patch: { ...f, savedReplies: f.savedReplies.map((x) => x.trim()).filter(Boolean) } })) setSaved(true); }}>
    <h1 className="display">Settings</h1>{!head && <p className="note">Only the head coach can change settings.</p>}
    <div className="grid2">
      <section className="panel"><h3 className="display">Reply SLAs by tier</h3><p className="small dim">Business days. 0 = same business day. Drives “reply by” on every submission and message, the overdue sweep, and what families are promised.</p>
        {(Object.keys(f.sla) as Tier[]).map((t) => <label key={t} className="setrow"><span>{t}<span className="small dim block">{replyLabel(f.sla[t])}</span></span><input className="input" type="number" min={0} max={5} disabled={!head} value={f.sla[t]} onChange={(e) => setF({ ...f, sla: { ...f.sla, [t]: +e.target.value } })} /></label>)}
        {num('dueSoonHours', '“Due soon” warning', 1, 48, 'hours before the deadline')}</section>
      <section className="panel"><h3 className="display">Capacity</h3>{num('capacity', 'Roster cap', 1, 100, 'Invites beyond this go to the waitlist')}{num('innerCircleCap', 'Inner Circle cap', 0, 50)}{num('inviteDays', 'Invite link valid for', 1, 30, 'days')}
        <label className="setrow"><span>Assistant reviews need head-coach sign-off<span className="small dim block">Routes assistant reviews to Sign-off</span></span><input type="checkbox" disabled={!head} checked={f.requireSignoff} onChange={(e) => setF({ ...f, requireSignoff: e.target.checked })} /></label></section>
      <section className="panel"><h3 className="display">Reviews per week</h3><p className="small dim">Written reviews owed per week (99 = every submission). Extra check-ins are logged and the next rep still unlocks. The family's promise card shows the count.</p>
        {(Object.keys(f.reviewsPerWeek) as Tier[]).map((t) => <label key={t} className="setrow"><span>{t}</span><input className="input" type="number" min={1} max={99} disabled={!head} value={f.reviewsPerWeek[t]} onChange={(e) => setF({ ...f, reviewsPerWeek: { ...f.reviewsPerWeek, [t]: +e.target.value } })} /></label>)}</section>
      <section className="panel"><h3 className="display">Office hours & urgent</h3><p className="small dim">Outside these hours, families see “coach is off now, back …”. Urgent messages are due within this many office hours.</p>
        <label className="setrow"><span>Opens (hour, 0–23)</span><input className="input" type="number" min={0} max={23} disabled={!head} value={f.officeHours.start} onChange={(e) => setF({ ...f, officeHours: { ...f.officeHours, start: +e.target.value } })} /></label>
        <label className="setrow"><span>Closes (hour)</span><input className="input" type="number" min={1} max={24} disabled={!head} value={f.officeHours.end} onChange={(e) => setF({ ...f, officeHours: { ...f.officeHours, end: +e.target.value } })} /></label>
        <div className="row wrapx" role="group" aria-label="Office days">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <button type="button" key={d} disabled={!head} aria-pressed={f.officeHours.days.includes(i)} className={`chip ${f.officeHours.days.includes(i) ? 'on' : ''}`} onClick={() => setF({ ...f, officeHours: { ...f.officeHours, days: f.officeHours.days.includes(i) ? f.officeHours.days.filter((x) => x !== i) : [...f.officeHours.days, i].sort() } })}>{d}</button>)}</div>
        {num('urgentReplyHours', 'Urgent reply within', 1, 24, 'office hours')}</section>
      <section className="panel"><h3 className="display">Saved replies</h3><p className="small dim">One per line. They show as one-tap chips in every thread.</p><label htmlFor="sr" className="sr">Saved replies</label><textarea id="sr" className="input" rows={4} disabled={!head} value={f.savedReplies.join('\n')} onChange={(e) => setF({ ...f, savedReplies: e.target.value.split('\n') })} /></section>
      <section className="panel" id="coachprofile"><h3 className="display">Your intro (families see this first)</h3><p className="small dim">Write it yourself. Short and true beats polished. Replace anything in [brackets].</p>
        {(['intro', 'why', 'how', 'lookFor'] as const).map((k) => { const L = { intro: 'Who you are', why: 'Why you coach', how: 'How you’ll work with them', lookFor: 'What you look for in a player' }[k]; const cp = f.coachProfile ?? DEFAULT_COACH_PROFILE; return <div key={k}><label htmlFor={`cp-${k}`}>{L}</label><textarea id={`cp-${k}`} className="input" rows={2} disabled={!head} value={cp[k]} onChange={(e) => setF({ ...f, coachProfile: { ...cp, [k]: e.target.value } })} /></div>; })}</section>
      <section className="panel"><h3 className="display">Availability</h3><label htmlFor="av" className="sr">Availability</label><input id="av" className="input" disabled={!head} value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} /><p className="small dim">Shown to families on Messages and Calendar.</p></section>
      <section className="panel"><h3 className="display">Branding</h3><label htmlFor="pn">Program name</label><input id="pn" className="input" disabled={!head} value={f.programName} onChange={(e) => setF({ ...f, programName: e.target.value })} /><label htmlFor="ac">Accent</label><input id="ac" type="color" disabled={!head} value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} /><p className="small dim">Program name is used in email subjects. The accent color is saved but not applied to the app theme yet.</p></section>
    </div>
    {head && <div className="row gap"><button className="btn">Save settings</button>{saved && <span className="small">Saved ✓ (logged to the audit log)</span>}</div>}
  </form>);
}

export function CoachShell({ ops }: { ops?: boolean }) {
  const s = useSnap(); const { as } = useStore(); const role = as?.role; useNextShortcut();
  const q = buildQueue(s, as?.id); const n = q.filter((x) => OWED(x.kind)).length; const late = q.filter((x) => x.overdue).length; const oq = buildOpsQueue(s);
  const unread = s.notifications.filter((x) => x.userId === as?.id && !x.readAt).length;
  const base = ops ? '/ops' : '/coach'; const L = (to: string, label: ReactNode, end = false) => <NavLink to={to} end={end}>{label}</NavLink>;
  return (
    <div className="coachshell">
      <aside className="side"><Logo light /><nav aria-label={ops ? 'Ops' : 'Coach'}>
        {ops ? L('/ops', <>Ops queue {oq.length > 0 && <b className={`badge ${oq.some((x) => x.overdue) ? 'late' : ''}`}>{oq.length}</b>}</>, true) : L('/coach', <>Action Center {n > 0 && <b className={`badge ${late ? 'late' : ''}`}>{n}</b>}</>, true)}
        {L(`${base}/inbox`, <>Inbox {unread > 0 && <b className="badge">{unread}</b>}</>)}{L(`${base}/roster`, 'Roster')}{L(`${base}/calendar`, 'Calendar')}
        {!ops && L('/coach/library', 'Library')}{!ops && L('/coach/digest', 'Weekly digest')}{(role === 'head' || role === 'ops') && L(`${base}/team`, 'Team')}
        {(role === 'head' || role === 'ops') && L(`${base}/billing`, 'Billing')}{(role === 'head' || role === 'ops') && L(`${base}/outbox`, 'Outbox')}{(role === 'head' || role === 'ops') && L(`${base}/audit`, 'Audit log')}{L(`${base}/settings`, 'Settings')}
      </nav><UserMenu dark /></aside>
      <main id="main" tabIndex={-1} className="cmain">
        <Routes>
          <Route index element={ops ? <OpsQueue /> : <ActionCenter />} /><Route path="roster" element={<Roster />} /><Route path="player/:id" element={<Profile />} />
          <Route path="review/:id" element={<Review />} /><Route path="cycle/:id" element={<CycleReviewCoach />} /><Route path="plan/:id" element={<PlanBuilder />} /><Route path="digest" element={<Digest />} />
          <Route path="library" element={<Library />} /><Route path="calendar" element={<Calendar />} /><Route path="team" element={<Team />} /><Route path="settings" element={<SettingsPage />} />
          <Route path="outbox" element={<Outbox />} /><Route path="billing" element={<CoachBilling />} /><Route path="inbox" element={<Inbox />} /><Route path="audit" element={<SystemLog embedded />} />
        </Routes>
      </main>
      <Moments role={ops ? 'ops' : 'coach'} />
    </div>
  );
}
