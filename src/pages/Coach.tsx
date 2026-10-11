import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { perspective, useSnap, useStore } from '../store';
import { TIER_INFO, replyLabel, type Billing, type Drill, type OutboxEmail, type Player, type Settings, type Tier } from '../../shared/domain';
import { relative, shortWhen, weekKey } from '../../shared/time';
import { OPS_KINDS, QUEUE_KINDS, buildOpsQueue, buildQueue, capacity, clock, family, first, guide, lastSubmission, pendingReview, playerAssignments, playerCycle, progress, staff, teamLoad, tierReply, userName, type OpsKind, type QueueKind } from '../../shared/workflow';
import { playerCsv, calendarIcs } from '../../server/export';
import { ActionButton, Back, Journal, Moments, PathPanel, Pill, Rubric, Thread, Track, UserMenu } from '../ui';
import SystemLog from './Log';
import Inbox from './Inbox';

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
  const urgent = q.filter((x) => x.kind !== 'Upcoming').length; const overdue = q.filter((x) => x.overdue).length; const rows = q.filter((x) => f === 'All' || x.kind === f);
  return (<>
    <div className="row between wrapx"><div><p className="kicker">{t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · {as?.name}</p><h1 className="display">Action Center</h1>
      <p className="lead sm">{urgent === 0 ? 'You’re clear. Nobody is waiting on you.' : <>{urgent} {urgent === 1 ? 'thing needs' : 'things need'} you{overdue ? <>, <b className="overdue-t">{overdue} overdue</b></> : ''}. Most urgent first.</>}</p></div><Capacity /></div>
    <div className="row gap wrapx">
      {isHead && <div className="seg light" role="group" aria-label="Whose queue"><button aria-pressed={scope === 'mine'} className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>Mine</button><button aria-pressed={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Whole team</button></div>}
      <div className="chips" role="group" aria-label="Filter queue">
        <button aria-pressed={f === 'All'} className={`chip ${f === 'All' ? 'on' : ''}`} onClick={() => setF('All')}>All <b>{q.length}</b></button>
        {QUEUE_KINDS.map((kind) => <button key={kind} aria-pressed={f === kind} className={`chip k-${k(kind)} ${f === kind ? 'on' : ''}`} onClick={() => setF(kind)}>{kind} <b>{q.filter((x) => x.kind === kind).length}</b></button>)}
      </div></div>
    <ol className="queue">{rows.map((x, i) => <QRow key={x.key} i={i} to={x.to} name={x.player.name} kind={x.kind} state={x.player.state} what={x.what} why={x.why} owner={scope === 'all' ? x.ownerName : undefined} unlocks={x.unlocks} dueBy={x.dueBy} overdue={x.overdue} />)}
      {rows.length === 0 && <li className="panel dim">Nothing in this lane.</li>}</ol>
    <p className="small dim">Items are routed to the player’s assigned coach; assistant reviews route to the head coach for sign-off. Counts come from the same list as the rows. The SLA sweep runs on a schedule (every 15 min).</p>
  </>);
}

function OpsQueue() {
  const s = useSnap(); const q = buildOpsQueue(s); const [f, setF] = useState<OpsKind | 'All'>('All'); const rows = q.filter((x) => f === 'All' || x.kind === f); const t = clock(s);
  return (<>
    <div className="row between wrapx"><div><p className="kicker">{t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · Ops</p><h1 className="display">Ops queue</h1><p className="lead sm">Intake, invites, billing status, scheduling and privacy requests. No coaching calls here.</p></div><Capacity /></div>
    <div className="chips" role="group" aria-label="Filter ops queue"><button aria-pressed={f === 'All'} className={`chip ${f === 'All' ? 'on' : ''}`} onClick={() => setF('All')}>All <b>{q.length}</b></button>
      {OPS_KINDS.map((kind) => <button key={kind} aria-pressed={f === kind} className={`chip ${f === kind ? 'on' : ''}`} onClick={() => setF(kind)}>{kind} <b>{q.filter((x) => x.kind === kind).length}</b></button>)}</div>
    <ol className="queue">{rows.map((x, i) => <QRow key={x.key} i={i} to={x.to} name={x.player.name} kind={x.kind} state={x.player.state} what={x.what} why={x.why} unlocks={x.unlocks} dueBy={x.dueBy} overdue={x.overdue} />)}
      {rows.length === 0 && <li className="panel dim">Nothing in this lane.</li>}</ol>
  </>);
}

function Review() {
  const { id } = useParams(); const s = useSnap(); const { run, as } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const sub = p && lastSubmission(s, p.id); const a = sub && s.assignments.find((x) => x.id === sub.assignmentId);
  const pend = p && pendingReview(s, p.id); const [fb, setFb] = useState(''); const [edit, setEdit] = useState<string | null>(null);
  if (!p || !sub || !a || !['Submitted', 'Feedback due', 'Sign-off'].includes(p.state)) return <div className="panel"><h2 className="display">Nothing to review</h2><p>This work was already reviewed.</p><Link className="btn" to="/coach">Back to Action Center</Link></div>;
  const queued = playerAssignments(s, p.id).filter((x) => x.status === 'queued'); const late = new Date(sub.dueBy) < clock(s);
  const act = async (decision: 'approve' | 'retry') => { if (await run({ type: 'review', playerId: p.id, decision, feedback: fb })) nav('/coach'); };
  const sign = async (approve: boolean) => { if (await run({ type: 'signOff', playerId: p.id, approve, feedback: edit ?? undefined })) nav('/coach'); };
  const signoffRule = s.settings.requireSignoff && as?.role === 'assistant';
  return (
    <div className="review">
      <Back to="/coach">Action Center</Back>
      <div className="row between wrapx"><h1 className="display">{p.state === 'Sign-off' ? 'Sign-off' : 'Review'}: {p.name}</h1><span className={`sla big ${late ? 'late' : ''}`}><b>{late ? 'OVERDUE' : 'Reply by'}</b>{shortWhen(sub.dueBy)}</span></div>
      <p className="dim">Focus: {playerCycle(s, p.id)?.focus} · {p.tier} (replies {tierReply(s, p)}) · Assigned to {userName(s, p.coachId)}</p>
      <div className="grid2">
        <section className="panel"><p className="kicker">Submitted {shortWhen(sub.at)}</p><h2 className="display">{a.title}</h2><p><b>{sub.repsDone}/{a.reps}</b> sets done</p><blockquote className="quote sm">“{sub.reflection}”</blockquote>{sub.linkUrl && <a className="attach" href={sub.linkUrl} target="_blank" rel="noreferrer noopener">🔗 {sub.linkUrl}</a>}<ul className="cues">{a.cues.map((c) => <li key={c}>{c}</li>)}</ul></section>
        {p.canvas && <section className="panel canvas"><p className="kicker">Your canvas (coach only)</p><p>{p.canvas}</p></section>}
      </div>
      {p.state === 'Sign-off' && pend ? (
        <section className="panel signoff"><p className="kicker">{userName(s, pend.reviewerId)} · {shortWhen(pend.at)} · proposed: <b>{pend.decision === 'approve' ? 'Approve' : 'Another attempt'}</b></p>
          {as?.role === 'head' ? <>
            <label htmlFor="ed" className="strong">Feedback the family will see</label><textarea id="ed" className="input" rows={3} value={edit ?? pend.feedback} onChange={(e) => setEdit(e.target.value)} />
            <div className="outcomes"><button className="outcome ok" onClick={() => sign(true)}><b>Sign off{edit !== null && edit !== pend.feedback ? ' with edits' : ''}</b><span>{first(p.name)} → {pend.decision === 'approve' ? 'Next step ready' : 'Work ready (another attempt)'}.</span></button>
              <button className="outcome retry" onClick={() => sign(false)}><b>Flip to {pend.decision === 'approve' ? 'Another attempt' : 'Approve'}</b><span>Overrides the assistant’s call. Logged.</span></button></div>
          </> : <><blockquote className="quote sm">{pend.feedback}</blockquote><p className="dim">Waiting for {userName(s, s.users.find((u) => u.role === 'head')?.id)} to sign off. The family sees “Sign-off: head coach is finalizing”.</p></>}
        </section>) : (
      <section className="panel">
        <label htmlFor="fb" className="strong">Feedback: one observation, one cue</label>
        <textarea id="fb" className="input" rows={3} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="Good read on the left wing. Next: set your feet before the catch." />
        <div className="row wrapx">{['Exactly right. Keep that.', 'Slow it down: 3 walk-throughs first.', 'Love the honesty in that reflection.'].map((x) => <button key={x} className="chip" onClick={() => setFb((v) => (v ? v + ' ' : '') + x)}>+ {x}</button>)}</div>
        {signoffRule && <p className="note">Your reviews go to the head coach for sign-off before {first(p.name)} sees them ({p.name} → Sign-off).</p>}
        <div className="outcomes">
          <button className="outcome ok" disabled={fb.trim().length < 5} onClick={() => act('approve')}><b>Approve</b><span>{signoffRule ? 'After sign-off: ' : ''}{first(p.name)} → Next step ready. {queued.length ? `Unlocks: ${queued[0].title}` : 'Last rep → Cycle review.'}</span></button>
          <button className="outcome retry" disabled={fb.trim().length < 5} onClick={() => act('retry')}><b>Another attempt</b><span>{signoffRule ? 'After sign-off: ' : ''}{first(p.name)} → Work ready, same rep with your cue.</span></button>
        </div>
      </section>)}
    </div>
  );
}

function Roster() {
  const s = useSnap(); const base = useBase(); const [who, setWho] = useState('all');
  const list = s.players.filter((p) => who === 'all' || p.coachId === who);
  return (<><div className="row between wrapx"><h1 className="display">Roster</h1><Capacity /></div>
    <label className="picker">Coach <select value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Everyone</option>{staff(s).filter((u) => u.role !== 'ops').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    <div className="table" role="table" aria-label="Roster">{list.map((p) => { const pr = progress(s, p.id); return (
      <Link key={p.id} to={`${base}/player/${p.id}`} className="trow r5" role="row"><span role="cell"><strong>{p.name}</strong><span className="small dim block">{p.age} · {p.position || '—'} · {p.tier}</span></span><span role="cell"><Pill state={p.state} /></span><span role="cell" className="small">{playerCycle(s, p.id)?.focus || <span className="dim">No focus yet</span>}</span><span role="cell" className="small">{first(userName(s, p.coachId))} · <span className={`bill b-${p.billing}`}>{p.billing}</span></span><span role="cell" className="small">L{pr.level} · 🔥{pr.streak}</span></Link>); })}</div></>);
}

function StaffBox({ p }: { p: Player }) {
  const s = useSnap(); const { run, as, mode, api } = useStore(); const canAssign = as?.role === 'head' || as?.role === 'ops';
  const [when, setWhen] = useState(''); const [kind, setKind] = useState<'check-in' | 'live'>('check-in');
  const exportCsv = () => (mode === 'live' ? window.open(api.url(`/api/players/${p.id}/export.csv`)) : download(`${p.name.replace(/\W+/g, '-')}.csv`, playerCsv(s, p.id)));
  const inv = s.invites.filter((i) => i.playerId === p.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]; const consent = s.consents.find((c) => c.playerId === p.id);
  return <section className="panel"><h3 className="display">Staff</h3><dl className="dl">
    <div><dt>Coach</dt><dd>{canAssign ? <select aria-label="Assigned coach" value={p.coachId} onChange={(e) => run({ type: 'assignCoach', playerId: p.id, coachId: e.target.value })}>{staff(s).filter((u) => u.role !== 'ops').map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select> : userName(s, p.coachId)}</dd></div>
    <div><dt>Billing</dt><dd>{canAssign ? <select aria-label="Billing" value={p.billing} onChange={(e) => run({ type: 'setBilling', playerId: p.id, billing: e.target.value as Billing })}>{['unpaid', 'paid', 'comp'].map((b) => <option key={b}>{b}</option>)}</select> : p.billing} <span className="small dim">${TIER_INFO[p.tier].price}/mo · manual</span></dd></div>
    <div><dt>Consent</dt><dd>{consent ? `${consent.guardianName} · ${shortWhen(consent.at)} · v${consent.version}` : <span className="overdue-t">Not on file</span>}</dd></div>
    {inv && <div><dt>Invite</dt><dd>{inv.status} · {inv.email}{inv.code && ` · code ${inv.code}`} · expires {shortWhen(inv.expiresAt)}</dd></div>}
  </dl>
    <form className="row gap wrapx" onSubmit={(e) => { e.preventDefault(); if (when) run({ type: 'scheduleSession', playerId: p.id, at: new Date(when).toISOString(), minutes: kind === 'live' ? 30 : 15, kind, note: kind === 'live' ? 'Live session' : 'Check-in' }).then(() => setWhen('')); }}>
      <label className="sr" htmlFor="sw">Session time</label><input id="sw" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 230 }} />
      <select aria-label="Session kind" value={kind} onChange={(e) => setKind(e.target.value as 'check-in' | 'live')}><option value="check-in">Check-in</option><option value="live">Live session</option></select><button className="btn sm" disabled={!when}>Schedule</button></form>
    <div className="row gap wrapx">{(p.state === 'Applied' || p.state === 'Fit review' || p.state === 'Waitlist' || p.state === 'Invited') && canAssign && <><button className="btn sm" onClick={() => run({ type: 'createInvite', playerId: p.id })}>{p.state === 'Invited' ? 'Resend invite' : 'Send invite'}</button>{p.state !== 'Waitlist' && p.state !== 'Invited' && <button className="btn sm ghost" onClick={() => run({ type: 'decideFit', playerId: p.id, accept: false })}>Waitlist</button>}</>}
      {p.state === 'Invited' && mode === 'demo' && <Link className="btn sm ghost" to={`/invite?token=${inv?.token ?? ''}`}>Open family invite</Link>}
      {(as?.role === 'head' || as?.role === 'ops') && <button className="btn sm ghost" onClick={exportCsv}>Export CSV</button>}</div>
  </section>;
}

function Profile() {
  const { id } = useParams(); const [sp, setSp] = useSearchParams(); const s = useSnap(); const { run, as } = useStore(); const base = useBase(); const view = perspective(as?.role);
  const p = s.players.find((x) => x.id === id); const tab = sp.get('tab') || 'overview';
  if (!p) return <p>Player not found. <Link to={`${base}/roster`}>Roster</Link></p>;
  const app = s.applications.find((a) => a.playerId === p.id); const tabs = view === 'ops' ? ['overview', 'timeline'] : ['overview', 'canvas', 'messages', 'journal', 'timeline'];
  return (<>
    <Back to={`${base}/roster`}>Roster</Back>
    <div className="row between wrapx"><div><h1 className="display">{p.name}</h1><p className="dim">{p.age} · {p.position || '—'} · {p.tier} · Parent: {family(s, p).parentName} · Coach: {userName(s, p.coachId)}</p></div><Pill state={p.state} /></div>
    <Track state={p.state} />
    <div className="seg light" role="tablist">{tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setSp({ tab: t })}>{t === 'canvas' ? 'Player canvas' : t[0].toUpperCase() + t.slice(1)}</button>)}</div>
    {tab === 'overview' && <div className="grid2">
      <div><PathPanel p={p} role={view} /><StaffBox p={p} />
        {app && <section className="panel"><h3 className="display">Application</h3><dl className="dl">{Object.entries(app.answers).filter(([q]) => q !== 'names').map(([q, v]) => <div key={q}><dt>{q}</dt><dd>{v}</dd></div>)}</dl></section>}</div>
      <div><section className="panel"><dl className="dl"><div><dt>Focus</dt><dd>{playerCycle(s, p.id)?.focus || '—'}</dd></div><div><dt>Goal</dt><dd>{p.goal || '—'}</dd></div><div><dt>Learns by</dt><dd>{p.learnStyle || '—'}</dd></div><div><dt>Rhythm</dt><dd>{p.rhythm || '—'}</dd></div><div><dt>Next session</dt><dd>{p.nextSession}</dd></div></dl></section>
        {view === 'coach' && <section className="panel"><h3 className="display">Skill rubric</h3><Rubric p={p} edit /></section>}</div></div>}
    {tab === 'canvas' && <section className="panel canvas"><p className="kicker">Coach only. Never shown to the family or ops.</p><label htmlFor="cv" className="strong">How {first(p.name)} ticks</label><textarea id="cv" className="input" rows={6} defaultValue={p.canvas} onBlur={(e) => run({ type: 'updateCanvas', playerId: p.id, canvas: e.target.value })} placeholder="Motivation, triggers, what cues land, family context…" /><p className="small dim">Saves when you leave the field.</p></section>}
    {tab === 'messages' && <Thread p={p} me="coach" onSend={(t, l) => run({ type: 'sendMessage', playerId: p.id, text: t, linkUrl: l })} />}
    {tab === 'journal' && <Journal p={p} />}
    {tab === 'timeline' && <ol className="events">{s.events.filter((e) => e.playerId === p.id).slice().reverse().map((e) => <li key={e.id} className="ev"><time>{shortWhen(e.at)}</time><span className={`who-tag ${e.role}`}>{e.actorId ? first(userName(s, e.actorId)) : e.role}</span><span className="grow">{e.from && e.to ? <span className="tr">{e.from} → <b>{e.to}</b> </span> : <b>{e.type} </b>}<span className="dim">{e.detail}</span></span></li>)}</ol>}
  </>);
}

