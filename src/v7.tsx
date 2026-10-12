// v7 UI: game log + post-game check-in, game plan card, progress timeline, Wins wall, 5-spot shooting log, Player Card.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from './App';
import { useSnap, useStore } from './store';
import { PRESSURE_LABEL, type FocusTried, type Game, type GameStats, type Player, type Pressure } from '../shared/domain';
import { FEEL_EMOJI, FEEL_WORDS, SPOTS, STAT_KEYS, STAT_LABEL, TRIED_LABEL, YOUNG_STATS, confidenceDip, gameAsksThisWeek, gameLine, gamePlan, gamesOf, isYoung, pct, shotStats, transfer } from '../shared/games';
import { draftStory, publicCard, timeline, type PublicCard } from '../shared/timeline';
import { isoDay, shortWhen } from '../shared/time';
import { clock, first, playerCycle, tierReply, userName } from '../shared/workflow';

type Me = 'player' | 'parent' | 'coach';
const fmtDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** 1–5 scale as big tap targets. Under-13: emoji faces. Growth words, never grades. */
function Scale({ label, value, onChange, young, name }: { label: string; value: number; onChange: (n: number) => void; young: boolean; name: string }) {
  return <fieldset className="scale"><legend className="strong">{label}</legend><div role="radiogroup" aria-label={label} className="scalebtns">
    {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${label}: ${n} (${FEEL_WORDS[n]})`} data-scale={name} className={`sbtn ${value === n ? 'on' : ''}`} onClick={() => onChange(n)}>{young ? <span className="emo" aria-hidden>{FEEL_EMOJI[n]}</span> : <b>{n}</b>}<small>{FEEL_WORDS[n]}</small></button>)}
  </div></fieldset>;
}
function Stepper({ k, value, onChange }: { k: keyof GameStats; value: number | null | undefined; onChange: (v: number | null) => void }) {
  return <div className="stepper"><span className="small">{STAT_LABEL[k]}</span><div className="row"><button type="button" className="mini" aria-label={`${STAT_LABEL[k]} minus one`} onClick={() => onChange(value ? value - 1 : null)}>−</button>
    <input aria-label={STAT_LABEL[k]} id={`st-${k}`} className="input num" inputMode="numeric" value={value ?? ''} placeholder="–" onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange(v === '' ? null : Math.min(200, +v)); }} />
    <button type="button" className="mini" aria-label={`${STAT_LABEL[k]} plus one`} onClick={() => onChange((value ?? 0) + 1)}>+</button></div></div>;
}

/** Quick post-game entry: a few taps. Stats optional; the check-in and one line are what the coach reads. */
export function GameLogForm({ p, onDone }: { p: Player; onDone?: () => void }) {
  const s = useSnap(); const { run } = useStore(); const young = isYoung(p); const cyc = playerCycle(s, p.id); const asked = gameAsksThisWeek(s, p.id, clock(s)) >= 1;
  const [st, setSt] = useState<GameStats>({}); const [c, setC] = useState({ confidence: 0, focus: 0, energy: 0 }); const [well, setWell] = useState(''); const [replay, setReplay] = useState('');
  const [tried, setTried] = useState<FocusTried | ''>(''); const [ask, setAsk] = useState(false); const [opp, setOpp] = useState(''); const [date, setDate] = useState(isoDay(clock(s))); const [more, setMore] = useState(false); const [busy, setBusy] = useState(false);
  const keys = young ? YOUNG_STATS : more ? STAT_KEYS : (['pts', 'reb', 'ast', 'stl', 'tov', 'min'] as (keyof GameStats)[]);
  const ready = c.confidence && c.focus && c.energy && well.trim().length >= 3 && (!cyc || tried);
  return <form id="gamelog" className="panel gameform" onSubmit={async (e) => { e.preventDefault(); if (!ready) return; setBusy(true);
    const ok = await run({ type: 'logGame', playerId: p.id, date, opponent: opp, stats: st, confidence: c.confidence, focus: c.focus, energy: c.energy, wellDone: well, replay, focusTried: tried || undefined, wantsReply: ask }); setBusy(false);
    if (ok) { setSt({}); setC({ confidence: 0, focus: 0, energy: 0 }); setWell(''); setReplay(''); setTried(''); setAsk(false); setOpp(''); onDone?.(); } }}>
    <p className="kicker orange">Post-game · 60 seconds</p><h2 className="display">{young ? 'How did the game go?' : 'Log your game'}</h2>
    <div className="row gap wrapx"><label className="grow">Opponent (optional)<input id="g-opp" className="input" value={opp} maxLength={60} onChange={(e) => setOpp(e.target.value)} placeholder="Team name" /></label><label>Date<input className="input" type="date" value={date} max={isoDay(clock(s))} onChange={(e) => setDate(e.target.value)} /></label></div>
    <p className="strong">{young ? 'Your numbers (skip any you don’t know)' : 'Stats (all optional)'}</p>
    <div className="steppers">{keys.map((k) => <Stepper key={k} k={k} value={st[k]} onChange={(v) => setSt({ ...st, [k]: v })} />)}</div>
    {!young && <button type="button" className="link small" onClick={() => setMore(!more)}>{more ? 'Fewer stats' : '+ Shooting (FG / 3P / FT made–tried)'}</button>}
    {!young && st.fga ? <p className="small dim">FG {st.fgm ?? 0}/{st.fga} ({pct(st.fgm, st.fga)}%){st.tpa ? ` · 3P ${st.tpm ?? 0}/${st.tpa}` : ''}{st.fta ? ` · FT ${st.ftm ?? 0}/${st.fta}` : ''}</p> : null}
    <Scale name="confidence" label={young ? 'How brave did you feel?' : 'Confidence'} value={c.confidence} young={young} onChange={(n) => setC({ ...c, confidence: n })} />
    <Scale name="focus" label={young ? 'How locked-in were you?' : 'Focus'} value={c.focus} young={young} onChange={(n) => setC({ ...c, focus: n })} />
    <Scale name="energy" label={young ? 'How much energy did you have?' : 'Energy'} value={c.energy} young={young} onChange={(n) => setC({ ...c, energy: n })} />
    {cyc && <fieldset className="scale"><legend className="strong">Did you try your focus in the game? <span className="dim">“{cyc.focus}”</span></legend><div role="radiogroup" className="row gap wrapx">{(['yes', 'sometimes', 'not_yet'] as FocusTried[]).map((t) => <button type="button" role="radio" aria-checked={tried === t} key={t} className={`chip ${tried === t ? 'on' : ''}`} onClick={() => setTried(t)}>{TRIED_LABEL[t]}</button>)}</div><p className="small dim">All three answers help. “Not yet” tells your coach what to practice next.</p></fieldset>}
    <label htmlFor="g-well" className="strong">One thing I did well</label><input id="g-well" className="input" maxLength={160} value={well} onChange={(e) => setWell(e.target.value)} placeholder={young ? 'I passed to the open player' : 'Stayed low on the press break'} />
    <label htmlFor="g-replay" className="strong">One moment I’d replay <span className="dim">(optional)</span></label><input id="g-replay" className="input" maxLength={160} value={replay} onChange={(e) => setReplay(e.target.value)} placeholder="The turnover on the first trap" />
    <label className="row gap small check"><input type="checkbox" checked={ask} disabled={asked} onChange={(e) => setAsk(e.target.checked)} /> {asked ? 'You’ve asked about a game this week. Your coach still sees this one.' : `Ask my coach for feedback on this game (reply ${tierReply(s, p)}; one game a week)`}</label>
    <div className="row between"><span className="small dim">Your coach sees every game you log.</span><button className="btn lg" disabled={busy || !ready}>Log game</button></div>
  </form>;
}

/** Logged games, with the coach's reply. Coaches can mark seen, reply in the standard format, annotate and tag a win. */
export function GamesList({ p, me }: { p: Player; me: Me }) {
  const s = useSnap(); const gs = gamesOf(s, p.id).slice().reverse(); const dip = me === 'coach' ? confidenceDip(s, p.id) : null;
  if (!gs.length) return <p className="dim">No games logged yet.{me !== 'coach' ? ' After your next game, it takes a minute.' : ''}</p>;
  return <div className="games">{dip && <p className="riskbox small" role="note">🫶 Coach-only: game confidence dipped two games in a row ({dip.values.join(' → ')}). A short note on something {first(p.name)} did well usually helps.</p>}
    {gs.map((g) => <GameCard key={g.id} p={p} g={g} me={me} />)}</div>;
}
function GameCard({ p, g, me }: { p: Player; g: Game; me: Me }) {
  const s = useSnap(); const { run } = useStore(); const young = isYoung(p); const [open, setOpen] = useState(false); const [f, setF] = useState({ wentWell: '', adjust: '', why: '' }); const [note, setNote] = useState(''); const ann = (s.timelineNotes ?? []).find((n) => n.kind === 'annotation' && n.refId === g.id);
  return <article className={`gamecard ${g.wantsReply && !g.reply ? 'ask' : ''}`} id={`g-${g.id}`}>
    <header className="row between wrapx"><b>{fmtDay(g.date)}{g.opponent ? ` · vs ${g.opponent}` : ''}</b><span className="small dim">{gameLine(g)}</span></header>
    <div className="feelrow"><span>{young ? FEEL_EMOJI[g.confidence] : g.confidence}<small>{young ? FEEL_WORDS[g.confidence] : 'confidence'}</small></span><span>{young ? FEEL_EMOJI[g.focus] : g.focus}<small>focus</small></span><span>{young ? FEEL_EMOJI[g.energy] : g.energy}<small>energy</small></span>{g.focusTried && <span className={`tried t-${g.focusTried}`}>{TRIED_LABEL[g.focusTried]}<small>tried the focus</small></span>}</div>
    <p>✓ <b>Did well:</b> {g.wellDone}</p>{g.replay && <p>↺ <b>Would replay:</b> {g.replay}</p>}
    {ann && <p className="annot">📌 {ann.text} <span className="dim">· {first(userName(s, ann.by))}</span></p>}
    {g.reply ? <dl className="fbgrid"><div className="fb-ok"><dt>What you did well</dt><dd>{g.reply.wentWell}</dd></div><div className="fb-adj"><dt>One adjustment</dt><dd>{g.reply.adjust}</dd></div><div className="fb-why"><dt>Why</dt><dd>{g.reply.why}</dd></div><div><dt>From</dt><dd>{userName(s, g.reply.by)} · {shortWhen(g.reply.at)}</dd></div></dl>
      : g.wantsReply ? <p className="small"><span className="pill st-submitted">Feedback asked</span> {me === 'coach' ? 'Reply' : 'Coach replies'} by <b>{g.dueBy ? shortWhen(g.dueBy) : 'soon'}</b></p>
      : me !== 'coach' && g.seenAt ? <p className="small dim">👀 Seen by {first(userName(s, g.seenBy))}</p> : null}
    {me === 'coach' && <div className="row gap wrapx">
      {!g.seenAt && !g.wantsReply && <button className="chip" onClick={() => run({ type: 'reviewGame', playerId: p.id, gameId: g.id })}>Mark seen</button>}
      {!g.reply && <button className="chip" aria-expanded={open} onClick={() => setOpen(!open)}>{g.wantsReply ? 'Write reply' : 'Reply'}</button>}
      <button className="chip" onClick={() => run({ type: 'tagWin', playerId: p.id, text: g.wellDone + (g.opponent ? ` (vs ${g.opponent})` : ''), refId: g.id })}>★ Add to Wins wall</button></div>}
    {me === 'coach' && open && <form className="gamereply" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'reviewGame', playerId: p.id, gameId: g.id, ...f })) setOpen(false); }}>
      <label htmlFor={`gw-${g.id}`}>What they did well</label><input id={`gw-${g.id}`} className="input" value={f.wentWell} onChange={(e) => setF({ ...f, wentWell: e.target.value })} placeholder={g.wellDone} />
      <label htmlFor={`ga-${g.id}`}>One adjustment</label><input id={`ga-${g.id}`} className="input" value={f.adjust} onChange={(e) => setF({ ...f, adjust: e.target.value })} placeholder={g.replay || 'One thing for the next game'} />
      <label htmlFor={`gy-${g.id}`}>Why (tie it to the focus)</label><input id={`gy-${g.id}`} className="input" value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} placeholder={g.focusText ? `It builds “${g.focusText}”` : 'Why it matters'} />
      <button className="btn" disabled={f.wentWell.trim().length < 3 || f.adjust.trim().length < 3 || f.why.trim().length < 3}>Send game feedback</button></form>}
    {me === 'coach' && <form className="row gap small" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'addNote', playerId: p.id, kind: 'annotation', refId: g.id, text: note })) setNote(''); }}><label className="sr" htmlFor={`an-${g.id}`}>Timeline note</label><input id={`an-${g.id}`} className="input grow" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder={ann ? 'Replace the timeline note' : 'One-line note on the timeline'} /><button className="chip" disabled={note.trim().length < 3}>📌 Note</button></form>}
  </article>;
}

/** Pre-game card: one focus, one cue, one affirmation in the player's words. */
export function GamePlanCard({ p, editable, compact }: { p: Player; editable?: boolean; compact?: boolean }) {
  const s = useSnap(); const { run } = useStore(); const g = gamePlan(s, p); const [edit, setEdit] = useState(false); const [t, setT] = useState(g.affirmation ?? '');
  if (!g.focus) return null;
  return <section className={`gameplan ${compact ? 'compact' : ''}`} id="gameplan" aria-label="Game plan card">
    <p className="kicker">Game plan card</p>
    <dl><div><dt>One focus</dt><dd>{g.focus}</dd></div>{g.cue && <div><dt>One cue</dt><dd>{g.cue}</dd></div>}<div><dt>In my words</dt><dd>{g.affirmation ? `“${g.affirmation}”` : <span className="dim">{editable ? 'Add one line you’ll say to yourself before tip-off.' : 'Not written yet.'}</span>}</dd></div></dl>
    {editable && (edit ? <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'setAffirmation', playerId: p.id, text: t })) setEdit(false); }}><label className="sr" htmlFor="aff">Your line</label><input id="aff" className="input grow" maxLength={120} value={t} onChange={(e) => setT(e.target.value)} placeholder={g.suggestion} /><button className="btn">Save</button></form>
      : <div className="row gap"><button className="link small" onClick={() => { setT(g.affirmation ?? ''); setEdit(true); }}>{g.affirmation ? 'Edit my line' : 'Write my line'}</button>{compact && <Link className="link small" to="/app/games#gamelog">After the game: log it →</Link>}</div>)}
  </section>;
}

/** Practice-to-game transfer: how often the weekly focus shows up in games. */
export function TransferBadge({ p, cycleId, big }: { p: Player; cycleId?: string | null; big?: boolean }) {
  const s = useSnap(); const c = cycleId === undefined ? playerCycle(s, p.id) : s.cycles.find((x) => x.id === cycleId); const t = transfer(s, p.id, c?.id ?? null);
  if (!c) return null;
  return <div className={`transfer ${big ? "tbig" : ""}`} data-transfer={t.pct ?? ''}><div className="tmeter" aria-hidden><i style={{ width: `${t.pct ?? 0}%` }} /></div>
    <p><b>Practice → game: {t.pct === null ? '—' : `${t.pct}%`}</b> <span className="small dim">{t.label}{t.games ? ` · focus “${c.focus}”` : ''}</span></p></div>;
}

/** The progress timeline: game points + confidence, focus-start markers, rubric across cycles, reps/streak, clips and shooting logs, coach notes. */
export function Timeline({ p, me }: { p: Player; me: Me }) {
  const s = useSnap(); const d = useMemo(() => timeline(s, p.id, me === 'coach'), [s, p.id, me]); const [list, setList] = useState(false);
  const day = (x: string) => new Date(x + 'T12:00').getTime(); const t0 = day(d.start) - 864e5; const t1 = Math.max(day(d.end), clock(s).getTime()) + 864e5;
  const W = 640, H = 220, L = 34, R = 34, T = 26, B = 40; const X = (x: string) => L + ((day(x) - t0) / (t1 - t0)) * (W - L - R);
  const maxPts = Math.max(10, ...d.games.map((g) => g.pts ?? 0)); const YP = (v: number) => T + (1 - v / maxPts) * (H - T - B); const YC = (v: number) => T + (1 - (v - 1) / 4) * (H - T - B);
  const ptsG = d.games.filter((g) => g.pts != null); const t = transfer(s, p.id); const fn = first(p.name);
  return <section className="panel timeline" id="timeline" aria-label="Progress timeline">
    <div className="row between wrapx"><h3 className="display">{me === 'player' ? 'See the player you’re becoming' : `${fn}’s progress timeline`}</h3><span className="small dim">🔥 {d.streak}-day streak · {d.reps.reduce((n, r) => n + r.count, 0)} practice check-ins · {d.games.length} games</span></div>
    {d.story && <blockquote className="story"><p className="kicker">What changed and why</p><p>{d.story.text}</p><footer className="small">— {userName(s, d.story.by)}, {shortWhen(d.story.at)}{me === 'coach' && d.story.drafted ? ' · started from a data draft, edited by the coach' : ''}</footer></blockquote>}
    <TransferBadge p={p} />
    <svg viewBox={`0 0 ${W} ${H}`} className="tlchart" role="img" aria-label={`Points and confidence across ${d.games.length} games. ${t.label}.`}>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
      {d.focusStarts.map((f) => <g key={f.index} className="focusmark"><line x1={X(f.date)} x2={X(f.date)} y1={T - 14} y2={H - B} /><text x={X(f.date) + 4} y={T - 4}>Focus {f.index}: {f.focus.slice(0, 34)}</text></g>)}
      {d.rubric.map((r) => <g key={r.date + r.index} className="rubmark"><rect x={X(r.date) - 5} y={H - B + 18} width={10} height={10} transform={`rotate(45 ${X(r.date)} ${H - B + 23})`} /><text x={X(r.date) + 9} y={H - B + 27}>rubric {r.avg}</text></g>)}
      {d.clips.map((c, i) => <text key={'c' + i} x={X(c.date) - 6} y={H - B + 14} className="clipmark">🎥</text>)}
      {d.shots.map((x, i) => <text key={'s' + i} x={X(x.date) - 6} y={H - B - 4} className="shotmark">◎ {x.pct}%</text>)}
      {ptsG.length > 1 && <polyline className="ptsline" points={ptsG.map((g) => `${X(g.date)},${YP(g.pts!)}`).join(' ')} />}
      {d.games.length > 1 && <polyline className="confline" points={d.games.map((g) => `${X(g.date)},${YC(g.conf)}`).join(' ')} />}
      {d.games.map((g, i) => <g key={g.id}>{g.pts != null && <circle cx={X(g.date)} cy={YP(g.pts)} r={4} className="ptsdot"><title>{fmtDay(g.date)}: {g.pts} pts</title></circle>}
        <circle cx={X(g.date)} cy={YC(g.conf)} r={5} className={`confdot t-${g.tried ?? 'none'}`}><title>{fmtDay(g.date)}: confidence {g.conf}/5{g.tried ? ` · focus ${TRIED_LABEL[g.tried as FocusTried].toLowerCase()}` : ''}</title></circle>
        {g.note && <g className="notemark"><circle cx={X(g.date)} cy={T + 2} r={8} /><text x={X(g.date)} y={T + 6} textAnchor="middle">{d.games.filter((x) => x.note).indexOf(g) + 1}</text></g>}{void i}</g>)}
      <text x={4} y={T + 4} className="ylab pts">{maxPts} pts</text><text x={W - 4} y={T + 4} textAnchor="end" className="ylab conf">5</text><text x={W - 4} y={H - B} textAnchor="end" className="ylab conf">1</text>
    </svg>
    <p className="legend small"><span className="lg pts">— points</span><span className="lg conf">— confidence (1–5)</span><span className="lg">● tried focus · ◐ sometimes · ○ not yet</span><span className="lg">┆ focus start</span><span className="lg">◆ rubric (cycle review)</span><span className="lg">🎥 clip · ◎ shooting log</span></p>
    {d.games.some((g) => g.note) && <ol className="tlnotes small">{d.games.filter((g) => g.note).map((g) => <li key={g.id}><b>{fmtDay(g.date)}{g.opponent ? ` vs ${g.opponent}` : ''}:</b> {g.note}</li>)}</ol>}
    {d.reps.length > 0 && <div className="repweeks" aria-label="Practice check-ins per week">{d.reps.map((r) => <span key={r.week} title={`${r.week}: ${r.count}`} style={{ height: `${8 + r.count * 10}px` }}><i>{r.count}</i></span>)}<small>practice check-ins / week</small></div>}
    {d.rubric.some((r) => r.changes.length) && <p className="small">Rubric changes: {d.rubric.flatMap((r) => r.changes).join(' · ')}</p>}
    <button className="link small" aria-expanded={list} onClick={() => setList(!list)}>{list ? 'Hide' : 'Show'} the timeline as a list</button>
    {list && <table className="tltable small"><thead><tr><th>Date</th><th>Game</th><th>Points</th><th>Confidence</th><th>Focus</th></tr></thead><tbody>{d.games.map((g) => <tr key={g.id}><td>{fmtDay(g.date)}</td><td>{g.opponent ?? '—'}</td><td>{g.pts ?? '—'}</td><td>{g.conf}/5 ({FEEL_WORDS[g.conf]})</td><td>{g.tried ? TRIED_LABEL[g.tried as FocusTried] : '—'}</td></tr>)}</tbody></table>}
    {me === 'coach' && <StoryEditor p={p} />}
  </section>;
}

/** Coach writes (or starts from a data draft and edits) the plain-language "what changed and why". Families only see the approved text, signed by the coach. */
function StoryEditor({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const c = playerCycle(s, p.id); const ex = (s.timelineNotes ?? []).find((n) => n.playerId === p.id && n.kind === 'story' && n.refId === c?.id);
  const [t, setT] = useState(ex?.text ?? ''); const [drafted, setDrafted] = useState(!!ex?.drafted); useEffect(() => { setT(ex?.text ?? ''); }, [ex?.text]);
  if (!c) return null;
  return <form className="storyedit" onSubmit={(e) => e.preventDefault()}><p className="kicker">What changed and why · cycle {c.index} {ex ? <span className={`pill ${ex.status === 'approved' ? 'st-approved' : 'st-submitted'}`}>{ex.status === 'approved' ? 'Approved · families see it' : 'Draft · only coaches see it'}</span> : null}</p>
    <textarea id="story" className="input" rows={4} value={t} onChange={(e) => setT(e.target.value)} placeholder="In your words: what changed this cycle, and why (cite the focus)." />
    <div className="row gap wrapx"><button type="button" className="chip" onClick={() => { setT(draftStory(s, p)); setDrafted(true); }}>Draft from the data</button>
      <button type="button" className="chip" disabled={t.trim().length < 3} onClick={() => run({ type: 'addNote', playerId: p.id, kind: 'story', text: t, drafted })}>Save draft</button>
      <button type="button" className="btn" disabled={t.trim().length < 3} onClick={() => run({ type: 'addNote', playerId: p.id, kind: 'story', text: t, approve: true, drafted })}>Approve &amp; share with family</button></div>
    <p className="small dim">The draft only arranges what was logged (games, check-ins, your last adjustment). Edit it into your own words; it is shared as yours, never as an automated coach.</p></form>;
}

/** Wins wall: coach-tagged moments, personal bests, focus confirmed in games, streaks, rubric gains. */
export function WinsWall({ p, me }: { p: Player; me: Me }) {
  const s = useSnap(); const { run } = useStore(); const ws = (s.wins ?? []).filter((w) => w.playerId === p.id).sort((a, b) => b.at.localeCompare(a.at)); const [t, setT] = useState('');
  const ICON = { coach: '🗣️', best: '🏅', focus: '🎯', streak: '🔥', growth: '📈' } as const; const LABEL = { coach: 'Coach saw it', best: 'Personal best', focus: 'Focus in a game', streak: 'Streak', growth: 'Growth' } as const;
  return <section className="panel wins" id="wins"><h3 className="display">Wins wall</h3><p className="small dim">{me === 'player' ? 'Proof you’re getting better. Come back here before a big game.' : 'Moments worth remembering, tagged by the coach or earned automatically.'}</p>
    {ws.length ? <ul className="wingrid">{ws.map((w) => <li key={w.id} className={`win k-${w.kind}`}><span className="wico" aria-hidden>{ICON[w.kind]}</span><span className="small kicker">{LABEL[w.kind]}{w.by ? ` · ${first(userName(s, w.by))}` : ''}</span><b>{w.text}</b><small className="dim">{shortWhen(w.at)}</small></li>)}</ul> : <p className="dim">The first win lands with your first game log, streak or coach shout-out.</p>}
    {me === 'coach' && <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'tagWin', playerId: p.id, text: t })) setT(''); }}><label className="sr" htmlFor="winx">New win</label><input id="winx" className="input grow" maxLength={140} value={t} onChange={(e) => setT(e.target.value)} placeholder="A moment you saw (one line)" /><button className="btn" disabled={t.trim().length < 3}>★ Tag win</button></form>}
  </section>;
}

/** Tap a 5-spot court: pick a spot, then Make / Miss. */
const SPOT_XY = [[34, 150], [70, 70], [160, 40], [250, 70], [286, 150]];
export function ShotCourt({ value, onChange }: { value: number[][]; onChange: (v: number[][]) => void }) {
  const [sel, setSel] = useState(0); const add = (make: boolean) => onChange(value.map((x, i) => (i === sel ? [x[0] + (make ? 1 : 0), x[1] + 1] : x))); const undo = () => onChange(value.map((x, i) => (i === sel && x[1] > 0 ? [Math.max(0, x[0] - (x[0] === x[1] ? 1 : 0)), x[1] - 1] : x)));
  return <div className="shotcourt"><svg viewBox="0 0 320 190" role="group" aria-label="Shooting spots" className="court">
    <rect x={2} y={2} width={316} height={186} rx={8} className="floor" /><path d="M 20 190 L 20 120 A 140 140 0 0 1 300 120 L 300 190" className="arc" /><rect x={120} y={120} width={80} height={70} className="lane" /><circle cx={160} cy={172} r={7} className="rim" />
    {SPOTS.map((n, i) => { const [x, y] = SPOT_XY[i]; const [m, a] = value[i]; return <g key={n} role="button" tabIndex={0} aria-label={`${n}: ${m} of ${a}${sel === i ? ' (selected)' : ''}`} aria-pressed={sel === i} className={`spot ${sel === i ? 'on' : ''}`} data-spot={i} onClick={() => setSel(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i); } }}><circle cx={x} cy={y} r={24} /><text x={x} y={y + 5} textAnchor="middle">{m}/{a}</text></g>; })}
  </svg><div className="row gap wrapx"><span className="small strong grow">{SPOTS[sel]}</span><button type="button" className="btn sm" onClick={() => add(true)}>✓ Make</button><button type="button" className="btn ghost sm" onClick={() => add(false)}>✗ Miss</button><button type="button" className="link small" onClick={undo}>Undo</button></div></div>;
}
export const emptyShots = () => SPOTS.map(() => [0, 0]);
export function ShotSummary({ shots, title = 'Shooting log' }: { shots?: number[][] | null; title?: string }) {
  const st = shotStats(shots); if (!st) return null;
  return <div className="shotsum" aria-label={title}><p className="kicker">{title} · {st.made}/{st.att} ({st.pct}%){st.best ? ` · best spot: ${st.best.name} ${st.best.pct}%` : ''}</p>
    <ul className="spotbars">{st.spots.map((x) => <li key={x.name} className={st.best?.name === x.name ? 'best' : ''}><span>{x.name}</span><i style={{ width: `${x.pct ?? 0}%` }} /><b>{x.att ? `${x.made}/${x.att}` : '—'}</b></li>)}</ul></div>;
}
export const isShooting = (title: string) => /shoot|shot|three|jumper|catch|form|finish/i.test(title);
export function PressureBadge({ pr }: { pr?: Pressure | null }) { if (!pr) return null; return <p className="pressure"><span className="pill st-feedback-due">Pressure rep</span> <b>{PRESSURE_LABEL[pr.kind]}</b>: {pr.target}</p>; }

// ---------- Player Card ----------
export function PlayerCardView({ c }: { c: PublicCard }) {
  return <article className="pcard" aria-label={`Player card: ${c.name}`}>
    <header><span className="pc-brand">{c.program}</span><span className="pc-lvl">Level {c.level} · {c.levelName}</span></header>
    <h2 className="display">{c.name}</h2>{c.position && <p className="pc-pos">{c.position}</p>}
    <div className="pc-row"><div><b>🔥 {c.streak}</b><small>day streak</small></div>{c.stats && <><div><b>{c.stats.pts ?? '—'}</b><small>pts / game</small></div><div><b>{c.stats.reb ?? '—'}</b><small>reb</small></div><div><b>{c.stats.ast ?? '—'}</b><small>ast</small></div></>}</div>
    {c.focus && <p className="pc-focus"><small>Working on</small>{c.focus}</p>}
    {c.quote && <blockquote className="pc-quote">“{c.quote}”<footer>— {c.coach}</footer></blockquote>}
    {c.moment && <p className="pc-moment"><small>Best moment</small>{c.moment}</p>}
    <footer className="pc-foot">See the player you’re becoming, with a real coach watching.</footer>
  </article>;
}
/** Draws the card to a PNG (1080×1350) for saving or texting to family. */
export function exportCardPng(c: PublicCard) {
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d'); if (!g) return null;
  const grd = g.createLinearGradient(0, 0, 0, 1350); grd.addColorStop(0, '#0B1430'); grd.addColorStop(1, '#162a63'); g.fillStyle = grd; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = '#FF5E1A'; g.fillRect(0, 0, 1080, 18); g.font = '700 34px system-ui, sans-serif'; g.fillText(c.program.toUpperCase(), 72, 110); g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText(`LEVEL ${c.level} · ${c.levelName.toUpperCase()}`, 1008, 110); g.textAlign = 'left';
  g.font = '900 120px system-ui, sans-serif'; g.fillText(c.name.toUpperCase(), 72, 290); g.font = '400 40px system-ui, sans-serif'; g.fillStyle = '#b8c3e6'; if (c.position) g.fillText(c.position, 76, 350);
  const wrap = (t: string, x: number, y: number, w: number, lh: number) => { const words = t.split(' '); let line = ''; for (const wd of words) { if (g.measureText(line + wd).width > w) { g.fillText(line, x, y); y += lh; line = ''; } line += wd + ' '; } g.fillText(line, x, y); return y + lh; };
  g.fillStyle = '#FF5E1A'; g.font = '800 72px system-ui, sans-serif'; g.fillText(`🔥 ${c.streak}`, 72, 480); g.fillStyle = '#b8c3e6'; g.font = '400 30px system-ui, sans-serif'; g.fillText('day streak', 76, 525);
  if (c.stats) { g.fillStyle = '#fff'; g.font = '800 72px system-ui, sans-serif'; [[c.stats.pts, 'pts / game'], [c.stats.reb, 'reb'], [c.stats.ast, 'ast']].forEach(([v, l], i) => { g.fillText(String(v ?? '—'), 380 + i * 230, 480); g.font = '400 30px system-ui, sans-serif'; g.fillStyle = '#b8c3e6'; g.fillText(String(l), 384 + i * 230, 525); g.fillStyle = '#fff'; g.font = '800 72px system-ui, sans-serif'; }); }
  let y = 640; g.fillStyle = '#b8c3e6'; g.font = '600 30px system-ui, sans-serif'; if (c.focus) { g.fillText('WORKING ON', 72, y); g.fillStyle = '#fff'; g.font = '700 46px system-ui, sans-serif'; y = wrap(c.focus, 72, y + 60, 930, 56) + 30; }
  if (c.quote) { g.fillStyle = '#FFB088'; g.font = 'italic 500 44px Georgia, serif'; y = wrap(`“${c.quote}”`, 72, y + 20, 930, 56); g.fillStyle = '#b8c3e6'; g.font = '400 32px system-ui, sans-serif'; g.fillText(`— ${c.coach}`, 72, y + 10); y += 80; }
  if (c.moment) { g.fillStyle = '#b8c3e6'; g.font = '600 30px system-ui, sans-serif'; g.fillText('BEST MOMENT', 72, y + 20); g.fillStyle = '#fff'; g.font = '600 40px system-ui, sans-serif'; wrap(c.moment, 72, y + 76, 930, 50); }
  g.fillStyle = '#FF5E1A'; g.fillRect(0, 1240, 1080, 110); g.fillStyle = '#0B1430'; g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('See the player you’re becoming, with a real coach watching.', 540, 1305);
  return cv.toDataURL('image/png');
}
/** Parent controls: link on/off, replace link, show stats, pick the moment, export image. */
export function CardSettings({ p }: { p: Player }) {
  const s = useSnap(); const { run, as } = useStore(); const c = publicCard(s, p); const card = p.card; const isParent = as?.role === 'parent'; const ws = (s.wins ?? []).filter((w) => w.playerId === p.id); const [copied, setCopied] = useState(false);
  const url = card?.enabled && card.token ? `${location.origin}${location.pathname}#/card/${card.token}` : null;
  return <section className="panel cardset" id="card"><h3 className="display">Player Card</h3>
    <p className="small dim">A card {first(p.name)} can be proud of: level, streak, focus, a coach quote and a best moment. {isYoung(p) ? 'Under 13: first name only, and ' : ''}It’s private until you turn on the link{isParent ? '' : ' (parents control it)'}. Stats only show if you choose.</p>
    <div className="cardgrid"><PlayerCardView c={c} />
      <div>{isParent ? <>
        <label className="row gap check"><input id="card-on" type="checkbox" checked={!!card?.enabled} onChange={(e) => run({ type: 'setCard', playerId: p.id, enabled: e.target.checked })} /> Private link on</label>
        <label className="row gap check"><input id="card-stats" type="checkbox" checked={!!card?.showStats} onChange={(e) => run({ type: 'setCard', playerId: p.id, showStats: e.target.checked })} /> Show game stats (averages)</label>
        {ws.length > 0 && <label>Best moment<select className="input" value={card?.momentId ?? ''} onChange={(e) => run({ type: 'setCard', playerId: p.id, momentId: e.target.value || null })}><option value="">Latest coach-tagged moment</option>{ws.map((w) => <option key={w.id} value={w.id}>{w.text.slice(0, 70)}</option>)}</select></label>}
        {url ? <><p className="small">Anyone with this link can see the card (not the app):</p><div className="row gap"><input aria-label="Card link" className="input grow mono" readOnly value={url} /><button className="chip" onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button></div>
          <div className="row gap wrapx"><a className="link small" href={url} target="_blank" rel="noreferrer">Open the card</a><button className="link small" onClick={() => run({ type: 'setCard', playerId: p.id, newLink: true, enabled: true })}>Replace link (old one stops working)</button></div></> : <p className="small dim">No link exists right now. Nobody outside your family and coaches can see the card.</p>}
      </> : <p className="small dim">{card?.enabled ? 'Your parent has shared this card with a private link.' : 'Private: only your family and coaches see it.'}</p>}
        <button className="btn ghost" onClick={() => { const d = exportCardPng(c); if (!d) return; const a = document.createElement('a'); a.href = d; a.download = `${c.name.replace(/\W+/g, '-').toLowerCase()}-player-card.png`; a.click(); }}>Save as image</button></div></div>
  </section>;
}
/** Public route: #/card/:token. */
export function PublicCardPage() {
  const { token } = useParams(); const { api } = useStore(); const [c, setC] = useState<PublicCard | null>(null); const [err, setErr] = useState('');
  useEffect(() => { api.get<PublicCard>(`/api/card/${token}`).then(setC).catch((e) => setErr((e as Error).message)); }, [api, token]);
  return <main id="main" className="cardpage hardwood"><Logo light />{c ? <PlayerCardView c={c} /> : <p className="light">{err || 'Loading…'}</p>}<p className="small light">Shared privately by a parent. <Link className="light" to="/">What is Baller Connection?</Link></p></main>;
}
