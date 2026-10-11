import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { ASSIGNMENT_LIBRARY, buildQueue, current, first, fmt, streak, uid, useStore, weekKey, type Player, type QueueKind } from '../store';
import { Journal, Pill, Rubric, StatusTrack, Thread } from './shared';

const KINDS: QueueKind[] = ['Reply needed', 'Work ready', 'Plan needed', 'Activation', 'Upcoming'];
const say = (m: string) => { const el = document.getElementById('toast'); if (el) { el.textContent = m; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); } };

function ActionCenter() {
  const { s } = useStore(); const q = buildQueue(s.players);
  const [f, setF] = useState<QueueKind | 'All'>('All');
  const urgent = q.filter((x) => x.kind !== 'Upcoming').length;
  const rows = q.filter((x) => f === 'All' || x.kind === f);
  return (<>
    <div className="row between wrapx"><div><h1>Action Center</h1><p className="lead sm">{urgent === 0 ? 'You’re clear. Nobody is waiting on you.' : `${urgent} ${urgent === 1 ? 'thing needs' : 'things need'} you, most urgent first.`}</p></div><Link className="btn ghost" to="/coach/digest">Weekly digest →</Link></div>
    <div className="chips" role="group" aria-label="Filter queue">
      <button aria-pressed={f === 'All'} className={`chip ${f === 'All' ? 'on' : ''}`} onClick={() => setF('All')}>All <b>{q.length}</b></button>
      {KINDS.map((k) => { const c = q.filter((x) => x.kind === k).length; return <button key={k} aria-pressed={f === k} className={`chip k-${k.split(' ')[0].toLowerCase()} ${f === k ? 'on' : ''}`} onClick={() => setF(k)}>{k} <b>{c}</b></button>; })}
    </div>
    <ol className="queue">{rows.map((x, i) => (
      <li key={x.kind + x.player.id}><Link to={x.to} className={`qrow k-${x.kind.split(' ')[0].toLowerCase()}`}>
        <span className="rank">{i + 1}</span>
        <span className="grow"><span className="row gap"><strong>{x.player.name}</strong><span className="kind">{x.kind}</span></span><span className="small muted block">{x.why}</span></span>
        <span aria-hidden>›</span></Link></li>))}
      {rows.length === 0 && <li className="card muted">Nothing in this lane.</li>}</ol>
    <p className="small muted">Counts are computed from the same list you see — they always match the rows.</p>
  </>);
}

function Review() {
  const { id } = useParams(); const { s, update } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const a = p && current(p);
  const [fb, setFb] = useState(''); const [next, setNext] = useState(ASSIGNMENT_LIBRARY.findIndex((l) => l.title === a?.title) + 1 || 0);
  if (!p || !a || a.state !== 'submitted') return <div className="card"><h2>Nothing to review</h2><p>This work was already reviewed.</p><Link className="btn" to="/coach">Back to Action Center</Link></div>;
  const approve = () => { update(p.id, (x) => ({ ...x, status: 'Next step ready', assignments: [...x.assignments.map((y) => y.id === a.id ? { ...y, state: 'approved' as const, feedback: fb.trim(), reviewedAt: new Date().toISOString() } : y), { ...ASSIGNMENT_LIBRARY[next % ASSIGNMENT_LIBRARY.length], id: uid(), state: 'assigned' as const }] })); say(`Approved. ${first(p.name)} sees “Next step ready”.`); nav('/coach'); };
  const retry = () => { update(p.id, (x) => ({ ...x, status: 'Work ready', assignments: [...x.assignments.map((y) => y.id === a.id ? { ...y, state: 'retry' as const, feedback: fb.trim(), reviewedAt: new Date().toISOString() } : y), { ...a, id: uid(), state: 'assigned' as const, repsDone: undefined, reflection: undefined, submittedAt: undefined, feedback: undefined }] })); say(`Sent back. ${first(p.name)} sees “Another attempt”.`); nav('/coach'); };
  return (
    <div className="review pop">
      <Link to="/coach" className="link small">← Action Center</Link>
      <h1>Review: {p.name}</h1><p className="muted">Focus: {p.focus} · {p.tier}</p>
      <section className="card"><p className="eyebrow">Submitted {fmt(a.submittedAt!)}</p><h2>{a.title}</h2><p><strong>{a.repsDone}/{a.reps}</strong> sets done</p><blockquote className="quote sm">“{a.reflection}”</blockquote><ul className="cues">{a.cues.map((c) => <li key={c}>{c}</li>)}</ul></section>
      {p.canvas && <section className="card canvas"><p className="eyebrow">Your canvas (coach only)</p><p>{p.canvas}</p></section>}
      <section className="card">
        <label htmlFor="fb" className="strong">Feedback — one observation, one cue</label>
        <textarea id="fb" className="input" rows={3} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="Good read on the left wing. Next: set your feet before the catch." />
        <div className="row gap wrapx">{['Exactly right — keep that.', 'Slow it down: 3 walk-throughs first.', 'Love the honesty in that reflection.'].map((t) => <button key={t} className="chip" onClick={() => setFb((v) => (v ? v + ' ' : '') + t)}>+ {t}</button>)}</div>
        <label htmlFor="nx" className="strong">If approved, next rep</label>
        <select id="nx" className="input" value={next} onChange={(e) => setNext(+e.target.value)}>{ASSIGNMENT_LIBRARY.map((l, i) => <option key={l.title} value={i}>{l.title} · {l.reps} sets · {l.minutes} min</option>)}</select>
        <div className="row gap"><button className="btn" disabled={fb.trim().length < 5} onClick={approve}>Approve + send next rep</button><button className="btn ghost" disabled={fb.trim().length < 5} onClick={retry}>Request another attempt</button></div>
      </section>
    </div>
  );
}