function PlanBuilder() {
  const { id } = useParams(); const s = useSnap(); const { run } = useStore(); const nav = useNavigate();
  const p = s.players.find((x) => x.id === id); const prev = p && playerCycle(s, p.id);
  const [focus, setFocus] = useState(''); const [pick, setPick] = useState<string[]>([]); const [tpl, setTpl] = useState<string | undefined>(); const [tname, setTname] = useState('');
  if (!p) return <p>Player not found.</p>;
  if (!['Plan building', 'Cycle review'].includes(p.state)) return (<><Back to={`/coach/player/${p.id}`}>{p.name}</Back><div className="panel"><h2 className="display">{p.name} isn’t waiting on a plan</h2><p>Current state: <Pill state={p.state} />. Plans can be published from <b>Plan building</b> or <b>Cycle review</b>.</p><ActionButton g={guide(s, p, 'coach')} /></div></>);
  const publish = async () => { if (await run({ type: 'publishPlan', playerId: p.id, focus, drillIds: pick, templateId: tpl })) nav('/coach'); };
  const drills = s.drills.filter((d) => !d.archived);
  return (<>
    <Back to={`/coach/player/${p.id}`}>{p.name}</Back>
    <h1 className="display">{p.state === 'Cycle review' ? `Cycle ${(prev?.index ?? 0) + 1}` : 'First plan'}: {p.name}</h1>
    <p className="dim">Goal: {p.goal || '—'} · Learns by: {p.learnStyle || '—'} · {p.rhythm || '—'}{prev ? ` · Last focus: ${prev.focus}` : ''}</p>
    {s.templates.length > 0 && <section className="panel"><p className="strong">Start from a template</p><div className="row wrapx">{s.templates.map((t) => <button key={t.id} aria-pressed={tpl === t.id} className={`chip ${tpl === t.id ? 'on' : ''}`} onClick={() => { setTpl(t.id); setFocus(t.focus); setPick(t.drillIds.filter((d) => drills.some((x) => x.id === d))); }}>{t.name}</button>)}</div></section>}
    <section className="panel"><label htmlFor="fo" className="strong">1 · One focus for the next 2–4 weeks</label><input id="fo" className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Dribbling in traffic with eyes up" /></section>
    <section className="panel"><p className="strong">2 · Queue the reps in order {pick.length > 0 && <span className="dim">({pick.length} queued, unlocked one at a time)</span>} <Link className="small" to="/coach/library">Edit library →</Link></p>
      <div className="lib">{drills.map((l) => { const n = pick.indexOf(l.id); return <button key={l.id} aria-pressed={n >= 0} className={`opt ${n >= 0 ? 'on' : ''}`} onClick={() => setPick(n >= 0 ? pick.filter((x) => x !== l.id) : [...pick, l.id])}>{n >= 0 && <span className="order">{n + 1}</span>}<strong>{l.title}</strong><span className="small block dim">{l.reps} sets · {l.minutes} min · {l.cues[0]}</span></button>; })}</div>
      <div className="row gap wrapx"><input aria-label="Template name" className="input" style={{ maxWidth: 260 }} value={tname} onChange={(e) => setTname(e.target.value)} placeholder="Save these as a template…" /><button className="btn sm ghost" disabled={!tname.trim() || !pick.length} onClick={() => run({ type: 'saveTemplate', template: { name: tname, focus, drillIds: pick } }).then(() => setTname(''))}>Save template</button></div></section>
    <div className="row gap"><button className="btn lg" disabled={!focus.trim() || !pick.length} onClick={publish}>Publish plan</button><span className="small dim">{first(p.name)} → <b>Plan set</b>: reads the focus, then rep 1 unlocks. Family gets a “plan published” notification.</span></div>
  </>);
}

