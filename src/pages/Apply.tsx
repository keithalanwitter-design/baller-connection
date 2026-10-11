import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { useStore } from '../store';
import { suggestTier } from '../../shared/engine';
import { TIERS } from '../../shared/domain';

type Q = { id: string; q: string; help?: string; opts?: string[]; text?: string };
const QS: Q[] = [
  { id: 'names', q: 'Who’s the player, and who’s the parent?', text: 'names' },
  { id: 'age', q: 'How old is the player?', opts: ['Under 10', '10–12', '13–14', '15–16', '17+'] },
  { id: 'days', q: 'How many days a week can they practice on their own?', help: 'Even 15 minutes counts.', opts: ['0–1 days', '2 days', '3–4 days', '5+ days'] },
  { id: 'want', q: 'Whose idea is this?', opts: ['The player is asking for it', 'Both of us', 'Mostly mine (parent)'] },
  { id: 'need', q: 'What would help most right now?', opts: ['A plan and accountability', 'Plan + regular feedback', 'Weekly live coaching', 'In-person team practice', 'Full game-film breakdown'] },
  { id: 'goal', q: 'In one sentence, what’s the goal for this season?', text: 'goal', help: 'Example: “Make the 8th-grade A team.”' },
];

export default function Apply() {
  const [sp] = useSearchParams(); const { run } = useStore();
  const [i, setI] = useState(0); const [a, setA] = useState<Record<string, string>>({ player: '', parent: '' }); const [done, setDone] = useState<string | null>(null);
  const q = QS[i]; const res = i >= QS.length ? suggestTier(a) : null;
  const pick = (v: string) => { setA({ ...a, [q.id]: v }); setTimeout(() => setI(i + 1), 140); };
  const submit = async (next: 'apply' | 'call' | 'waitlist') => { if (await run({ type: 'submitApplication', playerName: a.player.trim(), parentName: a.parent.trim(), email: a.email?.trim(), answers: a, next })) setDone(next); };
  const textOk = q?.text === 'names' ? a.player.trim().split(' ').length >= 2 && a.parent.trim().length > 1 && /^\S+@\S+\.\S+$/.test(a.email ?? '') : (a[q?.id] || '').trim().length > 2;
  return (
    <main id="main" tabIndex={-1} className="flow">
      <div className="flowtop"><Logo light /><Link to="/" className="small dim">Exit</Link></div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={QS.length} aria-valuenow={Math.min(i, QS.length)} aria-label="Application progress"><span style={{ width: `${(Math.min(i, QS.length) / QS.length) * 100}%` }} /></div>
      <div className="flowbody">
        {done ? (
          <div className="fcard pop center">
            <div className="big">✓</div><h1 className="display">{done === 'call' ? 'Call requested' : done === 'waitlist' ? 'You’re on the list' : 'Application in'}</h1>
            <ol className="timeline">
              <li className="done"><b>Now</b> Application saved. Status: <span className="pill st-applied">Applied</span></li>
              <li className="on"><b>Within 2 business days</b> The coach reviews fit and capacity ({done === 'call' ? 'and emails 3 call times' : 'Fit review'}).</li>
              <li><b>Then</b> You get an invite, or a waitlist spot if the roster is full.</li>
              <li><b>After invite</b> 5 short onboarding screens, then the first plan.</li>
            </ol>
            <p className="note">Demo: saved in the demo engine only. Nothing was emailed.</p>
            <div className="row gap center"><Link className="btn" to="/coach">See it arrive in the coach queue →</Link><Link className="btn ghost" to="/welcome">Preview onboarding</Link></div>
          </div>
        ) : res ? (
          <div className="fcard pop">
            <p className="kicker orange">Your result</p>
            <h1 className="display">{res.fit === 'fit' ? 'Looks like a great fit.' : 'Not the right fit yet.'}</h1>
            <p className="lead">{res.why}</p>
            {res.fit !== 'notyet' && <div className="suggest"><span>Suggested plan</span><strong>{res.tier}</strong><span>${TIERS[res.tier].price}/mo · replies {TIERS[res.tier].replyLabel}</span></div>}
            {res.tier === 'Inner Circle' && <p className="small dim">Inner Circle has 4 spots. If they’re full when the coach reviews, you’ll be waitlisted automatically.</p>}
            {sp.get('tier') && sp.get('tier') !== res.tier && <p className="small dim">You started from {sp.get('tier')}. The coach will talk through either option.</p>}
            <div className="row gap">
              {res.fit === 'notyet' ? <><button className="btn" onClick={() => submit('waitlist')}>Tell me if that changes</button><Link className="btn ghost" to="/">Back home</Link></>
                : <><button className="btn" onClick={() => submit('apply')}>Submit application</button><button className="btn ghost" onClick={() => submit('call')}>Request a 15-min call first</button></>}
            </div>
            <button className="link small" onClick={() => setI(0)}>Change my answers</button>
          </div>
        ) : (
          <div className="fcard" key={q.id}>
            <p className="kicker orange">Question {i + 1} of {QS.length}</p><h1 id="qh" className="display">{q.q}</h1>{q.help && <p className="dim">{q.help}</p>}
            {q.opts ? <div className="opts" role="radiogroup" aria-labelledby="qh">{q.opts.map((o) => <button key={o} role="radio" aria-checked={a[q.id] === o} className={`opt ${a[q.id] === o ? 'on' : ''}`} onClick={() => pick(o)}>{o}</button>)}</div>
              : <form onSubmit={(e) => { e.preventDefault(); if (textOk) setI(i + 1); }}>
                {q.text === 'names' ? <><label htmlFor="pn">Player’s full name</label><input id="pn" autoFocus className="input" value={a.player} placeholder="e.g. Casey Rowan (demo: use an invented name)" onChange={(e) => setA({ ...a, player: e.target.value })} />
                  <label htmlFor="pp">Parent or guardian name</label><input id="pp" className="input" value={a.parent} onChange={(e) => setA({ ...a, parent: e.target.value })} />
                  <label htmlFor="pe">Parent email (where the invite goes)</label><input id="pe" className="input" type="email" autoComplete="email" value={a.email ?? ''} onChange={(e) => setA({ ...a, email: e.target.value })} /></>
                  : <><label className="sr" htmlFor="t">{q.q}</label><input id="t" autoFocus className="input" value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} placeholder="Type here" /></>}
                <button className="btn" disabled={!textOk}>{i === QS.length - 1 ? 'See my result' : 'Continue'}</button>
              </form>}
            {i > 0 && <button className="link small" onClick={() => setI(i - 1)}>← Back</button>}
          </div>
        )}
      </div>
    </main>
  );
}
