import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { weekKey } from '../../shared/time';
import { clock, family, first, playerCycle, progress } from '../../shared/workflow';
import { Moments, PathPanel, PlayerPicker, Track, UserMenu, useFamilyPlayer } from '../ui';
import { ClipPrivacy, FocusCard } from '../v5';
import { BillingPanel } from '../v6';
import { subscriptionOf } from '../../shared/billing';
import { CoachKnows, CycleReviewPlayer, PromiseCard, UnifiedInbox } from '../v4';
import { plainFeedback } from '../../shared/personal';
import { useEffect, useState } from 'react';
import { shortWhen } from '../../shared/time';
import { userName } from '../../shared/workflow';
import { playerCsv, calendarIcs } from '../../server/export';
import type { Player } from '../../shared/domain';

const download = (name: string, text: string, type = 'text/csv') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
/** Account, schedule and privacy: player login PIN, consent record, iCal, CSV export, deletion request. */
function Account({ p }: { p: Player }) {
  const s = useSnap(); const { run, api, mode, refresh } = useStore(); const [u, setU] = useState(''); const [pin, setPin] = useState(''); const [msg, setMsg] = useState(''); const [cal, setCal] = useState('');
  useEffect(() => { if (mode === 'live') api.get<{ url: string }>('/api/calendar-link').then((r) => setCal(r.url)).catch(() => {}); }, [api, mode]);
  const login = s.users.find((x) => x.role === 'player' && x.playerId === p.id); const consent = s.consents.find((c) => c.playerId === p.id);
  const reqs = s.dataRequests.filter((r) => r.playerId === p.id); const fn = first(p.name);
  const meetings = s.meetings.filter((m) => m.playerId === p.id && m.status === 'scheduled' && new Date(m.at) > clock(s)).sort((a, b) => a.at.localeCompare(b.at));
  return <>
    <section className="panel"><h3 className="display">Schedule</h3>{meetings.length === 0 ? <p className="dim">No sessions booked. Coach availability: {s.settings.availability}.</p> : <ul className="plain">{meetings.map((m) => <li key={m.id}><b>{shortWhen(m.at)}</b> · {m.kind === 'live' ? 'Live session' : m.kind === 'fit-call' ? 'Intro call' : 'Check-in'} with {userName(s, m.staffId)} ({m.minutes} min)</li>)}</ul>}
      {mode === 'live' ? cal && <a className="chip" href={cal}>📅 Add to my calendar (iCal)</a> : <button className="chip" onClick={() => download('sessions.ics', calendarIcs({ ...s, meetings: s.meetings.filter((m) => m.playerId === p.id) }), 'text/calendar')}>📅 Download .ics</button>}</section>
    <section className="panel" id="account"><h3 className="display">Account & privacy</h3><dl className="dl">
      <div><dt>Plan</dt><dd>{p.tier} · see Billing below</dd></div>
      <div><dt>Coach</dt><dd>{userName(s, p.coachId)}</dd></div>
      <div><dt>Consent</dt><dd>{consent ? `Given by ${consent.guardianName}, ${shortWhen(consent.at)} (v${consent.version})` : 'Not yet recorded'}</dd></div>
      <div><dt>{fn}’s login</dt><dd>{login?.username ? `Username “${login.username}” · PIN set by you` : login?.email ? `Email ${login.email}` : 'None yet'}</dd></div></dl>
      <form className="row gap wrapx" onSubmit={async (e) => { e.preventDefault(); try { await api.setPlayerPin({ playerId: p.id, username: u || login?.username || '', pin }); await refresh(); setMsg('✓ Saved. Share the PIN with ' + fn + ' in person.'); setPin(''); } catch (x) { setMsg((x as Error).message); } }}>
        <input aria-label="Player username" className="input" style={{ maxWidth: 200 }} value={u} placeholder={login?.username ?? 'username'} onChange={(e) => setU(e.target.value)} /><input aria-label="New PIN" className="input" style={{ maxWidth: 120 }} type="password" inputMode="numeric" value={pin} placeholder="New PIN" onChange={(e) => setPin(e.target.value)} />
        <button className="btn sm" disabled={!/^\d{4,8}$/.test(pin) || !(u || login?.username)}>{login ? 'Change PIN' : 'Create player login'}</button></form>{msg && <p className="small">{msg}</p>}
      <div className="row gap wrapx"><button className="chip" onClick={() => (mode === 'live' ? window.open(api.url(`/api/players/${p.id}/export.csv`)) : download(`${p.name}.csv`, playerCsv(s, p.id)))}>⬇ Export {fn}’s data (CSV)</button>
        <button className="chip danger" disabled={reqs.some((r) => r.kind === 'delete' && r.status === 'open')} onClick={() => { if (confirm(`Request deletion of all of ${fn}’s data? Ops completes it within 30 days.`)) run({ type: 'requestData', playerId: p.id, kind: 'delete' }); }}>Request deletion</button></div>
      {reqs.map((r) => <p key={r.id} className="small dim">{r.kind === 'delete' ? 'Deletion' : 'Export'} requested {shortWhen(r.at)} · {r.status}</p>)}</section>
  </>;
}

