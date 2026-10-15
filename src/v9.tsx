// v9 UI: a coach who sees your reps between sessions. Teach-back, stuck, meet-your-coach, sessions, rhythm, rough week,
// since-week-1, parent week, game note. Wording follows VOICE.md.
import { useState } from 'react';
import { useSnap, useStore } from './store';
import { CHECKIN_STARTERS, DEFAULT_COACH_PROFILE, GAME_MARK_LABEL, type Game, type GameMark, type Player, type Review } from '../shared/domain';
import { gamesOf, confidenceDip, FEEL_WORDS } from '../shared/games';
import { shortWhen, isoDay } from '../shared/time';
import { addBusinessDays } from '../shared/time';
import { clock, first, lastReview, playerCycle, replyDays, userName } from '../shared/workflow';
import { ROUGH_WEEK, STUCK_PROMISE, STUCK_PROMPTS, TEACHBACK, WEEKDAYS, latestSession, parentSentence, parentTips, sessionLine, sinceWeek1, weekChoiceNote, REP_CHOICES } from '../shared/v9';
import { ClipPicker, ClipPlayer, type PickedClip } from './v5';

const coachFirst = (s: ReturnType<typeof useSnap>, p: Player) => first(userName(s, p.coachId));

/* ---------- teach-back ---------- */
/** “In your words”: the player says the adjustment back. Optional; the next rep never waits on it. */
export function TeachBack({ p, r, me }: { p: Player; r: Review; me: 'player' | 'parent' | 'coach' }) {
  const s = useSnap(); const { run } = useStore(); const coach = coachFirst(s, p); const [change, setChange] = useState(''); const [notice, setNotice] = useState(''); const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false);
  const tb = r.teachBack; const thread = s.messages.filter((m) => m.context === 'feedback' && m.refId === r.id).sort((a, b) => a.at.localeCompare(b.at));
  if (tb) return <section className="tback done" id="teachback" data-mark={tb.mark ?? 'pending'}>
    <p className="kicker">{me === 'parent' ? `In ${first(p.name)}’s words` : 'In your words'}</p>
    <p className="tbquote">“{tb.change}”{tb.notice ? <><br /><span className="dim">I’ll notice: {tb.notice}</span></> : null}</p>
    {tb.mark === 'got-it' ? <p className="ack ok" role="status">✓ {coach} read it: got it.{tb.note ? ` “${tb.note}”` : ''}</p>
      : tb.mark === 'clarify' ? <p className="ack q" role="status">{coach} wants to clarify.{tb.note ? ` “${tb.note}”` : ''}</p>
      : <p className="small dim" role="status">{coach} reads this by {shortWhen(addBusinessDays(new Date(tb.at), replyDays(s, p)).toISOString())}.</p>}
    {tb.mark === 'clarify' && me === 'player' && <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'sendMessage', playerId: p.id, text: reply, context: 'feedback', refId: r.id })) setReply(''); }}><label className="sr" htmlFor="tbreply">Your reply</label><input id="tbreply" className="input grow" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to your coach" /><button className="btn" disabled={!reply.trim()}>Send</button></form>}
    {thread.length > 0 && me !== 'coach' && <ul className="fbthread">{thread.map((m) => <li key={m.id} className={`from-${m.from}`}><b>{m.from === 'coach' ? first(userName(s, m.authorId)) : first(p.name)}:</b> {m.text}</li>)}</ul>}
  </section>;
  if (me !== 'player') return me === 'parent' ? <p className="small dim">{first(p.name)} hasn’t added their words yet. That’s fine.</p> : null;
  return <section className="tback" id="teachback">
    <p className="kicker orange">{TEACHBACK.title}</p>
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await run({ type: 'teachBack', playerId: p.id, reviewId: r.id, change, notice }); setBusy(false); }}>
      <label htmlFor="tb-change" className="strong">{TEACHBACK.change}</label>
      <textarea id="tb-change" className="input" rows={2} maxLength={300} value={change} onChange={(e) => setChange(e.target.value)} placeholder={TEACHBACK.examples[0]} />
      <label htmlFor="tb-notice" className="strong">{TEACHBACK.notice} <span className="dim">(optional)</span></label>
      <input id="tb-notice" className="input" maxLength={300} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="Fewer turnovers on the catch" />
      <div className="row gap wrapx"><button id="tb-send" className="btn lg" disabled={busy || change.trim().length < 8}>Send to {coach}</button>
        {p.state === 'Next step ready' && <button type="button" id="tb-skip" className="btn ghost" onClick={() => run({ type: 'startNext', playerId: p.id })}>Skip for now</button>}</div>
      <p className="small dim">A sentence is plenty. {coach} reads it and tells you “got it” or asks a quick question. Skipping is fine; your next rep opens either way.</p>
    </form></section>;
}
/** Coach: read the player’s words, then mark. */
export function TeachBackMark({ p, r }: { p: Player; r: Review }) {
  const { run } = useStore(); const [note, setNote] = useState(''); const [clar, setClar] = useState(false); const tb = r.teachBack;
  if (!tb) return null;
  return <section className="tback coach" id={`tb-${r.id}`}><p className="kicker">{first(p.name)}, in their words · for “{r.adjust.slice(0, 50)}”</p><p className="tbquote">“{tb.change}”{tb.notice ? <><br /><span className="dim">Will notice: {tb.notice}</span></> : null}</p>
    {tb.mark ? <p className="small">{tb.mark === 'got-it' ? '✓ Marked got it' : '↺ Clarifying'} · {tb.markedAt ? shortWhen(tb.markedAt) : ''}{tb.note ? ` · “${tb.note}”` : ''}</p>
      : <><div className="row gap wrapx"><button className="btn sm" id="tb-got" onClick={() => run({ type: 'markTeachBack', playerId: p.id, reviewId: r.id, mark: 'got-it', note: note || undefined })}>Got it</button><button className="btn ghost sm" id="tb-clar" aria-expanded={clar} onClick={() => setClar(!clar)}>Let’s clarify</button></div>
        {clar && <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'markTeachBack', playerId: p.id, reviewId: r.id, mark: 'clarify', note })) { setNote(''); setClar(false); } }}><label className="sr" htmlFor={`tbn-${r.id}`}>What to clarify</label><input id={`tbn-${r.id}`} className="input grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Close. One thing: the eyes stay up until the ball is in your hands." /><button className="btn sm" disabled={note.trim().length < 3}>Send</button></form>}</>}</section>;
}

