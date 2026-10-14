import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { UserRole } from '../shared/domain';
import { Forgot, Invite, Login, Reset, homeFor } from './pages/Auth';
import Inbox from './pages/Inbox';
import { useStore } from './store';
import { ErrorBar, UserMenu } from './ui';
import { CoachBio, Home, How, Method, NotFound, Parents, Plans } from './site/Site';
import Apply from './pages/Apply';
// App shells load on demand so the public site stays light.
const Welcome = lazy(() => import('./pages/Welcome'));
const PlayerShell = lazy(() => import('./pages/Player').then((m) => ({ default: m.PlayerShell })));
const Parent = lazy(() => import('./pages/Parent'));
const CoachShell = lazy(() => import('./pages/Coach').then((m) => ({ default: m.CoachShell })));
const SystemLog = lazy(() => import('./pages/Log'));
import { Legal } from './pages/Legal';
import { AccountPage, CheckoutSim, MagicVerify, PortalSim } from './v6';

export function Logo({ light }: { light?: boolean }) {
  return <Link to="/" className={`logo ${light ? 'light' : ''}`} aria-label="Baller Connection home"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden><circle cx="16" cy="16" r="14" fill="#FF5E1A" /><path d="M2 16h28M16 2v28M6 6c6 5 6 15 0 20M26 6c-6 5-6 15 0 20" stroke="#0A1430" strokeWidth="2" fill="none" /></svg><span>BALLER<b>CONNECTION</b></span></Link>;
}

