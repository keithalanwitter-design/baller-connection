import { useState } from 'react';
import { STATUSES, fmt, type Message, type Player, type Status } from '../store';

export function StatusTrack({ status }: { status: Status }) {
  const i = STATUSES.indexOf(status);
  return <ol className="track" aria-label={`Status: ${status}`}>{STATUSES.map((st, j) => <li key={st} className={j < i ? 'done' : j === i ? 'on' : ''} title={st}><span className="sr">{st}</span></li>)}</ol>;
}
export function Pill({ status }: { status: Status }) { return <span className={`pill s-${status.replace(/ /g, '-').toLowerCase()}`}>{status}</span>; }

export function Thread({ p, me, onSend }: { p: Player; me: Message['from']; onSend: (t: string) => void }) {
  const [t, setT] = useState('');
  const who = (m: Message) => (m.from === 'coach' ? 'Coach' : m.from === 'parent' ? p.parentName : p.name);
  return (
    <div className="thread">
      <ul aria-live="polite">{p.messages.length === 0 && <li className="muted">No messages yet.</li>}
        {p.messages.map((m, i) => <li key={i} className={`msg ${m.from === me ? 'mine' : ''}`}><span className="small muted">{who(m)} · {fmt(m.at)}</span><p>{m.text}</p></li>)}</ul>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onSend(t.trim()); setT(''); } }}>
        <label className="sr" htmlFor="msg">Message</label>
        <input id="msg" className="input grow" value={t} onChange={(e) => setT(e.target.value)} placeholder="Write a message" />
        <button className="btn" disabled={!t.trim()}>Send</button>
      </form>
    </div>
  );
}

export function Rubric({ r, edit }: { r: Record<string, number>; edit?: (k: string, v: number) => void }) {
  const keys = Object.keys(r);
  if (!keys.length) return <p className="muted">Rubric starts after the first plan.</p>;
  return <ul className="rubric">{keys.map((k) => <li key={k}><span>{k}</span><div className="bar" aria-label={`${k}: ${r[k]} of 5`}><i style={{ width: `${r[k] * 20}%` }} /></div>
    {edit ? <span className="row"><button className="ghost sm" aria-label={`Lower ${k}`} onClick={() => edit(k, Math.max(1, r[k] - 1))}>−</button><b>{r[k]}</b><button className="ghost sm" aria-label={`Raise ${k}`} onClick={() => edit(k, Math.min(5, r[k] + 1))}>+</button></span> : <b>{r[k]}/5</b>}</li>)}</ul>;
}

export function Journal({ p }: { p: Player }) {
  const [f, setF] = useState<'all' | 'approved' | 'retry' | 'submitted'>('all');
  const list = p.assignments.filter((a) => a.state !== 'assigned' && (f === 'all' || a.state === f)).slice().reverse();
  return (
    <div>
      <div className="seg sm" role="group" aria-label="Filter journal">{(['all', 'approved', 'retry', 'submitted'] as const).map((k) => <button key={k} aria-pressed={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k === 'retry' ? 'Another attempt' : k[0].toUpperCase() + k.slice(1)}</button>)}</div>
      {list.length === 0 && <p className="muted">Nothing here yet.</p>}
      <ol className="chain">{list.map((a) => (
        <li key={a.id} className="card">
          <div className="row between"><strong>{a.title}</strong><span className={`pill a-${a.state}`}>{a.state === 'retry' ? 'Another attempt' : a.state === 'approved' ? 'Approved' : 'Awaiting coach'}</span></div>
          <dl><dt>Assignment</dt><dd>{a.reps} sets · {a.minutes} min · {a.cues[0]}</dd>
            <dt>Player response</dt><dd>{a.repsDone}/{a.reps} sets · “{a.reflection}”</dd>
            <dt>Coach observation</dt><dd>{a.feedback ?? <span className="muted">Coming soon</span>}</dd></dl>
        </li>))}</ol>
    </div>
  );
}
