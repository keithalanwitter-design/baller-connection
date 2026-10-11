import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { weekKey } from '../../shared/time';
import { clock, family, first, playerCycle, progress } from '../../shared/workflow';
import { JourneyMap, Moments, PathPanel, PlayerPicker, Thread, Track, useFamilyPlayer } from '../ui';

export default function Parent() {
  const s = useSnap(); const [sp] = useSearchParams(); const p = useFamilyPlayer(s, sp.get('p')); const { run } = useStore();
  const wk = clock(s).getTime() - 7 * 864e5; const pr = progress(s, p.id); const cyc = playerCycle(s, p.id);
  const subs = s.submissions.filter((x) => x.playerId === p.id && new Date(x.at).getTime() > wk);
  const assigned = s.assignments.filter((a) => a.playerId === p.id && a.cycleId === cyc?.id);
  const digest = s.digests.find((d) => d.playerId === p.id && d.week === weekKey(clock(s)));
  const canPause = !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Paused'].includes(p.state);
  return (
    <div className="appshell">
      <header className="apph"><Logo light /><div className="row gap"><PlayerPicker p={p} base="/parent" /><Link className="small link light" to={`/app?p=${p.id}`}>Player view</Link></div></header>
      <main id="main" tabIndex={-1} className="appmain">
        <p className="kicker">Parent view · {family(s, p).parentName}</p>
        <h1 className="display">{first(p.name)}’s week</h1>
        <Track state={p.state} />
        <PathPanel p={p} role="parent" compact />
        <div className="stats"><div><b>{assigned.length}</b><span>reps this cycle</span></div><div><b>{subs.length}</b><span>done this week</span></div><div><b>{pr.streak}</b><span>day streak</span></div><div><b>L{pr.level}</b><span>{pr.name}</span></div></div>
        <section className="panel"><h3 className="display">Coach’s weekly note</h3>{digest ? <blockquote className="quote sm">{digest.text}</blockquote> : <p className="dim">The coach approves this week’s summary on Sunday.</p>}</section>
        <section className="panel"><h3 className="display">This cycle{cyc ? `: ${cyc.focus}` : ''}</h3>{assigned.length === 0 ? <p className="dim">No work assigned yet.</p> :
          <ul className="plain">{assigned.map((a) => { const r = s.reviews.find((x) => s.submissions.find((y) => y.id === x.submissionId)?.assignmentId === a.id); return <li key={a.id}><strong>{a.title}</strong> — {({ queued: 'up later', open: 'to do now', submitted: 'done, awaiting coach', approved: 'approved ✓', retry: 'coach asked for another attempt' })[a.status]}{r && <p className="small dim">Coach: {r.feedback}</p>}</li>; })}</ul>}</section>
        <JourneyMap pid={p.id} />
        <section className="panel"><h3 className="display">Message the coach</h3><Thread p={p} me="parent" onSend={(t) => run({ type: 'sendMessage', playerId: p.id, from: 'parent', text: t })} /></section>
        <p className="small dim">No coaching homework for you. {canPause && <button className="link small" onClick={() => run({ type: 'pause', playerId: p.id })}>Pause plan</button>}</p>
      </main>
      <Moments role="parent" pid={p.id} />
    </div>
  );
}
