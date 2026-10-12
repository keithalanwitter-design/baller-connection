import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from './App';
import { useSnap, useStore } from './store';
import { DEFAULT_PREFS, TIER_INFO, replyLabel, type EmailPrefs, type OutboxEmail, type Player, type Tier } from '../shared/domain';
import { CATEGORY_LABEL } from '../shared/emails';
import { PRICE_CENTS, TIERS, billingLabel, checkoutBlock, graceEnds, isPaid, mrr, subscriptionOf, type MockOutcome } from '../shared/billing';
import { shortWhen } from '../shared/time';
import { capacity, family, first } from '../shared/workflow';
import { homeFor } from './pages/Auth';
import { UserMenu } from './ui';

/** Where a billing endpoint sent us: an absolute Stripe URL (live/test), or an in-app simulator route (#/checkout …). */
function useGo() { const nav = useNavigate(); return (url: string) => { const h = url.indexOf('#/'); if (url.startsWith('#') || (h >= 0 && url.slice(0, h).replace(/\/$/, '') === (location.origin + location.pathname).replace(/\/$/, ''))) nav(url.slice(h + 1)); else location.href = url; }; }
/** Stripe mode of the server: live | test | simulated (demo build: simulated). */
export function useStripeMode() {
  const { api, mode } = useStore(); const [m, setM] = useState<{ stripe: string; demo: boolean } | null>(mode === 'demo' ? { stripe: 'simulated', demo: true } : null);
  useEffect(() => { if (mode === 'live') api.get<{ stripe: string; demo: boolean }>('/api/health').then(setM).catch(() => setM({ stripe: 'simulated', demo: false })); }, [api, mode]);
  return m;
}
const money = (c: number) => `$${(c / 100).toFixed(0)}`;
const perWeek = (n: number) => (n >= 99 ? 'Every submission reviewed' : `${n} written review${n === 1 ? '' : 's'}/week`);

export function TierPicker({ p, value, onChange }: { p: Player; value: Tier; onChange: (t: Tier) => void }) {
  const s = useSnap();
  return <div className="planpick" role="radiogroup" aria-label="Plan">{TIERS.map((t) => { const b = checkoutBlock(s, p, t); const full = !!b?.waitlist && t === 'Inner Circle'; return (
    <button type="button" key={t} role="radio" aria-checked={value === t} disabled={full} className={`plan ${value === t ? 'on' : ''}`} onClick={() => onChange(t)}>
      <b>{t}</b><span className="pp">${TIER_INFO[t].price}<small>/mo</small></span><span className="small">{perWeek(s.settings.reviewsPerWeek?.[t] ?? 99)}</span><span className="small">Replies {replyLabel(s.settings.sla[t])}</span>{full && <span className="small errtext">Full ({capacity(s).inner}/{capacity(s).innerMax})</span>}
    </button>); })}</div>;
}