/* ---------- “I’m stuck” ---------- */
export function StuckButton({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const [open, setOpen] = useState(false); const [v, setV] = useState({ happened: '', want: '', feeling: '' }); const [sent, setSent] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const coach = coachFirst(s, p); const days = s.settings.sla[p.tier];
  const send = async () => { setBusy(true); const ok = await run({ type: 'sendStuck', playerId: p.id, ...v }); setBusy(false); if (ok) { setSent(shortWhen(addBusinessDays(clock(s), days).toISOString())); setV({ happened: '', want: '', feeling: '' }); } };
  return <>
    <button id="stuck-btn" className="stuckfab" onClick={() => { setOpen(true); setSent(null); }} aria-haspopup="dialog"><span aria-hidden>✋</span> I’m stuck</button>
    {open && <div className="moment" role="dialog" aria-modal="true" aria-labelledby="stuck-h"><div className="sheet pop stuck">
      {sent ? <><h2 id="stuck-h" className="display">Sent to {coach}.</h2><p>Only {coach} sees this. He writes back by <b>{sent}</b>.</p><button className="btn" autoFocus onClick={() => setOpen(false)}>Close</button></>
        : <><p className="kicker orange">Private note to {coach}</p><h2 id="stuck-h" className="display">Stuck, or frustrated? Tell him.</h2>
          <p className="small dim" id="stuck-promise">{STUCK_PROMISE(days)}</p>
          {STUCK_PROMPTS.map((q) => <div key={q.key}><label className="strong" htmlFor={`st-${q.key}`}>{q.label}</label><textarea id={`st-${q.key}`} className="input" rows={2} maxLength={300} placeholder={q.hint} value={v[q.key]} onChange={(e) => setV({ ...v, [q.key]: e.target.value })} /></div>)}
          <p className="small dim">Answer any one. A few words is enough.</p>
          <div className="row gap"><button id="stuck-send" className="btn" disabled={busy || ![v.happened, v.want, v.feeling].some((x) => x.trim().length >= 2)} onClick={send}>Send privately</button><button className="btn ghost" onClick={() => setOpen(false)}>Not now</button></div></>}
    </div></div>}
  </>;
}

/* ---------- meet your coach · first look · sessions ---------- */
const isPlaceholder = (t: string) => t.trim().startsWith('[Coach');
export function MeetCoach({ p, compact }: { p: Player; compact?: boolean }) {
  const s = useSnap(); const { as } = useStore(); const cp = { ...DEFAULT_COACH_PROFILE, ...(s.settings.coachProfile ?? {}) }; const coach = userName(s, p.coachId); const fl = p.firstLook;
  return <section className="panel meetcoach" id="coach">
    <p className="kicker">{fl ? `What ${first(coach)} saw in you` : 'Meet your coach'}</p>
    {fl && <blockquote className="quote sm firstlook"><p>{fl.saw}</p><footer className="small">{first(coach)}, from your {fl.source === 'session' ? 'session' : 'first clip'}, {shortWhen(fl.at)}</footer></blockquote>}
    {!compact && <><h3 className="display">{coach}</h3>
      <p>{cp.intro}</p><p><b>Why this exists.</b> {cp.why}</p><p><b>How I work.</b> {cp.how}</p><p><b>What I look for.</b> {cp.lookFor}</p>
      {as?.role === 'head' && [cp.intro, cp.why].some(isPlaceholder) && <p className="note small">Only you see this: replace the [Coach: …] lines in Settings → Your coach profile, in your own words.</p>}</>}
  </section>;
}
export function SessionCard({ p }: { p: Player }) {
  const s = useSnap(); const x = latestSession(s, p.id); if (!x) return null;
  return <section className="panel sessioncard" id="session" data-session={x.id}><p className="kicker orange">{sessionLine(x)}</p><p>{x.note}</p><dl className="focusgrid"><div><dt>Focus</dt><dd>{x.focus}</dd></div>{x.cue && <div><dt>Cue</dt><dd>{x.cue}</dd></div>}</dl></section>;
}
export function SessionForm({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const [f, setF] = useState({ note: '', focus: '', cue: '', date: isoDay(clock(s)) }); const list = (s.sessions ?? []).filter((x) => x.playerId === p.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  return <section className="panel" id="session-form"><h3 className="display">Log a session</h3><p className="small dim">In person at Storm, or on video. The note sets the next focus, and {first(p.name)} sees it as “From your session on …”.</p>
    <form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'logSession', playerId: p.id, ...f })) setF({ ...f, note: '', focus: '', cue: '' }); }}>
      <label htmlFor="ses-note" className="strong">What you saw</label><textarea id="ses-note" className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Handled the trap better once she took one dribble away." />
      <div className="row gap wrapx"><label className="grow">Next focus<input id="ses-focus" className="input" value={f.focus} onChange={(e) => setF({ ...f, focus: e.target.value })} placeholder="Weak-hand control under pressure" /></label><label className="grow">One cue (optional)<input id="ses-cue" className="input" value={f.cue} onChange={(e) => setF({ ...f, cue: e.target.value })} placeholder="Dribble away, then look up" /></label><label>Date<input className="input" type="date" max={isoDay(clock(s))} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label></div>
      <button id="ses-save" className="btn sm" disabled={f.note.trim().length < 5 || f.focus.trim().length < 3}>Save session note</button></form>
    {list.length > 0 && <ul className="plain small">{list.map((x) => <li key={x.id}><b>{shortWhen(x.at)}</b> · {x.focus} <span className="dim">· {x.note.slice(0, 80)}</span></li>)}</ul>}</section>;
}
/** Plan building: the player can send an intake clip while the coach gets to them. */
export function IntakeClip({ p }: { p: Player }) {
  const s = useSnap(); const { upload } = useStore(); const [clip, setClip] = useState<PickedClip | null>(null); const [watch, setWatch] = useState(''); const [busy, setBusy] = useState(false);
  const sent = s.clips.filter((c) => c.playerId === p.id && !c.submissionId);
  return <section className="panel intake" id="intake"><p className="kicker orange">Your first clip</p><h3 className="display">Show {coachFirst(s, p)} how you play.</h3>
    <p className="small dim">One clip, 30 seconds or less: a few moves, a shot, whatever feels like you. He watches it for your first look.</p>
    {sent.length > 0 && <p className="ack ok" role="status">✓ {sent.length} clip{sent.length > 1 ? 's' : ''} sent. {coachFirst(s, p)} will watch {sent.length > 1 ? 'them' : 'it'}.</p>}
    <ClipPicker p={p} value={clip} onChange={setClip} />
    {clip && <><label className="small" htmlFor="intake-watch">What should he watch for? (optional)</label><input id="intake-watch" className="input" maxLength={200} value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="How I handle pressure on my left" />
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); const id = await upload(p.id, clip.file, { durationSec: clip.durationSec, mime: clip.mime, watchFor: watch }); setBusy(false); if (id) { setClip(null); setWatch(''); } }}>Send clip</button></>}</section>;
}