function Digest() {
  const s = useSnap(); const { run } = useStore(); const wk = weekKey(clock(s)); const [edits, setEdits] = useState<Record<string, string>>({});
  const active = s.players.filter((p) => !['Applied', 'Fit review', 'Waitlist', 'Invited', 'Onboarding'].includes(p.state));
  const fallback = (p: Player) => { const pr = progress(s, p.id); return `${first(p.name)} is on a ${pr.streak}-day habit streak and at Level ${pr.level} (${pr.name}). Focus: ${playerCycle(s, p.id)?.focus ?? 'first plan coming'}. Status: ${p.state}.`; };
  return (<><h1 className="display">Weekly digest</h1><p className="dim">Drafts are generated by the Sunday job from this week’s events. Edit, then approve: the parent gets it in-app and by email.</p>
    {active.length === 0 && <p className="dim">No active players yet.</p>}
    {active.map((p) => { const d = s.digests.find((x) => x.playerId === p.id && x.week === wk); const sent = d?.status === 'approved'; const txt = edits[p.id] ?? d?.text ?? fallback(p);
      return <section key={p.id} className="panel"><div className="row between"><strong>{p.name} → {family(s, p).parentName}</strong>{sent ? <span className="pill st-approved">Approved</span> : <span className="pill">{d ? 'Draft (auto)' : 'Draft'}</span>}</div>
        <label className="sr" htmlFor={`d-${p.id}`}>Digest for {p.name}</label><textarea id={`d-${p.id}`} className="input" rows={3} value={sent ? d!.text : txt} disabled={sent} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
        {!sent && <button className="btn sm" onClick={() => run({ type: 'approveDigest', playerId: p.id, text: txt })}>Approve & send</button>}</section>; })}</>);
}

