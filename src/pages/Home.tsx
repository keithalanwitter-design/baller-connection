import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Footer, SiteHeader } from '../App';

export const TIERS = [
  { name: 'Foundation', price: 69, tag: 'Start the habit', reply: 'Replies within 2 business days',
    items: ['Personal plan with one focus', 'A weekly set of assigned reps', '1 written coach review per week', 'Daily habit tracker and streaks', 'Weekly parent summary'] },
  { name: 'Development', price: 139, tag: 'Most families', featured: true, reply: 'Replies within 1 business day',
    items: ['Everything in Foundation', 'Up to 3 written reviews per week', 'Plan adjusted every 2 weeks', 'One 20-minute video check-in per month', 'Skill rubric updated monthly'] },
  { name: 'Inner Circle', price: 229, tag: '4 spots total', reply: 'Replies same business day', limit: true,
    items: ['Everything in Development', 'Weekly 30-minute live video session', 'Review on every submission', 'Pre-tournament game plan', 'Season goal review with parents'] },
];
const FAQ = [
  ['Is this in person?', 'No. Baller Connection is virtual. Players train on their own court or driveway, log the work in the app, and get written feedback. Live video calls are included on Development and Inner Circle.'],
  ['What ages?', 'Players 10–16 who can practice on their own 3+ days a week. Younger players are welcome if a parent helps them log.'],
  ['Why only 15 players?', 'One coach reviews every submission personally. Past 15 players, replies slow down and the plan stops being personal, so we cap it and keep a waitlist.'],
  ['Do you review game film?', 'Not full game film. Players can describe a 60-second phone clip in their self-check, and the coach responds in writing. Full film breakdown is not offered yet.'],
  ['Contracts?', 'None. Plans are month to month. Pause or cancel anytime before your next billing date.'],
  ['What does the parent see?', 'A short weekly summary: what was assigned, what got done, and the coach’s notes. No coaching homework for parents.'],
];

function HeroCard() {
  const steps = [['Focus', 'Weak-hand control under pressure'], ['Work', 'Weak-hand finishing ladder · 5 sets · 15 min'], ['Reflection', '“Kept bringing it to my right hand.”'], ['Coach adjustment', 'Slow it down: 3 walk-through reps, then game speed.']];
  const [i, setI] = useState(0);
  useEffect(() => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; const t = setInterval(() => setI((x) => (x + 1) % 4), 2600); return () => clearInterval(t); }, []);
  return (
    <div className="card herocard" aria-label="Example player path for a fictional player">
      <div className="row between"><strong>Avery Pine’s path</strong><span className="pill">Example player</span></div>
      <ol className="path">{steps.map(([k, v], j) => <li key={k} className={j === i ? 'on' : j < i ? 'done' : ''} onMouseEnter={() => setI(j)}><span>{k}</span><p>{v}</p></li>)}</ol>
    </div>
  );
}

export default function Home() {
  const [sp] = useSearchParams();
  useEffect(() => { const s = sp.get('s'); if (s) document.getElementById(s)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [sp]);
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <section className="hero"><div className="wrap hgrid">
          <div>
            <p className="eyebrow">Virtual player development · 15 players max</p>
            <h1>One focus. One next rep.<br /><em>A coach who answers.</em></h1>
            <p className="lead">Baller Connection gives each player a personal plan, a short list of reps to do this week, and written feedback from their coach on every check-in. Parents get a weekly summary.</p>
            <div className="row gap"><Link className="btn lg" to="/apply">Apply in 2 minutes</Link><Link className="btn ghost lg" to="/app">Try the player demo</Link></div>
            <p className="muted small">From $69/month · No contracts · Replies within 2 business days or faster</p>
          </div>
          <HeroCard />
        </div></section>

        <section className="band"><div className="wrap">
          <h2>Players don’t need more information. <em>They need translation.</em></h2>
          <div className="ba">
            <div className="card before"><h3>Before</h3><ul><li>Ten drill videos saved, none finished</li><li>“Work on your left hand” with no plan</li><li>Camps that end on Sunday</li><li>Parents guessing if it’s working</li></ul></div>
            <div className="arrow" aria-hidden>→</div>
            <div className="card after"><h3>After</h3><ul><li>One focus for the next 2–4 weeks</li><li>One next rep, waiting on Today</li><li>Every check-in gets a coach reply</li><li>A Sunday summary parents can read in a minute</li></ul></div>
          </div>
        </div></section>

        <section id="how"><div className="wrap">
          <p className="eyebrow">How it works</p><h2>A loop you can run every week</h2>
          <ol className="steps">
            {[['Apply', 'Six quick questions. We tell you right away if it’s a fit and which plan makes sense.'], ['Connect', 'Accept your invite, set up your player’s profile and weekly rhythm.'], ['Plan', 'Your coach sets one focus and assigns the first reps.'], ['Rep & reflect', 'Your player does the work, taps what got done, and writes one honest sentence.'], ['Feedback', 'The coach approves it or asks for another attempt, with one clear cue. Then the next rep unlocks.']].map(([t, d], i) => <li key={t} className="card"><span className="num">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}
          </ol>
        </div></section>

        <section className="band"><div className="wrap fit">
          <div className="card"><h3>✓ A good fit</h3><ul><li>Players 10–16 who want to get better on their own time</li><li>Can practice 3+ days a week, even 15 minutes</li><li>Willing to write one honest sentence after practice</li><li>Families who want structure, not more noise</li></ul></div>
          <div className="card"><h3>✕ Not a fit (yet)</h3><ul><li>Looking for in-person team practice</li><li>Want full game-film breakdown</li><li>Need recruiting or exposure guarantees</li><li>Player isn’t the one who wants this</li></ul></div>
        </div></section>

        <section id="plans"><div className="wrap">
          <p className="eyebrow">Plans</p><h2>Simple monthly plans. Honest limits.</h2>
          <p className="muted">The whole program caps at 15 players so every submission gets a personal reply. When it’s full, new families join the waitlist.</p>
          <div className="tiers">
            {TIERS.map((t) => (
              <article key={t.name} className={`card tier ${t.featured ? 'feat' : ''}`}>
                <p className="eyebrow">{t.tag}</p><h3>{t.name}</h3>
                <p className="price">${t.price}<span>/month</span></p>
                <p className="small strong">{t.reply}</p>
                <ul>{t.items.map((x) => <li key={x}>{x}</li>)}</ul>
                <Link className={`btn ${t.featured ? '' : 'ghost'}`} to={`/apply?tier=${t.name}`}>Apply for {t.name}</Link>
              </article>
            ))}
          </div>
        </div></section>

        <section className="band" id="coach"><div className="wrap cgrid">
          <div className="avatar" aria-hidden>C</div>
          <div>
            <p className="eyebrow">Your coach</p><h2>Coach [Your Name]</h2>
            <p className="note">Placeholder — Keith, replace this with your real bio, photo, and coaching background.</p>
            <p>Every plan, review, and message in Baller Connection comes from one coach — not a rotating staff, not an AI. Write here who you’ve coached, what you believe about development, and why you cap the roster.</p>
          </div>
        </div></section>

        <section id="faq"><div className="wrap narrow">
          <p className="eyebrow">FAQ</p><h2>Questions families ask</h2>
          {FAQ.map(([q, a]) => <details key={q} className="card faq"><summary>{q}</summary><p>{a}</p></details>)}
          <div className="cta card"><h3>Ready for one clear next step?</h3><Link className="btn lg" to="/apply">Apply in 2 minutes</Link></div>
        </div></section>
      </main>
      <Footer />
    </>
  );
}