/* ---------- rhythm · rough week ---------- */
export function RhythmPicker({ value, onChange }: { value: { repsPerWeek: number; clipDay: string }; onChange: (v: { repsPerWeek: number; clipDay: string }) => void }) {
  return <div className="rhythmpick"><p className="strong small">Clips a week</p><div className="opts" role="radiogroup" aria-label="Clips per week">{REP_CHOICES.map((n) => <button type="button" key={n} role="radio" aria-checked={value.repsPerWeek === n} className={`opt ${value.repsPerWeek === n ? 'on' : ''}`} onClick={() => onChange({ ...value, repsPerWeek: n })}>{n}</button>)}</div>
    <p className="strong small">Your clip day</p><div className="opts" role="radiogroup" aria-label="Clip day">{WEEKDAYS.map((d) => <button type="button" key={d} role="radio" aria-checked={value.clipDay === d} className={`opt ${value.clipDay === d ? 'on' : ''}`} onClick={() => onChange({ ...value, clipDay: d })}>{d.slice(0, 3)}</button>)}</div></div>;
}
export function RhythmCard({ p }: { p: Player }) {
  const { run } = useStore(); const [edit, setEdit] = useState(false); const rp = p.rhythmPlan; const [v, setV] = useState(rp ?? { repsPerWeek: 2, clipDay: 'Saturday' });
  return <section className="panel rhythmcard" id="rhythm"><div className="row between wrapx"><p><span className="kicker">Your rhythm</span> {rp ? <b>{rp.repsPerWeek} clip{rp.repsPerWeek === 1 ? '' : 's'} a week · clip day {rp.clipDay}</b> : <span className="dim">Not set yet</span>}</p><button className="link small" aria-expanded={edit} onClick={() => setEdit(!edit)}>{rp ? 'Change' : 'Set it'}</button></div>
    {edit && <form onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'setRhythm', playerId: p.id, ...v })) setEdit(false); }}><RhythmPicker value={v} onChange={setV} /><p className="small dim">Pick what’s realistic, especially in season. It’s yours to change.</p><button className="btn sm" id="rhythm-save">Save my rhythm</button></form>}</section>;
}
export function RoughWeek({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const [note, setNote] = useState(''); const wc = weekChoiceNote(p, clock(s)); const [open, setOpen] = useState(typeof location !== 'undefined' && location.hash === '#rough');
  const label = { light: 'a light week', reset: 'a reset', talk: 'a talk with your coach' } as const;
  if (wc) return <section className="panel roughweek chosen" id="rough"><p className="kicker">Rough week</p><p>You picked <b>{label[wc.choice]}</b>. Nothing is owed and nothing to make up. {coachFirst(s, p)} knows.</p></section>;
  return <details className="panel roughweek" id="rough" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}><summary><b>Rough week?</b> <span className="dim">You have options.</span></summary>
    <div className="opts rough">{ROUGH_WEEK.map((o) => <button key={o.key} id={`rough-${o.key}`} className="opt" onClick={() => run({ type: 'roughWeek', playerId: p.id, choice: o.key, note })}><b>{o.label}</b><span className="small block dim">{o.note}</span></button>)}</div>
    <label className="small" htmlFor="rough-note">Anything you want him to know? (optional)</label><input id="rough-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></details>;
}

