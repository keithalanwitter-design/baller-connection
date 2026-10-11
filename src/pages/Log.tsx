import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnap, useStore } from '../store';
import { shortWhen } from '../../shared/time';
import { Logo } from '../App';

export default function SystemLog({ embedded }: { embedded?: boolean }) {
  const s = useSnap(); const { mode } = useStore(); const Tag = embedded ? 'div' : 'main'; const [role, setRole] = useState('all'); const [pid, setPid] = useState('all');
  const ev = s.events.filter((e) => (role === 'all' || e.role === role) && (pid === 'all' || e.playerId === pid)).slice().reverse();
  const name = (id?: string | null) => s.players.find((p) => p.id === id)?.name ?? '—';
  return (
    <div className={embedded ? '' : 'logpage'}>{!embedded && <header className="apph"><Logo light /><span className="small dim">Engine: {mode === 'demo' ? 'in-browser (same module as the API server)' : 'API'} · v{s.version}</span></header>}
      <Tag id={embedded ? undefined : 'main'} tabIndex={-1} className={embedded ? '' : 'wrap'}>
        <h1 className="display">{embedded ? 'Audit log' : 'System log'}</h1>
        <p className="dim">Every command any role runs goes through one workflow engine. This is the event stream: who did what, and which state changed.</p>
        <div className="row gap">
          <label className="picker">Role <select value={role} onChange={(e) => setRole(e.target.value)}>{['all', 'player', 'parent', 'head', 'assistant', 'ops', 'public', 'system'].map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="picker">Player <select value={pid} onChange={(e) => setPid(e.target.value)}><option value="all">all</option>{s.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <Link className={`chip ${embedded ? '' : 'dark'}`} to="/how">How it works</Link>
        </div>
        <ol className="events">{ev.map((e) => (
          <li key={e.id} className={`ev r-${e.role}`}><time>{shortWhen(e.at)}</time><span className={`who-tag ${e.role}`}>{e.actorId && s.users.find((u) => u.id === e.actorId)?.name.split(' ')[0] || e.role}</span>
            <span className="grow"><b>{name(e.playerId)}</b> {e.from && e.to ? <><span className="tr">{e.from} → <b>{e.to}</b></span> </> : <span className="tr">{e.type}</span>} <span className="dim">{e.detail}</span></span></li>))}
          {ev.length === 0 && <li className="dim">No events for this filter.</li>}</ol>
      </Tag>
    </div>
  );
}
