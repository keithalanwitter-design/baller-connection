import { sha256 } from '../../shared/sha256';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { TIER_INFO } from '../../shared/domain';
import { shortWhen } from '../../shared/time';
import { family, first, tierReply } from '../../shared/workflow';
import { MagicLinkForm } from '../v6';
import { GoogleButton, GoogleNotice } from '../google';

// eslint-disable-next-line react-refresh/only-export-components
export const homeFor = (r?: string | null) => (r === 'head' || r === 'assistant' ? '/coach' : r === 'ops' ? '/ops' : r === 'parent' ? '/parent' : '/app');

export function Login() {
  const { signIn, mode, error } = useStore(); const nav = useNavigate(); const [sp] = useSearchParams();
  const [kind, setKind] = useState<'email' | 'pin'>('email'); const [login, setLogin] = useState(''); const [secret, setSecret] = useState(''); const [busy, setBusy] = useState(false);
  if (mode === 'demo') return <AuthFrame title="Sign in"><GoogleNotice /><GoogleButton next={sp.get('next') ?? ''} /><p className="small dim">Demo build: Google sign-in is simulated with fictional accounts.</p><p className="lead">There are no real accounts here.</p><p>Use the demo bar at the top to switch between Player, Parent, Head coach, Assistant and Ops.</p><div className="row gap"><Link className="btn" to="/coach">Open the coach view</Link><Link className="btn ghost" to="/app">Open the player view</Link></div></AuthFrame>;
  return <AuthFrame title="Sign in">
    <GoogleNotice />
    <div className="seg light" role="tablist"><button role="tab" aria-selected={kind === 'email'} className={kind === 'email' ? 'on' : ''} onClick={() => setKind('email')}>Parent / staff</button><button role="tab" aria-selected={kind === 'pin'} className={kind === 'pin' ? 'on' : ''} onClick={() => setKind('pin')}>Player</button></div>
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); const u = await signIn(login, secret, kind === 'pin'); setBusy(false); if (u) nav(sp.get('next') ?? homeFor(u.role)); }}>
      <label htmlFor="lg">{kind === 'email' ? 'Email' : 'Player username'}</label><input id="lg" className="input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={kind === 'email' ? 'you@family.com' : 'e.g. avery.pine'} />
      <label htmlFor="pw">{kind === 'email' ? 'Password' : 'PIN from your parent'}</label><input id="pw" className="input" type="password" inputMode={kind === 'pin' ? 'numeric' : undefined} autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} />
      {error && <p className="errtext" role="alert">{error}</p>}
      <button className="btn lg" disabled={busy || !login || !secret}>Sign in</button>
    </form>
    {kind === 'email' && <div className="authalt"><span className="or">or</span><GoogleButton next={sp.get('next') ?? ''} /></div>}
    {kind === 'email' && <details className="magicbox" open={sp.get('magic') === '1'}><summary>Or get a one-time sign-in link by email</summary><MagicLinkForm initial={login.includes('@') ? login : ''} /></details>}
    <p className="small dim">{kind === 'email' ? <><Link to="/forgot">First time or forgot password?</Link> · Got an invite? <Link to="/invite">Enter your code</Link></> : 'Players under 13 don’t use email. Your parent sets your username and PIN in their account.'}</p>
  </AuthFrame>;
}
export function Forgot() {
  const { api } = useStore(); const [email, setEmail] = useState(''); const [done, setDone] = useState(false);
  return <AuthFrame title="Set or reset your password">{done ? <p className="lead">If that email has an account, a link is on its way (valid 2 hours).</p> :
    <form onSubmit={async (e) => { e.preventDefault(); await api.requestPassword(email); setDone(true); }}><label htmlFor="fe">Email</label><input id="fe" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><button className="btn" disabled={!email}>Email me a link</button></form>}<p className="small"><Link to="/login">← Sign in</Link></p></AuthFrame>;
}
export function Reset() {
  const { api, refresh, me } = useStore(); const [sp] = useSearchParams(); const nav = useNavigate(); const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  return <AuthFrame title="Choose a password"><form onSubmit={async (e) => { e.preventDefault(); try { await api.resetPassword(sp.get('token') ?? '', pw); await refresh(); nav(homeFor(me?.role)); } catch (x) { setErr((x as Error).message); } }}>
    <label htmlFor="np">New password (8+ characters)</label><input id="np" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />{err && <p className="errtext">{err}</p>}<button className="btn" disabled={pw.length < 8}>Save & sign in</button></form></AuthFrame>;
}
/** Invite acceptance: tokenized link or 6-digit backup code → parent account → onboarding. */
export function Invite() {
  const s = useSnap(); const { api, refresh, mode, setDemoRole } = useStore(); const nav = useNavigate(); const [sp] = useSearchParams();
  const token = sp.get('token') ?? ''; const th = token ? sha256(token) : ''; const inv = s.invites.find((i) => token && i.tokenHash === th);
  const p = inv && s.players.find((x) => x.id === inv.playerId);
  const [f, setF] = useState({ code: '', parentName: p ? family(s, p).parentName : '', email: inv?.email ?? '', password: mode === 'demo' ? 'demo-only' : '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr('');
    try { const r = await api.acceptInvite({ token: token || undefined, code: token ? undefined : f.code, parentName: f.parentName, email: f.email, password: f.password }); if (mode === 'demo') { setDemoRole('parent'); if (r.playerId) localStorage.setItem('bc-fam', r.playerId); } await refresh(); nav(`/welcome${r.playerId ? `?p=${r.playerId}` : ''}`); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return <AuthFrame title={p ? `${f.parentName || 'Hi'}, ${first(p.name)} has a spot.` : 'Accept your invite'}><GoogleNotice />
    {p && <p className="lead">Plan: <b>{p.tier}</b> · ${TIER_INFO[p.tier].price}/month · replies {tierReply(s, p)} · cancel anytime.{inv && <span className="block small dim">Link expires {shortWhen(inv.expiresAt)}.</span>}</p>}
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {!token && <><label htmlFor="ic">6-digit invite code from your email</label><input id="ic" className="input" inputMode="numeric" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />{mode === 'demo' && <p className="note">Demo: Theo Banks’ code is <b>246810</b>.</p>}</>}
      <label htmlFor="ipn">Your name (parent or guardian)</label><input id="ipn" className="input" value={f.parentName} onChange={(e) => setF({ ...f, parentName: e.target.value })} />
      <label htmlFor="ie">Email</label><input id="ie" className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      {mode === 'live' && <><label htmlFor="ipw">Create a password (optional: 8+ characters, or leave empty and sign in with emailed links)</label><input id="ipw" className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></>}
      {err && <p className="errtext" role="alert">{err}</p>}
      <button className="btn lg" disabled={busy || (!token && f.code.length < 6) || !f.parentName.trim() || !f.email.includes('@') || (f.password.length > 0 && f.password.length < 8)}>Accept invite & create account</button>
      <p className="small dim">Next: choose the plan and pay securely with Stripe (cancel anytime), then a 2-minute setup: profile, goal, rhythm and parental consent.</p>
    </form></AuthFrame>;
}
function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <main id="main" tabIndex={-1} className="flow"><div className="flowtop"><Logo light /><Link className="small link light" to="/">Home</Link></div><div className="flowbody"><div className="fcard pop authcard"><p className="kicker orange">Baller Connection</p><h1 className="display">{title}</h1>{children}</div></div></main>;
}