function Roster() {
  const { s } = useStore();
  return (<><h1>Roster <span className="muted">{s.players.length}/15</span></h1>
    <div className="table" role="table" aria-label="Roster">{s.players.map((p) => (
      <Link key={p.id} to={`/coach/player/${p.id}`} className="trow" role="row"><span role="cell"><strong>{p.name}</strong><span className="small muted block">{p.age} · {p.position} · {p.tier}</span></span><span role="cell"><Pill status={p.status} /></span><span role="cell" className="small">{p.focus || <span className="muted">No focus yet</span>}</span><span role="cell" className="small">🔥 {streak(p.habits)}</span></Link>))}</div>
    <p className="small muted">Tier caps: Inner Circle {s.players.filter((p) => p.tier === 'Inner Circle').length}/4.</p></>);
}

function Profile() {
  const { id } = useParams(); const [sp, setSp] = useSearchParams(); const { s, update } = useStore();
  const p = s.players.find((x) => x.id === id); const tab = sp.get('tab') || 'overview';
  if (!p) return <p>Player not found. <Link to="/coach/roster">Roster</Link></p>;
  const tabs = ['overview', 'canvas', 'messages', 'journal'];
  return (<>
    <Link to="/coach/roster" className="link small">← Roster</Link>
    <div className="row between wrapx"><div><h1>{p.name}</h1><p className="muted">{p.age} · {p.position} · {p.tier} · Parent: {p.parentName}</p></div><Pill status={p.status} /></div>
    <StatusTrack status={p.status} />
    <div className="seg sm" role="tablist">{tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setSp({ tab: t })}>{t === 'canvas' ? 'Player canvas' : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {tab === 'overview' && <div className="grid2">
      <section className="card"><p className="eyebrow">Next action</p>
        {p.status === 'Invited' ? <><p>Invite not accepted.</p><div className="row gap"><button className="btn" onClick={() => say('Demo: invite reminder would be emailed.')}>Resend invite</button><Link className="btn ghost" to="/welcome">Open family invite</Link></div></>
          : p.status === 'Connected' ? <p>Family is finishing onboarding.</p>
          : p.status === 'Submitted' ? <Link className="btn" to={`/coach/review/${p.id}`}>Review submission</Link>
          : <Link className="btn" to={`/coach/plan/${p.id}`}>{p.focus ? 'Adjust plan' : 'Build plan'}</Link>}
        <dl><dt>Focus</dt><dd>{p.focus || '—'}</dd><dt>Goal</dt><dd>{p.goal || '—'}</dd><dt>Learns by</dt><dd>{p.learnStyle || '—'}</dd><dt>Rhythm</dt><dd>{p.rhythm || '—'}</dd></dl></section>
      <section className="card"><h3>Skill rubric</h3><Rubric r={p.rubric} edit={(k, v) => update(p.id, (x) => ({ ...x, rubric: { ...x.rubric, [k]: v } }))} /></section></div>}
    {tab === 'canvas' && <section className="card canvas"><p className="eyebrow">Coach only — never shown to family</p><label htmlFor="cv" className="strong">How {first(p.name)} ticks</label><textarea id="cv" className="input" rows={6} value={p.canvas} onChange={(e) => update(p.id, (x) => ({ ...x, canvas: e.target.value }))} placeholder="Motivation, triggers, what cues land, family context…" /><p className="small muted">Saves as you type.</p></section>}
    {tab === 'messages' && <Thread p={p} me="coach" onSend={(t) => { update(p.id, (x) => ({ ...x, messages: [...x.messages, { from: 'coach', text: t, at: new Date().toISOString() }] })); say('Reply sent — cleared from Reply needed.'); }} />}
    {tab === 'journal' && <Journal p={p} />}
  </>);
}

function PlanBuilder() {
  const { id } = useParams(); const { s, update } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id);
  const [focus, setFocus] = useState(p?.focus || ''); const [pick, setPick] = useState<number[]>([]);
  if (!p) return <p>Player not found.</p>;
  const save = () => { update(p.id, (x: Player) => ({ ...x, focus: focus.trim(), status: pick.length ? 'Work ready' : 'Plan set', assignments: [...x.assignments.filter((a) => a.state !== 'assigned'), ...pick.map((i) => ({ ...ASSIGNMENT_LIBRARY[i], id: uid(), state: 'assigned' as const }))].slice(0, 99) })); say(`Plan saved. ${first(p.name)} sees “${pick.length ? 'Work ready' : 'Plan set'}”.`); nav('/coach'); };
  return (<>
    <Link to={`/coach/player/${p.id}`} className="link small">← {p.name}</Link>
    <h1>Plan builder: {p.name}</h1><p className="muted">Goal: {p.goal || '—'} · Learns by: {p.learnStyle || '—'} · {p.rhythm || '—'}</p>
    <section className="card"><label htmlFor="fo" className="strong">1. One focus for the next 2–4 weeks</label><input id="fo" className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Dribbling in traffic without looking down" /></section>
    <section className="card"><p className="strong">2. Assign the first rep{pick.length > 1 ? 's (first one shows on Today)' : ''}</p>
      <div className="lib">{ASSIGNMENT_LIBRARY.map((l, i) => <button key={l.title} aria-pressed={pick.includes(i)} className={`opt ${pick.includes(i) ? 'on' : ''}`} onClick={() => setPick(pick.includes(i) ? pick.filter((x) => x !== i) : [...pick, i])}><strong>{l.title}</strong><span className="small block">{l.reps} sets · {l.minutes} min · {l.cues[0]}</span></button>)}</div></section>
    <button className="btn lg" disabled={!focus.trim()} onClick={save}>Publish plan</button>
  </>);
}

