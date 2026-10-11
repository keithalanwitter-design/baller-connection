import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../App';
import { first, useStore } from '../store';

export default function Welcome() {
  const { s, update } = useStore();
  const theo = s.players.find((p) => p.id === 'theo');
  const [i, setI] = useState(0);
  const [f, setF] = useState({ code: 'THEO-2026', position: 'Guard', goal: '', learn: '', days: '', when: '' });
  if (!theo) return null;
  const already = !['Invited', 'Connected'].includes(theo.status) && i === 0;
  const steps = ['Invite', 'Profile', 'Goal', 'Learning', 'Rhythm', 'Welcome'];
  const next = () => {
    if (i === 0) update('theo', (p) => ({ ...p, status: 'Connected' }));
    if (i === 4) update('theo', (p) => ({ ...p, status: 'Active', position: f.position, goal: f.goal, learnStyle: f.learn, rhythm: `${f.days}, ${f.when}`, habits: [], messages: [{ from: 'coach', text: `Welcome, Theo! I’m reading your goal now — “${f.goal}”. Your first plan lands within 2 business days.`, at: new Date().toISOString() }] }));
    setI(i + 1);
  };
  const choice = (k: keyof typeof f, opts: string[]) => <div className="opts" role="radiogroup">{opts.map((o) => <button type="button" key={o} role="radio" aria-checked={f[k] === o} className={`opt ${f[k] === o ? 'on' : ''}`} onClick={() => setF({ ...f, [k]: o })}>{o}</button>)}</div>;
  const ok = [f.code.trim(), f.position, f.goal.trim(), f.learn, f.days && f.when, true][i];
  return (
    <main id="main" tabIndex={-1} className="flow">
      <div className="flowtop"><Logo /><span className="muted small">Invite for {theo.name} · from Coach</span></div>
      <ol className="dots" aria-label="Onboarding steps">{steps.map((st, j) => <li key={st} className={j <= i ? 'on' : ''} aria-current={j === i ? 'step' : undefined}>{st}</li>)}</ol>
      <div className="flowbody">
        {already ? (
          <div className="card center"><h1>Theo is already set up.</h1><p className="lead">Status: <span className="pill">{theo.status}</span></p><p>Reset the demo to replay onboarding.</p><Link className="btn" to="/coach">See the coach side →</Link></div>
        ) : (
        <form className="card pop" key={i} onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
          {i === 0 && <><p className="eyebrow">You’re invited</p><h1>{theo.parentName}, Theo has a spot.</h1><p className="lead">Plan: <strong>{theo.tier}</strong> · $69/month · cancel anytime. Enter the invite code from your email.</p><label htmlFor="c">Invite code</label><input id="c" className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /><p className="note">Demo: no payment is taken.</p></>}
          {i === 1 && <><p className="eyebrow">Player profile</p><h1>Where does Theo play?</h1>{choice('position', ['Guard', 'Wing', 'Forward', 'Center', 'Not sure yet'])}</>}
          {i === 2 && <><p className="eyebrow">The goal</p><h1>What does Theo want this season?</h1><label htmlFor="g">In Theo’s words, if you can</label><input id="g" autoFocus className="input" value={f.goal} placeholder="Make the travel team" onChange={(e) => setF({ ...f, goal: e.target.value })} /></>}
          {i === 3 && <><p className="eyebrow">How Theo learns</p><h1>When something’s new, Theo likes to…</h1>{choice('learn', ['Watch, then try', 'Just let me try it', 'Explain the why', 'Do it with someone'])}</>}
          {i === 4 && <><p className="eyebrow">Weekly rhythm</p><h1>When can Theo practice?</h1><p className="muted">Days per week</p>{choice('days', ['2 days a week', '3 days a week', '4 days a week', '5+ days a week'])}<p className="muted">Usually</p>{choice('when', ['Mornings', 'After school', 'Evenings', 'Weekends'])}</>}
          {i === 5 && <div className="center"><div className="avatar sm" aria-hidden>C</div><p className="eyebrow">A note from your coach</p><h1>Welcome, {first(theo.name)}.</h1><blockquote className="quote">“I read your goal — <strong>{f.goal}</strong>. Here’s how this works: I’ll set one focus, you’ll see one next rep on Today, and I reply to every check-in. Your first plan arrives within 2 business days.”</blockquote><p className="muted small">Coach [Your Name] · placeholder message</p><div className="row gap center"><Link className="btn" to="/app?p=theo">Open Theo’s Today</Link><Link className="btn ghost" to="/coach">See it from the coach side</Link></div></div>}
          {i < 5 && <div className="row between"><button type="button" className="link" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button><button className="btn" disabled={!ok}>{i === 0 ? 'Accept invite' : i === 4 ? 'Finish' : 'Continue'}</button></div>}
        </form>)}
      </div>
    </main>
  );
}
