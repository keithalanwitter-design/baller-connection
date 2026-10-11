import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '../App';
import { uid, useStore, type Tier } from '../store';

type Q = { id: string; q: string; help?: string; opts?: string[]; text?: boolean };
const QS: Q[] = [
  { id: 'who', q: 'Who’s filling this out?', opts: ['Parent or guardian', 'The player (with a parent nearby)'] },
  { id: 'age', q: 'How old is the player?', opts: ['Under 10', '10–12', '13–14', '15–16', '17+'] },
  { id: 'days', q: 'How many days a week can they practice on their own?', help: 'Even 15 minutes counts.', opts: ['0–1 days', '2 days', '3–4 days', '5+ days'] },
  { id: 'want', q: 'Whose idea is this?', opts: ['The player is asking for it', 'Both of us', 'Mostly mine (parent)'] },
  { id: 'need', q: 'What would help most right now?', opts: ['A plan and accountability', 'Plan + regular feedback', 'Weekly live coaching', 'In-person team practice', 'Game film breakdown'] },
  { id: 'goal', q: 'In one sentence, what’s the goal for this season?', text: true, help: 'Example: “Make the 8th-grade A team.”' },
];

function evaluate(a: Record<string, string>): { fit: 'fit' | 'waitlist' | 'notyet'; tier: Tier; why: string } {
  if (a.need === 'In-person team practice' || a.need === 'Game film breakdown') return { fit: 'notyet', tier: 'Foundation', why: `We don’t offer ${a.need.toLowerCase()} — so we’d rather tell you now than take your money.` };
  if (a.age === 'Under 10' || a.days === '0–1 days') return { fit: 'notyet', tier: 'Foundation', why: 'The program works when a player can rep on their own 2+ days a week, starting around age 10.' };
  if (a.want === 'Mostly mine (parent)') return { fit: 'fit', tier: 'Foundation', why: 'Start light. Foundation lets your player try the loop without a big commitment.' };
  const tier: Tier = a.need === 'Weekly live coaching' ? 'Inner Circle' : a.need === 'Plan + regular feedback' || a.days === '5+ days' ? 'Development' : 'Foundation';
  return { fit: tier === 'Inner Circle' ? 'waitlist' : 'fit', tier, why: tier === 'Inner Circle' ? 'Inner Circle has 4 spots and they’re full right now. We’ll hold your place, or you can start on Development today.' : `Based on ${a.days} a week and wanting ${a.need.toLowerCase()}, ${tier} is the right starting plan.` };
}

export default function Apply() {
  const [sp] = useSearchParams(); const { set } = useStore();
  const [i, setI] = useState(0); const [a, setA] = useState<Record<string, string>>({}); const [done, setDone] = useState<string | null>(null);
  const q = QS[i]; const res = i >= QS.length ? evaluate(a) : null;
  const pick = (v: string) => { setA({ ...a, [q.id]: v }); setTimeout(() => setI(i + 1), 120); };
  const submit = (next: string) => {
    if (!res) return;
    set((s) => ({ ...s, applications: [...s.applications, { id: uid(), at: new Date().toISOString(), answers: a, tier: res.tier, fit: res.fit, next }] }));
    setDone(next);
  };
  return (
    <main id="main" tabIndex={-1} className="flow">
      <div className="flowtop"><Logo /><Link to="/" className="muted small">Exit</Link></div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={QS.length} aria-valuenow={Math.min(i, QS.length)} aria-label="Application progress"><span style={{ width: `${(Math.min(i, QS.length) / QS.length) * 100}%` }} /></div>
      <div className="flowbody">
        {done ? (
          <div className="card center pop">
            <div className="big">✓</div>
            <h1>{done === 'call' ? 'Call requested' : done === 'waitlist' ? 'You’re on the waitlist' : 'Application received'}</h1>
            <p className="lead">{done === 'call' ? 'You’ll get an email with 3 time options for a 15-minute intro call.' : 'The coach reads every application personally and replies within 2 business days.'}</p>
            <p className="note">Demo: saved in this browser only. Nothing was sent.</p>
            <div className="row gap center"><Link className="btn" to="/welcome">See what happens after an invite →</Link><Link className="btn ghost" to="/">Back home</Link></div>
          </div>
        ) : res ? (
          <div className="card pop">
            <p className="eyebrow">Your result</p>
            <h1>{res.fit === 'fit' ? 'Looks like a great fit.' : res.fit === 'waitlist' ? 'A fit — and a waitlist.' : 'Not the right fit yet.'}</h1>
            <p className="lead">{res.why}</p>
            {res.fit !== 'notyet' && <div className="suggest"><span>Suggested plan</span><strong>{res.tier}</strong><span>{res.tier === 'Foundation' ? '$69' : res.tier === 'Development' ? '$139' : '$229'}/mo</span></div>}
            {sp.get('tier') && sp.get('tier') !== res.tier && <p className="small muted">You started from {sp.get('tier')}. The coach will talk through either option.</p>}
            <div className="row gap">
              {res.fit === 'notyet' ? <><button className="btn" onClick={() => submit('waitlist')}>Notify me if that changes</button><Link className="btn ghost" to="/">Back home</Link></>
                : <><button className="btn" onClick={() => submit(res.fit === 'waitlist' ? 'waitlist' : 'apply')}>{res.fit === 'waitlist' ? 'Join the waitlist' : 'Submit application'}</button><button className="btn ghost" onClick={() => submit('call')}>Request a 15-min call first</button></>}
            </div>
            <button className="link small" onClick={() => setI(0)}>Change my answers</button>
          </div>
        ) : (
          <div className="card" key={q.id}>
            <p className="eyebrow">Question {i + 1} of {QS.length}</p>
            <h1 id="qh">{q.q}</h1>{q.help && <p className="muted">{q.help}</p>}
            {q.opts ? (
              <div className="opts" role="radiogroup" aria-labelledby="qh">{q.opts.map((o) => <button key={o} role="radio" aria-checked={a[q.id] === o} className={`opt ${a[q.id] === o ? 'on' : ''}`} onClick={() => pick(o)}>{o}</button>)}</div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if ((a[q.id] || '').trim()) setI(i + 1); }}>
                <label className="sr" htmlFor="t">{q.q}</label>
                <input id="t" autoFocus className="input" value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} placeholder="Type here" />
                <button className="btn" disabled={!(a[q.id] || '').trim()}>See my result</button>
              </form>
            )}
            {i > 0 && <button className="link small" onClick={() => setI(i - 1)}>← Back</button>}
          </div>
        )}
      </div>
    </main>
  );
}
