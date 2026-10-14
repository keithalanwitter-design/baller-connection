import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GOOGLE_REASON, googleLink } from '../shared/google';
import { apiBase } from './api';
import { homeFor } from './pages/Auth';
import { useSnap, useStore } from './store';
import { Logo } from './App';

const GMark = () => <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>;

/** "Continue with Google": live = server-side OIDC redirect; demo = the simulated chooser below. */
export function GoogleButton({ next = '' }: { next?: string }) {
  const { mode } = useStore(); const nav = useNavigate();
  return <button type="button" className="btn ghost google" onClick={() => { if (mode === 'demo') nav(`/google${next ? `?next=${encodeURIComponent(next)}` : ''}`); else location.href = `${apiBase()}/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`; }}><GMark /> Continue with Google</button>;
}
export function GoogleNotice() {
  const [sp] = useSearchParams(); const r = sp.get('google') as keyof typeof GOOGLE_REASON | null;
  return r && GOOGLE_REASON[r] ? <p className="notice" role="alert" id="google-msg">{GOOGLE_REASON[r]}</p> : null;
}

/** Demo only: a stand-in for Google's account chooser. Runs the SAME linking rules as the server. */
export function GoogleSim() {
  const s = useSnap(); const { mode, setDemoRole } = useStore(); const nav = useNavigate(); const [sp] = useSearchParams(); const [msg, setMsg] = useState('');
  if (mode !== 'demo') return <main id="main" className="flow"><div className="flowbody"><div className="fcard"><p>Not available on the live site.</p><Link to="/login">Sign in</Link></div></div></main>;
  const people = s.users.filter((u) => u.email && u.active).slice(0, 6).map((u) => ({ email: u.email!, name: u.name }));
  const choose = (email: string, verified = true) => {
    const out = googleLink(s, [], { sub: `sim-${email}`, email, email_verified: verified });
    if (out.kind === 'signin') { setDemoRole(out.role as never); nav(sp.get('next') || homeFor(out.role)); }
    else if (out.kind === 'invite') nav('/invite?google=invite');
    else setMsg(GOOGLE_REASON[out.reason]);
  };
  return <main id="main" tabIndex={-1} className="flow"><div className="flowtop"><Logo light /><Link className="small link light" to="/login">Cancel</Link></div><div className="flowbody"><div className="fcard gsim">
    <p className="kicker orange">Simulated · demo only</p><h1 className="display">Choose an account</h1>
    <p className="small dim">On the live site this is Google’s own screen. Here, pick a fictional account to see what happens. The same linking rules apply: only existing, invited accounts can sign in.</p>
    <ul className="gsim-list">{people.map((p) => <li key={p.email}><button onClick={() => choose(p.email)}><span className="gsim-av" aria-hidden>{p.name[0]}</span><span><b>{p.name}</b><small>{p.email}</small></span></button></li>)}
      <li><button onClick={() => choose('casey.new@example.com')}><span className="gsim-av" aria-hidden>?</span><span><b>Someone new</b><small>casey.new@example.com · no account</small></span></button></li>
      <li><button onClick={() => choose('dana@demo.test', false)}><span className="gsim-av" aria-hidden>!</span><span><b>Unverified email</b><small>dana@demo.test · email_verified: false</small></span></button></li></ul>
    {msg && <p className="notice" role="alert" id="google-msg">{msg}</p>}
  </div></div></main>;
}