/* ---------- since week 1 ---------- */
export function SinceWeek1({ p, me }: { p: Player; me: 'player' | 'parent' | 'coach' }) {
  const s = useSnap(); const d = sinceWeek1(s, p.id); const fn = first(p.name); const probe = p.probe;
  return <section className="panel since" id="since"><h3 className="display">{me === 'player' ? 'What’s changed since week 1' : `What’s changed for ${fn} since week 1`}</h3>
    {d ? <>
      <div className="sidebyside"><figure><figcaption className="kicker">Then · {shortWhen(d.then.clip.at)}</figcaption><ClipPlayer clip={d.then.clip} /><p className="small"><b>{d.then.title}</b>{d.then.adjust ? ` · coach said: ${d.then.adjust}` : ''}</p></figure>
        <figure><figcaption className="kicker">Now · {shortWhen(d.now.clip.at)}</figcaption><ClipPlayer clip={d.now.clip} /><p className="small"><b>{d.now.title}</b>{d.now.note ? ` · coach saw: ${d.now.note}` : ''}</p></figure></div>
      {!d.sameDrill && <p className="small dim">Different drills so far. When your coach asks to “see it again”, the same drill lands here side by side.</p>}
      {d.changeNote ? <blockquote className="story"><p className="kicker">Your coach’s note</p><p>{d.changeNote}</p></blockquote> : <p className="small dim">{coachFirst(s, p)} adds a note here at each re-check.</p>}</>
      : <div className="empty"><b>Your first two clips will sit side by side here.</b><p className="small">That’s the before and after. It only needs two clips.</p></div>}
    {probe && <p className="small" data-probe={probe.status}>🎬 {probe.status === 'done' ? `Show me again: “${probe.title}” was reviewed.` : probe.status === 'open' ? `Show me again: “${probe.title}” is your next rep.` : me === 'coach' ? `Show me again requested for “${probe.title}” on ${probe.dueOn}.` : null}</p>}
  </section>;
}
export function ProbeForm({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const drills = s.drills.filter((d) => !d.archived); const [id, setId] = useState(''); const [due, setDue] = useState(isoDay(new Date(clock(s).getTime() + 14 * 864e5))); const [note, setNote] = useState(''); const d = drills.find((x) => x.id === id);
  const c = playerCycle(s, p.id); if (!c || c.status !== 'active') return null;
  return <section className="panel probe" id="probe"><h3 className="display">Show me again</h3><p className="small dim">Ask for a fresh clip of the same drill on a later date. It shows up as {first(p.name)}’s next rep that day, without a heads-up.</p>
    {p.probe && p.probe.status !== 'done' ? <p className="small">Requested: <b>{p.probe.title}</b> on {p.probe.dueOn} · {p.probe.status === 'open' ? 'now in their reps' : 'waiting for the date'}.</p>
      : <form className="row gap wrapx" onSubmit={async (e) => { e.preventDefault(); if (d && await run({ type: 'requestProbe', playerId: p.id, title: d.title, drillId: d.id, dueOn: due, note })) { setId(''); setNote(''); } }}>
        <label className="grow">Drill<select id="probe-drill" className="input" value={id} onChange={(e) => setId(e.target.value)}><option value="">Pick a drill</option>{drills.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label><label>On<input className="input" type="date" min={isoDay(clock(s))} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <button id="probe-send" className="btn sm" disabled={!d}>Ask to see it again</button></form>}</section>;
}

/* ---------- parent ---------- */
export function ParentWeek({ p }: { p: Player }) {
  const s = useSnap(); const ps = parentSentence(s, p); const tips = parentTips(s, p);
  return <section className="panel parentweek" id="parentweek"><p className="kicker orange">What this means this week</p>
    <p className="bigsentence" data-by={ps.byCoach ? 'coach' : 'auto'}>{ps.text}</p>{ps.byCoach && <p className="small dim">— {first(ps.by ?? userName(s, p.coachId))}, this week</p>}
    <ul className="tips">{tips.map((t, i) => <li key={i} className={t.kind}><b>{t.kind === 'do' ? 'Do' : 'Skip'}</b> {t.text}</li>)}</ul></section>;
}
export function ParentNoteForm({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const [t, setT] = useState(''); const ps = parentSentence(s, p);
  return <section className="panel" id="parent-note"><h3 className="display">One sentence for the parent</h3><p className="small dim">Plain language, no jargon. If you skip it, they see: “{ps.byCoach ? 'your sentence' : ps.text}”</p>
    <form className="row gap wrapx" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'setParentNote', playerId: p.id, text: t })) setT(''); }}><label className="sr" htmlFor="pnote">Sentence</label><input id="pnote" className="input grow" maxLength={220} value={t} onChange={(e) => setT(e.target.value)} placeholder={ps.byCoach ? ps.text : `${first(p.name)} is learning to slow down before adding speed. It shows in the clips.`} /><button id="pnote-save" className="btn sm" disabled={t.trim().length < 8}>Save for this week</button></form></section>;
}
export function CheckInForm({ p }: { p: Player }) {
  const { run } = useStore(); const [t, setT] = useState('');
  return <section className="panel" id="checkin-form"><h3 className="display">Check in on {first(p.name)}</h3><p className="small dim">Private between you and {first(p.name)}. Not about reps. Your own words beat a template, so edit the starter.</p>
    <div className="row wrapx quick">{CHECKIN_STARTERS.map((x) => <button key={x} type="button" className="chip" onClick={() => setT(x)}>{x.slice(0, 40)}…</button>)}</div>
    <form className="row gap wrapx" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'sendCheckIn', playerId: p.id, text: t })) setT(''); }}><label className="sr" htmlFor="ci">Check-in</label><textarea id="ci" className="input grow" rows={2} value={t} onChange={(e) => setT(e.target.value)} placeholder="Checking in on you, not your reps." /><button id="ci-send" className="btn sm" disabled={t.trim().length < 5}>Send privately</button></form></section>;
}

