import { Link } from 'react-router-dom';
import { Logo } from '../App';
import { first, replyBy, streak, useStore, weekKey } from '../store';
import { FamilyPicker, useFamilyPlayer } from './Player';
import { Pill } from './shared';

export default function Parent() {
  const p = useFamilyPlayer(); const { s } = useStore();
  const week = Date.now() - 7 * 864e5;
  const recent = p.assignments.filter((a) => !a.submittedAt || new Date(a.submittedAt).getTime() > week);
  const digest = s.digests[`${p.id}-${weekKey()}`];
  return (
    <div className="appshell">
      <header className="apph"><Logo /><div className="row gap"><FamilyPicker p={p} base="/parent" /><Link className="small link" to="/app">Player view</Link></div></header>
      <main id="main" tabIndex={-1} className="appmain">
        <p className="eyebrow">Parent view · {p.parentName}</p>
        <h1>{first(p.name)}’s week</h1>
        <p className="statusline"><Pill status={p.status} /> {p.status === 'Submitted' ? `Coach replies by ${replyBy()}` : `Plan: ${p.tier}`}</p>
        <div className="stats"><div className="card"><b>{recent.length}</b><span>assigned</span></div><div className="card"><b>{recent.filter((a) => a.submittedAt).length}</b><span>done</span></div><div className="card"><b>{streak(p.habits)}</b><span>day habit streak</span></div></div>
        <section className="card"><h3>Coach’s weekly note</h3>{digest ? <p className="quote sm">{digest}</p> : <p className="muted">Your coach approves this week’s summary on Sunday.</p>}</section>
        <section className="card"><h3>This week’s work</h3>{recent.length === 0 ? <p className="muted">No work assigned yet{p.status === 'Active' ? ' — the first plan arrives within 2 business days' : ''}.</p> :
          <ul className="plain">{recent.map((a) => <li key={a.id}><strong>{a.title}</strong> — {a.state === 'assigned' ? 'not started' : a.state === 'submitted' ? `done ${a.repsDone}/${a.reps}, awaiting coach` : a.state === 'retry' ? 'coach asked for another attempt' : 'approved'}{a.feedback && <p className="small muted">Coach: {a.feedback}</p>}</li>)}</ul>}</section>
        <p className="small muted">Nothing for you to do here. Questions? <Link className="link" to="/app/messages">Message the coach</Link>.</p>
      </main>
    </div>
  );
}
