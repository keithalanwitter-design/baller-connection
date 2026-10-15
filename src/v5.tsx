/* v5: short clips (pick / record / play / timestamp), the "Your focus this week" card with its required acknowledgment,
   "What I'm working on", acknowledgment status for coaches, and the review timer. */
import { useEffect, useRef, useState } from 'react';
import { useSnap, useStore } from './store';
import type { Clip, Player, Review, TimedNote } from '../shared/domain';
import { CLIP_ACCEPT, CLIP_MAX_MB, CLIP_MAX_SEC, CLIP_RETENTION_DAYS, TRIM_HINT, clipError, fmtT, mb, normalizeMime, tooLong } from '../shared/clips';
import { shortWhen, weekKey } from '../shared/time';
import { clock } from '../shared/workflow';
import { first, lastReview, openAssignment, playerAssignments, userName } from '../shared/workflow';
import { TeachBack } from './v9';

/** Reads duration from the file's own metadata in a <video> element (client-side check; the server re-checks the container). */
export function readDuration(file: Blob): Promise<number | null> {
  return new Promise((ok) => {
    const v = document.createElement('video'); const url = URL.createObjectURL(file); let done = false;
    const end = (d: number | null) => { if (done) return; done = true; URL.revokeObjectURL(url); ok(d); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { if (Number.isFinite(v.duration)) end(v.duration); else { v.currentTime = 1e6; v.ontimeupdate = () => end(Number.isFinite(v.duration) ? v.duration : null); } };
    v.onerror = () => end(null); setTimeout(() => end(null), 8000); v.src = url;
  });
}
export interface PickedClip { file: File; durationSec: number; mime: string; url: string }
export const videoConsentOk = (s: ReturnType<typeof useSnap>, p: Player) => p.age >= 13 || s.consents.some((c) => c.playerId === p.id && c.version >= '2026-10b');

/** Choose or record one clip. Validates type, size and length before anything is uploaded. */
export function ClipPicker({ p, value, onChange }: { p: Player; value: PickedClip | null; onChange: (c: PickedClip | null) => void }) {
  const s = useSnap(); const [err, setErr] = useState<string | null>(null); const [hint, setHint] = useState(false); const [busy, setBusy] = useState(false);
  if (!videoConsentOk(s, p)) return <p className="note small" data-clip="consent">Clips are off until a parent says OK (players under 13). Parent view → Account → “Allow clips”.</p>;
  const pick = async (f?: File | null) => {
    setErr(null); setHint(false); if (!f) return; setBusy(true);
    const mime = normalizeMime(f.type, f.name); const d = await readDuration(f); setBusy(false);
    const e = clipError({ mime, bytes: f.size, durationSec: d }); if (e) { setErr(e); setHint(tooLong(d)); onChange(null); return; }
    onChange({ file: f, durationSec: d!, mime, url: URL.createObjectURL(f) });
  };
  return <div className="clippick" aria-live="polite">
    {value ? <div className="clipchosen"><video src={value.url} muted playsInline controls className="clipprev" aria-label="Your clip preview" /><div><b>Clip ready · {Math.round(value.durationSec)} s · {mb(value.file.size)} MB</b><p className="small dim">It uploads when you send.</p><button type="button" className="link" onClick={() => onChange(null)}>Remove clip</button></div></div>
      : <div className="row gap wrapx">
        <label className="btn ghost sm filebtn">🎥 Add a clip<input id="clipfile" type="file" accept={CLIP_ACCEPT} className="sr" onChange={(e) => pick(e.target.files?.[0])} /></label>
        <label className="btn ghost sm filebtn mobileonly">● Record now<input id="cliprec" type="file" accept="video/*" capture="environment" className="sr" onChange={(e) => pick(e.target.files?.[0])} /></label>
        <span className="small dim">Up to {CLIP_MAX_SEC} s · {CLIP_MAX_MB} MB · MP4, MOV or WebM</span></div>}
    {busy && <p className="small dim">Checking the clip…</p>}
    {err && <p className="err small" role="alert" data-clip="error">{err}</p>}
    {hint && <p className="note small" data-clip="trim">✂ {TRIM_HINT}</p>}
  </div>;
}

/** Plays a clip with coaching controls: 0.5×/1×, frame step, loop, and (coach) tap-to-timestamp notes. */
export function ClipPlayer({ clip, notes = [], onNote, playerRef }: { clip: Clip; notes?: TimedNote[]; onNote?: (t: number) => void; playerRef?: React.MutableRefObject<HTMLVideoElement | null> }) {
  const { api } = useStore(); const v = useRef<HTMLVideoElement | null>(null); const [rate, setRate] = useState(1); const [loop, setLoop] = useState(false); const [t, setT] = useState(0);
  const src = api.clipSrc(clip);
  if (!src) return <div className="clipgone small dim" data-clip="unavailable">This demo clip only lived in the browser tab that recorded it ({Math.round(clip.durationSec)} s). In the real app it’s stored privately.</div>;
  const step = (dir: number) => { const el = v.current; if (!el) return; el.pause(); el.currentTime = Math.max(0, Math.min((el.duration || clip.durationSec), el.currentTime + dir / 30)); };
  const seek = (x: number) => { const el = v.current; if (el) { el.currentTime = x; el.pause(); } };
  return <div className="clipplayer">
    <video ref={(el) => { v.current = el; if (playerRef) playerRef.current = el; }} src={src} controls playsInline preload="metadata" loop={loop} crossOrigin={src.startsWith('http') && !src.startsWith(location.origin) ? 'use-credentials' : undefined}
      onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { e.currentTarget.playbackRate = rate; }} aria-label={`Practice clip, ${Math.round(clip.durationSec)} seconds`} />
    <div className="cliptools" role="toolbar" aria-label="Clip controls">
      <div className="seg light">{[0.5, 1].map((r) => <button key={r} type="button" aria-pressed={rate === r} className={rate === r ? 'on' : ''} onClick={() => { setRate(r); if (v.current) v.current.playbackRate = r; }}>{r}×</button>)}</div>
      <button type="button" className="btn sm ghost" onClick={() => step(-1)} aria-label="Back one frame" title="Back one frame (J)">◀ frame</button>
      <button type="button" className="btn sm ghost" onClick={() => step(1)} aria-label="Forward one frame" title="Forward one frame (K)">frame ▶</button>
      <button type="button" className={`btn sm ${loop ? '' : 'ghost'}`} aria-pressed={loop} onClick={() => setLoop(!loop)}>⟲ Loop</button>
      <span className="tc" aria-live="off">{fmtT(t)} / {fmtT(clip.durationSec)}</span>
      {onNote && <button type="button" id="addnote" className="btn sm" onClick={() => { v.current?.pause(); onNote(Math.round((v.current?.currentTime ?? t) * 10) / 10); }}>📍 Note at {fmtT(t)}</button>}
    </div>
    {notes.length > 0 && !onNote && <NoteList notes={notes} onSeek={seek} />}
    {clip.watchFor && <p className="small"><b>Watch for:</b> “{clip.watchFor}”</p>}
  </div>;
}
export function NoteList({ notes, onSeek }: { notes: TimedNote[]; onSeek?: (t: number) => void }) {
  return <ul className="tnotes">{notes.map((n, i) => <li key={i}><button type="button" className="tstamp" onClick={() => onSeek?.(n.t)} disabled={!onSeek}>{fmtT(n.t)}</button> {n.text}</li>)}</ul>;
}
/** The clip attached to a submission (if any), with notes from its review. */
export function SubmissionClip({ clipId, notes }: { clipId?: string | null; notes?: TimedNote[] | null }) {
  const s = useSnap(); const c = clipId ? s.clips.find((x) => x.id === clipId) : undefined;
  if (!clipId) return null; if (!c) return <p className="small dim">🎥 Clip removed (90-day limit or on request).</p>;
  return <ClipPlayer clip={c} notes={notes ?? []} />;
}