/* ---------- games: one note, then the coach’s read ---------- */
export function GameNoteForm({ p, onDone }: { p: Player; onDone?: () => void }) {
  const s = useSnap(); const { run } = useStore(); const cyc = playerCycle(s, p.id); const [f, setF] = useState({ carried: '', missed: '', opponent: '', date: isoDay(clock(s)) }); const [feel, setFeel] = useState(0); const [busy, setBusy] = useState(false);
  return <form id="gamelog" className="panel gameform" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await run({ type: 'logGame', playerId: p.id, date: f.date, opponent: f.opponent, carried: f.carried, missed: f.missed, confidence: feel || 3 }); setBusy(false); if (ok) { setF({ ...f, carried: '', missed: '', opponent: '' }); setFeel(0); onDone?.(); } }}>
    <p className="kicker orange">After a game or scrimmage</p><h2 className="display">What carried over?</h2>
    {cyc && <p className="small dim">Your focus: “{cyc.focus}”.</p>}
    <label htmlFor="g-carried" className="strong">What from practice showed up?</label><textarea id="g-carried" className="input" rows={2} maxLength={200} value={f.carried} onChange={(e) => setF({ ...f, carried: e.target.value })} placeholder="Went left twice and finished one through contact. “Nothing yet” is an honest answer." />
    <label htmlFor="g-missed" className="strong">What didn’t? <span className="dim">(optional)</span></label><textarea id="g-missed" className="input" rows={2} maxLength={200} value={f.missed} onChange={(e) => setF({ ...f, missed: e.target.value })} placeholder="Picked up my dribble when they trapped." />
    <div className="row gap wrapx"><label className="grow">Opponent (optional)<input id="g-opp" className="input" maxLength={60} value={f.opponent} onChange={(e) => setF({ ...f, opponent: e.target.value })} /></label><label>Date<input className="input" type="date" value={f.date} max={isoDay(clock(s))} onChange={(e) => setF({ ...f, date: e.target.value })} /></label></div>
    <fieldset className="scale"><legend className="strong">How did it feel? <span className="dim">(only you and your coach see this)</span></legend><div role="radiogroup" aria-label="How it felt" className="row gap wrapx">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={feel === n} className={`chip ${feel === n ? 'on' : ''}`} onClick={() => setFeel(n)}>{FEEL_WORDS[n]}</button>)}</div></fieldset>
    <div className="row between"><span className="small dim">{coachFirst(s, p)} reads every game note and tells you what he sees.</span><button id="g-send" className="btn lg" disabled={busy || f.carried.trim().length < 3}>Save game note</button></div></form>;
}
const MARKS: GameMark[] = ['carried', 'partly', 'not-yet'];
export function GameNotes({ p, me }: { p: Player; me: 'player' | 'parent' | 'coach' }) {
  const s = useSnap(); const gs = gamesOf(s, p.id).slice().reverse(); const dip = me === 'coach' ? confidenceDip(s, p.id) : null;
  if (!gs.length) return <p className="dim">No game notes yet.{me === 'player' ? ' After your next game, it takes a minute.' : ''}</p>;
  return <div className="games">{dip && <p className="riskbox small" role="note">🫶 Coach-only: games have felt rougher two in a row ({dip.values.join(' → ')}). A short note on something {first(p.name)} did well usually helps.</p>}{gs.map((g) => <GameNote key={g.id} p={p} g={g} me={me} />)}</div>;
}
function GameNote({ p, g, me }: { p: Player; g: Game; me: 'player' | 'parent' | 'coach' }) {
  const s = useSnap(); const { run } = useStore(); const [note, setNote] = useState(''); const day = new Date(g.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return <article className="gamecard" id={`g-${g.id}`} data-mark={g.mark ?? 'unread'}>
    <header className="row between wrapx"><b>{day}{g.opponent ? ` · vs ${g.opponent}` : ''}</b>{g.mark ? <span className={`pill mark-${g.mark}`}>{GAME_MARK_LABEL[g.mark]}</span> : <span className="small dim">{me === 'coach' ? 'Not read yet' : `Waiting for ${coachFirst(s, p)} to read`}</span>}</header>
    <p><b>Carried over:</b> {g.carried ?? g.wellDone}</p>{(g.missed ?? g.replay) && <p><b>Didn’t yet:</b> {g.missed ?? g.replay}</p>}
    {me !== 'parent' && <p className="small dim">Felt: {FEEL_WORDS[g.confidence]}</p>}
    {g.mark && <p className="small">{first(userName(s, g.seenBy))} read it: <b>{GAME_MARK_LABEL[g.mark]}</b>{g.markNote ? `. “${g.markNote}”` : ''}</p>}
    {me === 'coach' && !g.mark && <div className="gamemark"><label className="sr" htmlFor={`gm-${g.id}`}>One line (optional)</label><input id={`gm-${g.id}`} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line for the player (optional)" /><div className="row gap wrapx">{MARKS.map((m) => <button key={m} id={`mark-${m}-${g.id}`} className="chip" onClick={() => run({ type: 'markGame', playerId: p.id, gameId: g.id, mark: m, note })}>{GAME_MARK_LABEL[m]}</button>)}</div></div>}
    {me === 'coach' && g.mark && <button className="chip" onClick={() => run({ type: 'tagWin', playerId: p.id, text: (g.carried ?? g.wellDone).slice(0, 120) + (g.opponent ? ` (vs ${g.opponent})` : ''), refId: g.id })}>★ Add to “what your coach noticed”</button>}
  </article>;
}

/* ---------- player settings ---------- */
export function GamifyToggle({ p }: { p: Player }) {
  const { run } = useStore();
  return <section className="panel" id="gamify"><h3 className="display">Streaks and points</h3><p className="small dim">Off by default. Some players like a streak; plenty don’t. Your coach never counts it against you either way.</p>
    <label className="row gap check"><input id="gamify-on" type="checkbox" checked={!!p.gamify} onChange={(e) => run({ type: 'setGamify', playerId: p.id, on: e.target.checked })} /> Show my streak, level and habits</label></section>;
}
export const LastReviewTeach = ({ p, me }: { p: Player; me: 'player' | 'parent' }) => { const s = useSnap(); const r = lastReview(s, p.id); return r ? <TeachBack p={p} r={r} me={me} /> : null; };
