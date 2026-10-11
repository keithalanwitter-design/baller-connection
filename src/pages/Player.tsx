import { useState } from 'react';
import { Link, NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { HABITS, type Player } from '../../shared/domain';
import { isoDay, relative, shortWhen } from '../../shared/time';
import { clock, first, tierReply, userName, lastReview, lastSubmission, openAssignment, playerAssignments, playerCycle, progress } from '../../shared/workflow';
import { JourneyMap, Journal, Moments, PathPanel, PlayerPicker, Rubric, Thread, Track, UserMenu, useFamilyPlayer } from '../ui';

function CheckIn({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const a = openAssignment(s, p.id)!;
  const [reps, setReps] = useState<boolean[]>(() => Array(a.reps).fill(false)); const [r, setR] = useState(''); const [link, setLink] = useState(''); const [busy, setBusy] = useState(false);
  const done = reps.filter(Boolean).length;
  return (
    <form className="checkin" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await run({ type: 'submitRep', playerId: p.id, repsDone: done, reflection: r, linkUrl: link.trim() || undefined }); setBusy(false); }}>
      <p className="strong">1 · Tap each set you finished</p>
      <div className="reps">{reps.map((v, i) => <button type="button" key={i} aria-pressed={v} aria-label={`Set ${i + 1}`} className={`rep ${v ? 'on' : ''}`} onClick={() => setReps(reps.map((x, j) => (j === i ? !x : x)))}>{v ? '✓' : i + 1}</button>)}</div>
      <div className="repbar" aria-hidden><i style={{ width: `${(done / a.reps) * 100}%` }} /></div>
      <label htmlFor="refl" className="strong">2 · One honest sentence: what happened?</label>
      <textarea id="refl" className="input" rows={2} maxLength={240} value={r} onChange={(e) => setR(e.target.value)} placeholder="Lost it on the switch twice, better when I stayed low." />
      <label htmlFor="rlink" className="small dim">Optional link (e.g. a clip you host elsewhere). We don’t take uploads or review full game film.</label><input id="rlink" className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
      <div className="row between"><span className="small dim">{done}/{a.reps} sets · coach replies {tierReply(s, p)}</span><button className="btn lg" disabled={busy || !done || r.trim().length < 5}>Submit to coach</button></div>
    </form>
  );
}

function RepCard({ p }: { p: Player }) {
  const s = useSnap(); const a = openAssignment(s, p.id); const rev = lastReview(s, p.id); const sub = lastSubmission(s, p.id); const cyc = playerCycle(s, p.id);
  const retry = a && a.status === 'open' && rev?.decision === 'retry' && s.assignments.find((x) => x.id === s.submissions.find((y) => y.id === rev.submissionId)?.assignmentId)?.title === a.title;
  const queued = playerAssignments(s, p.id).filter((x) => x.status === 'queued');
  let body;
  if (p.state === 'Work ready' && a) body = <>
    <p className="kicker orange">{retry ? 'Another attempt · coach cue' : 'Your next rep'}</p><h2 className="display">{a.title}</h2>
    <p className="meta">{a.reps} sets · {a.minutes} min · Focus: {cyc?.focus}</p>
    {retry && <blockquote className="quote sm">{rev!.feedback}</blockquote>}
    <ul className="cues">{a.cues.map((c) => <li key={c}>{c}</li>)}</ul><CheckIn p={p} /></>;
  else if ((p.state === 'Submitted' || p.state === 'Feedback due' || p.state === 'Sign-off') && sub) body = <>
    <p className="kicker orange">{p.state === 'Sign-off' ? 'Feedback written · head coach finalizing' : `Waiting on ${first(userName(s, p.coachId))}`}</p><h2 className="display">Submitted ✓</h2>
    <p>{s.assignments.find((x) => x.id === sub.assignmentId)?.title} · {sub.repsDone} sets · “{sub.reflection}”</p>
    <div className="sla-clock"><span>Coach replies by</span><b>{shortWhen(sub.dueBy)}</b><span className="small">{relative(sub.dueBy, clock(s))}</span></div>
    <p className="small dim">While you wait: knock out today’s habits. {queued.length ? `${queued.length} more rep${queued.length > 1 ? 's' : ''} in this cycle.` : 'This is the last rep of the cycle.'}</p></>;
  else if (p.state === 'Next step ready' && rev) body = <><p className="kicker orange">Coach feedback</p><h2 className="display">Approved ✓</h2><blockquote className="quote">{rev.feedback}</blockquote><p className="small dim">{queued.length ? `Up next: ${queued[0].title}` : 'That was the last rep. Next: your cycle wrap-up.'}</p></>;
  else if (p.state === 'Plan set') body = <><p className="kicker orange">New plan · Cycle {cyc?.index}</p><h2 className="display">{cyc?.focus}</h2><ol className="planlist">{queued.map((x) => <li key={x.id}>{x.title} <span className="dim small">· {x.reps} sets</span></li>)}</ol></>;
  else if (p.state === 'Cycle review') body = <><p className="kicker orange">Cycle {cyc?.index} complete</p><h2 className="display">You finished the cycle.</h2><p>Coach is re-rating your rubric and picking the next focus.</p></>;
  else return null;
  return <section id="rep" className={`repcard rc-${p.state.replace(/ /g, '-').toLowerCase()}`}>{body}</section>;
}

