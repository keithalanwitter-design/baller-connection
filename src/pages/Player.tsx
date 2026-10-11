import { useState } from 'react';
import { Link, NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { HABITS, current, priorRetry, first, replyBy, streak, today, useStore, type Player } from '../store';
import { Journal, Pill, Rubric, StatusTrack, Thread } from './shared';

export function useFamilyPlayer() {
  const { s } = useStore(); const [sp] = useSearchParams();
  const q = sp.get('p'); if (q) localStorage.setItem('bc-fam', q);
  const id = q || localStorage.getItem('bc-fam') || 'avery';
  return s.players.find((p) => p.id === id) || s.players[0];
}
export function FamilyPicker({ p, base }: { p: Player; base: string }) {
  const { s } = useStore();
  return <label className="picker small">Viewing <select value={p.id} onChange={(e) => { localStorage.setItem('bc-fam', e.target.value); location.hash = `#${base}?p=${e.target.value}`; }}>{s.players.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
}

function CheckIn({ p, onDone }: { p: Player; onDone: () => void }) {
  const { update } = useStore(); const a = current(p)!;
  const [reps, setReps] = useState<boolean[]>(Array(a.reps).fill(false)); const [r, setR] = useState('');
  const done = reps.filter(Boolean).length;
  const submit = () => {
    update(p.id, (pl) => ({ ...pl, status: 'Submitted', assignments: pl.assignments.map((x) => x.id === a.id ? { ...x, state: 'submitted', repsDone: done, reflection: r.trim(), submittedAt: new Date().toISOString() } : x) }));
    onDone();
  };
  return (
    <form className="checkin pop" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="strong">Tap each set you finished</p>
      <div className="reps">{reps.map((v, i) => <button type="button" key={i} aria-pressed={v} aria-label={`Set ${i + 1}`} className={`rep ${v ? 'on' : ''}`} onClick={() => setReps(reps.map((x, j) => (j === i ? !x : x)))}>{v ? '✓' : i + 1}</button>)}</div>
      <label htmlFor="refl" className="strong">One honest sentence: what happened?</label>
      <textarea id="refl" className="input" rows={2} maxLength={240} value={r} onChange={(e) => setR(e.target.value)} placeholder="Lost it on the switch twice, better when I stayed low." />
      <div className="row between"><span className="small muted">{done}/{a.reps} sets · {r.length}/240</span><button className="btn" disabled={!done || r.trim().length < 5}>Submit to coach</button></div>
    </form>
  );
}

function NextRep({ p }: { p: Player }) {
  const { update } = useStore(); const [open, setOpen] = useState(false); const a = current(p);
  const last = [...p.assignments].reverse().find((x) => x.feedback); const retry = priorRetry(p, a);
  let body;
  if (p.status === 'Invited' || p.status === 'Connected') body = <><h2>Finish setting up</h2><p>Five quick screens and your coach can build your plan.</p><Link className="btn" to="/welcome">Continue setup</Link></>;
  else if (p.status === 'Active' || p.status === 'Plan set' || !a && p.status !== 'Next step ready') body = <><h2>Your plan is on the way</h2><p>Your coach is building your first focus. It arrives by <strong>{replyBy()}</strong>. Until then: knock out today’s habits below.</p></>;
  else if (p.status === 'Next step ready') body = <><h2>New feedback is in</h2><blockquote className="quote">{last?.feedback}</blockquote><button className="btn" onClick={() => update(p.id, (x) => ({ ...x, status: 'Work ready' }))}>Start next rep →</button></>;
  else if (a && a.state === 'submitted') body = <><h2>Submitted ✓</h2><p><strong>{a.title}</strong> · {a.repsDone}/{a.reps} sets. Your coach replies by <strong>{replyBy(a.submittedAt)}</strong>.</p><p className="muted">Nice work. Keep the streak going below.</p></>;
  else if (a) body = <>
    <p className="eyebrow">{retry ? 'Another attempt · coach note' : 'Assigned by your coach'}</p>
    <h2>{a.title}</h2>
    <p className="meta">{a.reps} sets · {a.minutes} min · Focus: {p.focus}</p>
    {retry && <blockquote className="quote sm">{retry.feedback}</blockquote>}
    <ul className="cues">{a.cues.map((c) => <li key={c}>{c}</li>)}</ul>
    {open ? <CheckIn p={p} onDone={() => setOpen(false)} /> : <button className="btn lg" onClick={() => setOpen(true)}>Log practice</button>}
  </>;
  return <section className="card nextrep" aria-labelledby="nr"><p id="nr" className="eyebrow gold">Your next rep</p>{body}</section>;
}

function Habits({ p }: { p: Player }) {
  const { update } = useStore(); const k = `${today()}`; const st = streak(p.habits);
  const [checked, setChecked] = useState<string[]>(() => JSON.parse(localStorage.getItem(`bc-h-${p.id}-${k}`) || '[]'));
  const toggle = (h: string) => {
    const n = checked.includes(h) ? checked.filter((x) => x !== h) : [...checked, h]; setChecked(n); localStorage.setItem(`bc-h-${p.id}-${k}`, JSON.stringify(n));
    update(p.id, (x) => ({ ...x, habits: n.length === HABITS.length ? Array.from(new Set([...x.habits, k])) : x.habits.filter((d) => d !== k) }));
  };
  return (
    <section className="card"><div className="row between"><h3>Daily habits</h3><span className="streak" aria-label={`${st} day streak`}>🔥 {st}-day streak</span></div>
      <div className="habits">{HABITS.map((h) => <button key={h} aria-pressed={checked.includes(h)} className={`habit ${checked.includes(h) ? 'on' : ''}`} onClick={() => toggle(h)}>{checked.includes(h) ? '✓ ' : ''}{h}</button>)}</div>
      <p className="small muted">All three today keeps the streak alive.</p></section>
  );
}

function Today({ p }: { p: Player }) {
  const last = [...p.assignments].reverse().find((x) => x.feedback);
  const sub = current(p);
  const line = p.status === 'Submitted' || p.status === 'Feedback due' ? `Coach replies by ${replyBy(sub?.submittedAt)}` : p.status === 'Active' ? `Plan arrives by ${replyBy()}` : `Next live check-in ${new Date(p.nextSession + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })}`;
  return (<>
    <div className="hello"><h1>Hey {first(p.name)}.</h1><p className="statusline"><Pill status={p.status} /> <span>{line}</span></p><StatusTrack status={p.status} /></div>
    <NextRep p={p} />
    <Habits p={p} />
    {last && p.status !== 'Next step ready' && last !== priorRetry(p, sub) && <section className="card"><p className="eyebrow">Latest coach feedback</p><p className="strong">{last.title}</p><blockquote className="quote sm">{last.feedback}</blockquote><Link to="/app/development" className="link">See your proof chain →</Link></section>}
  </>);
}

function Development({ p }: { p: Player }) {
  return (<>
    <h1>Development</h1>
    <section className="card"><p className="eyebrow">Current focus</p><h2>{p.focus || 'Coming with your first plan'}</h2><p className="muted">Season goal: {p.goal || '—'}</p></section>
    <section className="card"><h3>Skill rubric</h3><p className="small muted">1 = learning it · 3 = reliable in practice · 5 = reliable in games</p><Rubric r={p.rubric} /></section>
    <section><h3>Proof chain</h3><p className="small muted">Each entry links the assignment, your response, and what the coach saw.</p><Journal p={p} /></section>
  </>);
}

export function badges(p: Player) {
  const sub = p.assignments.filter((a) => a.submittedAt).length, ok = p.assignments.filter((a) => a.state === 'approved').length, st = streak(p.habits);
  return [['First check-in', sub >= 1], ['3-day streak', st >= 3], ['7-day streak', st >= 7], ['First approval', ok >= 1], ['Honest retry', p.assignments.some((a) => a.state === 'retry')], ['5 approvals', ok >= 5]] as [string, boolean][];
}
function Progress({ p }: { p: Player }) {
  const b = badges(p); const sub = p.assignments.filter((a) => a.submittedAt).length;
  return (<>
    <h1>Progress</h1>
    <div className="stats"><div className="card"><b>{streak(p.habits)}</b><span>day streak</span></div><div className="card"><b>{sub}</b><span>check-ins</span></div><div className="card"><b>{p.assignments.filter((a) => a.state === 'approved').length}</b><span>approved</span></div></div>
    <section className="card"><h3>Badges</h3><ul className="badges">{b.map(([n, on]) => <li key={n} className={on ? 'on' : ''}><span aria-hidden>{on ? '★' : '☆'}</span>{n}<span className="sr">{on ? ' earned' : ' not yet'}</span></li>)}</ul></section>
  </>);
}

export function PlayerShell() {
  const p = useFamilyPlayer(); const { update } = useStore();
  const tabs = [['/app', 'Today'], ['/app/development', 'Development'], ['/app/messages', 'Messages'], ['/app/progress', 'Progress']];
  return (
    <div className="appshell">
      <header className="apph"><Logo /><div className="row gap"><FamilyPicker p={p} base="/app" /><Link className="small link" to="/parent">Parent view</Link></div></header>
      <main id="main" tabIndex={-1} className="appmain">
        <Routes>
          <Route index element={<Today p={p} />} />
          <Route path="development" element={<Development p={p} />} />
          <Route path="messages" element={<><h1>Messages</h1><p className="muted small">Your coach replies within the window on your plan.</p><Thread p={p} me="player" onSend={(t) => update(p.id, (x) => ({ ...x, messages: [...x.messages, { from: 'player', text: t, at: new Date().toISOString() }] }))} /></>} />
          <Route path="progress" element={<Progress p={p} />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Player">{tabs.map(([to, l]) => <NavLink key={to} to={to} end>{l}</NavLink>)}</nav>
    </div>
  );
}