function Library() {
  const s = useSnap(); const { run } = useStore(); const blank = { title: '', reps: 3, minutes: 10, cues: [''], tags: [] as string[] }; const [f, setF] = useState<typeof blank & { id?: string }>(blank); const [arch, setArch] = useState(false);
  const save = async () => { if (await run({ type: 'saveDrill', drill: { ...f, cues: f.cues.filter((c) => c.trim()) } })) setF(blank); };
  const edit = (d: Drill) => setF({ id: d.id, title: d.title, reps: d.reps, minutes: d.minutes, cues: [...d.cues, ''], tags: d.tags });
  return (<><h1 className="display">Drill library</h1><p className="dim">Reusable reps for every plan. Editing a drill changes future plans only; reps already assigned keep their wording.</p>
    <div className="grid2">
      <div>{s.drills.filter((d) => d.archived === arch).map((d) => <section key={d.id} className="panel drill"><div className="row between"><strong>{d.title}</strong><span className="small dim">{d.reps} sets · {d.minutes} min</span></div><ul className="cues">{d.cues.map((c) => <li key={c}>{c}</li>)}</ul>
        <div className="row gap"><span className="small dim grow">{d.tags.map((t) => `#${t}`).join(' ')} · by {first(userName(s, d.createdBy))} · used {s.assignments.filter((a) => a.drillId === d.id).length}×</span><button className="chip" onClick={() => edit(d)}>Edit</button><button className="chip" onClick={() => run({ type: 'archiveDrill', drillId: d.id })}>{d.archived ? 'Restore' : 'Archive'}</button></div></section>)}
        <button className="link small" onClick={() => setArch(!arch)}>{arch ? '← Active drills' : 'Show archived'}</button></div>
      <div><form className="panel sticky" onSubmit={(e) => { e.preventDefault(); save(); }}><h3 className="display">{f.id ? 'Edit drill' : 'New drill'}</h3>
        <label htmlFor="dt">Title</label><input id="dt" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="row gap"><label>Sets <input className="input" type="number" min={1} max={20} value={f.reps} onChange={(e) => setF({ ...f, reps: +e.target.value })} /></label><label>Minutes <input className="input" type="number" min={1} max={90} value={f.minutes} onChange={(e) => setF({ ...f, minutes: +e.target.value })} /></label></div>
        <p className="strong">Cues</p>{f.cues.map((c, i) => <input key={i} aria-label={`Cue ${i + 1}`} className="input" value={c} onChange={(e) => { const cues = f.cues.map((x, j) => (j === i ? e.target.value : x)); if (i === cues.length - 1 && e.target.value) cues.push(''); setF({ ...f, cues }); }} placeholder="One short cue" />)}
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
  return (<form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'updateSettings', patch: f })) setSaved(true); }}>
    <h1 className="display">Settings</h1>{!head && <p className="note">Only the head coach can change settings.</p>}
    <div className="grid2">
      <section className="panel"><h3 className="display">Reply SLAs by tier</h3><p className="small dim">Business days. 0 = same business day. Drives “reply by” on every submission and message, the overdue sweep, and what families are promised.</p>
        {(Object.keys(f.sla) as Tier[]).map((t) => <label key={t} className="setrow"><span>{t}<span className="small dim block">{replyLabel(f.sla[t])}</span></span><input className="input" type="number" min={0} max={5} disabled={!head} value={f.sla[t]} onChange={(e) => setF({ ...f, sla: { ...f.sla, [t]: +e.target.value } })} /></label>)}
        {num('dueSoonHours', '“Due soon” warning', 1, 48, 'hours before the deadline')}</section>
      <section className="panel"><h3 className="display">Capacity</h3>{num('capacity', 'Roster cap', 1, 100, 'Invites beyond this go to the waitlist')}{num('innerCircleCap', 'Inner Circle cap', 0, 50)}{num('inviteDays', 'Invite link valid for', 1, 30, 'days')}
        <label className="setrow"><span>Assistant reviews need head-coach sign-off<span className="small dim block">Routes assistant reviews to Sign-off</span></span><input type="checkbox" disabled={!head} checked={f.requireSignoff} onChange={(e) => setF({ ...f, requireSignoff: e.target.checked })} /></label></section>
      <section className="panel"><h3 className="display">Availability</h3><label htmlFor="av" className="sr">Availability</label><input id="av" className="input" disabled={!head} value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} /><p className="small dim">Shown to families on Messages and Calendar.</p></section>
      <section className="panel"><h3 className="display">Branding</h3><label htmlFor="pn">Program name</label><input id="pn" className="input" disabled={!head} value={f.programName} onChange={(e) => setF({ ...f, programName: e.target.value })} /><label htmlFor="ac">Accent</label><input id="ac" type="color" disabled={!head} value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} /><p className="small dim">Program name is used in email subjects. The accent color is saved but not applied to the app theme yet.</p></section>
    </div>
    {head && <div className="row gap"><button className="btn">Save settings</button>{saved && <span className="small">Saved ✓ (logged to the audit log)</span>}</div>}
  </form>);
}

