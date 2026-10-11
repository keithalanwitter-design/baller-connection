import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import Home from './pages/Home';
import Apply from './pages/Apply';
import Welcome from './pages/Welcome';
import { PlayerShell } from './pages/Player';
import Parent from './pages/Parent';
import { CoachShell } from './pages/Coach';
import { Legal } from './pages/Legal';

export function Logo() {
  return <Link to="/" className="logo" aria-label="Baller Connection home"><span className="mark" aria-hidden>◐</span> Baller <em>Connection</em></Link>;
}

function DemoBar() {
  const loc = useLocation(); const nav = useNavigate(); const { reset } = useStore();
  const role = loc.pathname.startsWith('/coach') ? 'coach' : loc.pathname.startsWith('/app') || loc.pathname.startsWith('/parent') || loc.pathname.startsWith('/welcome') ? 'family' : 'visitor';
  return (
    <div className="demobar" role="region" aria-label="Demo controls">
      <span className="demotag">Demo · fictional data</span>
      <div className="seg" role="group" aria-label="View as">
        {([['visitor', 'Visitor', '/'], ['family', 'Family', '/app'], ['coach', 'Coach', '/coach']] as const).map(([k, l, to]) => (
          <button key={k} aria-pressed={role === k} className={role === k ? 'on' : ''} onClick={() => nav(to)}>{l}</button>
        ))}
      </div>
      <button className="ghost sm" onClick={() => { if (confirm('Reset all demo data?')) { reset(); nav('/'); } }}>Reset demo</button>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="site-h"><div className="wrap row">
      <Logo />
      <nav aria-label="Main" className="mainnav">
        <a href="#/?s=how">How it works</a><a href="#/?s=plans">Plans</a><a href="#/?s=faq">FAQ</a>
        <NavLink to="/app">Sign in</NavLink>
        <Link className="btn sm" to="/apply">Apply</Link>
      </nav>
    </div></header>
  );
}

export function Footer() {
  return (
    <footer className="foot"><div className="wrap fgrid">
      <div><Logo /><p className="muted">One focus. One next rep. A coach who answers.</p></div>
      <nav aria-label="Footer"><Link to="/apply">Apply</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/support">Support</Link></nav>
      <p className="muted small">© 2026 Baller Connection · Demo build with fictional players.</p>
    </div></footer>
  );
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { if (!location.hash.includes('?s=')) window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <DemoBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/app/*" element={<PlayerShell />} />
        <Route path="/parent" element={<Parent />} />
        <Route path="/coach/*" element={<CoachShell />} />
        <Route path="/privacy" element={<Legal page="privacy" />} />
        <Route path="/terms" element={<Legal page="terms" />} />
        <Route path="/support" element={<Legal page="support" />} />
        <Route path="*" element={<Legal page="404" />} />
      </Routes>
    </>
  );
}