export default function Parent() {
  const s = useSnap(); const [sp] = useSearchParams(); const p = useFamilyPlayer(s, sp.get('p')); const { run, mode } = useStore();
  if (!p) return <main className="appmain"><p>No player on this account yet. <Link to="/invite">Accept an invite</Link></p></main>;
  const wk = clock(s).getTime() - 7 * 864e5; const pr = progress(s, p.id); const cyc = playerCycle(s, p.id);
  const subs = s.submissions.filter((x) => x.playerId === p.id && new Date(x.at).getTime() > wk);
  const assigned = s.assignments.filter((a) => a.playerId === p.id && a.cycleId === cyc?.id);
  const digest = s.digests.filter((d) => d.playerId === p.id && d.status === 'approved').sort((a, b) => b.week.localeCompare(a.week))[0]; void weekKey;
  const canPause = !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Paused'].includes(p.state);
  return (
    <div className="appshell">
      <header className="apph"><Logo light /><div className="row gap">{(mode === 'demo' || s.players.length > 1) && <PlayerPicker p={p} base="/parent" />}<Link className="small link light" to={`/app?p=${p.id}`}>Player view</Link><UserMenu /></div></header>
      <main id="main" tabIndex={-1} className="appmain">
        <p className="kicker">Parent view · {family(s, p).parentName}</p>
        <h1 className="display">{first(p.name)}’s week</h1>
        <Track state={p.state} />
        <PathPanel p={p} role="parent" compact />
        <FocusCard p={p} me="parent" compact />
        <div className="stats"><div><b>{assigned.length}</b><span>reps this cycle</span></div><div><b>{subs.length}</b><span>done this week</span></div><div><b>{pr.streak}</b><span>day streak</span></div><div><b>L{pr.level}</b><span>{pr.name}</span></div></div>
        <section className="panel"><h3 className="display">Coach’s weekly note</h3>{digest ? <blockquote className="quote sm">{digest.text}</blockquote> : <p className="dim">The coach approves this week’s summary on Sunday.</p>}</section>
        <section className="panel"><h3 className="display">This cycle{cyc ? `: ${cyc.focus}` : ''}</h3>{assigned.length === 0 ? <p className="dim">No work assigned yet.</p> :
          <ul className="plain">{assigned.map((a) => { const r = s.reviews.find((x) => x.status === 'final' && s.submissions.find((y) => y.id === x.submissionId)?.assignmentId === a.id); return <li key={a.id}><strong>{a.title}</strong> — {({ queued: 'up later', open: 'to do now', submitted: 'done, awaiting coach', approved: 'approved ✓', retry: 'coach asked for another attempt', logged: 'done (logged)' })[a.status]}{r && <p className="small dim">{r.wentWell ? plainFeedback(p, r) : `Coach: ${r.feedback}`}</p>}</li>; })}</ul>}</section>
        <PromiseCard p={p} />
        <section className="panel" id="messages"><h3 className="display">Messages & updates</h3><p className="small dim">Pick a type: General, Schedule change, or Urgent (injury or a same-day change: {s.settings.urgentReplyHours} office hours, head coach alerted).</p><UnifiedInbox players={[p]} me="parent" fixedPlayer /></section>
        <CycleReviewPlayer p={p} me="parent" />
        <CoachKnows p={p} />
        <ClipPrivacy p={p} />
        <BillingPanel p={p} />
        <Account p={p} />
        <p className="small dim">No coaching homework for you. {canPause && <button className="link small" onClick={() => run({ type: 'pause', playerId: p.id })}>Pause coaching</button>}{p.state === 'Paused' && !subscriptionOf(s, p.id)?.pausedByBilling && <button className="link small" onClick={() => run({ type: 'resume', playerId: p.id })}>Resume coaching</button>} Pausing coaching doesn’t stop billing; to stop paying, cancel in Billing.</p>
      </main>
      <Moments role="parent" pid={p.id} />
    </div>
  );
}
