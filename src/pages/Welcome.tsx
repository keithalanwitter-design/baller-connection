import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { family, first } from '../../shared/workflow';
import { TIERS } from '../../shared/domain';
import { Confetti, Pill } from '../ui';

export default function Welcome() {
  const s = useSnap(); const { run } = useStore(); const [sp] = useSearchParams();
  const candidates = s.players.filter((p) => p.state === 'Invited' || p.state === 'Onboarding');
  const p = s.players.find((x) => x.id === sp.get('p')) ?? candidates[0] ?? s.players.find((x) => x.id === 'theo')!;
  const inv = s.invites.find((x) => x.playerId === p.id);
  const [i, setI] = useState(p.state === 'Onboarding' ? 1 : 0);
  const [f, setF] = useState({ code: inv?.code ?? '', position: '', goal: '', learn: '', days: '', when: '' });
  const fn = first(p.name); const steps = ['Invite', 'Profile', 'Goal', 'Learning', 'Rhythm', 'Welcome'];
  const done = i === 5; const blocked = !done && !['Invited', 'Onboarding'].includes(p.state);
  const next = async () => {
    if (i === 0 && !(await run({ type: 'acceptInvite', playerId: p.id, code: f.code }))) return;
    if (i === 4 && !(await run({ type: 'completeOnboarding', playerId: p.id, position: f.position, goal: f.goal, learnStyle: f.learn, rhythm: `${f.days}, ${f.when}` }))) return;
    setI(i + 1);
  };
  const choice = (k: keyof typeof f, opts: string[]) => <div className="opts" role="radiogroup">{opts.map((o) => <button type="button" key={o} role="radio" aria-checked={f[k] === o} className={`opt ${f[k] === o ? 'on' : ''}`} onClick={() => setF({ ...f, [k]: o })}>{o}</button>)}</div>;
  const ok = [f.code.trim(), f.position, f.goal.trim(), f.learn, f.days && f.when, true][i];
  return (
    <main id="main" tabIndex={-1} className="flow">
      <div className="flowtop"><Logo light /><span className="small dim">Invite for {p.name}</span></div>
      <ol className="dots" aria-label="Onboarding steps">{steps.map((st, j) => <li key={st} className={j <= i ? 'on' : ''} aria-current={j === i ? 'step' : undefined}>{st}</li>)}</ol>
      <div className="flowbody">
        {blocked ? (
          <div className="fcard center"><h1 className="display">{p.name} is past onboarding.</h1><p className="lead">Status: <Pill state={p.state} /></p><p>Reset the demo to replay it, or invite a new applicant from the coach queue.</p><div className="row gap center"><Link className="btn" to={`/app?p=${p.id}`}>Open Today</Link><Link className="btn ghost" to="/coach">Coach queue</Link></div></div>
        ) : (
        <form className="fcard pop" key={i} onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
          {i === 0 && <><p className="kicker orange">You’re invited</p><h1 className="display">{family(s, p).parentName}, {fn} has a spot.</h1><p className="lead">Plan: <b>{p.tier}</b> · ${TIERS[p.tier].price}/month · replies {TIERS[p.tier].replyLabel} · cancel anytime.</p><label htmlFor="c">Invite code from your email</label><input id="c" className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /><p className="note">Demo: code is prefilled ({inv?.code}). No payment is taken.</p></>}
          {i === 1 && <><p className="kicker orange">Player profile</p><h1 className="display">Where does {fn} play?</h1>{choice('position', ['Guard', 'Wing', 'Forward', 'Center', 'Not sure yet'])}</>}
          {i === 2 && <><p className="kicker orange">The goal</p><h1 className="display">What does {fn} want this season?</h1><label htmlFor="g">In {fn}’s words, if you can</label><input id="g" autoFocus className="input" value={f.goal} placeholder="Make the travel team" onChange={(e) => setF({ ...f, goal: e.target.value })} /><p className="small dim">Why we ask: the coach picks the first focus from this.</p></>}
          {i === 3 && <><p className="kicker orange">How {fn} learns</p><h1 className="display">When something’s new, {fn} likes to…</h1>{choice('learn', ['Watch, then try', 'Just let me try it', 'Explain the why', 'Do it with someone'])}</>}
          {i === 4 && <><p className="kicker orange">Weekly rhythm</p><h1 className="display">When can {fn} practice?</h1><p className="dim">Days per week</p>{choice('days', ['2 days a week', '3 days a week', '4 days a week', '5+ days a week'])}<p className="dim">Usually</p>{choice('when', ['Mornings', 'After school', 'Evenings', 'Weekends'])}</>}
          {i === 5 && <div className="center celebrate rel"><Confetti /><div className="avatar sm" aria-hidden>?</div><p className="kicker orange">A note from your coach</p><h1 className="display">Welcome, {fn}.</h1><blockquote className="quote">“I read your goal: <strong>{f.goal}</strong>. Here’s how this works. I set one focus, you see one next rep on Today, and I reply to every check-in. Your first plan arrives within 2 business days.”</blockquote><p className="small dim">Coach [Your Name] · placeholder message</p>
            <ol className="timeline left"><li className="done"><b>Done</b> Onboarding. Level 1 unlocked: Tip-off.</li><li className="on"><b>Next · Coach</b> Builds {fn}’s plan (status: Plan building).</li><li><b>Then · {fn}</b> Reads the focus and unlocks rep 1.</li></ol>
            <div className="row gap center"><Link className="btn" to={`/app?p=${p.id}`}>Open {fn}’s Today</Link><Link className="btn ghost" to={`/coach/plan/${p.id}`}>Build the plan as coach</Link></div></div>}
          {i < 5 && <div className="row between"><button type="button" className="link" disabled={i === 0 || (i === 1 && p.state === 'Onboarding')} onClick={() => setI(i - 1)}>← Back</button><button className="btn" disabled={!ok}>{i === 0 ? 'Accept invite' : i === 4 ? 'Finish setup' : 'Continue'}</button></div>}
        </form>)}
      </div>
    </main>
  );
}
