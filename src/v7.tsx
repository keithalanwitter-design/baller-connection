// v7 UI: game log + post-game check-in, game plan card, progress timeline, Wins wall, 5-spot shooting log, Player Card.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from './App';
import { useSnap, useStore } from './store';
import { PRESSURE_LABEL, type Player, type Pressure } from '../shared/domain';
import { SPOTS, gamePlan, isYoung, shotStats } from '../shared/games';
import { draftStory, publicCard, type PublicCard } from '../shared/timeline';
import { shortWhen } from '../shared/time';
import { first, playerCycle, userName } from '../shared/workflow';

type Me = 'player' | 'parent' | 'coach';

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

/** Coach writes (or starts from a data draft and edits) the plain-language "what changed and why". Families only see the approved text, signed by the coach. */
export function StoryEditor({ p }: { p: Player }) {
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
  const s = useSnap(); const { run } = useStore(); const ws = (s.wins ?? []).filter((w) => w.playerId === p.id && (w.kind === 'coach' || w.kind === 'focus')).sort((a, b) => b.at.localeCompare(a.at)); const [t, setT] = useState('');
  const ICON = { coach: '🗣️', best: '🏅', focus: '🎯', streak: '🔥', growth: '📈' } as const; const LABEL = { coach: 'Coach saw it', best: 'Personal best', focus: 'Carried into a game', streak: 'Streak', growth: 'Growth' } as const;
  return <section className="panel wins" id="wins"><h3 className="display">What your coach noticed</h3><p className="small dim">{me === 'player' ? 'Moments he saw. Come back here before a big game.' : 'Moments the coach flagged, or a focus that carried into a game.'}</p>
    {ws.length ? <ul className="wingrid">{ws.map((w) => <li key={w.id} className={`win k-${w.kind}`}><span className="wico" aria-hidden>{ICON[w.kind]}</span><span className="small kicker">{LABEL[w.kind]}{w.by ? ` · ${first(userName(s, w.by))}` : ''}</span><b>{w.text}</b><small className="dim">{shortWhen(w.at)}</small></li>)}</ul> : <p className="dim">Moments your coach notices will collect here.</p>}
    {me === 'coach' && <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'tagWin', playerId: p.id, text: t })) setT(''); }}><label className="sr" htmlFor="winx">New moment</label><input id="winx" className="input grow" maxLength={140} value={t} onChange={(e) => setT(e.target.value)} placeholder="A moment you saw (one line)" /><button className="btn" disabled={t.trim().length < 3}>★ Add moment</button></form>}
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
    <header><span className="pc-brand">{c.program}</span></header>
    <h2 className="display">{c.name}</h2>{c.position && <p className="pc-pos">{c.position}</p>}
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
  g.fillStyle = '#FF5E1A'; g.fillRect(0, 0, 1080, 18); g.font = '700 34px system-ui, sans-serif'; g.fillText(c.program.toUpperCase(), 72, 110); g.textAlign = 'left';
  g.font = '900 120px system-ui, sans-serif'; g.fillText(c.name.toUpperCase(), 72, 290); g.font = '400 40px system-ui, sans-serif'; g.fillStyle = '#b8c3e6'; if (c.position) g.fillText(c.position, 76, 350);
  const wrap = (t: string, x: number, y: number, w: number, lh: number) => { const words = t.split(' '); let line = ''; for (const wd of words) { if (g.measureText(line + wd).width > w) { g.fillText(line, x, y); y += lh; line = ''; } line += wd + ' '; } g.fillText(line, x, y); return y + lh; };
  let y = 480; g.fillStyle = '#b8c3e6'; g.font = '600 30px system-ui, sans-serif'; if (c.focus) { g.fillText('WORKING ON', 72, y); g.fillStyle = '#fff'; g.font = '700 46px system-ui, sans-serif'; y = wrap(c.focus, 72, y + 60, 930, 56) + 30; }
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
    <p className="small dim">A card {first(p.name)} can be proud of: the current focus, a coach quote and a best moment. No stats. {isYoung(p) ? 'Under 13: first name only, and ' : ''}It’s private until you turn on the link{isParent ? '' : ' (parents control it)'}.</p>
    <div className="cardgrid"><PlayerCardView c={c} />
      <div>{isParent ? <>
        <label className="row gap check"><input id="card-on" type="checkbox" checked={!!card?.enabled} onChange={(e) => run({ type: 'setCard', playerId: p.id, enabled: e.target.checked })} /> Private link on</label>
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