function Digest() {
  const { s, set } = useStore(); const wk = weekKey();
  const active = s.players.filter((p) => !['Invited', 'Connected'].includes(p.status));
  const draft = (p: Player) => { const done = p.assignments.filter((a) => a.submittedAt && Date.now() - new Date(a.submittedAt).getTime() < 7 * 864e5); const fb = [...p.assignments].reverse().find((a) => a.feedback);
    return `${first(p.name)} logged ${done.length} check-in${done.length === 1 ? '' : 's'} this week and kept a ${streak(p.habits)}-day habit streak. Focus: ${p.focus || 'first plan coming'}. ${fb ? `My note: ${fb.feedback}` : ''}`.trim(); };
  const [edits, setEdits] = useState<Record<string, string>>({});
  return (<><h1>Weekly digest</h1><p className="muted">Drafted from this week’s activity. Edit, then approve — parents see it in their Parent view.</p>
    {active.map((p) => { const key = `${p.id}-${wk}`; const sent = s.digests[key]; const txt = edits[p.id] ?? draft(p);
      return <section key={p.id} className="card"><div className="row between"><strong>{p.name} → {p.parentName}</strong>{sent ? <span className="pill a-approved">Approved</span> : <span className="pill">Draft</span>}</div>
        <label className="sr" htmlFor={`d-${p.id}`}>Digest for {p.name}</label>
        <textarea id={`d-${p.id}`} className="input" rows={3} value={sent ?? txt} disabled={!!sent} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
        {sent ? <button className="link small" onClick={() => set((st) => { const d = { ...st.digests }; delete d[key]; return { ...st, digests: d }; })}>Unapprove</button>
          : <button className="btn sm" onClick={() => { set((st) => ({ ...st, digests: { ...st.digests, [key]: txt } })); say('Approved — visible in Parent view.'); }}>Approve</button>}
      </section>; })}</>);
}

export function CoachShell() {
  const { s } = useStore(); const n = buildQueue(s.players).filter((x) => x.kind !== 'Upcoming').length;
  return (
    <div className="coach">
      <aside className="side"><Logo /><nav aria-label="Coach"><NavLink to="/coach" end>Action Center {n > 0 && <b className="badge">{n}</b>}</NavLink><NavLink to="/coach/roster">Roster</NavLink><NavLink to="/coach/digest">Weekly digest</NavLink></nav><p className="small muted">Coach [Your Name]</p></aside>
      <main id="main" tabIndex={-1} className="cmain">
        <Routes>
          <Route index element={<ActionCenter />} /><Route path="roster" element={<Roster />} /><Route path="player/:id" element={<Profile />} />
          <Route path="review/:id" element={<Review />} /><Route path="plan/:id" element={<PlanBuilder />} /><Route path="digest" element={<Digest />} />
        </Routes>
      </main>
      <div id="toast" className="toast" role="status" aria-live="polite" />
    </div>
  );
}