/** Start checkout: the server checks the roster cap, then hands back Stripe Checkout (or the test-mode simulator). */
export function PayButton({ p, tier, label = 'Continue to secure checkout' }: { p: Player; tier: Tier; label?: string }) {
  const { api } = useStore(); const go = useGo(); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return <><button type="button" className="btn lg" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { const r = await api.post<{ url: string }>('/api/billing/checkout', { playerId: p.id, tier }); go(r.url); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>{busy ? 'Opening checkout…' : label}</button>{err && <p className="errtext" role="alert">{err}</p>}</>;
}
export function TestModeNote() { const m = useStripeMode(); if (!m || m.stripe === 'live') return null; return <p className="note small">🧪 {m.stripe === 'simulated' ? 'Test mode: payments are simulated in this build. No card is charged and nothing is sent to Stripe.' : 'Stripe test mode: use card 4242 4242 4242 4242. No real money moves.'}</p>; }

/** Parent → Billing: plan, status, next charge, grace / pause banners, Stripe portal. */
export function BillingPanel({ p }: { p: Player }) {
  const s = useSnap(); const { api, run, refresh } = useStore(); const go = useGo(); const sub = subscriptionOf(s, p.id); const label = billingLabel(s, p); const [tier, setTier] = useState<Tier>(p.tier); const [err, setErr] = useState('');
  const ge = graceEnds(s, sub); const fn = first(p.name); const block = checkoutBlock(s, p, tier); const needsPlan = !isPaid(p) || p.billing === 'canceled' || sub?.cancelAtPeriodEnd;
  const [sp] = useSearchParams(); useEffect(() => { if (sp.get('tab') === 'billing') document.getElementById('billing')?.scrollIntoView(); }, [sp]); useEffect(() => { refresh(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps -- billing changes arrive by webhook, so fetch fresh status on open
  return <section className="panel" id="billing"><h3 className="display">Billing</h3>
    <dl className="dl"><div><dt>Plan</dt><dd>{p.tier} · ${TIER_INFO[p.tier].price}/month</dd></div><div><dt>Status</dt><dd><span className={`pill bill-${label.split(' ')[0].toLowerCase()}`}>{label}</span></dd></div>
      {sub?.currentPeriodEnd && sub.status === 'active' && <div><dt>{sub.cancelAtPeriodEnd ? 'Coaching ends' : 'Next charge'}</dt><dd>{shortWhen(sub.currentPeriodEnd)}</dd></div>}</dl>
    {sub?.status === 'past_due' && !sub.pausedByBilling && ge && <p className="riskbox">Payment failed. Coaching continues until <b>{shortWhen(ge)}</b>; update the card before then to avoid a pause.</p>}
    {sub?.pausedByBilling && p.billing !== 'canceled' && <p className="riskbox">{fn}’s coaching is paused for billing. Progress is saved. It resumes the moment the payment goes through.</p>}
    {p.billing === 'canceled' && <p className="note">Canceled: nothing more is charged. {fn}’s plans, feedback and progress are saved if you come back.</p>}
    {p.billing === 'comp' ? <p className="dim">Complimentary plan: nothing to pay.</p> : <>
      {sub && sub.status !== 'canceled' && <button className="btn" onClick={async () => { setErr(''); try { go((await api.post<{ url: string }>('/api/billing/portal', { playerId: p.id })).url); } catch (e) { setErr((e as Error).message); } }}>Manage billing (change plan, card, cancel)</button>}
      {needsPlan && !['Applied', 'Fit review', 'Waitlist'].includes(p.state) && p.state !== 'Invited' && !(sub?.cancelAtPeriodEnd) && <><p className="small dim">{p.billing === 'canceled' ? 'Restart coaching:' : 'Choose the plan and pay:'}</p><TierPicker p={p} value={tier} onChange={setTier} />{block?.waitlist && p.billing === 'canceled' ? <><p className="errtext">{block.error}</p><button className="btn" onClick={() => run({ type: 'joinWaitlist', playerId: p.id })}>Join the waitlist</button></> : <PayButton p={p} tier={tier} label={p.billing === 'canceled' ? 'Restart with secure checkout' : 'Pay with secure checkout'} />}</>}
      {p.state === 'Waitlist' && <p className="dim">On the waitlist. When a spot opens we email a link held for {s.settings.offerHours ?? 48} hours.</p>}
      {err && <p className="errtext" role="alert">{err}</p>}
      <p className="small dim">Cancel anytime: coaching continues to the end of the month you paid for. If a payment fails, coaching keeps going for {s.settings.graceDays ?? 7} days while you fix the card. <button className="link small" onClick={() => refresh()}>Refresh status</button></p>
      <TestModeNote /></>}
  </section>;
}

function SimFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <main id="main" tabIndex={-1} className="flow stripe-sim"><div className="flowtop"><Logo light /><span className="pill testpill">TEST MODE</span></div><div className="flowbody"><div className="fcard pop authcard"><p className="kicker orange">Simulated Stripe · nothing is charged</p><h1 className="display">{title}</h1>{children}</div></div></main>;
}
/** Test-mode stand-in for Stripe Checkout. Real deployments with STRIPE_SECRET_KEY never show this page. */
export function CheckoutSim() {
  const s = useSnap(); const { api, refresh } = useStore(); const nav = useNavigate(); const [sp] = useSearchParams(); const p = s.players.find((x) => x.id === sp.get('p'));
  const tier = (TIERS.includes(sp.get('tier') as Tier) ? sp.get('tier') : p?.tier) as Tier; const [card, setCard] = useState('4242 4242 4242 4242'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!p) return <SimFrame title="Checkout"><p>Player not found.</p></SimFrame>;
  const back = p.state === 'Onboarding' ? `/welcome?p=${p.id}` : `/parent?p=${p.id}&tab=billing`;
  const pay = async () => {
    setBusy(true); setErr('');
    if (card.replace(/\s/g, '') === '4000000000000002' || card.replace(/\s/g, '') === '4000000000000341') { setErr('Your card was declined. (Stripe test card: try 4242 4242 4242 4242.)'); setBusy(false); return; }
    try { await api.post('/api/billing/simulate', { playerId: p.id, outcome: 'checkout', tier }); await refresh(); nav(`${back}&paid=1`); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return <SimFrame title={`Subscribe: ${tier}`}>
    <p className="lead"><b>${TIER_INFO[tier].price}.00</b> per month · {p.name} · {family(s, p).parentName}</p>
    <p className="small dim">{perWeek(s.settings.reviewsPerWeek?.[tier] ?? 99)} · replies {replyLabel(s.settings.sla[tier])} · cancel anytime</p>
    <form onSubmit={(e) => { e.preventDefault(); pay(); }}>
      <label htmlFor="cc">Card number (test)</label><input id="cc" className="input" value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" />
      <div className="row gap"><input aria-label="Expiry" className="input" defaultValue="12 / 34" /><input aria-label="CVC" className="input" defaultValue="123" /></div>
      {err && <p className="errtext" role="alert">{err}</p>}
      <button className="btn lg" disabled={busy}>{busy ? 'Processing…' : `Subscribe · $${TIER_INFO[tier].price}/mo`}</button>
    </form>
    <p className="small dim">This simulator sends Stripe-shaped, signed webhook events through the same handler production uses: checkout.session.completed, then invoice.paid. Decline test: 4000 0000 0000 0002.</p>
    <Link className="small link" to={back}>← Cancel and go back</Link>
  </SimFrame>;
}
/** Test-mode stand-in for the Stripe Customer Portal. */
export function PortalSim() {
  const s = useSnap(); const { api, refresh } = useStore(); const nav = useNavigate(); const [sp] = useSearchParams(); const p = s.players.find((x) => x.id === sp.get('p')); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  if (!p) return <SimFrame title="Billing portal"><p>Player not found.</p></SimFrame>;
  const sub = subscriptionOf(s, p.id); const back = `/parent?p=${p.id}&tab=billing`;
  const act = async (outcome: MockOutcome, done: string) => { setErr(''); try { await api.post('/api/billing/simulate', { playerId: p.id, outcome }); await refresh(); setMsg(done); } catch (e) { setErr((e as Error).message); } };
  return <SimFrame title="Manage billing">
    <p className="lead">{p.name} · <b>{p.tier}</b> · ${TIER_INFO[p.tier].price}/month · {billingLabel(s, p)}</p>
    {sub?.currentPeriodEnd && <p className="small dim">{sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {shortWhen(sub.currentPeriodEnd)}</p>}
    <h3 className="display">Payment method</h3><button className="btn sm" onClick={() => act('invoice_paid', 'Card updated. Outstanding invoice paid.')}>Update card {sub?.status === 'past_due' ? '& pay now' : ''}</button>
    <h3 className="display">Change plan</h3><div className="row gap wrapx">{TIERS.filter((t) => t !== p.tier).map((t) => <button key={t} className="btn sm outline" onClick={() => act(`switch:${t}`, `Switched to ${t}. Review limits and reply windows updated.`)}>Switch to {t} (${TIER_INFO[t].price})</button>)}</div>
    <h3 className="display">Cancel</h3>{sub?.cancelAtPeriodEnd ? <button className="btn sm outline" onClick={() => act('reactivate', 'Cancellation undone.')}>Don’t cancel</button> : <button className="btn sm outline danger" onClick={() => act('cancel', 'Canceled. Coaching continues to the end of the paid month.')}>Cancel plan</button>}
    {msg && <p className="note" role="status">{msg}</p>}{err && <p className="errtext" role="alert">{err}</p>}
    <p><button className="link" onClick={() => nav(back)}>← Return to Baller Connection</button></p>
  </SimFrame>;
}

/** /magic?token=…: verify once (StrictMode-safe), start the session, go home. */
export function MagicVerify() {
  const { api, refresh, mode } = useStore(); const [sp] = useSearchParams(); const nav = useNavigate(); const [err, setErr] = useState(''); const once = useRef(false);
  useEffect(() => { if (once.current || mode === 'demo') return; once.current = true; api.post<{ user: { role: string } }>('/api/auth/magic/verify', { token: sp.get('token') ?? '' }).then(async (r) => { await refresh(); nav(homeFor(r.user.role), { replace: true }); }).catch((e) => setErr((e as Error).message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <main id="main" tabIndex={-1} className="flow"><div className="flowtop"><Logo light /></div><div className="flowbody"><div className="fcard pop authcard"><h1 className="display">{err ? 'Link didn’t work' : mode === 'demo' ? 'Demo build' : 'Signing you in…'}</h1>{err && <><p className="errtext" role="alert">{err}</p><Link className="btn" to="/login">Get a new link</Link></>}{mode === 'demo' && <p>Sign-in links work on the live server. Use the demo bar here.</p>}</div></div></main>;
}
/** “Email me a sign-in link”: same answer whether or not the email has an account. */
export function MagicLinkForm({ initial = '' }: { initial?: string }) {
  const { api } = useStore(); const [email, setEmail] = useState(initial); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  return <form className="magic" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { const r = await api.post<{ message: string }>('/api/auth/magic', { email }); setMsg(r.message); } catch (x) { setErr((x as Error).message); } }}>
    <label htmlFor="ml">Email</label><input id="ml" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@family.com" />
    <button className="btn outline" disabled={!email.includes('@')}>Email me a sign-in link</button>
    {msg && <p className="note" role="status">{msg}</p>}{err && <p className="errtext" role="alert">{err}</p>}
    <p className="small dim">No password needed. The link works once, for 15 minutes.</p></form>;
}

/** Email settings + sign out everywhere. */
export function AccountPage() {
  const s = useSnap(); const { as, run, api, mode, refresh } = useStore(); const nav = useNavigate(); const u = s.users.find((x) => x.id === as?.id);
  const [f, setF] = useState<EmailPrefs>({ ...DEFAULT_PREFS, ...(u?.prefs ?? {}) }); const [saved, setSaved] = useState(false);
  const hours = Array.from({ length: 24 }, (_, h) => h); const hl = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
  return <div className="appshell"><header className="apph"><Logo light /><UserMenu /></header><main id="main" tabIndex={-1} className="appmain">
    <p className="kicker">Account</p><h1 className="display">Email & sign-in</h1>
    <form className="panel" onSubmit={async (e) => { e.preventDefault(); if (await run({ type: 'setEmailPrefs', prefs: f })) setSaved(true); }}>
      <h3 className="display">Email settings</h3><p className="small dim">Account email (sign-in links, invites, consent, payments, spot offers) always arrives. Everything else is your call, and each email has a one-click unsubscribe link.</p>
      {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((k) => <label key={k} className="check"><input type="checkbox" checked={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.checked }); setSaved(false); }} /> {CATEGORY_LABEL[k]}</label>)}
      <h3 className="display">Quiet hours</h3><p className="small dim">Non-essential email waits until quiet hours end (program time, {s.settings.timezone ?? 'America/Chicago'}). Same start and end = off.</p>
      <div className="row gap"><label htmlFor="qs">From</label><select id="qs" className="input" value={f.quietStart} onChange={(e) => setF({ ...f, quietStart: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{hl(h)}</option>)}</select><label htmlFor="qe">to</label><select id="qe" className="input" value={f.quietEnd} onChange={(e) => setF({ ...f, quietEnd: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{hl(h)}</option>)}</select></div>
      <div className="row gap"><button className="btn">Save email settings</button>{saved && <span className="small" role="status">Saved ✓</span>}</div>
    </form>
    <section className="panel"><h3 className="display">Sign-in</h3><p className="small dim">Sign in with a password or an emailed link (15 minutes, single use). Players under 13 use the username + PIN a parent sets.</p>
      {mode === 'live' ? <button className="btn outline" onClick={async () => { if (!confirm('Sign out on every device, including this one?')) return; await api.post('/api/auth/logout-all', {}); await refresh(); nav('/login'); }}>Sign out everywhere</button> : <p className="note small">Demo build: no real sessions. On the live server this button ends every session for your account.</p>}
    </section>
    <Link className="small link" to={homeFor(as?.role)}>← Back</Link>
  </main></div>;
}

/** Coach/ops billing view: MRR, per-family status, and (test mode) the simulator. */
export function CoachBilling() {
  const s = useSnap(); const { api, run, refresh } = useStore(); const m = useStripeMode(); const [err, setErr] = useState('');
  const roster = s.players.filter((p) => !['Applied', 'Fit review'].includes(p.state)); const c = capacity(s);
  const count = (l: string) => roster.filter((p) => billingLabel(s, p) === l).length;
  const sim = async (pid: string, outcome: MockOutcome) => { setErr(''); try { await api.post('/api/billing/simulate', { playerId: pid, outcome }); await refresh(); } catch (e) { setErr((e as Error).message); } };
  return <><h1 className="display">Billing</h1><p className="dim">Stripe is the source of truth; webhooks keep this in sync. Status drives coaching: a plan change updates review limits and reply windows, a failed payment gets a {s.settings.graceDays ?? 7}-day grace, then coaching pauses; a cancellation ends access at period end and offers the spot to the waitlist.</p>
    <div className="stats"><div><b>{money(mrr(s))}</b><span>MRR</span></div><div><b>{count('Active') + count('Ends at period end')}</b><span>active</span></div><div><b>{count('Past due (grace)') + count('Paused (payment)')}</b><span>past due</span></div><div><b>{count('Canceled')}</b><span>canceled</span></div><div><b>{c.used}/{c.max}</b><span>roster · IC {c.inner}/{c.innerMax}</span></div></div>
    {err && <p className="errtext" role="alert">{err}</p>}
    <div className="ttable billtable" role="table" aria-label="Billing by family"><div className="trow head" role="row"><span>Player · family</span><span>Plan</span><span>Status</span><span>Next / grace</span><span>MRR</span>{m?.stripe === 'simulated' && <span>Test-mode simulator</span>}</div>
      {roster.map((p) => { const sub = subscriptionOf(s, p.id); const l = billingLabel(s, p); const ge = graceEnds(s, sub); return <div className="trow" role="row" key={p.id}>
        <span><b>{p.name}</b><span className="small dim block">{family(s, p).parentName} · {p.state}</span></span><span>{p.tier}<span className="small dim block">${TIER_INFO[p.tier].price}/mo</span></span>
        <span><span className={`pill bill-${l.split(' ')[0].toLowerCase()}`}>{l}</span></span>
        <span className="small">{sub?.status === 'past_due' && ge ? `Grace ends ${shortWhen(ge)}` : sub?.currentPeriodEnd && sub.status === 'active' ? `${sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${shortWhen(sub.currentPeriodEnd)}` : '—'}</span>
        <span>{sub && (sub.status === 'active' || sub.status === 'past_due') ? money(PRICE_CENTS[sub.tier]) : '—'}</span>
        {m?.stripe === 'simulated' && <span className="row gap wrapx">{sub && sub.status === 'active' && <button className="chip" onClick={() => sim(p.id, 'invoice_failed')}>Simulate failed payment</button>}{sub?.status === 'past_due' && <button className="chip" onClick={() => sim(p.id, 'invoice_paid')}>Payment recovers</button>}{sub && sub.status !== 'canceled' && <button className="chip" onClick={() => sim(p.id, 'cancel_now')}>End subscription</button>}</span>}
      </div>; })}</div>
    {m?.demo && <p className="row gap"><button className="btn sm outline" onClick={() => run({ type: 'advanceClock', hours: 24 * 8 })}>⏩ +8 days (grace check)</button><span className="small dim">Demo clock: runs the same sweep as the cron job.</span></p>}
    <TestModeNote />
  </>;
}

/** Staff outbox: every email with status, retries and the dead-letter list; text + HTML preview. */
export function Outbox() {
  const s = useSnap(); const { api, mode } = useStore(); const [list, setList] = useState<OutboxEmail[] | null>(null); const [open, setOpen] = useState<string | null>(null); const [f, setF] = useState<'all' | 'queued' | 'delivered' | 'dead'>('all'); const [tick, setTick] = useState(0);
  useEffect(() => { api.get<OutboxEmail[]>('/api/outbox').then(setList).catch(() => setList([])); }, [api, s.version, tick]);
  const shown = (list ?? []).filter((m) => f === 'all' || (f === 'queued' && m.status === 'queued') || (f === 'delivered' && (m.status === 'sent' || m.status === 'logged')) || (f === 'dead' && (m.status === 'dead' || m.status === 'failed')));
  const n = (k: typeof f) => (list ?? []).filter((m) => k === 'queued' ? m.status === 'queued' : k === 'delivered' ? m.status === 'sent' || m.status === 'logged' : k === 'dead' ? m.status === 'dead' || m.status === 'failed' : true).length;
  return (<><h1 className="display">Outbox</h1><p className="dim">{mode === 'live' ? 'Every email the system sends, with its delivery status from the provider.' : 'Demo: emails are logged here instead of sent.'} <b>logged</b> = the dev log provider (nothing left the server); <b>sent</b> = Resend/Postmark accepted it; <b>queued</b> = waiting (quiet hours or a retry); <b>dead</b> = gave up after 5 attempts.</p>
    <div className="seg light" role="tablist">{(['all', 'queued', 'delivered', 'dead'] as const).map((k) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{k === 'dead' ? 'Dead letter' : k[0].toUpperCase() + k.slice(1)} ({n(k)})</button>)}</div>
    <ol className="queue">{shown.map((m) => <li key={m.id} className="panel mail"><button className="row gap mailrow" onClick={() => setOpen(open === m.id ? null : m.id)}><span className={`pill st-${m.status}`}>{m.status}</span><strong className="grow">{m.subject}</strong><span className="small dim">{m.to} · {m.kind}{m.category ? ` · ${m.category}` : ''} · {shortWhen(m.at)}</span></button>
      {(m.attempts ?? 0) > 0 && m.status !== 'sent' && m.status !== 'logged' && <p className="small errtext">Attempts {m.attempts}{m.lastError ? ` · ${m.lastError}` : ''}{m.sendAfter && m.status === 'queued' ? ` · next try ${shortWhen(m.sendAfter)}` : ''}</p>}
      {m.status === 'queued' && !(m.attempts ?? 0) && m.sendAfter && <p className="small dim">Held for quiet hours until {shortWhen(m.sendAfter)}</p>}
      {mode === 'live' && (m.status === 'dead' || m.status === 'failed') && <button className="chip" onClick={async () => { await api.post('/api/outbox/retry', { id: m.id }); setTick(tick + 1); }}>Retry now</button>}
      {open === m.id && <div className="mailprev"><pre className="mailbody">{m.body}</pre>{m.html && <iframe title={`HTML preview: ${m.subject}`} sandbox="" className="mailhtml" srcDoc={m.html} />}</div>}</li>)}
      {shown.length === 0 && <li className="dim">No emails here.</li>}</ol></>);
}