function Outbox() {
  const s = useSnap(); const { api, mode } = useStore(); const [list, setList] = useState<OutboxEmail[] | null>(null); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.get<OutboxEmail[]>('/api/outbox').then(setList).catch(() => setList([])); }, [api, s.version]);
  return (<><h1 className="display">Outbox</h1><p className="dim">{mode === 'live' ? 'Every email the system sends, with its delivery status from the provider.' : 'Dev/demo: emails are logged here instead of sent.'} Status <b>logged</b> means the dev log provider; <b>sent</b> means Resend/Postmark accepted it.</p>
    <ol className="queue">{(list ?? []).map((m) => <li key={m.id} className="panel mail"><button className="row gap mailrow" onClick={() => setOpen(open === m.id ? null : m.id)}><span className={`pill st-${m.status}`}>{m.status}</span><strong className="grow">{m.subject}</strong><span className="small dim">{m.to} · {m.kind} · {shortWhen(m.at)}</span></button>{open === m.id && <pre className="mailbody">{m.body}</pre>}</li>)}
      {list?.length === 0 && <li className="dim">No emails yet.</li>}</ol></>);
}

export function CoachShell({ ops }: { ops?: boolean }) {
  const s = useSnap(); const { as } = useStore(); const role = as?.role;
  const q = buildQueue(s, as?.id); const n = q.filter((x) => x.kind !== 'Upcoming').length; const late = q.filter((x) => x.overdue).length; const oq = buildOpsQueue(s);
  const unread = s.notifications.filter((x) => x.userId === as?.id && !x.readAt).length;
  const base = ops ? '/ops' : '/coach'; const L = (to: string, label: ReactNode, end = false) => <NavLink to={to} end={end}>{label}</NavLink>;
  return (
    <div className="coachshell">
      <aside className="side"><Logo light /><nav aria-label={ops ? 'Ops' : 'Coach'}>
        {ops ? L('/ops', <>Ops queue {oq.length > 0 && <b className={`badge ${oq.some((x) => x.overdue) ? 'late' : ''}`}>{oq.length}</b>}</>, true) : L('/coach', <>Action Center {n > 0 && <b className={`badge ${late ? 'late' : ''}`}>{n}</b>}</>, true)}
        {L(`${base}/inbox`, <>Inbox {unread > 0 && <b className="badge">{unread}</b>}</>)}{L(`${base}/roster`, 'Roster')}{L(`${base}/calendar`, 'Calendar')}
        {!ops && L('/coach/library', 'Library')}{!ops && L('/coach/digest', 'Weekly digest')}{(role === 'head' || role === 'ops') && L(`${base}/team`, 'Team')}
        {(role === 'head' || role === 'ops') && L(`${base}/outbox`, 'Outbox')}{(role === 'head' || role === 'ops') && L(`${base}/audit`, 'Audit log')}{L(`${base}/settings`, 'Settings')}
      </nav><UserMenu dark /></aside>
      <main id="main" tabIndex={-1} className="cmain">
        <Routes>
          <Route index element={ops ? <OpsQueue /> : <ActionCenter />} /><Route path="roster" element={<Roster />} /><Route path="player/:id" element={<Profile />} />
          <Route path="review/:id" element={<Review />} /><Route path="plan/:id" element={<PlanBuilder />} /><Route path="digest" element={<Digest />} />
          <Route path="library" element={<Library />} /><Route path="calendar" element={<Calendar />} /><Route path="team" element={<Team />} /><Route path="settings" element={<SettingsPage />} />
          <Route path="outbox" element={<Outbox />} /><Route path="inbox" element={<Inbox />} /><Route path="audit" element={<SystemLog embedded />} />
        </Routes>
      </main>
      <Moments role={ops ? 'ops' : 'coach'} />
    </div>
  );
}
