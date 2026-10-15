import { useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { HABITS, type Player } from '../../shared/domain';
import { isoDay, relative, shortWhen } from '../../shared/time';
import { clock, first, guide, tierReply, userName, lastReview, lastSubmission, openAssignment, playerAssignments, playerCycle, progress } from '../../shared/workflow';
import { greeting } from '../../shared/personal';
import { ActionButton, Moments, PathPanel, PlayerPicker, UserMenu, useFamilyPlayer } from '../ui';
import { ClipPicker, FocusCard, RETENTION_COPY, WorkingOn, type PickedClip } from '../v5';
import { InstallPrompt } from '../pwa';
import { CardSettings, GamePlanCard, PressureBadge, ShotCourt, WinsWall, emptyShots, isShooting } from '../v7';
import { CoachKnows, CycleReviewPlayer, FeedbackTimeline, PromiseCard, ReflectionCard, TournamentBox, UnifiedInbox, WhyLine } from '../v4';
import { GameNoteForm, GameNotes, GamifyToggle, IntakeClip, MeetCoach, RhythmCard, RoughWeek, SessionCard, SinceWeek1, StuckButton } from '../v9';

function CheckIn({ p }: { p: Player }) {
  const s = useSnap(); const { run, upload } = useStore(); const a = openAssignment(s, p.id)!;
  const [sets, setSets] = useState(a.reps); const [r, setR] = useState(''); const [link, setLink] = useState(''); const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState<number[][]>(emptyShots); const [clip, setClip] = useState<PickedClip | null>(null); const [watch, setWatch] = useState(''); const [stage, setStage] = useState('');
  return (
    <form className="checkin" onSubmit={async (e) => { e.preventDefault(); setBusy(true);
      let clipId: string | undefined; if (clip) { setStage('Uploading clip…'); clipId = (await upload(p.id, clip.file, { durationSec: clip.durationSec, mime: clip.mime, watchFor: watch })) ?? undefined; if (!clipId) { setBusy(false); setStage(''); return; } }
      setStage('Sending…'); await run({ type: 'submitRep', playerId: p.id, repsDone: sets, reflection: r, shots: shots.some((x) => x[1] > 0) ? shots : undefined, linkUrl: link.trim() || undefined, clipId, watchFor: clip ? watch : undefined }); setBusy(false); setStage(''); }}>
      <p className="strong">1 · Your clip <span className="dim">(30 seconds or less)</span></p>
      <ClipPicker p={p} value={clip} onChange={setClip} />
      {clip && <><label htmlFor="watch" className="small">What should your coach watch for? (optional)</label><input id="watch" className="input" maxLength={200} value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="My feet on the catch" /></>}
      <p className="small dim">{RETENTION_COPY} Practice clips only, not full games.</p>
      {!clip && <details className="small"><summary>No clip this time? Share a link instead</summary><label htmlFor="rlink" className="sr">Link</label><input id="rlink" className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></details>}
      <label htmlFor="refl" className="strong">2 · What happened? One honest sentence.</label>
      <textarea id="refl" className="input" rows={2} maxLength={240} value={r} onChange={(e) => setR(e.target.value)} placeholder="Lost it on the switch twice, better when I stayed low." />
      <div className="row gap wrapx setsrow"><span className="strong small" id="sets-l">3 · Sets I got through</span><div className="stepper" role="group" aria-labelledby="sets-l"><button type="button" className="mini" aria-label="One fewer set" onClick={() => setSets(Math.max(1, sets - 1))}>−</button><b id="sets-n" aria-live="polite">{sets} of {a.reps}</b><button type="button" className="mini" aria-label="One more set" onClick={() => setSets(Math.min(a.reps, sets + 1))}>+</button></div></div>
      <details className="shotlog" open={isShooting(a.title)}><summary className="strong small">Shooting log (optional)</summary><ShotCourt value={shots} onChange={setShots} /></details>
      <div className="row between"><span className="small dim">{first(userName(s, p.coachId))} writes back {tierReply(s, p)}.</span><button className="btn lg" disabled={busy || r.trim().length < 5}>{stage || 'Send to my coach'}</button></div>
    </form>
  );
}

function RepCard({ p }: { p: Player }) {
  const s = useSnap(); const a = openAssignment(s, p.id); const rev = lastReview(s, p.id); const sub = lastSubmission(s, p.id); const cyc = playerCycle(s, p.id);
  const retry = a && a.status === 'open' && rev?.decision === 'retry' && s.assignments.find((x) => x.id === s.submissions.find((y) => y.id === rev.submissionId)?.assignmentId)?.title === a.title;
  const queued = playerAssignments(s, p.id).filter((x) => x.status === 'queued'); const g = guide(s, p, 'player'); const coach = first(userName(s, p.coachId));
  let body;
  if (p.state === 'Work ready' && a) body = <>
    <p className="kicker orange">{retry ? `Same rep again, with ${coach}’s adjustment` : 'Your next rep'}</p><h2 className="display">{a.title}</h2>
    <p className="meta">{a.reps} sets · {a.minutes} min · Focus: {cyc?.focus}</p><PressureBadge pr={a.pressure} /><WhyLine p={p} />
    {rev && (retry || rev.teachBack) && <FocusCard p={p} me="player" compact />}
    <ul className="cues">{a.cues.map((c) => <li key={c}>{c}</li>)}</ul><CheckIn p={p} /></>;
  else if ((p.state === 'Submitted' || p.state === 'Feedback due' || p.state === 'Sign-off') && sub) body = <>
    <p className="kicker orange">{p.state === 'Sign-off' ? 'Written. One last look before it reaches you.' : `With ${coach}`}</p><h2 className="display">Sent ✓</h2>
    <p>{s.assignments.find((x) => x.id === sub.assignmentId)?.title} · {sub.repsDone} sets{sub.clipId ? ` · 🎥 ${Math.round(s.clips.find((c) => c.id === sub.clipId)?.durationSec ?? 0)} s clip` : ''} · “{sub.reflection}”</p>
    <div className="sla-clock"><span>{coach} writes back by</span><b>{shortWhen(sub.dueBy)}</b><span className="small">{relative(sub.dueBy, clock(s))}</span></div>
    <p className="small dim">You’ll get what went well, one adjustment, why, and your next rep. {queued.length ? `${queued.length} more rep${queued.length > 1 ? 's' : ''} in this stretch.` : 'That’s the last rep in this stretch.'}</p></>;
  else if (p.state === 'Next step ready') body = <>
    <p className="kicker orange">{sub?.reviewed === false ? 'Saved' : `From ${coach}`}</p>{sub?.reviewed === false && <h2 className="display">Saved ✓</h2>}
    {sub?.reviewed === false ? <><p className="small">This week’s written reviews on {p.tier} are used. {coach} still sees every clip. They reset Sunday.</p><ActionButton g={g} className="btn lg" /></> : rev && <FocusCard p={p} me="player" />}
    <p className="small dim">{queued.length ? `Next up: ${queued[0].title}` : 'That was the last rep. Next: your re-check.'}</p></>;
  else if (p.state === 'Plan set') body = <><p className="kicker orange">Your focus · {s.settings.cycleWeeks ?? 4} weeks</p><h2 className="display">{cyc?.focus}</h2><WhyLine p={p} /><ol className="planlist">{queued.map((x) => <li key={x.id}>{x.title} <span className="dim small">· {x.reps} sets</span></li>)}</ol><ActionButton g={g} className="btn lg" /></>;
  else if (p.state === 'Cycle review') body = <><p className="kicker orange">Re-check time</p><h2 className="display">Look at week 1 next to now.</h2><p>{g.why}</p><ActionButton g={g} className="btn lg" /></>;
  else if (p.state === 'Plan building') body = <><p className="kicker orange">First look</p><h2 className="display">{coach} is looking at how you play.</h2><p>{g.why}</p><p className="small dim">He’ll tell you what he saw by {g.byWhen}. Send a clip below if you haven’t.</p></>;
  else return null;
  return <section id="rep" className={`repcard rc-${p.state.replace(/ /g, '-').toLowerCase()}`}>{body}</section>;
}
function Habits({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const d = isoDay(clock(s)); const pr = progress(s, p.id);
  const on = (k: string) => s.habits.some((h) => h.playerId === p.id && h.date === d && h.key === k);
  return (
    <section id="habits" className="habitcard">
      <div className="row between"><h3 className="display">Daily habits</h3><span className="flame" aria-label={`${pr.streak} day streak`}>🔥 {pr.streak}</span></div>
      <div className="habits">{HABITS.map((h) => <button key={h} aria-pressed={on(h)} className={`habit ${on(h) ? 'on' : ''}`} onClick={() => run({ type: 'toggleHabit', playerId: p.id, key: h })}>{on(h) ? '✓ ' : '+ '}{h}</button>)}</div>
      <p className="small dim">You turned this on. You can turn it off in Progress.</p>
    </section>
  );
}

function Today({ p }: { p: Player }) {
  const s = useSnap(); const pr = progress(s, p.id);
  const repOwnsAction = ['Work ready', 'Next step ready', 'Plan set', 'Cycle review', 'Plan building'].includes(p.state);
  const active = !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding', 'Paused'].includes(p.state);
  return (<>
    <div className="hello"><div><p className="kicker">{first(userName(s, p.coachId))} is your coach{p.gamify ? ` · Level ${pr.level} ${pr.name}` : ''}</p><h1 className="display">{greeting(p, clock(s))}</h1></div></div>
    {p.state === 'Plan building' && <IntakeClip p={p} />}
    {!repOwnsAction && <PathPanel p={p} role="player" />}
    <SessionCard p={p} />
    <RepCard p={p} />
    {p.firstLook && <MeetCoach p={p} compact />}
    <WorkingOn p={p} editable />
    {active && <RhythmCard p={p} />}
    {active && <RoughWeek p={p} />}
    <GamePlanCard p={p} editable compact />
    <InstallPrompt compact />
    {p.gamify && <Habits p={p} />}
  </>);
}

function Develop({ p }: { p: Player }) {
  const s = useSnap(); const cyc = playerCycle(s, p.id);
  return (<>
    <h1 className="display">Develop</h1>
    <section className="focuscard"><p className="kicker orange">Current focus{cyc ? ` · re-check ${shortWhen(cyc.endAt)}` : ''}</p><h2 className="display">{cyc?.focus || 'Coming with your first look'}</h2><WhyLine p={p} /></section>
    <MeetCoach p={p} />
    {p.state === 'Cycle review' && <CycleReviewPlayer p={p} me="player" />}
    <section><h3 className="display">Feedback history</h3><p className="small dim">Every clip, what you wrote, and what your coach saw.</p><FeedbackTimeline p={p} me="player" /></section>
    <CoachKnows p={p} editable />
    {p.state !== 'Cycle review' && <CycleReviewPlayer p={p} me="player" />}
    <ReflectionCard p={p} />
    <TournamentBox p={p} />
  </>);
}

function Progress({ p }: { p: Player }) {
  const s = useSnap(); const pr = progress(s, p.id); const ms = s.milestones.filter((m) => m.playerId === p.id);
  const ALL = ['First check-in', 'First approval', 'Honest retry', '3-day streak', '7-day streak', '14-day streak', 'Cycle 1 complete', 'Cycle 2 complete'];
  return (<>
    <h1 className="display">Progress</h1>
    <SinceWeek1 p={p} me="player" />
    <WinsWall p={p} me="player" />
    <PromiseCard p={p} />
    <GamifyToggle p={p} />
    {p.gamify && <><div className="stats"><div><b>{pr.streak}</b><span>day streak</span></div><div><b>{pr.subs}</b><span>check-ins</span></div><div><b>{pr.approved}</b><span>approved</span></div></div>
      <section className="panel"><h3 className="display">Badges</h3><ul className="badges">{ALL.map((n) => { const m = ms.find((x) => x.key === n); return <li key={n} className={m ? 'on' : ''}><span aria-hidden>{m ? '★' : '☆'}</span>{n}<span className="sr">{m ? ' earned' : ' not yet'}</span>{m && <small>{shortWhen(m.at)}</small>}</li>; })}</ul></section></>}
    <CardSettings p={p} />
  </>);
}

function Games({ p }: { p: Player }) {
  const playing = !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state);
  return (<>
    <h1 className="display">Games</h1><p className="small light">Practice builds it. Games show it. One short note after each game, and your coach reads every one.</p>
    <GamePlanCard p={p} editable />
    {playing ? <GameNoteForm p={p} onDone={() => document.getElementById('games')?.scrollIntoView({ behavior: 'smooth' })} /> : <p className="note">Game notes open once coaching starts.</p>}
    <section id="games"><h3 className="display">My game notes</h3><GameNotes p={p} me="player" /></section>
  </>);
}

export function PlayerShell() {
  const s = useSnap(); const [sp] = useSearchParams(); const p = useFamilyPlayer(s, sp.get('p')); const { run, mode, as } = useStore();
  if (!p) return <main className="appmain"><p>No player on this account yet.</p></main>;
  const tabs = [['/app', 'Today', '◎'], ['/app/games', 'Games', '🏀'], ['/app/develop', 'Develop', '▲'], ['/app/inbox', 'Inbox', '✉'], ['/app/progress', 'Progress', '★']];
  const unread = s.messages.filter((m) => m.playerId === p.id && m.from === 'coach' && !(as && m.readBy?.[as.id])).length + s.notifications.filter((n) => n.userId === as?.id && !n.readAt).length; void run;
  return (
    <div className="appshell hardwood">
      <header className="apph"><Logo light /><div className="row gap">{(mode === 'demo' || s.players.length > 1) && <PlayerPicker p={p} base="/app" />}{(mode === 'demo' || as?.role === 'parent') && <Link className="small link light" to={`/parent?p=${p.id}`}>Parent view</Link>}<UserMenu /></div></header>
      <main id="main" tabIndex={-1} className="appmain">
        <Routes>
          <Route index element={<Today p={p} />} /><Route path="develop" element={<Develop p={p} />} /><Route path="development" element={<Develop p={p} />} />
          <Route path="inbox" element={<><h1 className="display">Inbox</h1><p className="small dim">Messages and updates in one place. {first(userName(s, p.coachId))} writes back {tierReply(s, p)}.</p><UnifiedInbox players={[p]} me={as?.role === 'parent' ? 'parent' : 'player'} fixedPlayer /></>} />
          <Route path="messages" element={<Navigate to="/app/inbox" replace />} />
          <Route path="progress" element={<Progress p={p} />} /><Route path="games" element={<Games p={p} />} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Player">{tabs.map(([to, l, ic]) => <NavLink key={to} to={to} end><span aria-hidden>{ic}</span>{l}{l === 'Inbox' && unread > 0 && <i className="dotn" aria-hidden />}</NavLink>)}</nav>
      {!['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state) && as?.role !== 'parent' && <StuckButton p={p} />}
      <Moments role="player" pid={p.id} />
    </div>
  );
}
