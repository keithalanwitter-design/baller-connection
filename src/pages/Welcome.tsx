import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useSnap, useStore } from '../store';
import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/domain';
import { addBusinessDays } from '../../shared/time';
import { clock, family, first, userName } from '../../shared/workflow';
import { Pill } from '../ui';
import { MeetCoach, RhythmPicker } from '../v9';
import { ROLES_AGREEMENT } from '../../shared/v9';
import { PayButton, TestModeNote, TierPicker } from '../v6';
import { isPaid } from '../../shared/billing';
import { TIER_INFO, type Tier } from '../../shared/domain';
import { useEffect } from 'react';

/** Onboarding after the invite: plan & pay → meet your coach → profile → goal → learning → rhythm → roles → consent → welcome. */
export default function Welcome() {
  const s = useSnap(); const { run, api, refresh } = useStore(); const [sp] = useSearchParams();
  const p = s.players.find((x) => x.id === sp.get('p')) ?? s.players.find((x) => x.state === 'Onboarding') ?? s.players[0];
  const paidNow = !!p && (isPaid(p) || s.settings.requirePayment === false); const [i, setI] = useState(paidNow ? 1 : 0); const [tier, setTier] = useState<Tier>(p?.tier ?? 'Foundation');
  // Back from Stripe Checkout: the webhook may land a moment after the redirect, so re-check briefly.
  useEffect(() => { if (!sp.get('paid') || paidNow) return; let n = 0; const iv = setInterval(() => { n++; refresh(); if (n > 10) clearInterval(iv); }, 2000); return () => clearInterval(iv); }, [paidNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (paidNow && i === 0 && sp.get('paid')) setI(1); }, [paidNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState({ position: '', goal: '', learn: '', days: '', when: '', guardian: '', agree: false, username: '', pin: '', proud: '', frus: '', mine: '', reps: 3, day: 'Thursday', roles: false }); const [pinMsg, setPinMsg] = useState('');
  if (!p) return <main className="flow"><div className="flowbody"><div className="fcard"><h1 className="display">No player found.</h1><Link to="/invite">Enter an invite code</Link></div></div></main>;
  const fn = first(p.name); const steps = ['Plan & pay', 'Your coach', 'Profile', 'Goal', 'Learning', 'Rhythm', 'Roles', 'Consent', 'Welcome'];
  const done = i === 8; const blocked = !done && p.state !== 'Onboarding'; const consented = s.consents.some((c) => c.playerId === p.id);
  const next = async () => {
    if (i === 7) { if (!consented && !(await run({ type: 'recordConsent', playerId: p.id, guardianName: f.guardian, agreed: f.agree }))) return; if (!(await run({ type: 'completeOnboarding', playerId: p.id, position: f.position, goal: f.goal, learnStyle: f.learn, rhythm: `${f.reps} clips a week, clip day ${f.day}`, proudOf: f.proud, frustration: f.frus, agreed: f.roles, repsPerWeek: f.reps, clipDay: f.day, playerWords: f.mine || undefined }))) return; }
    setI(i + 1);
  };
  const choice = (k: 'position' | 'learn' | 'days' | 'when', opts: string[]) => <div className="opts" role="radiogroup">{opts.map((o) => <button type="button" key={o} role="radio" aria-checked={f[k] === o} className={`opt ${f[k] === o ? 'on' : ''}`} onClick={() => setF({ ...f, [k]: o })}>{o}</button>)}</div>;
  const ok = [paidNow, true, f.position, f.goal.trim(), f.learn, true, f.roles, consented || (f.agree && f.guardian.trim().length >= 3), true][i];
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
            {paidNow ? <p className="lead">{p.billing === 'comp' ? 'Complimentary plan: nothing to pay.' : <>{p.tier} · ${TIER_INFO[p.tier].price}/month · paid. Cancel anytime from Billing.</>}</p> : <><p className="dim">Monthly, cancel anytime. Coaching continues to the end of the month you paid for. If a payment fails, we’ll tell you and you can fix the card. Nothing happens overnight.</p>
              <TierPicker p={p} value={tier} onChange={setTier} /><PayButton p={p} tier={tier} /><TestModeNote /></>}</>}
          {i === 1 && <><p className="kicker orange">Your coach</p><h1 className="display">Meet {first(coach)}.</h1><MeetCoach p={p} /></>}
          {i === 2 && <><p className="kicker orange">Player profile</p><h1 className="display">Where does {fn} play?</h1>{choice('position', ['Guard', 'Wing', 'Forward', 'Center', 'Not sure yet'])}</>}
          {i === 3 && <><p className="kicker orange">The goal</p><h1 className="display">What does {fn} want this season?</h1><label htmlFor="g">In {fn}’s words, if you can</label><input id="g" autoFocus className="input" value={f.goal} placeholder="Make the travel team" onChange={(e) => setF({ ...f, goal: e.target.value })} /><label htmlFor="mine">{fn}, in your own words: what do you want out of this? (optional)</label><input id="mine" className="input" value={f.mine} placeholder="Stop turning it over under pressure" onChange={(e) => setF({ ...f, mine: e.target.value })} /><label htmlFor="pr">Something {fn} is proud of in their game</label><input id="pr" className="input" value={f.proud} placeholder="My defense" onChange={(e) => setF({ ...f, proud: e.target.value })} /><label htmlFor="fr">What frustrates {fn} most on the court?</label><input id="fr" className="input" value={f.frus} placeholder="Losing the ball under pressure" onChange={(e) => setF({ ...f, frus: e.target.value })} /><p className="small dim">Why we ask: {coach} picks the first focus from this, and {fn} sees these words on every rep.</p></>}
          {i === 4 && <><p className="kicker orange">How {fn} learns</p><h1 className="display">When something’s new, {fn} likes to…</h1>{choice('learn', ['Watch, then try', 'Just let me try it', 'Explain the why', 'Do it with someone'])}</>}
          {i === 5 && <><p className="kicker orange">Weekly rhythm</p><h1 className="display">What can {fn} actually keep up?</h1><p className="dim">Pick a pace that fits a real week. Fewer clips done beat more clips planned. You can change it any time.</p><RhythmPicker value={{ repsPerWeek: f.reps, clipDay: f.day }} onChange={(v) => setF({ ...f, reps: v.repsPerWeek, day: v.clipDay })} /></>}
          {i === 6 && <><p className="kicker orange">Who does what</p><h1 className="display">A short agreement between {fn}, you and {first(coach)}.</h1>
            <ul className="plain roles">{ROLES_AGREEMENT.map((r) => <li key={r.who}><b>{r.who}</b> {r.line}</li>)}</ul>
            <label className="check"><input type="checkbox" checked={f.roles} onChange={(e) => setF({ ...f, roles: e.target.checked })} /> {fn} and I read this and agree to it.</label></>}
          {i === 7 && <><p className="kicker orange">Parental consent</p><h1 className="display">One last thing before coaching starts.</h1>
            {consented ? <p className="lead">Consent is on file ✓</p> : <><blockquote className="quote sm consent">{CONSENT_TEXT}</blockquote>
              <label htmlFor="gn">Guardian’s full name</label><input id="gn" className="input" value={f.guardian} onChange={(e) => setF({ ...f, guardian: e.target.value })} placeholder={family(s, p).parentName} />
              <label className="check"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} /> I am {fn}’s parent or legal guardian and I agree.</label>
              <p className="small dim">Recorded with your name, account and a timestamp (version {CONSENT_VERSION}). You can export or delete {fn}’s data anytime from the parent view.</p></>}</>}
          {i === 8 && <div className="center celebrate rel"><div className="avatar sm" aria-hidden>{first(coach)[0]}</div><p className="kicker orange">You’re in</p><h1 className="display">Welcome, {fn}.</h1><p className="lead">Here’s what happens next.</p>
            <ol className="timeline left"><li className="done"><b>Done</b> Plan, agreement and consent.</li><li className="on"><b>Now · {fn}</b> Send one clip of how you play (30 seconds or less) from Today. It can be a drill or a few possessions.</li><li><b>By {addBusinessDays(clock(s), 2).toLocaleDateString('en-US', { weekday: 'long' })} · {first(coach)}</b> Writes what he saw and sets your first focus.</li><li><b>Then · {fn}</b> One rep, one clip, one adjustment, said back in your own words.</li></ol>
            <section className="panel left"><h3 className="display">{fn}’s own login (optional)</h3><p className="small dim">For players without email (under 13 especially): pick a username and a 4–8 digit PIN. You can change it later.</p>
              <div className="row gap wrapx"><input aria-label="Player username" className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder={`${fn.toLowerCase()}.${p.name.split(' ')[1]?.toLowerCase() ?? 'player'}`} /><input aria-label="PIN" className="input" inputMode="numeric" type="password" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} placeholder="PIN" style={{ maxWidth: 120 }} />
                <button type="button" className="btn sm" disabled={f.username.length < 3 || !/^\d{4,8}$/.test(f.pin)} onClick={async () => { try { await api.setPlayerPin({ playerId: p.id, username: f.username, pin: f.pin }); await refresh(); setPinMsg(`✓ ${fn} can sign in as “${f.username.toLowerCase()}” with that PIN.`); } catch (e) { setPinMsg((e as Error).message); } }}>Save login</button></div>{pinMsg && <p className="small">{pinMsg}</p>}</section>
            <div className="row gap center"><Link className="btn" to={`/parent?p=${p.id}`}>Open parent view</Link><Link className="btn ghost" to={`/app?p=${p.id}`}>Open {fn}’s Today</Link></div></div>}
          {i < 8 && <div className="row between"><button type="button" className="link" disabled={i <= 1} onClick={() => setI(i - 1)}>← Back</button><button className="btn" disabled={!ok}>{i === 7 ? 'Agree & finish setup' : 'Continue'}</button></div>}
        </form>)}
      </div>
    </main>
  );
}