/** “From your coach”: the one adjustment, the next rep, and (for the player) the teach-back in their own words. */
export function FocusCard({ p, me, compact }: { p: Player; me: 'player' | 'parent'; compact?: boolean }) {
  const s = useSnap(); const { run } = useStore(); const r = lastReview(s, p.id); const [ask, setAsk] = useState(false); const [q, setQ] = useState('');
  if (!r) return null;
  const nextA = openAssignment(s, p.id) ?? playerAssignments(s, p.id).find((x) => x.status === 'queued'); const coach = first(userName(s, r.reviewerId));
  const thread = s.messages.filter((m) => m.context === 'feedback' && m.refId === r.id); const answered = thread.some((m) => m.from === 'coach');
  return <section className={`focus5 ${compact ? 'compact' : ''} ${r.teachBack ? 'acked' : 'pending'}`} id="focus" data-review={r.id} data-ack={r.teachBack ? (r.teachBack.mark ?? 'sent') : 'none'}>
    <p className="kicker orange">One thing to work on · from {coach}</p>
    <h2 className="display">{r.adjust}</h2>
    {!compact && <p className="small"><b>What you did well:</b> {r.wentWell}<br /><b>Why this adjustment:</b> {r.why}</p>}
    <dl className="focusgrid"><div><dt>Next rep</dt><dd>{r.nextRep}</dd></div><div><dt>How much</dt><dd>{nextA ? `${nextA.reps} sets` : 'Wrap-up'}</dd></div></dl>
    {r.notes && r.notes.length > 0 && !compact && <><p className="kicker">On your clip</p><NoteList notes={r.notes} /></>}
    {r.reaction === 'question' && !r.teachBack && <p className="ack q" role="status">❓ Question sent{answered ? `. ${coach} answered in Inbox.` : thread.at(-1)?.dueBy ? `. ${coach} writes back by ${shortWhen(thread.at(-1)!.dueBy!)}.` : '.'}</p>}
    <TeachBack p={p} r={r} me={me} />
    {me === 'player' && !r.teachBack && <><button id="ack-q" className="link small" aria-expanded={ask} onClick={() => setAsk(!ask)}>I have a question first</button>
      {ask && <form className="row gap" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'reactFeedback', playerId: p.id, reviewId: r.id, reaction: 'question', question: q })) { setAsk(false); setQ(''); } }}>
        <label className="sr" htmlFor="ackq">Your question</label><input id="ackq" autoFocus className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What part is unclear?" /><button className="btn" disabled={q.trim().length < 3}>Send question</button></form>}</>}
  </section>;
}
/** One sentence in the player's words, renewed each week, at the top of Today. */
export function WorkingOn({ p, editable }: { p: Player; editable: boolean }) {
  const s = useSnap(); const { run } = useStore(); const fresh = p.workingOn && p.workingOnWeek === weekKey(clock(s)); const [edit, setEdit] = useState(false); const r = lastReview(s, p.id);
  const [t, setT] = useState(''); const open = editable && (!fresh || edit);
  return <section className="workingon" id="workingon">
    {fresh && !edit ? <p><span className="kicker">What I’m working on</span><q>{p.workingOn}</q>{editable && <button className="link small" onClick={() => { setT(p.workingOn ?? ''); setEdit(true); }}>Edit</button>}</p>
      : open ? <form className="row gap wrapx" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'setWorkingOn', playerId: p.id, text: t })) setEdit(false); }}>
        <label htmlFor="wo" className="kicker">This week, in one sentence: what are you working on?</label>
        <input id="wo" className="input grow" maxLength={160} value={t} onChange={(e) => setT(e.target.value)} placeholder={r ? `e.g. ${r.adjust}` : 'e.g. Staying low on every switch'} /><button className="btn sm" disabled={t.trim().length < 3}>Save</button></form>
      : <p className="small dim"><span className="kicker">What {first(p.name)} is working on</span> Not written yet this week.</p>}
  </section>;
}

