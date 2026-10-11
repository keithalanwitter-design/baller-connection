import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LifecycleState, Player, Role, Snapshot } from '../shared/domain';
import { relative, shortWhen } from '../shared/time';
import { LEVELS, clock, family, first, guide, progress, type Guide } from '../shared/workflow';
import { useSnap, useStore } from './store';

export const TRACK: LifecycleState[] = ['Invited', 'Onboarding', 'Plan building', 'Plan set', 'Work ready', 'Submitted', 'Feedback due', 'Next step ready', 'Cycle review'];
const slug = (x: string) => x.toLowerCase().replace(/[^a-z]+/g, '-');
export function Pill({ state }: { state: string }) { return <span className={`pill st-${slug(state)}`}>{state}</span>; }
export function Track({ state }: { state: LifecycleState }) {
  const i = TRACK.indexOf(state);
  return <ol className="track" aria-label={`Lifecycle: ${state}`}>{TRACK.map((t, j) => <li key={t} className={j < i ? 'done' : j === i ? 'on' : ''}><span>{t}</span></li>)}</ol>;
}

/** The persistent “Your path” panel: what’s happening, why, who acts, by when, what unlocks. */
export function PathPanel({ p, role, compact }: { p: Player; role: Role; compact?: boolean }) {
  const s = useSnap(); const g: Guide = guide(s, p, role);
  return (
    <section className={`path-panel who-${g.who} ${compact ? 'compact' : ''}`} aria-label="Your path">
      <div className="pp-head"><span className="kicker">{role === 'coach' ? 'Workflow' : 'Your path'}</span><Pill state={g.stage} /></div>
      <p className="pp-what">{g.what}</p>
      <dl className="pp-grid">
        <div><dt>Why it matters</dt><dd>{g.why}</dd></div>
        <div><dt>Who acts next</dt><dd className="who">{g.whoLabel}</dd></div>
        <div><dt>By when</dt><dd>{g.byWhen ?? 'No deadline'}</dd></div>
        <div><dt>Unlocks</dt><dd>{g.unlocks}</dd></div>
      </dl>
      {g.action && <ActionButton g={g} />}
    </section>
  );
}
export function ActionButton({ g, className = 'btn' }: { g: Guide; className?: string }) {
  const { run } = useStore(); const nav = useNavigate();
  if (!g.action) return null;
  const go = (to: string) => { const [path, hash] = to.split('#'); nav(path); if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'center' }), 60); };
  return <button className={className} onClick={() => (g.action!.cmd ? run(g.action!.cmd) : go(g.action!.to!))}>{g.action.label} →</button>;
}

export function JourneyMap({ pid, big }: { pid: string; big?: boolean }) {
  const s = useSnap(); const pr = progress(s, pid);
  return (
    <section className={`journey ${big ? 'big' : ''}`} aria-label={`Journey: level ${pr.level}, ${pr.name}`}>
      <div className="row between"><span className="kicker">Journey · Level {pr.level}{pr.level ? ` · ${pr.name}` : ''}</span>{pr.next && <span className="small">Next: <b>{pr.next.name}</b> — {pr.next.unlock}</span>}</div>
      <ol>{LEVELS.map((l) => { const st = l.n <= pr.level ? 'done' : l.n === pr.level + 1 ? 'on' : ''; return (
        <li key={l.n} className={st}><span className="node" aria-hidden>{st === 'done' ? '✓' : l.n}</span><b>{l.name}</b>{big && <span className="small">{l.unlock}</span>}
          {st === 'on' && <span className="meter" aria-label={`${Math.round(pr.pct * 100)}% to ${l.name}`}><i style={{ width: `${pr.pct * 100}%` }} /></span>}</li>); })}</ol>
    </section>
  );
}

export function Thread({ p, me, onSend }: { p: Player; me: 'player' | 'parent' | 'coach'; onSend: (t: string) => void }) {
  const s = useSnap(); const [t, setT] = useState(''); const msgs = s.messages.filter((m) => m.playerId === p.id).sort((a, b) => a.at.localeCompare(b.at));
  const who = (f: string) => (f === 'coach' ? 'Coach' : f === 'parent' ? family(s, p).parentName : p.name);
  return (
    <div className="thread">
      <ul aria-live="polite">{msgs.length === 0 && <li className="muted">No messages yet.</li>}
        {msgs.map((m) => <li key={m.id} className={`msg ${m.from === me ? 'mine' : ''} from-${m.from}`}><span className="small muted">{who(m.from)} · {shortWhen(m.at)}{m.from !== 'coach' && !m.answered ? ` · reply due ${m.dueBy ? relative(m.dueBy, clock(s)) : ''}` : ''}</span><p>{m.text}</p></li>)}</ul>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onSend(t.trim()); setT(''); } }}>
        <label className="sr" htmlFor="msg">Message</label><input id="msg" className="input grow" value={t} onChange={(e) => setT(e.target.value)} placeholder="Write a message" />
        <button className="btn" disabled={!t.trim()}>Send</button>
      </form>
    </div>
  );
}

