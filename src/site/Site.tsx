import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '../App';
import { useStore } from '../store';
import { TIERS, PRESSURE_LABEL, type Tier } from '../../shared/domain';
import { LEVELS } from '../../shared/workflow';
import { COMPARE, FAQ, NOT, PILLARS, PROMISE, START, SUB, TIER_TAG, WEEK } from './content';
import './site.css';

const NAV: [string, string][] = [['/how', 'How it works'], ['/method', 'Method'], ['/parents', 'For parents'], ['/plans', 'Plans'], ['/coach-bio', 'Coach']];
const TIER_LIST = Object.keys(TIERS) as Tier[];

export function SiteHeader() {
  const [open, setOpen] = useState(false); const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return <header className="s-head"><div className="s-wrap s-headrow">
    <Logo light />
    <nav aria-label="Main" className="s-nav">{NAV.map(([to, l]) => <NavLink key={to} to={to}>{l}</NavLink>)}</nav>
    <div className="s-headcta"><Link to="/login" className="s-signin">Sign in</Link><Link className="btn sm" to="/apply">Apply</Link>
      <button className="s-menu" aria-expanded={open} aria-controls="s-drawer" onClick={() => setOpen(!open)}><span className="sr">Menu</span><i aria-hidden /><i aria-hidden /></button></div>
  </div>
    {open && <nav id="s-drawer" className="s-drawer" aria-label="Menu">{NAV.map(([to, l]) => <NavLink key={to} to={to}>{l}</NavLink>)}<Link to="/login">Sign in</Link><Link to="/invite">Have an invite?</Link></nav>}
  </header>;
}
export function Footer() {
  const { mode } = useStore();
  return <footer className="s-foot"><div className="s-wrap s-fgrid">
    <div className="s-fbrand"><Logo light /><p>{PROMISE}</p><p className="s-fine">Coach-led player development for ages 10–17. Roster capped at 15.</p></div>
    <nav aria-label="Program"><h2>Program</h2>{NAV.map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}</nav>
    <nav aria-label="Get started"><h2>Get started</h2><Link to="/apply">Apply</Link><Link to="/login">Sign in</Link><Link to="/invite">Have an invite?</Link><Link to={mode === 'demo' ? '/app' : '/demo'}>Try the demo</Link></nav>
    <nav aria-label="Legal"><h2>Legal</h2><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/support">Support</Link></nav>
  </div><div className="s-wrap s-fbase"><span>© 2026 Baller Connection</span>{mode === 'demo' && <span>Demo build · all players are fictional</span>}</div></footer>;
}
/** Marketing page frame: header, content, footer, and the sticky mobile CTA. */
export function SitePage({ children, cta = true }: { children: ReactNode; cta?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); const f = () => setShow(window.scrollY > 420); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  return <><SiteHeader /><main id="main" tabIndex={-1} className="s-main">{children}</main><Footer />
    {cta && <div className={`s-mcta ${show ? 'show' : ''}`} role="region" aria-label="Get started"><Link className="btn" to="/apply">Apply</Link><Link className="btn ghost" to="/how">How it works</Link></div>}</>;
}
function PageHead({ k, title, lead, children }: { k: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return <section className="s-pagehead s-dark"><div className="s-wrap"><p className="kicker">{k}</p><h1 className="display">{title}</h1>{lead && <p className="s-lead">{lead}</p>}{children}</div></section>;
}
const Check = ({ v }: { v: string | boolean }) => v === true ? <span className="s-yes" aria-label="Included">✓</span> : v === false ? <span className="s-no" aria-label="Not included">—</span> : <span>{v}</span>;

/** Hero visual: the product, not decoration. Two real screens, simplified, for a fictional player. */
function HeroProduct() {
  return <figure className="s-product" aria-label="Example screens for a fictional player, Avery">
    <div className="s-screen s-today rise d1">
      <div className="s-sh"><span>Today</span><span className="s-tag">Avery · Week 3</span></div>
      <p className="s-lab">This cycle’s focus</p><p className="s-big">Weak-hand control under pressure</p>
      <div className="s-meter"><span>This week</span><i><b style={{ width: '60%' }} /></i><span>3 of 5 reps</span></div>
      <div className="s-reply"><p className="s-lab">Coach Jamie · replied Tue 4:12 PM</p><p>“Left hand stayed low through contact. Next: 3 walk-throughs, then game speed.”</p><span className="s-ok">Replied before the 6 PM deadline</span></div>
    </div>
    <div className="s-screen s-games rise d2">
      <div className="s-sh"><span>Games</span><span className="s-tag">Last 4</span></div>
      <svg viewBox="0 0 220 70" aria-hidden className="s-spark"><polyline points="10,55 75,42 140,40 205,18" /><g>{[[10, 55], [75, 42], [140, 40], [205, 18]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.5" />)}</g></svg>
      <p className="s-lab">Confidence 2 → 4 · Practice → game 63%</p>
    </div>
    <figcaption>Example screens · fictional player</figcaption>
  </figure>;
}

export function Home() {
  return <SitePage>
    <section className="s-hero s-dark"><div className="s-wrap s-herogrid">
      <div className="rise">
        <p className="kicker">Coach-led player development · ages 10–17</p>
        <h1 className="display xl">{PROMISE}</h1>
        <p className="s-lead">{SUB}</p>
        <div className="s-ctas"><Link className="btn lg" to="/apply">Apply</Link><Link className="btn lg outline" to="/how">See how it works</Link></div>
        <ul className="s-trust"><li>Written replies with a deadline</li><li>15 players max</li><li>From ${TIERS.Foundation.price}/month, no contract</li></ul>
      </div>
      <HeroProduct />
    </div></section>

    <section className="s-sec"><div className="s-wrap">
      <div className="s-sechead"><p className="kicker">Why it works</p><h2 className="display">Effort isn’t the problem. Transfer is.</h2>
        <p className="s-intro">Most players already work hard. What breaks is the step from the driveway to the game. We build that step on three things.</p></div>
      <div className="s-pillars">{PILLARS.map((p) => <article key={p.k} className={`s-pillar p-${p.k}`}><span className="s-num">{p.n}</span><h3>{p.t}</h3><p>{p.d}</p><p className="s-proof">{p.proof}</p></article>)}</div>
      <Link className="s-more" to="/method">How the method works →</Link>
    </div></section>

    <section className="s-sec s-tint"><div className="s-wrap s-split">
      <div><p className="kicker">A week in the program</p><h2 className="display">Clear for the player. Visible to the parent.</h2>
        <ol className="s-steps">{WEEK.filter((w) => w.d !== 'Midweek').map((w) => <li key={w.d}><b>{w.d}</b><p><span>{w.t}.</span> {w.player === "—" ? w.coach : w.player}</p></li>)}</ol>
        <Link className="s-more" to="/how">The full week, step by step →</Link></div>
      <div className="s-card s-digest"><p className="kicker orange">Sunday parent summary · example</p><h3>Avery’s week</h3>
        <dl><div><dt>Check-ins</dt><dd>4 of 5</dd></div><div><dt>Habit streak</dt><dd>9 days</dd></div><div><dt>Games</dt><dd>2 · confidence 3.5 / 5</dd></div><div><dt>Focus in games</dt><dd>Tried it in 2 of 2</dd></div></dl>
        <p className="s-quote">“The left hand is starting to trust itself at game speed.” <span>Coach Jamie</span></p>
        <p className="s-fine">Approved by the coach before it’s sent. Reads in a minute.</p></div>
    </div></section>

    <section className="s-sec"><div className="s-wrap">
      <div className="s-sechead"><p className="kicker">Plans</p><h2 className="display">Priced by coach time.</h2><p className="s-intro">Same coach, same app. The difference is how often and how fast the coach replies.</p></div>
      <div className="s-tiers">{TIER_LIST.map((t) => <article key={t} className={`s-tier ${t === 'Development' ? 'feat' : ''}`}><p className="kicker">{TIER_TAG[t]}</p><h3>{t}</h3><p className="s-price">${TIERS[t].price}<span>/month</span></p><p className="s-sla">Replies {TIERS[t].replyLabel}</p><p className="s-fine">Written reviews: {String(COMPARE[1].v[t]).toLowerCase()}</p></article>)}</div>
      <Link className="s-more" to="/plans">Compare plans in detail →</Link>
    </div></section>

    <section className="s-sec s-tint"><div className="s-wrap s-split">
      <div><p className="kicker">For parents</p><h2 className="display">Safe, private and easy to check on.</h2>
        <ul className="s-ticks"><li>Under-13s sign in with a username and PIN you set, not an email.</li><li>Clips are seen only by your family and your player’s coaches, and are deleted after 90 days.</li><li>Nothing about your player is public. A shareable card exists only if you turn it on.</li><li>Pause or cancel anytime. No contract.</li></ul>
        <Link className="s-more" to="/parents">What parents see each week →</Link></div>
      <div><p className="kicker">What we don’t do</p><h2 className="display">Said up front.</h2><ul className="s-crosses">{NOT.map((n) => <li key={n}>{n}</li>)}</ul></div>
    </div></section>

    <section className="s-sec"><div className="s-wrap s-faqgrid">
      <div><p className="kicker">Questions</p><h2 className="display">What families ask first</h2><Link className="s-more" to="/plans#faq">All questions →</Link></div>
      <div>{FAQ.slice(0, 4).map(([q, a]) => <details key={q} className="s-faq"><summary>{q}</summary><p>{a}</p></details>)}</div>
    </div></section>
    <FinalCta />
  </SitePage>;
}
function FinalCta() {
  return <section className="s-final s-dark"><div className="s-wrap"><h2 className="display">Ready for one clear next step?</h2><p>Six questions, about two minutes. A person replies within 2 business days.</p><div className="s-ctas center"><Link className="btn lg" to="/apply">Apply</Link><Link className="btn lg outline" to="/how">See how it works</Link></div></div></section>;
}

export function How() {
  return <SitePage>
    <PageHead k="How it works" title="A week in the life" lead="The same loop every week. The player always knows the next rep, the coach always knows who needs a reply, and the parent sees it all on Sunday." />
    <section className="s-sec"><div className="s-wrap">
      <div className="s-week" role="table" aria-label="A week in the program">
        <div role="row" className="s-wk-h"><span role="columnheader">When</span><span role="columnheader">Player</span><span role="columnheader">Coach</span></div>
        {WEEK.map((w) => <div role="row" key={w.d} className="s-wk"><span role="cell" className="s-wk-d"><b>{w.d}</b>{w.t}</span><span role="cell">{w.player}</span><span role="cell">{w.coach}</span></div>)}
      </div>
      <p className="s-fine">Every 4 weeks there’s a cycle review: the player says what improved, the coach re-rates the skills and picks the next focus.</p>
    </div></section>
    <section className="s-sec s-tint"><div className="s-wrap">
      <div className="s-sechead"><p className="kicker">Getting started</p><h2 className="display">From application to first plan</h2></div>
      <ol className="s-start">{START.map((s, i) => <li key={s.t}><span className="s-num">{i + 1}</span><h3>{s.t}</h3><p>{s.d}</p></li>)}</ol>
    </div></section>
    <section className="s-sec"><div className="s-wrap s-split">
      <div><p className="kicker">Deadlines</p><h2 className="display">Every reply has one.</h2><p>Each reviewed check-in, game question and message gets a reply-by time based on your plan. Weekends don’t count. If a deadline passes, the item goes to the top of the coach’s queue and you can see it on Today.</p></div>
      <table className="s-table"><thead><tr><th>Plan</th><th>Written reply</th></tr></thead><tbody>{TIER_LIST.map((t) => <tr key={t}><td>{t}</td><td>{TIERS[t].replyLabel}</td></tr>)}<tr><td>Urgent message</td><td>Within 4 office hours</td></tr></tbody></table>
    </div></section>
    <FinalCta />
  </SitePage>;
}

export function Method() {
  return <SitePage>
    <PageHead k="Development method" title="Practice that holds up in games" lead="Three pillars, one skills rubric and a clear path. Each is built into the app, not left to good intentions." />
    <section className="s-sec"><div className="s-wrap s-pillars big">{PILLARS.map((p) => <article key={p.k} className={`s-pillar p-${p.k}`}><span className="s-num">{p.n}</span><h3>{p.t}</h3><p>{p.d}</p><p className="s-proof">{p.proof}</p></article>)}</div></section>
    <section className="s-sec s-tint"><div className="s-wrap s-split">
      <div><p className="kicker">Pressure reps</p><h2 className="display">Make practice look like the game.</h2><p>When practice isn’t showing up in games, the coach adds a pressure rep, one of four kinds:</p><ul className="s-ticks">{Object.values(PRESSURE_LABEL).map((l) => <li key={l}>{l}</li>)}</ul></div>
      <div><p className="kicker">Practice → game</p><h2 className="display">Measured after every game.</h2><p>After each game the player answers: did I try my focus? Yes counts fully, sometimes counts half. Below 50% after two games, the coach is prompted to change the reps. Confidence is the player’s own 1–5 read. If it drops two games in a row, the coach checks in privately.</p></div>
    </div></section>
    <section className="s-sec"><div className="s-wrap s-split">
      <div><p className="kicker">Skills rubric</p><h2 className="display">Five skills, rated each cycle.</h2><p>Development and Inner Circle: the coach re-rates five skills at every 4-week cycle review, so you can see change over months, not just weeks. 1 = learning it · 3 = reliable in practice · 5 = reliable in games.</p>
        <ul className="s-rubric">{['Ball security', 'Finishing', 'Defense', 'Shot form', 'Confidence'].map((k, i) => <li key={k}><span>{k}</span><i><b style={{ width: `${[60, 60, 40, 60, 80][i]}%` }} /></i></li>)}</ul><p className="s-fine">Example ratings, fictional player.</p></div>
      <div><p className="kicker">The journey</p><h2 className="display">Five levels, earned by doing.</h2><ol className="s-levels">{LEVELS.map((l) => <li key={l.n}><b>{l.n} · {l.name}</b><span>{l.unlock}</span></li>)}</ol><p className="s-fine">Growth language, not grades. Players see their progress, never a ranking against other kids.</p></div>
    </div></section>
    <FinalCta />
  </SitePage>;
}

export function Parents() {
  return <SitePage>
    <PageHead k="For parents" title="You’ll know it’s working." lead="A one-minute summary every Sunday, a deadline on every coach reply, and privacy settings that start closed." />
    <section className="s-sec"><div className="s-wrap s-split">
      <div><p className="kicker">Each week you’ll see</p><h2 className="display">The work, the games, the coach’s view.</h2>
        <ul className="s-ticks"><li>Check-ins done against the plan, and the habit streak</li><li>Games logged, average confidence, and how often the focus showed up</li><li>The coach’s latest feedback and the current focus</li><li>Any reply that’s due, with its deadline</li></ul>
        <p>Your parent view shows the same plan, timeline and messages as your player’s, worded for you.</p></div>
      <div className="s-card s-digest"><p className="kicker orange">Example summary</p><h3>Avery’s week</h3><dl><div><dt>Check-ins</dt><dd>4 of 5</dd></div><div><dt>Games</dt><dd>2 · confidence 3.5 / 5</dd></div><div><dt>Focus in games</dt><dd>Tried it in 2 of 2</dd></div></dl><p className="s-fine">Fictional player.</p></div>
    </div></section>
    <section className="s-sec s-tint"><div className="s-wrap">
      <div className="s-sechead"><p className="kicker">Safety and privacy</p><h2 className="display">Closed by default.</h2></div>
      <div className="s-grid3">
        <article className="s-card"><h3>Sign-in for kids</h3><p>Players under 13 use a username and PIN you set, never an email. You can also sign in with Google or a one-time email link.</p></article>
        <article className="s-card"><h3>Clips stay private</h3><p>Seen only by your family and your player’s assigned coaches. Never shared. Deleted after 90 days.</p></article>
        <article className="s-card"><h3>Nothing public</h3><p>No profiles, rankings or leaderboards. A Player Card link exists only if you turn it on. You can switch it off or replace it anytime.</p></article>
        <article className="s-card"><h3>Your data</h3><p>Ask for an export or deletion from your account. We complete it within 30 days.</p></article>
        <article className="s-card"><h3>Real people only</h3><p>A coach you know by name writes every reply. The head coach checks any review an assistant writes.</p></article>
        <article className="s-card"><h3>Money</h3><p>Month to month. Pause anytime (billing continues while paused). Cancel in Billing and coaching runs to the end of the paid month.</p></article>
      </div></div></section>
    <section className="s-sec"><div className="s-wrap s-narrow"><p className="kicker">Your part</p><h2 className="display">What we ask of you</h2><p>Make sure your player can practice on their own at least 2 days a week, read the Sunday summary, and let the player own the work. The program works best when the player is the one who wants it.</p></div></section>
    <FinalCta />
  </SitePage>;
}

export function Plans() {
  const { hash } = useLocation();
  useEffect(() => { if (hash.includes('faq')) document.getElementById('faq')?.scrollIntoView(); }, [hash]);
  return <SitePage>
    <PageHead k="Plans" title="Honest plans. Honest limits." lead={`One coach and 15 players in total, so every reviewed rep gets a personal reply. Monthly, no contract.`} />
    <section className="s-sec"><div className="s-wrap">
      <div className="s-tiers">{TIER_LIST.map((t) => <article key={t} className={`s-tier ${t === 'Development' ? 'feat' : ''}`}><p className="kicker">{TIER_TAG[t]}</p><h3>{t}</h3><p className="s-price">${TIERS[t].price}<span>/month</span></p><p className="s-sla">Replies {TIERS[t].replyLabel}</p><Link className={`btn ${t === 'Development' ? '' : 'ghost'}`} to={`/apply?tier=${encodeURIComponent(t)}`}>Apply for {t}</Link></article>)}</div>
      <div className="s-tablewrap"><table className="s-table s-compare"><caption className="sr">Plan comparison</caption><thead><tr><th scope="col">What you get</th>{TIER_LIST.map((t) => <th key={t} scope="col">{t}</th>)}</tr></thead>
        <tbody>{COMPARE.map((r) => <tr key={r.f}><th scope="row">{r.f}</th>{TIER_LIST.map((t) => <td key={t}><Check v={r.v[t]} /></td>)}</tr>)}</tbody></table></div>
      <p className="s-fine">A check-in with a clip counts as one review. Inner Circle has 4 spots. When the roster is full, new families join the waitlist and get an email when a spot opens.</p>
    </div></section>
    <section className="s-sec s-tint" id="faq"><div className="s-wrap s-faqgrid">
      <div><p className="kicker">FAQ</p><h2 className="display">Questions, answered straight</h2><p>Something else? <Link to="/support">Contact support</Link>.</p>
        <div className="s-fit"><h3>A good fit</h3><ul className="s-ticks"><li>Players 10–17 who want to improve on their own time</li><li>Can practice 2+ days a week, even 15 minutes</li><li>Willing to write one honest sentence after practice</li></ul></div></div>
      <div>{FAQ.map(([q, a]) => <details key={q} className="s-faq"><summary>{q}</summary><p>{a}</p></details>)}</div>
    </div></section>
    <FinalCta />
  </SitePage>;
}

export function CoachBio() {
  return <SitePage>
    <PageHead k="Your coach" title="Coach [Your Name]" lead="A real coach you know by name writes every plan, review and reply." />
    <section className="s-sec"><div className="s-wrap s-split">
      <div className="s-portrait" aria-label="Photo placeholder"><span>Photo</span></div>
      <div><p className="note"><b>Placeholder.</b> Keith: replace this section with your real bio, photo and coaching background before launch.</p>
        <h2 className="display">Background</h2><p>[Who you’ve coached, at what levels, for how long. Two or three specific, true sentences.]</p>
        <h2 className="display">What I believe about development</h2><p>[One short paragraph. For example: why one focus at a time, and why games are the test.]</p>
        <h2 className="display">Why the roster is capped at 15</h2><p>I read every check-in myself, and the head coach checks any review an assistant writes. Beyond 15 players, replies slow down and plans stop being personal, so the app enforces the cap.</p></div>
    </div></section>
    <section className="s-sec s-tint" id="why"><div className="s-wrap s-narrow"><p className="kicker">Why this exists</p><h2 className="display">A note from the founder</h2>
      <p className="note"><b>Placeholder.</b> Replace with your own words: why you started Baller Connection, and the player who practiced hard but froze in games.</p>
      <blockquote className="s-quote big">“[Your story, 3–4 sentences. Keep it true and specific.]”<span>[Your name], founder</span></blockquote></div></section>
    <FinalCta />
  </SitePage>;
}

export function NotFound() {
  return <SitePage cta={false}><section className="s-sec s-404"><div className="s-wrap s-narrow"><p className="kicker">404</p><h1 className="display">This page isn’t here.</h1><p className="s-lead">The link may be old, or the page has moved. Try one of these:</p>
    <div className="s-ctas"><Link className="btn" to="/">Home</Link><Link className="btn ghost" to="/how">How it works</Link><Link className="btn ghost" to="/login">Sign in</Link></div></div></section></SitePage>;
}
