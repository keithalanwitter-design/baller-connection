import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { ErrorBar } from './ui';
import Home from './pages/Home';
import How from './pages/How';
import Apply from './pages/Apply';
import Welcome from './pages/Welcome';
import { PlayerShell } from './pages/Player';
import Parent from './pages/Parent';
import { CoachShell } from './pages/Coach';
import SystemLog from './pages/Log';
import { Legal } from './pages/Legal';

export function Logo({ light }: { light?: boolean }) {
  return <Link to="/" className={`logo ${light ? 'light' : ''}`} aria-label="Baller Connection home"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden><circle cx="16" cy="16" r="14" fill="#FF5E1A" /><path d="M2 16h28M16 2v28M6 6c6 5 6 15 0 20M26 6c-6 5-6 15 0 20" stroke="#0A1430" strokeWidth="2" fill="none" /></svg><span>BALLER<b>CONNECTION</b></span></Link>;
}

function DemoBar() {
  const loc = useLocation(); const nav = useNavigate(); const { reset, run, mode } = useStore();
  const p = loc.pathname; const role = p.startsWith('/coach') ? 'coach' : /^\/(app|parent|welcome)/.test(p) ? 'family' : p.startsWith('/log') ? 'log' : 'visitor';
  return (
    <div className="demobar" role="region" aria-label="Demo controls">
      <span className="demotag"><i className={`dot ${mode}`} /> Demo · fictional data · {mode === 'local' ? 'in-browser engine' : 'API'}</span>
      <div className="seg" role="group" aria-label="View as">
        {([['visitor', 'Visitor', '/'], ['family', 'Family', '/app'], ['coach', 'Coach', '/coach']] as const).map(([k, l, to]) => <button key={k} aria-pressed={role === k} className={role === k ? 'on' : ''} onClick={() => nav(to)}>{l}</button>)}
      </div>
      <button className="chip dark" onClick={() => run({ type: 'advanceClock', hours: 24 })} title="Move the demo clock forward to see SLA escalation">⏩ +1 day</button>
      <button className={`chip dark ${role === 'log' ? 'on' : ''}`} onClick={() => nav('/log')}>System log</button>
      <button className="chip dark" onClick={async () => { if (confirm('Reset all demo data?')) { await reset(); nav('/'); } }}>Reset demo</button>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="site-h"><div className="wrap row between">
      <Logo light />
      <nav aria-label="Main" className="mainnav">
        <NavLink to="/how">How it works</NavLink><a href="#/?s=plans">Plans</a><a href="#/?s=faq">FAQ</a>
        <NavLink to="/app" className="hide-sm">Sign in</NavLink>
        <Link className="btn sm" to="/apply">Apply</Link>
      </nav>
    </div></header>
  );
}
export function Footer() {
  return (
    <footer className="foot"><div className="wrap fgrid">
      <div><Logo light /><p>One focus. One next rep. A coach who answers.</p></div>
      <nav aria-label="Footer"><Link to="/how">How it works</Link><Link to="/apply">Apply</Link><Link to="/log">System log</Link></nav>
      <nav aria-label="Legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/support">Support</Link></nav>
      <p className="small">© 2026 Baller Connection · Demo build with fictional players.</p>
    </div></footer>
  );
}

export default function App() {
  const { pathname } = useLocation(); const { s, error, last, dismiss } = useStore();
  useEffect(() => { if (!location.hash.includes('?s=')) window.scrollTo(0, 0); }, [pathname]);
  // A celebration belongs to the screen where the action happened (or the one it navigated to right after).
  useEffect(() => { if (last && Date.now() - last.t > 1500) dismiss(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <DemoBar /><ErrorBar />
      {!s ? <main id="main" className="loading">{error ? 'Could not reach the API.' : 'Loading…'}</main> : (
        <Routes>
          <Route path="/" element={<Home />} /><Route path="/how" element={<How />} /><Route path="/apply" element={<Apply />} /><Route path="/welcome" element={<Welcome />} />
          <Route path="/app/*" element={<PlayerShell />} /><Route path="/parent" element={<Parent />} /><Route path="/coach/*" element={<CoachShell />} /><Route path="/log" element={<SystemLog />} />
          <Route path="/privacy" element={<Legal page="privacy" />} /><Route path="/terms" element={<Legal page="terms" />} /><Route path="/support" element={<Legal page="support" />} /><Route path="*" element={<Legal page="404" />} />
        </Routes>)}
    </>
  );
}