/** Coach view: has the player said it back, and have you read it? */
export function AckStatus({ r }: { r: Review }) {
  if (r.status !== 'final') return <span className="ackchip wait">Awaiting sign-off</span>;
  const tb = r.teachBack; if (!tb) return <span className="ackchip wait">No teach-back (optional)</span>;
  return tb.mark === 'got-it' ? <span className="ackchip ok">✓ Teach-back: got it</span> : tb.mark === 'clarify' ? <span className="ackchip q">↺ Clarifying</span> : <span className="ackchip late">Teach-back to read</span>;
}
export const fmtSpent = (sec?: number | null) => (sec ? fmtT(sec) : '—');

/** Review timer: starts when the review opens; target under 5 minutes. */
export function useReviewTimer(key: string) {
  const start = useRef(Date.now()); const [now, setNow] = useState(Date.now());
  useEffect(() => { start.current = Date.now(); setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [key]);
  return Math.round((now - start.current) / 1000);
}
export const RETENTION_COPY = `Clips are up to ${CLIP_MAX_SEC} seconds, seen only by you, your parent(s) and your assigned coaches, and deleted after ${CLIP_RETENTION_DAYS} days or when you ask.`;

/** Parent account: the clip consent upgrade (under 13) and every stored clip with a delete button. */
export function ClipPrivacy({ p }: { p: Player }) {
  const s = useSnap(); const { run } = useStore(); const fam = s.families.find((f) => f.id === p.familyId); const clips = s.clips.filter((c) => c.playerId === p.id);
  return <section className="panel" id="clips"><h3 className="display">Clips</h3>
    <p className="small dim">{RETENTION_COPY}</p>
    {!videoConsentOk(s, p) && <div className="note"><p className="small">{first(p.name)} is under 13, so clips stay off until you OK them.</p><button id="allowclips" className="btn sm" onClick={() => run({ type: 'recordConsent', playerId: p.id, guardianName: fam?.parentName ?? '', agreed: true })}>Allow clips (updates consent)</button></div>}
    {clips.length === 0 ? <p className="small dim">No clips stored.</p> : <ul className="plain">{clips.map((c) => <li key={c.id} className="row between wrapx"><span>🎥 {Math.round(c.durationSec)} s · {shortWhen(c.at)} · auto-deletes {shortWhen(c.deleteAfter)}</span><button className="chip danger" onClick={() => { if (confirm('Delete this clip now? This can’t be undone.')) run({ type: 'deleteClip', playerId: p.id, clipId: c.id }); }}>Delete clip</button></li>)}</ul>}
  </section>;
}