const PERSONAS: [UserRole, string, string][] = [['player', 'Player', '/app'], ['parent', 'Parent', '/parent'], ['head', 'Head coach', '/coach'], ['assistant', 'Assistant', '/coach'], ['ops', 'Ops', '/ops']];
import { PublicCardPage } from './v7';
import { UpdateToast } from './pwa';
import { GoogleSim } from './google';
function DemoBar() {
  const loc = useLocation(); const nav = useNavigate(); const { reset, run, as, setDemoRole } = useStore(); const p = loc.pathname;
  // The route decides the persona; the coach area remembers head vs assistant.
  useEffect(() => {
    const coachFlavor = (localStorage.getItem('bc-demo-coach') as UserRole) || 'head';
    const want: UserRole | null = p.startsWith('/coach') ? coachFlavor : p.startsWith('/ops') ? 'ops' : p.startsWith('/app') ? 'player' : /^\/(parent|welcome|invite|inbox|checkout|billing)/.test(p) ? 'parent' : null;
    if (want && want !== as?.role && !(p.startsWith('/inbox') && as?.role === 'player')) setDemoRole(want);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const visitor = !/^\/(app|parent|coach|ops|welcome|invite|inbox|log|checkout|billing|account)/.test(p);
  return (
    <div className="demobar" role="region" aria-label="Demo controls">
      <span className="demotag"><i className="dot local" /> Demo · fictional data · in-browser engine</span>
      <div className="seg" role="group" aria-label="View as">
        <button aria-pressed={visitor} className={visitor ? 'on' : ''} onClick={() => nav('/')}>Visitor</button>
        {PERSONAS.map(([r, l, to]) => { const on = !visitor && as?.role === r; return <button key={r} aria-pressed={on} className={on ? 'on' : ''} onClick={() => { if (r === 'head' || r === 'assistant') localStorage.setItem('bc-demo-coach', r); setDemoRole(r); nav(to); }}>{l}</button>; })}
      </div>
      <button className="chip dark" onClick={() => run({ type: 'advanceClock', hours: 24 })} title="Move the demo clock forward; the SLA sweep runs like the cron job">⏩ +1 day</button>
      <button className="chip dark" onClick={() => run({ type: 'generateDigests' })} title="Run the Sunday digest job now">Run digest job</button>
      <button className={`chip dark ${p.startsWith('/log') ? 'on' : ''}`} onClick={() => nav('/log')}>System log</button>
      <button className="chip dark" onClick={async () => { if (confirm('Reset all demo data?')) { await reset(); nav('/'); } }}>Reset demo</button>
    </div>
  );
}

/** Live mode: route guard by role. Demo mode: everything is open (personas come from the demo bar). */
function Need({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { mode, me } = useStore(); const loc = useLocation();
  if (mode === 'demo') return <>{children}</>;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />;
  return <>{children}</>;
}
function FamilyInbox() { return <div className="appshell"><header className="apph"><Logo light /><UserMenu /></header><main id="main" tabIndex={-1} className="appmain"><Inbox /></main></div>; }

export { SiteHeader, Footer } from './site/Site';

export default function App() {
  const { pathname } = useLocation(); const { s, error, last, dismiss, mode, ready, me, refresh } = useStore();
  useEffect(() => { if (!location.hash.includes('?s=')) window.scrollTo(0, 0); }, [pathname]);
  // Live: re-read the scoped snapshot on every screen change so teammates' actions show up.
  useEffect(() => { if (mode === 'live' && me) refresh(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // A celebration belongs to the screen where the action happened (or the one it navigated to right after).
  useEffect(() => { if (last && Date.now() - last.t > 1500) dismiss(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      {mode === 'demo' && <DemoBar />}<ErrorBar /><UpdateToast />
      {!s || !ready ? <main id="main" className="loading">{error ? <><p>Couldn’t reach the server. Check your connection, then try again.</p><button className="btn" onClick={() => refresh()}>Try again</button></> : 'Loading…'}</main> : (
        <Suspense fallback={<main id="main" className="loading" aria-busy="true">Loading…</main>}><Routes>
          <Route path="/" element={<Home />} /><Route path="/how" element={<How />} /><Route path="/method" element={<Method />} /><Route path="/parents" element={<Parents />} /><Route path="/plans" element={<Plans />} /><Route path="/coach-bio" element={<CoachBio />} /><Route path="/google" element={<GoogleSim />} /><Route path="/apply" element={<Apply />} /><Route path="/login" element={<Login />} /><Route path="/forgot" element={<Forgot />} /><Route path="/reset" element={<Reset />} /><Route path="/invite" element={<Invite />} /><Route path="/magic" element={<MagicVerify />} />
          <Route path="/checkout" element={<Need roles={['parent']}><CheckoutSim /></Need>} /><Route path="/billing/portal" element={<Need roles={['parent']}><PortalSim /></Need>} /><Route path="/account" element={<Need roles={['head', 'assistant', 'ops', 'parent', 'player']}><AccountPage /></Need>} />
          <Route path="/welcome" element={<Need roles={['parent']}><Welcome /></Need>} /><Route path="/inbox" element={<Need roles={['parent', 'player']}><FamilyInbox /></Need>} />
          <Route path="/app/*" element={<Need roles={['player', 'parent']}><PlayerShell /></Need>} /><Route path="/parent" element={<Need roles={['parent']}><Parent /></Need>} />
          <Route path="/coach/*" element={<Need roles={['head', 'assistant']}><CoachShell /></Need>} /><Route path="/ops/*" element={<Need roles={['ops', 'head']}><CoachShell ops /></Need>} />
          <Route path="/log" element={<Need roles={['head', 'ops']}><SystemLog /></Need>} /><Route path="/demo" element={<DemoRedirect />} /><Route path="/card/:token" element={<PublicCardPage />} />
          <Route path="/privacy" element={<Legal page="privacy" />} /><Route path="/terms" element={<Legal page="terms" />} /><Route path="/support" element={<Legal page="support" />} /><Route path="*" element={<NotFound />} />
        </Routes></Suspense>)}
    </>
  );
}

/** /demo → force demo mode for this tab, even on a live build. */
function DemoRedirect() { useEffect(() => { sessionStorage.setItem('bc-demo', '1'); location.replace(location.pathname + '#/coach'); location.reload(); }, []); return null; }
