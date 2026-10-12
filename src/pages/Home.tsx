import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Footer, SiteHeader } from '../App';
import { TIERS } from '../../shared/domain';

const PLANS = [
  { name: 'Foundation' as const, tag: 'Build the habit', items: ['Personal plan with one focus', 'A weekly set of assigned reps', '1 written coach review per week', 'Send a short practice clip (30 s) with a check-in', 'Game log + post-game check-in your coach reads', 'Progress timeline, Wins wall and Player Card', 'Daily habits, streaks and journey levels', 'Weekly parent summary'] },
  { name: 'Development' as const, tag: 'Most families', featured: true, items: ['Everything in Foundation', 'Up to 3 written reviews per week', 'Plan adjusted every 2 weeks', 'One 20-minute video check-in per month', 'Skill rubric updated every cycle'] },
  { name: 'Inner Circle' as const, tag: '4 spots total', items: ['Everything in Development', 'Weekly 30-minute live video session', 'Review on every submission', 'Pre-tournament game plan', 'Season goal review with parents'] },
];
const FAQ = [
  ['Is this in person?', 'No. Players train on their own court or driveway, log the work in the app, and get written feedback. Live video calls are included on Development and Inner Circle.'],
  ['What ages?', 'Players 10–16 who can practice on their own 2+ days a week. Younger players are welcome if a parent helps them log.'],
  ['Why only 15 players?', 'Your coach reviews your check-ins personally, and the head coach checks any review an assistant writes. Past 15, replies slow down and plans stop being personal, so we cap it and keep a waitlist. The app enforces the cap. When a spot opens, the longest-waiting family gets an email with a link held for 48 hours.'],
  ['What happens if the coach is late?', 'Every submission has a reply-by time based on your plan. If it passes, it jumps to the top of the coach’s queue marked overdue, and you can see the deadline on your Today screen.'],
  ['Is there an app?', 'Yes, as a web app you add to your home screen (iPhone: Share → Add to Home Screen). It opens full screen, records clips with the camera, and can send phone notifications when your coach replies, if you turn them on. Nothing to download from an app store.'],
  ['Do you track games?', 'Players log their own games in about a minute: optional stats, confidence, focus and energy (1–5), one thing they did well, and whether they tried their focus. The coach reads every log, and players can ask for feedback on one game a week, answered in writing within your usual reply window. Under-13s get an emoji scale and fewer stats.'],
  ['Do you review game film?', 'Not full game film. With a check-in, players can send one short practice clip (up to 30 seconds), and the coach answers with written feedback and time-stamped notes. Clips count toward your plan’s weekly reviews. Full film breakdown isn’t offered.'],
  ['Contracts?', 'None. Month to month, billed in advance through Stripe. Pause coaching anytime from the parent view and pick up exactly where you left off (pausing doesn’t stop billing).'],
  ['How do I cancel?', 'Parent view → Billing → Manage billing (Stripe’s secure portal). Coaching continues to the end of the month you paid for. No fees, no partial-month refunds.'],
  ['What if a payment fails?', 'Stripe retries and we email you. Coaching keeps going for 7 days while you update the card; after that it pauses, with progress saved, until the payment goes through.'],
];
const JOURNEY = [
  { k: 'Play', t: 'Practice the one focus. Then play the game.', d: 'Log practice reps and games in a minute: a few stats if you want, how you felt, one thing you did well.' },
  { k: 'Reflect', t: 'One honest line, every time.', d: 'Confidence, focus and energy 1–5, plus “did I try my focus in the game?” Yes, sometimes or not yet are all good answers.' },
  { k: 'Coach', t: 'A real person reads it.', d: 'Your coach replies with what went well, one adjustment and why, and notices when practice isn’t showing up in games yet.' },
  { k: 'Improve', t: 'See it change.', d: 'A timeline of games, confidence and focus changes, with the coach’s own notes on what changed and why.' },
];
const DEMO_TL = [{ x: 20, p: 4, c: 2 }, { x: 95, p: 6, c: 3 }, { x: 150, p: 7, c: 3 }, { x: 205, p: 9, c: 4 }];
function PhoneTimeline() {
  const Y = (v: number, max: number) => 150 - (v / max) * 110;
  return <div className="phone" aria-label="Example progress timeline for a fictional player, Avery Pine"><div className="phone-notch" aria-hidden />
    <div className="phone-screen"><p className="kicker orange">Avery’s timeline</p><p className="ph-title">See the player you’re becoming</p>
      <svg viewBox="0 0 230 170" className="ph-chart" aria-hidden><line x1="70" x2="70" y1="10" y2="150" className="ph-focus" /><text x="74" y="20" className="ph-lab">Focus: weak hand</text>
        <polyline points={DEMO_TL.map((g) => `${g.x},${Y(g.p, 10)}`).join(' ')} className="ph-pts" /><polyline points={DEMO_TL.map((g) => `${g.x},${Y(g.c, 5)}`).join(' ')} className="ph-conf" />
        {DEMO_TL.map((g) => <circle key={g.x} cx={g.x} cy={Y(g.c, 5)} r="5" className="ph-dot" />)}<circle cx="205" cy="25" r="9" className="ph-note" /><text x="205" y="29" textAnchor="middle" className="ph-n">1</text></svg>
      <p className="ph-legend"><span className="o">— points</span> <span className="b">— confidence</span></p>
      <div className="ph-note-card"><b>📌 Coach:</b> First game the left hand showed up under pressure.</div>
      <div className="ph-transfer"><span>Practice → game</span><i><b style={{ width: '50%' }} /></i><span>50%</span></div>
      <div className="ph-win">🏅 Personal best: 9 points</div></div></div>;
}