export function Rubric({ p, edit }: { p: Player; edit?: boolean }) {
  const { run } = useStore(); const keys = Object.keys(p.rubric);
  if (!keys.length) return <p className="muted">Rubric starts after onboarding.</p>;
  return <ul className="rubric">{keys.map((k) => <li key={k}><span>{k}</span><div className="bar" aria-label={`${k}: ${p.rubric[k]} of 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= p.rubric[k] ? 'on' : ''} />)}</div>
    {edit ? <span className="row"><button className="mini" aria-label={`Lower ${k}`} onClick={() => run({ type: 'rateSkill', playerId: p.id, skill: k, value: p.rubric[k] - 1 })}>−</button><b>{p.rubric[k]}</b><button className="mini" aria-label={`Raise ${k}`} onClick={() => run({ type: 'rateSkill', playerId: p.id, skill: k, value: p.rubric[k] + 1 })}>+</button></span> : <b>{p.rubric[k]}/5</b>}</li>)}</ul>;
}

/** Proof chain: assignment → player response → coach observation. */
export function Journal({ p }: { p: Player }) {
  const s = useSnap(); const [f, setF] = useState<'all' | 'approve' | 'retry' | 'waiting'>('all');
  const rows = s.submissions.filter((x) => x.playerId === p.id).sort((a, b) => b.at.localeCompare(a.at)).map((sub) => ({ sub, a: s.assignments.find((x) => x.id === sub.assignmentId)!, r: s.reviews.find((x) => x.submissionId === sub.id) }))
    .filter((x) => f === 'all' || (f === 'waiting' ? !x.r : x.r?.decision === f));
  return (<div>
    <div className="seg light" role="group" aria-label="Filter proof chain">{([['all', 'All'], ['approve', 'Approved'], ['retry', 'Another attempt'], ['waiting', 'Awaiting coach']] as const).map(([k, l]) => <button key={k} aria-pressed={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
    {rows.length === 0 && <p className="muted">Nothing here yet.</p>}
    <ol className="chain">{rows.map(({ sub, a, r }) => (
      <li key={sub.id}><div className="row between"><strong>{a.title}</strong><Pill state={r ? (r.decision === 'approve' ? 'Approved' : 'Another attempt') : 'Awaiting coach'} /></div>
        <div className="links"><div><span className="kicker">Assignment</span><p>{a.reps} sets · {a.minutes} min · {a.cues[0]}</p></div><div><span className="kicker">Response · {shortWhen(sub.at)}</span><p>{sub.repsDone}/{a.reps} sets · “{sub.reflection}”</p></div><div><span className="kicker">Coach observation</span><p>{r?.feedback ?? <span className="muted">Due {relative(sub.dueBy, clock(s))}</span>}</p></div></div></li>))}</ol>
  </div>);
}

export function Confetti({ n = 26 }: { n?: number }) {
  return <div className="confetti" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 60}ms`, background: ['#FF5E1A', '#FFC53D', '#3FD0FF', '#2E6BFF', '#fff'][i % 5] }} />)}</div>;
}

/** Celebrations + “what’s next” sheet after every action. */
export function Moments({ role, pid }: { role: Role; pid?: string }) {
  const { last, dismiss } = useStore(); const s = useSnap();
  if (!last || !last.events.some((e) => e.type === 'transition' || e.type === 'milestone')) return null;
  const setOpen = (_: null) => dismiss();
  const tr = last.events.filter((e) => e.type === 'transition' && (!pid || e.playerId === pid)).at(-1);
  const ms = last.events.filter((e) => e.type === 'milestone');
  const p = s.players.find((x) => x.id === (tr?.playerId ?? ms[0]?.playerId)); if (!p) return null;
  const g = guide(s, p, role); const lvl = ms.find((m) => m.detail.startsWith('Level'));
  const headline = lvl ? `Level up! ${LEVELS[Number(lvl.detail.split(' ')[1]) - 1]?.name}` : tr?.to === 'Submitted' ? 'Rep submitted!' : tr?.to === 'Next step ready' ? 'Approved!' : ms[0] ? ms[0].detail + '!' : `${first(p.name)}: ${tr?.to}`;
  const big = !!lvl || ['Submitted', 'Next step ready', 'Cycle review'].includes(tr?.to ?? '') || ms.length > 0;
  return (
    <div className="moment" role="dialog" aria-modal="true" aria-labelledby="mh">
      <div className={`sheet pop ${big ? 'celebrate' : ''}`}>
        {big && <Confetti />}
        {tr && <p className="kicker">{tr.from} → {tr.to}</p>}
        <h2 id="mh" className="display">{headline}</h2>
        {ms.length > 0 && <ul className="msl">{ms.map((m) => <li key={m.id}>★ {m.detail}</li>)}</ul>}
        <div className="whatsnext"><span className="kicker">What’s next</span><p className="strong">{g.what}</p><p className="small">{g.whoLabel} acts next{g.byWhen ? ` · by ${g.byWhen}` : ''}. Unlocks: {g.unlocks}</p></div>
        <div className="row gap">{g.action && g.action.cmd && g.who !== 'coach' && role !== 'coach' ? <ActionButton g={g} /> : null}<button className="btn ghost" autoFocus onClick={() => setOpen(null)}>Got it</button></div>
      </div>
    </div>
  );
}

export function ErrorBar() { const { error, clearError } = useStore(); if (!error) return null; return <div className="errbar" role="alert"><span>⚠ {error}</span><button className="mini" onClick={clearError} aria-label="Dismiss">✕</button></div>; }
export const Section = ({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) => <section id={id} className={className}><div className="wrap">{children}</div></section>;
export function PlayerPicker({ p, base, filter }: { p: Player; base: string; filter?: (p: Player) => boolean }) {
  const s = useSnap(); const nav = useNavigate();
  return <label className="picker small">Viewing <select value={p.id} onChange={(e) => { localStorage.setItem('bc-fam', e.target.value); nav(`${base}?p=${e.target.value}`); }}>{s.players.filter(filter ?? (() => true)).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.state}</option>)}</select></label>;
}
export const useFamilyPlayer = (s: Snapshot, q: string | null) => { if (q) localStorage.setItem('bc-fam', q); const id = q || localStorage.getItem('bc-fam') || 'avery'; return s.players.find((p) => p.id === id) ?? s.players[0]; };
export const Back = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to} className="back">← {children}</Link>;
