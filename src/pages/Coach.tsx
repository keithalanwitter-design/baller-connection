import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { LIBRARY } from '../../shared/library';
import { TIERS, type Player } from '../../shared/domain';
import { relative, shortWhen, weekKey } from '../../shared/time';
import { QUEUE_KINDS, buildQueue, capacity, clock, family, first, lastSubmission, playerAssignments, playerCycle, progress, type QueueKind } from '../../shared/workflow';
import { ActionButton, Back, Journal, Moments, PathPanel, Pill, Rubric, Thread, Track } from '../ui';
import { guide } from '../../shared/workflow';

const k = (x: string) => x.split(' ')[0].toLowerCase();

function Capacity() {
  const s = useSnap(); const c = capacity(s);
  return <div className="capacity" aria-label={`Roster ${c.used} of ${c.max}`}><div className="row between small"><span>Roster <b>{c.used}/{c.max}</b></span><span>Inner Circle <b>{c.inner}/{c.innerMax}</b></span></div><div className="capbar">{Array.from({ length: c.max }, (_, i) => <i key={i} className={i < c.used ? 'on' : ''} />)}</div></div>;
}

function ActionCenter() {
  const s = useSnap(); const q = buildQueue(s); const [f, setF] = useState<QueueKind | 'All'>('All'); const t = clock(s);
  const urgent = q.filter((x) => x.kind !== 'Upcoming').length; const overdue = q.filter((x) => x.overdue).length;
  const rows = q.filter((x) => f === 'All' || x.kind === f);
  return (<>
    <div className="row between wrapx"><div><p className="kicker">{t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p><h1 className="display">Action Center</h1>
      <p className="lead sm">{urgent === 0 ? 'You’re clear. Nobody is waiting on you.' : <>{urgent} {urgent === 1 ? 'thing needs' : 'things need'} you{overdue ? <>, <b className="overdue-t">{overdue} overdue</b></> : ''}. Most urgent first.</>}</p></div><Capacity /></div>
    <div className="chips" role="group" aria-label="Filter queue">
      <button aria-pressed={f === 'All'} className={`chip ${f === 'All' ? 'on' : ''}`} onClick={() => setF('All')}>All <b>{q.length}</b></button>
      {QUEUE_KINDS.map((kind) => <button key={kind} aria-pressed={f === kind} className={`chip k-${k(kind)} ${f === kind ? 'on' : ''}`} onClick={() => setF(kind)}>{kind} <b>{q.filter((x) => x.kind === kind).length}</b></button>)}
    </div>
    <ol className="queue">{rows.map((x, i) => (
      <li key={x.key}><Link to={x.to} className={`qrow k-${k(x.kind)} ${x.overdue ? 'overdue' : ''}`}>
        <span className="rank">{i + 1}</span>
        <span className="grow"><span className="row gap"><strong>{x.player.name}</strong><span className="kind">{x.kind}</span><Pill state={x.player.state} /></span><span className="small dim block">{x.reason}</span></span>
        {x.dueBy && <span className={`sla ${x.overdue ? 'late' : ''}`}><b>{x.overdue ? 'OVERDUE' : 'Due'}</b>{relative(x.dueBy, t)}</span>}<span aria-hidden className="chev">›</span></Link></li>))}
      {rows.length === 0 && <li className="panel dim">Nothing in this lane.</li>}</ol>
    <p className="small dim">Counts come from the same list as the rows, so they always match. Overdue items go to the top. Use ⏩ +1 day to watch SLAs escalate.</p>
  </>);
}

function Review() {
  const { id } = useParams(); const s = useSnap(); const { run } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const sub = p && lastSubmission(s, p.id); const a = sub && s.assignments.find((x) => x.id === sub.assignmentId);
  const [fb, setFb] = useState('');
  if (!p || !sub || !a || !['Submitted', 'Feedback due'].includes(p.state)) return <div className="panel"><h2 className="display">Nothing to review</h2><p>This work was already reviewed.</p><Link className="btn" to="/coach">Back to Action Center</Link></div>;
  const queued = playerAssignments(s, p.id).filter((x) => x.status === 'queued'); const t = clock(s); const late = new Date(sub.dueBy) < t;
  const act = async (decision: 'approve' | 'retry') => { if (await run({ type: 'review', playerId: p.id, decision, feedback: fb })) nav('/coach'); };
  return (
    <div className="review">
      <Back to="/coach">Action Center</Back>
      <div className="row between wrapx"><h1 className="display">Review: {p.name}</h1><span className={`sla big ${late ? 'late' : ''}`}><b>{late ? 'OVERDUE' : 'Reply by'}</b>{shortWhen(sub.dueBy)}</span></div>
      <p className="dim">Focus: {playerCycle(s, p.id)?.focus} · {p.tier} (replies {TIERS[p.tier].replyLabel})</p>
      <div className="grid2">
        <section className="panel"><p className="kicker">Submitted {shortWhen(sub.at)}</p><h2 className="display">{a.title}</h2><p><b>{sub.repsDone}/{a.reps}</b> sets done</p><blockquote className="quote sm">“{sub.reflection}”</blockquote><ul className="cues">{a.cues.map((c) => <li key={c}>{c}</li>)}</ul></section>
        {p.canvas && <section className="panel canvas"><p className="kicker">Your canvas (coach only)</p><p>{p.canvas}</p></section>}
      </div>
      <section className="panel">
        <label htmlFor="fb" className="strong">Feedback: one observation, one cue</label>
        <textarea id="fb" className="input" rows={3} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="Good read on the left wing. Next: set your feet before the catch." />
        <div className="row wrapx">{['Exactly right. Keep that.', 'Slow it down: 3 walk-throughs first.', 'Love the honesty in that reflection.'].map((x) => <button key={x} className="chip" onClick={() => setFb((v) => (v ? v + ' ' : '') + x)}>+ {x}</button>)}</div>
        <div className="outcomes">
          <button className="outcome ok" disabled={fb.trim().length < 5} onClick={() => act('approve')}><b>Approve</b><span>{first(p.name)} → Next step ready. {queued.length ? `Unlocks: ${queued[0].title}` : 'Last rep → Cycle review.'}</span></button>
          <button className="outcome retry" disabled={fb.trim().length < 5} onClick={() => act('retry')}><b>Another attempt</b><span>{first(p.name)} → Work ready, same rep with your cue.</span></button>
        </div>
      </section>
    </div>
  );
}

function Roster() {
  const s = useSnap();
  return (<><div className="row between wrapx"><h1 className="display">Roster</h1><Capacity /></div>
    <div className="table" role="table" aria-label="Roster">{s.players.map((p) => { const pr = progress(s, p.id); return (
      <Link key={p.id} to={`/coach/player/${p.id}`} className="trow" role="row"><span role="cell"><strong>{p.name}</strong><span className="small dim block">{p.age} · {p.position || '—'} · {p.tier}</span></span><span role="cell"><Pill state={p.state} /></span><span role="cell" className="small">{playerCycle(s, p.id)?.focus || <span className="dim">No focus yet</span>}</span><span role="cell" className="small">L{pr.level} · 🔥{pr.streak}</span></Link>); })}</div></>);
}

function Profile() {
  const { id } = useParams(); const [sp, setSp] = useSearchParams(); const s = useSnap(); const { run } = useStore();
  const p = s.players.find((x) => x.id === id); const tab = sp.get('tab') || 'overview';
  if (!p) return <p>Player not found. <Link to="/coach/roster">Roster</Link></p>;
  const g = guide(s, p, 'coach'); const app = s.applications.find((a) => a.playerId === p.id);
  return (<>
    <Back to="/coach/roster">Roster</Back>
    <div className="row between wrapx"><div><h1 className="display">{p.name}</h1><p className="dim">{p.age} · {p.position || '—'} · {p.tier} · Parent: {family(s, p).parentName}</p></div><Pill state={p.state} /></div>
    <Track state={p.state} />
    <div className="seg light" role="tablist">{['overview', 'canvas', 'messages', 'journal', 'timeline'].map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setSp({ tab: t })}>{t === 'canvas' ? 'Player canvas' : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {tab === 'overview' && <div className="grid2">
      <div><PathPanel p={p} role="coach" />
        {(p.state === 'Fit review' || p.state === 'Waitlist') && <div className="row gap"><button className="btn ghost" onClick={() => run({ type: 'decideFit', playerId: p.id, accept: false })}>Waitlist</button></div>}
        {p.state === 'Invited' && <div className="row gap"><Link className="btn ghost" to={`/welcome?p=${p.id}`}>Open family invite</Link></div>}
        {app && <section className="panel"><h3 className="display">Application</h3><dl className="dl">{Object.entries(app.answers).filter(([q]) => q !== 'names').map(([q, v]) => <div key={q}><dt>{q}</dt><dd>{v}</dd></div>)}</dl></section>}</div>
      <div><section className="panel"><dl className="dl"><div><dt>Focus</dt><dd>{playerCycle(s, p.id)?.focus || '—'}</dd></div><div><dt>Goal</dt><dd>{p.goal || '—'}</dd></div><div><dt>Learns by</dt><dd>{p.learnStyle || '—'}</dd></div><div><dt>Rhythm</dt><dd>{p.rhythm || '—'}</dd></div></dl></section>
        <section className="panel"><h3 className="display">Skill rubric</h3><Rubric p={p} edit /></section></div></div>}
    {tab === 'canvas' && <section className="panel canvas"><p className="kicker">Coach only. Never shown to the family.</p><label htmlFor="cv" className="strong">How {first(p.name)} ticks</label><textarea id="cv" className="input" rows={6} defaultValue={p.canvas} onBlur={(e) => run({ type: 'updateCanvas', playerId: p.id, canvas: e.target.value })} placeholder="Motivation, triggers, what cues land, family context…" /><p className="small dim">Saves when you leave the field.</p></section>}
    {tab === 'messages' && <Thread p={p} me="coach" onSend={(t) => run({ type: 'sendMessage', playerId: p.id, from: 'coach', text: t })} />}
    {tab === 'journal' && <Journal p={p} />}
    {tab === 'timeline' && <ol className="events">{s.events.filter((e) => e.playerId === p.id).slice().reverse().map((e) => <li key={e.id} className="ev"><time>{shortWhen(e.at)}</time><span className={`who-tag ${e.role}`}>{e.role}</span><span className="grow">{e.from && e.to ? <span className="tr">{e.from} → <b>{e.to}</b> </span> : <b>{e.type} </b>}<span className="dim">{e.detail}</span></span></li>)}</ol>}
    <span className="sr">{g.stage}</span>
  </>);
}

function PlanBuilder() {
  const { id } = useParams(); const s = useSnap(); const { run } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const prev = p && playerCycle(s, p.id);
  const [focus, setFocus] = useState(''); const [pick, setPick] = useState<number[]>([]);
  if (!p) return <p>Player not found.</p>;
  if (!['Plan building', 'Cycle review'].includes(p.state)) return (<><Back to={`/coach/player/${p.id}`}>{p.name}</Back><div className="panel"><h2 className="display">{p.name} isn’t waiting on a plan</h2><p>Current state: <Pill state={p.state} />. Plans can be published from <b>Plan building</b> or <b>Cycle review</b>.</p><ActionButton g={guide(s, p, 'coach')} /></div></>);
  const publish = async () => { if (await run({ type: 'publishPlan', playerId: p.id, focus, assignments: pick })) nav('/coach'); };
  return (<>
    <Back to={`/coach/player/${p.id}`}>{p.name}</Back>
    <h1 className="display">{p.state === 'Cycle review' ? `Cycle ${(prev?.index ?? 0) + 1}` : 'First plan'}: {p.name}</h1>
    <p className="dim">Goal: {p.goal || '—'} · Learns by: {p.learnStyle || '—'} · {p.rhythm || '—'}{prev ? ` · Last focus: ${prev.focus}` : ''}</p>
    <section className="panel"><label htmlFor="fo" className="strong">1 · One focus for the next 2–4 weeks</label><input id="fo" className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Dribbling in traffic with eyes up" /></section>
    <section className="panel"><p className="strong">2 · Queue the reps in order {pick.length > 0 && <span className="dim">({pick.length} queued, unlocked one at a time)</span>}</p>
      <div className="lib">{LIBRARY.map((l, i) => { const n = pick.indexOf(i); return <button key={l.title} aria-pressed={n >= 0} className={`opt ${n >= 0 ? 'on' : ''}`} onClick={() => setPick(n >= 0 ? pick.filter((x) => x !== i) : [...pick, i])}>{n >= 0 && <span className="order">{n + 1}</span>}<strong>{l.title}</strong><span className="small block dim">{l.reps} sets · {l.minutes} min · {l.cues[0]}</span></button>; })}</div></section>
    <div className="row gap"><button className="btn lg" disabled={!focus.trim() || !pick.length} onClick={publish}>Publish plan</button><span className="small dim">{first(p.name)} → <b>Plan set</b>: reads the focus, then rep 1 unlocks.</span></div>
  </>);
}

function Digest() {
  const s = useSnap(); const { run } = useStore(); const wk = weekKey(clock(s)); const [edits, setEdits] = useState<Record<string, string>>({});
  const active = s.players.filter((p) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state));
  const draft = (p: Player) => { const cut = clock(s).getTime() - 7 * 864e5; const done = s.submissions.filter((x) => x.playerId === p.id && new Date(x.at).getTime() > cut).length; const r = s.reviews.filter((x) => x.playerId === p.id).sort((a, b) => b.at.localeCompare(a.at))[0]; const pr = progress(s, p.id);
    return `${first(p.name)} logged ${done} check-in${done === 1 ? '' : 's'} this week, is on a ${pr.streak}-day habit streak, and is at Level ${pr.level} (${pr.name}). Focus: ${playerCycle(s, p.id)?.focus ?? 'first plan coming'}. Status: ${p.state}.${r ? ` My note: ${r.feedback}` : ''}`; };
  return (<><h1 className="display">Weekly digest</h1><p className="dim">Drafted from this week’s events. Edit, then approve. Parents see it in their view.</p>
    {active.map((p) => { const sent = s.digests.find((d) => d.playerId === p.id && d.week === wk); const txt = edits[p.id] ?? draft(p);
      return <section key={p.id} className="panel"><div className="row between"><strong>{p.name} → {family(s, p).parentName}</strong>{sent ? <span className="pill st-approved">Approved</span> : <span className="pill">Draft</span>}</div>
        <label className="sr" htmlFor={`d-${p.id}`}>Digest for {p.name}</label><textarea id={`d-${p.id}`} className="input" rows={3} value={sent?.text ?? txt} disabled={!!sent} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
        {!sent && <button className="btn sm" onClick={() => run({ type: 'approveDigest', playerId: p.id, text: txt })}>Approve</button>}</section>; })}</>);
}

export function CoachShell() {
  const s = useSnap(); const q = buildQueue(s); const n = q.filter((x) => x.kind !== 'Upcoming').length; const late = q.filter((x) => x.overdue).length;
  return (
    <div className="coachshell">
      <aside className="side"><Logo light /><nav aria-label="Coach"><NavLink to="/coach" end>Action Center {n > 0 && <b className={`badge ${late ? 'late' : ''}`}>{n}</b>}</NavLink><NavLink to="/coach/roster">Roster</NavLink><NavLink to="/coach/digest">Weekly digest</NavLink><NavLink to="/log">System log</NavLink><NavLink to="/how">Workflow</NavLink></nav><p className="small dim">Coach [Your Name]</p></aside>
      <main id="main" tabIndex={-1} className="cmain">
        <Routes>
          <Route index element={<ActionCenter />} /><Route path="roster" element={<Roster />} /><Route path="player/:id" element={<Profile />} />
          <Route path="review/:id" element={<Review />} /><Route path="plan/:id" element={<PlanBuilder />} /><Route path="digest" element={<Digest />} />
        </Routes>
      </main>
      <Moments role="coach" />
    </div>
  );
}