const LOOP = [
  { k: 'Focus', t: 'Weak-hand control under pressure', who: 'Coach sets it', x: 70, y: 210 },
  { k: 'Rep', t: 'Finishing ladder · 5 sets · 15 min', who: 'Avery logs it', x: 170, y: 90 },
  { k: 'Reflect', t: '“Kept going back to my right hand.”', who: 'One honest sentence', x: 330, y: 90 },
  { k: 'Coach cue', t: 'Slow it down: 3 walk-throughs first.', who: 'Reply by Tue 6 PM', x: 430, y: 210 },
];

function HeroLoop() {
  const [i, setI] = useState(0); const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => { if (reduce) return; const t = setInterval(() => setI((x) => (x + 1) % LOOP.length), 2200); return () => clearInterval(t); }, [reduce]);
  const cur = LOOP[i];
  return (
    <div className="heroloop" aria-label="Animated example of the weekly loop for a fictional player, Avery Pine">
      <svg viewBox="0 0 500 300" className="court" aria-hidden>
        <defs><linearGradient id="wood" x1="0" x2="1"><stop offset="0" stopColor="#D9A066" /><stop offset="1" stopColor="#E9BC86" /></linearGradient></defs>
        <rect width="500" height="300" rx="18" fill="url(#wood)" />
        {Array.from({ length: 12 }, (_, k) => <line key={k} x1={k * 44} y1="0" x2={k * 44 - 40} y2="300" stroke="#c48a4f" strokeOpacity=".35" />)}
        <g stroke="#fff" strokeWidth="3" fill="none" opacity=".9"><rect x="175" y="170" width="150" height="130" /><circle cx="250" cy="170" r="45" /><path d="M40 300 V 230 A 210 210 0 0 1 460 230 V 300" /></g>
        <path id="loop" d="M70 210 C 90 120, 140 90, 170 90 L 330 90 C 380 90, 420 130, 430 210 C 400 270, 120 270, 70 210" stroke="#0A1430" strokeWidth="3" strokeDasharray="6 8" fill="none" opacity=".5" />
        {LOOP.map((l, j) => <g key={l.k}><circle cx={l.x} cy={l.y} r={j === i ? 22 : 15} fill={j === i ? '#FF5E1A' : '#0A1430'} className="station" /><text x={l.x} y={l.y + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">{j + 1}</text></g>)}
        {!reduce && <circle r="9" fill="#FFC53D" stroke="#0A1430" strokeWidth="2"><animateMotion dur="8.8s" repeatCount="indefinite"><mpath href="#loop" /></animateMotion></circle>}
      </svg>
      <div className="loopcard" aria-live="polite" key={i}>
        <span className="kicker">Step {i + 1} · {cur.k}</span><p className="strong">{cur.t}</p><span className="small">{cur.who}</span>
        <div className="loopnav" role="tablist" aria-label="Loop steps">{LOOP.map((l, j) => <button key={l.k} role="tab" aria-selected={j === i} aria-label={l.k} className={j === i ? 'on' : ''} onClick={() => setI(j)} />)}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [sp] = useSearchParams();
  useEffect(() => { const s = sp.get('s'); if (s) document.getElementById(s)?.scrollIntoView(); }, [sp]);
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="hero"><div className="wrap hgrid">
          <div>
            <p className="kicker orange">Virtual player development · 15 players max</p>
            <h1 className="display xl">See the player you’re becoming,<br /><span className="hl">with a real coach watching.</span></h1>
            <p className="lead">One focus, one next rep, and a coach who reads your practice and your games. Every reviewed check-in gets a written reply (1 a week, up to 3, or every one, by plan) with a reply-by time you can see. Parents get a one-minute weekly summary.</p>
            <div className="row gap"><Link className="btn lg" to="/apply">Apply in 2 minutes</Link><Link className="btn outline lg" to="/app">Try the player demo</Link></div>
            <p className="small dim">From $69/month · No contracts · Every reply has a deadline</p>
          </div>
          <HeroLoop />
        </div></section>

        <section className="journey" id="journey"><div className="wrap">
          <p className="kicker orange">The journey</p><h2 className="display">Play. Reflect. Coach. Improve.</h2>
          <ol className="jband">{JOURNEY.map((j, i) => <li key={j.k}><span className="jn">{i + 1}</span><h3 className="display">{j.k}</h3><p className="strong">{j.t}</p><p className="small">{j.d}</p></li>)}</ol>
          <p className="compare">Self-tracking apps show you numbers. Here, a real coach reads them and tells you the one thing to change, and checks whether it shows up in your games.</p>
        </div></section>

        <section className="paper tlband"><div className="wrap tlgrid">
          <div><p className="kicker">Progress you can see</p><h2 className="display">Practice builds it. Games show it.</h2>
            <p>The gap most players have isn’t effort. It’s that what they practice doesn’t show up in games yet. After each game, players answer one question: did I try my focus? The timeline shows points and confidence game by game, when each new focus started, and how often the focus made it into a game.</p>
            <ul className="ticks"><li>Pressure reps (counted, on the clock, with a defender, on tired legs) make practice look like the game</li><li>A pre-game card: one focus, one cue, one line in the player’s own words</li><li>A Wins wall to revisit before a big game, and a gentle coach check-in if confidence dips two games in a row</li><li>A Player Card parents can share by private link (off until they turn it on)</li></ul>
            <p className="small dim">Players log their own games; we don’t break down game film. Confidence is the player’s own 1–5 read, never a grade.</p></div>
          <PhoneTimeline />
        </div></section>

        <section className="scoreboard"><div className="wrap">
          <h2 className="display">Players don’t need more information. <span className="hl">They need translation.</span></h2>
          <div className="sb">
            <div className="sb-col before"><span className="kicker">Before</span><ul><li>10 drill videos saved, none finished</li><li>“Work on your left hand,” no plan</li><li>Camps that end on Sunday</li><li>Parents guessing if it’s working</li></ul></div>
            <div className="sb-vs" aria-hidden>VS</div>
            <div className="sb-col after"><span className="kicker">After</span><ul><li>One focus for the next 2–4 weeks</li><li>One next rep, waiting on Today</li><li>Every reviewed check-in gets a reply by a set time</li><li>A Sunday summary parents read in a minute</li></ul></div>
          </div>
        </div></section>

        <section className="paper" id="how"><div className="wrap">
          <p className="kicker">How it works</p><h2 className="display">The loop, every week</h2>
          <ol className="playbook">
            {[['Apply', 'Six questions. You get a fit result and a suggested plan right away.', 'Family'], ['Connect', 'Accept the invite. Profile, goal, how you learn, weekly rhythm.', 'Family'], ['Plan', 'The coach sets one focus and queues the reps, within 2 business days.', 'Coach'], ['Rep & reflect', 'Tap each finished set and write one honest sentence.', 'Player'], ['Cue', 'Approve or “another attempt,” always with one cue. The next rep unlocks.', 'Coach'], ['Level up', 'Approvals, streaks and full cycles move you along the journey.', 'Player']].map(([t, d, w], i) => <li key={t}><span className="num">{String(i + 1).padStart(2, '0')}</span><div><h3>{t}</h3><p>{d}</p><span className={`who-tag ${w.toLowerCase()}`}>{w}</span></div></li>)}
          </ol>
          <Link className="btn ghost" to="/how">See the full workflow →</Link>
        </div></section>

        <section className="fitband"><div className="wrap fit">
          <div><h3 className="display">✓ A good fit</h3><ul><li>Players 10–16 who want to get better on their own time</li><li>Can practice 2+ days a week, even 15 minutes</li><li>Willing to write one honest sentence after practice</li><li>Families who want structure, not more noise</li></ul></div>
          <div><h3 className="display">✕ Not a fit (yet)</h3><ul><li>Looking for in-person team practice</li><li>Want full game-film breakdown</li><li>Need recruiting or exposure guarantees</li><li>The player isn’t the one who wants this</li></ul></div>
        </div></section>

        <section className="paper" id="plans"><div className="wrap">
          <p className="kicker">Plans</p><h2 className="display">Priced by coach time. Honest limits.</h2>
          <p className="muted">One coach and 15 players in total, so every reviewed rep gets a personal reply. When the roster is full, new families go on the waitlist automatically. Pay monthly by card through Stripe; cancel anytime.</p>
          <div className="tiers">{PLANS.map((t) => (
            <article key={t.name} className={`tier ${t.featured ? 'feat' : ''}`}>
              <span className="kicker">{t.tag}</span><h3 className="display">{t.name}</h3>
              <p className="price">${TIERS[t.name].price}<span>/mo</span></p>
              <p className="sla">⏱ Replies {TIERS[t.name].replyLabel}</p>
              <ul>{t.items.map((x) => <li key={x}>{x}</li>)}</ul>
              <Link className={`btn ${t.featured ? '' : 'ghost'}`} to={`/apply?tier=${t.name}`}>Apply for {t.name}</Link>
            </article>))}</div>
        </div></section>

        <section className="founder" id="why"><div className="wrap narrow">
          <p className="kicker orange">Why this exists</p><h2 className="display">A note from the founder</h2>
          <p className="note">Placeholder for Keith’s story. Replace this block with your own words before launch: why you started Baller Connection, the player (maybe you) who practiced hard but froze in games, and why you cap the roster at 15.</p>
          <blockquote className="quote">“[Your story, 3–4 sentences. Keep it true and specific.]”<footer>— [Your name], founder</footer></blockquote>
        </div></section>

        <section className="coachband" id="coach"><div className="wrap cgrid">
          <div className="avatar" aria-hidden>?</div>
          <div><p className="kicker orange">Your coach</p><h2 className="display">Coach [Your Name]</h2>
            <p className="note">Placeholder: Keith, replace this with your real bio, photo and coaching background.</p>
            <p>Every plan, review and message comes from a real coach you know by name, never an AI, and the head coach checks any review an assistant writes. Say here who you’ve coached, what you believe about development, and why you cap the roster.</p></div>
        </div></section>

        <section className="paper" id="faq"><div className="wrap narrow">
          <p className="kicker">FAQ</p><h2 className="display">Questions families ask</h2>
          {FAQ.map(([q, a]) => <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>)}
          <div className="cta"><h3 className="display">Ready for one clear next step?</h3><Link className="btn lg" to="/apply">Apply in 2 minutes</Link></div>
        </div></section>
      </main>
      <Footer />
    </>
  );
}
