import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/domain';
import { addBusinessDays } from '../../shared/time';
import { clock, family, first, userName } from '../../shared/workflow';
import { Confetti, Pill } from '../ui';
import { PayButton, TestModeNote, TierPicker } from '../v6';
import { isPaid } from '../../shared/billing';
import { TIER_INFO, type Tier } from '../../shared/domain';
import { useEffect } from 'react';

/** Onboarding after the invite: plan & pay → profile → goal → learning → rhythm → consent → player login → welcome. */
export default function Welcome() {
  const s = useSnap(); const { run, api, refresh } = useStore(); const [sp] = useSearchParams();
  const p = s.players.find((x) => x.id === sp.get('p')) ?? s.players.find((x) => x.state === 'Onboarding') ?? s.players[0];
  const paidNow = !!p && (isPaid(p) || s.settings.requirePayment === false); const [i, setI] = useState(paidNow ? 1 : 0); const [tier, setTier] = useState<Tier>(p?.tier ?? 'Foundation');
  // Back from Stripe Checkout: the webhook may land a moment after the redirect, so re-check briefly.
  useEffect(() => { if (!sp.get('paid') || paidNow) return; let n = 0; const iv = setInterval(() => { n++; refresh(); if (n > 10) clearInterval(iv); }, 2000); return () => clearInterval(iv); }, [paidNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (paidNow && i === 0 && sp.get('paid')) setI(1); }, [paidNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState({ position: '', goal: '', learn: '', days: '', when: '', guardian: '', agree: false, username: '', pin: '', proud: '', frus: '' }); const [pinMsg, setPinMsg] = useState('');
  if (!p) return <main className="flow"><div className="flowbody"><div className="fcard"><h1 className="display">No player found.</h1><Link to="/invite">Enter an invite code</Link></div></div></main>;
  const fn = first(p.name); const steps = ['Plan & pay', 'Profile', 'Goal', 'Learning', 'Rhythm', 'Consent', 'Welcome'];
  const done = i === 6; const blocked = !done && p.state !== 'Onboarding'; const consented = s.consents.some((c) => c.playerId === p.id);
  const next = async () => {
    if (i === 5) { if (!consented && !(await run({ type: 'recordConsent', playerId: p.id, guardianName: f.guardian, agreed: f.agree }))) return; if (!(await run({ type: 'completeOnboarding', playerId: p.id, position: f.position, goal: f.goal, learnStyle: f.learn, rhythm: `${f.days}, ${f.when}`, proudOf: f.proud, frustration: f.frus }))) return; }
    setI(i + 1);
  };
  const choice = (k: 'position' | 'learn' | 'days' | 'when', opts: string[]) => <div className="opts" role="radiogroup">{opts.map((o) => <button type="button" key={o} role="radio" aria-checked={f[k] === o} className={`opt ${f[k] === o ? 'on' : ''}`} onClick={() => setF({ ...f, [k]: o })}>{o}</button>)}</div>;
  const ok = [paidNow, f.position, f.goal.trim(), f.learn, f.days && f.when, consented || (f.agree && f.guardian.trim().length >= 3), true][i];
  const coach = userName(s, p.coachId);
  return (
    <main id="main" tabIndex={-1} className="flow">
      <div className="flowtop"><Logo light /><span className="small dim">Setting up {p.name}</span></div>
      <ol className="dots" aria-label="Onboarding steps"><li className="on">Invite ✓</li>{steps.map((st, j) => <li key={st} className={j <= i ? 'on' : ''} aria-current={j === i ? 'step' : undefined}>{st}</li>)}</ol>
      <div className="flowbody">
        {blocked ? (
          <div className="fcard center"><h1 className="display">{p.name} is {p.state === 'Invited' ? 'waiting on the invite' : 'past onboarding'}.</h1><p className="lead">Status: <Pill state={p.state} /></p><div className="row gap center">{p.state === 'Invited' ? <Link className="btn" to="/invite">Accept the invite</Link> : <Link className="btn" to={`/parent?p=${p.id}`}>Open parent view</Link>}</div></div>
        ) : (
        <form className="fcard pop" key={i} onSubmit={(e) => { e.preventDefault(); if (ok) next(); }}>
          {i === 0 && <><p className="kicker orange">Plan & payment</p><h1 className="display">{paidNow ? `${fn}’s plan is set ✓` : `Pick ${fn}’s plan`}</h1>
            {paidNow ? <p className="lead">{p.billing === 'comp' ? 'Complimentary plan: nothing to pay.' : <>{p.tier} · ${TIER_INFO[p.tier].price}/month · paid. Cancel anytime from Billing.</>}</p> : <><p className="dim">Monthly, cancel anytime. Coaching continues to the end of the month you paid for. If a payment fails, coaching keeps going for {s.settings.graceDays ?? 7} days while you fix the card.</p>
              <TierPicker p={p} value={tier} onChange={setTier} /><PayButton p={p} tier={tier} /><TestModeNote /></>}</>}
          {i === 1 && <><p className="kicker orange">Player profile</p><h1 className="display">Where does {fn} play?</h1>{choice('position', ['Guard', 'Wing', 'Forward', 'Center', 'Not sure yet'])}</>}
          {i === 2 && <><p className="kicker orange">The goal</p><h1 className="display">What does {fn} want this season?</h1><label htmlFor="g">In {fn}’s words, if you can</label><input id="g" autoFocus className="input" value={f.goal} placeholder="Make the travel team" onChange={(e) => setF({ ...f, goal: e.target.value })} /><label htmlFor="pr">Something {fn} is proud of in their game</label><input id="pr" className="input" value={f.proud} placeholder="My defense" onChange={(e) => setF({ ...f, proud: e.target.value })} /><label htmlFor="fr">What frustrates {fn} most on the court?</label><input id="fr" className="input" value={f.frus} placeholder="Losing the ball under pressure" onChange={(e) => setF({ ...f, frus: e.target.value })} /><p className="small dim">Why we ask: {coach} picks the first focus from this, and {fn} sees these words on every rep.</p></>}
          {i === 3 && <><p className="kicker orange">How {fn} learns</p><h1 className="display">When something’s new, {fn} likes to…</h1>{choice('learn', ['Watch, then try', 'Just let me try it', 'Explain the why', 'Do it with someone'])}</>}
          {i === 4 && <><p className="kicker orange">Weekly rhythm</p><h1 className="display">When can {fn} practice?</h1><p className="dim">Days per week</p>{choice('days', ['2 days a week', '3 days a week', '4 days a week', '5+ days a week'])}<p className="dim">Usually</p>{choice('when', ['Mornings', 'After school', 'Evenings', 'Weekends'])}</>}
          {i === 5 && <><p className="kicker orange">Parental consent</p><h1 className="display">One last thing before coaching starts.</h1>
            {consented ? <p className="lead">Consent is on file ✓</p> : <><blockquote className="quote sm consent">{CONSENT_TEXT}</blockquote>
              <label htmlFor="gn">Guardian’s full name</label><input id="gn" className="input" value={f.guardian} onChange={(e) => setF({ ...f, guardian: e.target.value })} placeholder={family(s, p).parentName} />
              <label className="check"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} /> I am {fn}’s parent or legal guardian and I agree.</label>
              <p className="small dim">Recorded with your name, account and a timestamp (version {CONSENT_VERSION}). You can export or delete {fn}’s data anytime from the parent view.</p></>}</>}
          {i === 6 && <div className="center celebrate rel"><Confetti /><div className="avatar sm" aria-hidden>?</div><p className="kicker orange">A note from {coach}</p><h1 className="display">Welcome, {fn}.</h1><blockquote className="quote">“I read your goal: <strong>{p.goal}</strong>. I set one focus, you see one next rep on Today, and I reply to your reviewed check-ins by a set time. Your first plan arrives by {addBusinessDays(clock(s), 2).toLocaleDateString('en-US', { weekday: 'long' })}.”</blockquote>
            <ol className="timeline left"><li className="done"><b>Done</b> Onboarding + consent. Level 1 unlocked: Tip-off.</li><li className="on"><b>Next · {coach}</b> Builds {fn}’s plan (status: Plan building).</li><li><b>Then · {fn}</b> Reads the focus and unlocks rep 1.</li></ol>
            <section className="panel left"><h3 className="display">{fn}’s own login (optional)</h3><p className="small dim">For players without email (under 13 especially): pick a username and a 4–8 digit PIN. You can change it later.</p>
              <div className="row gap wrapx"><input aria-label="Player username" className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder={`${fn.toLowerCase()}.${p.name.split(' ')[1]?.toLowerCase() ?? 'player'}`} /><input aria-label="PIN" className="input" inputMode="numeric" type="password" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} placeholder="PIN" style={{ maxWidth: 120 }} />
                <button type="button" className="btn sm" disabled={f.username.length < 3 || !/^\d{4,8}$/.test(f.pin)} onClick={async () => { try { await api.setPlayerPin({ playerId: p.id, username: f.username, pin: f.pin }); await refresh(); setPinMsg(`✓ ${fn} can sign in as “${f.username.toLowerCase()}” with that PIN.`); } catch (e) { setPinMsg((e as Error).message); } }}>Save login</button></div>{pinMsg && <p className="small">{pinMsg}</p>}</section>
            <div className="row gap center"><Link className="btn" to={`/parent?p=${p.id}`}>Open parent view</Link><Link className="btn ghost" to={`/app?p=${p.id}`}>Open {fn}’s Today</Link></div></div>}
          {i < 6 && <div className="row between"><button type="button" className="link" disabled={i <= 1} onClick={() => setI(i - 1)}>← Back</button><button className="btn" disabled={!ok}>{i === 5 ? 'Agree & finish setup' : 'Continue'}</button></div>}
        </form>)}
      </div>
    </main>
  );
}