function Habits({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const d = isoDay(clock(s)); const pr = progress(s, p.id);
  const on = (k: string) => s.habits.some((h) => h.playerId === p.id && h.date === d && h.key === k);
  const week = Array.from({ length: 7 }, (_, i) => { const x = clock(s); x.setDate(x.getDate() - (6 - i)); const iso = isoDay(x); return { iso, n: s.habits.filter((h) => h.playerId === p.id && h.date === iso).length, label: x.toLocaleDateString('en-US', { weekday: 'narrow' }) }; });
  return (
    <section id="habits" className="habitcard">
      <div className="row between"><h3 className="display">Daily habits</h3><span className={`flame ${pr.streak >= 3 ? 'hot' : ''}`} aria-label={`${pr.streak} day streak`}>🔥 {pr.streak}</span></div>
      <div className="habits">{HABITS.map((h) => <button key={h} aria-pressed={on(h)} className={`habit ${on(h) ? 'on' : ''}`} onClick={() => run({ type: 'toggleHabit', playerId: p.id, key: h })}>{on(h) ? '✓ ' : '+ '}{h}</button>)}</div>
      <ol className="week" aria-label="Last 7 days">{week.map((w) => <li key={w.iso} className={w.n >= 3 ? 'full' : w.n ? 'part' : ''}><i /><span>{w.label}</span></li>)}</ol>
      <p className="small dim">All three in a day keeps the streak. 7 days in a row helps unlock Level 5.</p>
    </section>
  );
}

function Today({ p }: { p: Player }) {
  const s = useSnap(); const pr = progress(s, p.id); const rev = lastReview(s, p.id);
  return (<>
    <div className="hello"><div><p className="kicker">Level {pr.level} · {pr.name}</p><h1 className="display">Hey {first(p.name)}.</h1></div><span className={`flame big ${pr.streak >= 3 ? 'hot' : ''}`} aria-label={`${pr.streak} day streak`}>🔥{pr.streak}</span></div>
    <Track state={p.state} />
    <PathPanel p={p} role="player" />
    <RepCard p={p} />
    <JourneyMap pid={p.id} />
    <Habits p={p} />
    {rev && p.state !== 'Next step ready' && !(p.state === 'Work ready' && rev.decision === 'retry') && <section className="fbcard"><p className="kicker">Latest coach feedback</p><blockquote className="quote sm">{rev.feedback}</blockquote><Link to="/app/development" className="link">See your proof chain →</Link></section>}
  </>);
}

function Development({ p }: { p: Player }) {
  const s = useSnap(); const cyc = playerCycle(s, p.id);
  return (<>
    <h1 className="display">Development</h1>
    <section className="focuscard"><p className="kicker orange">Current focus{cyc ? ` · Cycle ${cyc.index}` : ''}</p><h2 className="display">{cyc?.focus || 'Coming with your first plan'}</h2><p className="dim">Season goal: {p.goal || '—'}</p></section>
    <section className="panel"><h3 className="display">Skill rubric</h3><p className="small dim">1 = learning it · 3 = reliable in practice · 5 = reliable in games. Re-rated every cycle.</p><Rubric p={p} /></section>
    <section><h3 className="display">Proof chain</h3><p className="small dim">Each entry links the assignment, your response and what the coach saw.</p><Journal p={p} /></section>
  </>);
}

function Progress({ p }: { p: Player }) {
  const s = useSnap(); const pr = progress(s, p.id); const ms = s.milestones.filter((m) => m.playerId === p.id);
  const ALL = ['First check-in', 'First approval', 'Honest retry', '3-day streak', '7-day streak', '14-day streak', 'Cycle 1 complete', 'Cycle 2 complete'];
  return (<>
    <h1 className="display">Progress</h1>
    <div className="stats"><div><b>{pr.streak}</b><span>day streak</span></div><div><b>{pr.subs}</b><span>check-ins</span></div><div><b>{pr.approved}</b><span>approved</span></div><div><b>{pr.cycles}</b><span>cycles</span></div></div>
    <JourneyMap pid={p.id} big />
    <section className="panel"><h3 className="display">Badges</h3><ul className="badges">{ALL.map((n) => { const m = ms.find((x) => x.key === n); return <li key={n} className={m ? 'on' : ''}><span aria-hidden>{m ? '★' : '☆'}</span>{n}<span className="sr">{m ? ' earned' : ' not yet'}</span>{m && <small>{shortWhen(m.at)}</small>}</li>; })}</ul></section>
  </>);
}

export function PlayerShell() {
  const s = useSnap(); const [sp] = useSearchParams(); const p = useFamilyPlayer(s, sp.get('p')); const { run, mode, as } = useStore();
  if (!p) return <main className="appmain"><p>No player on this account yet.</p></main>;
  const tabs = [['/app', 'Today', '◎'], ['/app/development', 'Develop', '▲'], ['/app/messages', 'Messages', '✉'], ['/app/progress', 'Progress', '★']];
  const unread = s.messages.filter((m) => m.playerId === p.id && m.from === 'coach' && !(as && m.readBy?.[as.id])).length;
  return (
    <div className="appshell hardwood">
      <header className="apph"><Logo light /><div className="row gap">{(mode === 'demo' || s.players.length > 1) && <PlayerPicker p={p} base="/app" />}{(mode === 'demo' || as?.role === 'parent') && <Link className="small link light" to={`/parent?p=${p.id}`}>Parent view</Link>}<UserMenu /></div></header>
      <main id="main" tabIndex={-1} className="appmain">
        <Routes>
          <Route index element={<Today p={p} />} /><Route path="development" element={<Development p={p} />} />
          <Route path="messages" element={<><h1 className="display">Messages</h1><p className="small dim">Coach replies {tierReply(s, p)}. Every message gets a reply-by time.</p><Thread p={p} me="player" onSend={(t, l) => run({ type: 'sendMessage', playerId: p.id, text: t, linkUrl: l })} /></>} />
          <Route path="progress" element={<Progress p={p} />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Player">{tabs.map(([to, l, ic]) => <NavLink key={to} to={to} end><span aria-hidden>{ic}</span>{l}{l === 'Messages' && unread > 0 && <i className="dotn" aria-hidden />}</NavLink>)}</nav>
      <Moments role="player" pid={p.id} />
    </div>
  );
}
