import { describe, expect, it } from 'vitest';
import type { Command, Snapshot } from '../shared/domain';
import { dispatch } from '../shared/engine';
import type { Actor } from '../shared/permissions';
import { seed, DEMO_INVITE } from '../shared/seed';
import { CATEGORY, quietUntil, render, wants, type EmailKind } from '../shared/emails';
import { checkoutBlock, mockStripeEvents, mockPriceToTier, mrr, stripeToCommand, subscriptionOf } from '../shared/billing';
import { reviewsAllowed } from '../shared/promises';
import { capacity, clock, tierReply } from '../shared/workflow';
import { deliver, queueEmail, runCommand, unsubscribeUrl } from '../server/app';
import { signStripe, verifyStripe, StripeClient, form } from '../server/stripe';
import { makeProvider } from '../server/email';
import { Repo } from '../server/repo';
import { client, login, makeEnv } from './helpers';

const SYS: Actor = { id: 'system', role: 'system' }; const HEAD: Actor = { id: 'u_head', role: 'head' }; const OPS: Actor = { id: 'u_ops', role: 'ops' };
const CHRIS: Actor = { id: 'u_chris', role: 'parent', familyId: 'f_moss' };
const run = (s: Snapshot, a: Actor, ...cs: Command[]) => cs.reduce((x, c) => dispatch(x, c, a).snapshot, s);
const P = (s: Snapshot, id: string) => s.players.find((p) => p.id === id)!;
const raw = (env: { DB: unknown }) => (env.DB as { raw: { exec: (q: string) => { values: unknown[][] }[] } }).raw;
const bill = (eventId: string, kind: Extract<Command, { type: 'billingEvent' }>['kind'], playerId: string, extra: Partial<Extract<Command, { type: 'billingEvent' }>> = {}): Command => ({ type: 'billingEvent', eventId, kind, playerId, ...extra });

describe('magic-link sign-in', () => {
  const token = (body: string) => body.match(/magic\?token=([a-f0-9]+)/)![1];
  it('stores only a hash, works once, expires, and rotates the session', async () => {
    const env = await makeEnv(); const c = await login(env, 'dana@demo.test'); const before = c.cookie!;
    expect((await client(env).post('/api/auth/magic', { email: 'dana@demo.test' })).status).toBe(200);
    const mail = (await (await login(env, 'head@demo.test')).get('/api/outbox')).body.find((m: { kind: string }) => m.kind === 'magic-link'); expect(mail.to).toBe('dana@demo.test'); expect(mail.html).toContain('#FF5E1A');
    const tok = token(mail.body); expect(tok).toHaveLength(64);
    const stored = raw(env).exec('SELECT token_hash, expires_at FROM magic_tokens')[0].values; expect(stored).toHaveLength(1); expect(stored[0][0]).not.toBe(tok); expect(JSON.stringify(stored)).not.toContain(tok);
    expect(new Date(String(stored[0][1])).getTime() - Date.now()).toBeLessThanOrEqual(15 * 6e4); expect(new Date(String(stored[0][1])).getTime() - Date.now()).toBeGreaterThan(14 * 6e4);
    const v = await c.post('/api/auth/magic/verify', { token: tok }); expect(v.status).toBe(200); expect(v.body.user.role).toBe('parent'); expect(c.cookie).not.toBe(before);
    expect((await client(env, before).get('/api/auth/me')).status).toBe(401); // old session token is gone (upgrade = rotation)
    const again = await client(env).post('/api/auth/magic/verify', { token: tok }); expect(again.status).toBe(400); expect(again.body.error).toMatch(/already used/);
    await client(env).post('/api/auth/magic', { email: 'chris@demo.test' }); const t2 = token((await (await login(env, 'head@demo.test')).get('/api/outbox')).body.find((m: { to: string; kind: string }) => m.kind === 'magic-link' && m.to === 'chris@demo.test').body);
    raw(env).exec("UPDATE magic_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE used_at IS NULL");
    const exp = await client(env).post('/api/auth/magic/verify', { token: t2 }); expect(exp.status).toBe(400); expect(exp.body.error).toMatch(/expired/);
    expect((await client(env).post('/api/auth/magic/verify', { token: 'f'.repeat(64) })).body.error).toMatch(/isn’t valid/);
  });
  it('same answer for unknown emails; rate limited per email+IP; under-13 players get no link', async () => {
    const env = await makeEnv(); const a = await client(env).post('/api/auth/magic', { email: 'nobody@nowhere.test' }); const b = await client(env).post('/api/auth/magic', { email: 'dana@demo.test' });
    expect(a.status).toBe(b.status); expect(a.body).toEqual(b.body);
    for (const email of ['nobody@nowhere.test', 'dana@demo.test']) { const codes = []; for (let i = 0; i < 3; i++) codes.push((await client(env).post('/api/auth/magic', { email })).status); expect(codes).toEqual([200, 200, 429]); }
    raw(env).exec("UPDATE users SET email = 'sam@demo.test' WHERE id = 'u_sam'"); // Sam is 12
    expect((await client(env).post('/api/auth/magic', { email: 'sam@demo.test' })).status).toBe(200); expect((await client(env).post('/api/auth/magic', { email: 'riley@demo.test' })).status).toBe(200);
    const users = raw(env).exec('SELECT user_id FROM magic_tokens')[0].values.map((r) => r[0]); expect(users).toContain('u_riley'); expect(users).not.toContain('u_sam');
    expect((await login(env, 'sam.quill', '1234', true)).cookie).toBeTruthy(); // PIN fallback still works
  });
  it('sign out everywhere ends every session; a password reset does too; invites can be passwordless', async () => {
    const env = await makeEnv(); const one = await login(env, 'dana@demo.test'); const two = await login(env, 'dana@demo.test');
    expect((await one.post('/api/auth/logout-all')).status).toBe(200); expect((await two.get('/api/auth/me')).status).toBe(401); expect((await one.get('/api/auth/me')).status).toBe(401);
    expect((await login(env, 'dana@demo.test')).cookie).toBeTruthy(); // password fallback intact
    const fam = client(env); const r = await fam.post('/api/auth/accept-invite', { token: DEMO_INVITE.token, parentName: 'Robin Banks', email: 'robin@demo.test' }); expect(r.status).toBe(200);
    expect((await client(env).post('/api/auth/login', { login: 'robin@demo.test', password: '' })).status).toBe(401); // no password set: links only
    await client(env).post('/api/auth/magic', { email: 'robin@demo.test' }); expect(raw(env).exec("SELECT COUNT(*) FROM magic_tokens WHERE user_id = (SELECT id FROM users WHERE email = 'robin@demo.test')")[0].values[0][0]).toBe(1);
  });
});

describe('email templates', () => {
  const kinds = Object.keys(CATEGORY) as EmailKind[];
  it('every template renders text + branded HTML; essential mail has no unsubscribe, the rest do', () => {
    for (const k of kinds) {
      const r = render(k, { player: 'Avery <b>Pine</b>', playerFirst: 'Avery', token: 'abc', code: '123456', tier: 'Development', price: 139, amount: 13900, coach: 'Jamie', coachFirst: 'Jamie', rep: 'Weak-hand', snippet: 'Stay low', expires: 'Tue 5 PM', graceEnds: 'Mon', name: 'Dana', count: 2, items: '• a\n• b', text: 'Week text', playerId: 'avery', from: 'Dana', due: 'Tue', when: 'Tue', role: 'ops', reason: 'canceled', parent: 'Dana' });
      expect(r.subject.length).toBeGreaterThan(3); expect(r.text.length).toBeGreaterThan(10); expect(r.html).toContain('#0A1430'); expect(r.html).toContain('BALLER');
      expect(r.html).not.toContain('<b>Pine</b>'); // escaped
      expect(r.text.includes('{{UNSUB}}')).toBe(CATEGORY[k] !== 'essential'); expect(r.html.includes('{{UNSUB}}')).toBe(CATEGORY[k] !== 'essential');
    }
    expect(kinds).toEqual(expect.arrayContaining(['magic-link', 'invite', 'consent-request', 'feedback-ready', 'focus-nudge', 'reply-needed', 'parent-digest', 'plan-drop', 'payment-receipt', 'payment-failed', 'waitlist-open']));
    const inv = render('invite', { token: 'tok123', code: '246810', player: 'Theo', tier: 'Foundation', price: 69, expires: 'x' }).text; expect(inv).toContain('{{APP}}/#/invite?token=tok123'); expect(inv).toContain('code 246810');
    expect(render('payment-receipt', { amount: 13900, tier: 'Development', player: 'Avery' }).text).toContain('$139.00');
  });
});

describe('preferences, quiet hours, unsubscribe', () => {
  it('engine skips categories a user turned off (essential always goes) and stamps notifications it emailed', () => {
    let s = run(seed(), CHRIS, { type: 'setEmailPrefs', prefs: { coaching: false, quietStart: 0, quietEnd: 0 } });
    s = run(s, { id: 'u_riley', role: 'player', playerId: 'riley', familyId: 'f_moss' }, { type: 'setEmailPrefs', prefs: { quietStart: 0, quietEnd: 0 } });
    s = run(s, HEAD, { type: 'review', playerId: 'riley', decision: 'approve', wentWell: 'Feet set', adjust: 'Hold the follow-through', why: 'Arc' });
    const fr = s.outbox.filter((m) => m.kind === 'feedback-ready'); expect(fr.map((m) => m.to)).toEqual(['riley@demo.test']); expect(fr[0].sendAfter).toBeNull();
    const n = s.notifications.filter((x) => x.type === 'feedback_ready' && x.playerId === 'riley'); expect(n.find((x) => x.userId === 'u_riley')!.emailedAt).toBeTruthy(); expect(n.find((x) => x.userId === 'u_chris')!.emailedAt).toBeFalsy();
    expect(wants({ coaching: false }, 'essential')).toBe(true); expect(wants({ coaching: false }, 'coaching')).toBe(false);
    expect(() => run(s, CHRIS, { type: 'setEmailPrefs', prefs: { quietStart: 25 } })).toThrow(/0–23/);
  });
  it('quiet hours hold non-essential mail until they end (program time zone)', () => {
    const late = new Date('2026-10-12T03:00:00Z'); // 10 PM CDT
    expect(quietUntil(late, null, 'coaching')).toBe('2026-10-12T12:00:00.000Z'); expect(quietUntil(late, null, 'essential')).toBeNull();
    expect(quietUntil(new Date('2026-10-12T18:00:00Z'), null, 'digest')).toBeNull(); expect(quietUntil(late, { quietStart: 0, quietEnd: 0 }, 'coaching')).toBeNull();
  });
  it('signed one-click unsubscribe: GET confirms, POST flips the preference, tampered links fail; provider gets List-Unsubscribe headers', async () => {
    const env = await makeEnv({ APP_URL: 'https://app.test', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }); await runCommand(env, SYSTEM_OF(), { type: 'setEmailPrefs', userId: 'u_dana', prefs: { quietStart: 0, quietEnd: 0 } });
    const url = await unsubscribeUrl(env, 'u_dana', 'digest'); const path = url.replace('https://app.test', '');
    const g = await client(env).get(path); expect(g.status).toBe(200); expect(String(g.body)).toContain('Unsubscribe from the weekly parent digest?');
    expect(String((await client(env).post(path.replace(/s=\w+/, 's=deadbeef'))).body)).toContain('Link not valid');
    expect(String((await client(env).post(path)).body)).toContain('You’re unsubscribed'); const head = await login(env, 'head@demo.test');
    const dana = (await head.get('/api/snapshot')).body.snapshot.users.find((u: { id: string }) => u.id === 'u_dana'); expect(dana.prefs.digest).toBe(false); expect(dana.prefs.coaching).toBe(true);
    const sent: { url: string; body: Record<string, unknown> }[] = []; const fake = (async (u: string, init: RequestInit) => { sent.push({ url: u, body: JSON.parse(String(init.body)) }); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    await queueEmail(env, 'feedback-ready', 'dana@demo.test', { player: 'Avery', coach: 'Jamie', rep: 'x', snippet: 'y' }, 'u_dana'); await deliver(env, fake);
    const m = sent.find((x) => (x.body.subject as string).includes('Feedback is in'))!; expect(m.url).toBe('https://api.resend.com/emails'); expect(m.body.html).toContain('https://app.test/#/app');
    expect((m.body.headers as Record<string, string>)['List-Unsubscribe']).toMatch(/^<https:\/\/app\.test\/api\/unsubscribe\?u=u_dana&c=coaching&s=[a-f0-9]{32}>$/); expect((m.body.headers as Record<string, string>)['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.body.text).not.toContain('{{'); expect(await queueEmail(env, 'parent-digest', 'dana@demo.test', { playerFirst: 'Avery', text: 'x' }, 'u_dana')).toBe(false); // digest is off now
  });
});
const SYSTEM_OF = (): Actor => ({ id: 'system', role: 'system' });

describe('delivery retries and dead letter', () => {
  it('backs off on provider errors, dead-letters after 5 attempts (or a permanent 4xx), and staff can retry', async () => {
    const env = await makeEnv({ EMAIL_PROVIDER: 'postmark', POSTMARK_SERVER_TOKEN: 'pm_test' }); await runCommand(env, SYSTEM_OF(), { type: 'sweep' });
    let status = 503; const fake = (async () => new Response('nope', { status })) as unknown as typeof fetch;
    await queueEmail(env, 'password', 'ops@demo.test', { token: 'x', hours: 2 }, 'u_ops'); await deliver(env, fake);
    const row = () => raw(env).exec("SELECT status, attempts, send_after, last_error, id FROM outbox WHERE kind = 'password'")[0].values[0];
    expect(row()[0]).toBe('queued'); expect(row()[1]).toBe(1); expect(new Date(String(row()[2])).getTime()).toBeGreaterThan(Date.now() + 50e3); expect(row()[3]).toMatch(/Postmark 503/);
    for (let i = 0; i < 4; i++) { raw(env).exec("UPDATE outbox SET send_after = NULL WHERE kind = 'password'"); await deliver(env, fake); }
    expect(row()[0]).toBe('dead'); expect(row()[1]).toBe(5);
    const ops = await login(env, 'ops@demo.test'); expect((await ops.get('/api/outbox?status=dead')).body.map((m: { kind: string }) => m.kind)).toContain('password');
    status = 200; await new Repo(env.DB).requeueEmail(String(row()[4])); await deliver(env, fake); expect(row()[0]).toBe('sent');
    expect(raw(env).exec("SELECT body FROM outbox WHERE kind = 'password'")[0].values[0][0]).toContain('token=[sent]'); // secret redacted once a real provider has it
    status = 422; await queueEmail(env, 'staff', 'bad@demo.test', { name: 'x', role: 'ops' }); await deliver(env, fake); expect(raw(env).exec("SELECT status FROM outbox WHERE kind = 'staff'")[0].values[0][0]).toBe('dead');
    env.EMAIL_PROVIDER = 'log'; const dead = (await ops.get('/api/outbox?status=dead')).body[0]; expect((await ops.post('/api/outbox/retry', { id: dead.id })).status).toBe(200); expect(raw(env).exec("SELECT status, attempts FROM outbox WHERE kind = 'staff'")[0].values[0]).toEqual(['logged', 1]);
    expect((await (await login(env, 'dana@demo.test')).post('/api/outbox/retry', { id: dead.id })).status).toBe(403);
    expect(makeProvider({}).name).toBe('log'); expect(makeProvider({ EMAIL_PROVIDER: 'resend' }).name).toBe('log'); // no key → log, never a half-configured send
  });
});

describe('Stripe webhook: signature, idempotency, entitlements', () => {
  const secret = 'whsec_test_123';
  it('verifies signatures (HMAC + timestamp tolerance) and processes each event once', async () => {
    const payload = '{"id":"evt_1"}'; const now = Math.floor(Date.now() / 1000);
    expect(await verifyStripe(payload, await signStripe(payload, secret, now), secret, now)).toBe(true);
    expect(await verifyStripe(payload + ' ', await signStripe(payload, secret, now), secret, now)).toBe(false);
    expect(await verifyStripe(payload, await signStripe(payload, 'other', now), secret, now)).toBe(false);
    expect(await verifyStripe(payload, await signStripe(payload, secret, now - 400), secret, now)).toBe(false);
    expect(await verifyStripe(payload, null, secret, now)).toBe(false);
    const env = await makeEnv({ STRIPE_WEBHOOK_SECRET: secret }); const c = client(env); await runCommand(env, SYSTEM_OF(), { type: 'sweep' });
    const s0 = seed(); const ev = mockStripeEvents(s0, 'avery', 'invoice_failed')[0]; const body = JSON.stringify(ev);
    const post = async (b: string, sig: string) => { const r = await (await import('../server/app')).handle(new Request('http://t/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': sig }, body: b }), env); return { status: r.status, body: await r.json() }; };
    expect((await post(body, 'v1=bad,t=1')).status).toBe(400); void c;
    const first = await post(body, await signStripe(body, secret)); expect(first.status).toBe(200); expect(first.body.duplicate).toBe(false);
    const dup = await post(body, await signStripe(body, secret)); expect(dup.status).toBe(200); expect(dup.body.duplicate).toBe(true);
    expect(raw(env).exec("SELECT COUNT(*) FROM outbox WHERE kind = 'payment-failed'")[0].values[0][0]).toBe(1);
    expect(raw(env).exec("SELECT status, past_due_since IS NOT NULL FROM subscriptions WHERE player_id = 'avery'")[0].values[0]).toEqual(['past_due', 1]);
    expect((await post(JSON.stringify({ id: 'evt_x', type: 'customer.created', data: { object: {} } }), await signStripe(JSON.stringify({ id: 'evt_x', type: 'customer.created', data: { object: {} } }), secret))).body.ignored).toBe('customer.created');
    const head = await login(env, 'head@demo.test'); expect((await head.cmd({ type: 'billingEvent', eventId: 'evt_forged', kind: 'checkout_completed', playerId: 'sam' })).status).toBe(403);
  });
  it('maps real Stripe payload shapes (metadata, price ids, invoices)', () => {
    const toTier = (id?: string | null) => (id === 'price_dev' ? 'Development' as const : null);
    const c = stripeToCommand({ id: 'evt_a', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, metadata: { player_id: 'avery' }, items: { data: [{ current_period_end: 1800000000, price: { id: 'price_dev' } }] } } } }, toTier)!;
    expect(c).toMatchObject({ kind: 'subscription_updated', playerId: 'avery', subscriptionId: 'sub_1', customerId: 'cus_1', tier: 'Development', cancelAtPeriodEnd: true, periodEnd: new Date(1800000000e3).toISOString() });
    const inv = stripeToCommand({ id: 'evt_b', type: 'invoice.paid', data: { object: { customer: 'cus_1', amount_paid: 13900, parent: { subscription_details: { subscription: 'sub_1', metadata: { player_id: 'avery' } } } } } }, toTier)!;
    expect(inv).toMatchObject({ kind: 'invoice_paid', playerId: 'avery', subscriptionId: 'sub_1', amount: 13900 });
    expect(stripeToCommand({ id: 'e', type: 'checkout.session.completed', data: { object: { mode: 'payment' } } }, toTier)).toBeNull();
  });
  it('tier change updates review limits and reply window; past_due → 7-day grace → pause → paid resumes', () => {
    let s = seed(); expect(reviewsAllowed(s, P(s, 'avery'))).toBe(3); expect(tierReply(s, P(s, 'avery'))).toMatch(/1 business day/);
    s = run(s, SYS, bill('e1', 'subscription_updated', 'avery', { tier: 'Foundation', status: 'active' })); expect(P(s, 'avery').tier).toBe('Foundation'); expect(reviewsAllowed(s, P(s, 'avery'))).toBe(1); expect(tierReply(s, P(s, 'avery'))).toMatch(/2 business days/);
    expect(s.events.at(-1)!.detail).toMatch(/Development → Foundation/);
    s = run(s, SYS, bill('e2', 'invoice_failed', 'avery')); const since = subscriptionOf(s, 'avery')!.pastDueSince; expect(P(s, 'avery').billing).toBe('past_due');
    s = run(s, SYS, bill('e3', 'invoice_failed', 'avery')); expect(subscriptionOf(s, 'avery')!.pastDueSince).toBe(since); // a retry failure doesn't extend the grace
    s = run(s, SYS, { type: 'advanceClock', hours: 24 * 6 + 23 }); expect(P(s, 'avery').state).toBe('Work ready');
    s = run(s, SYS, { type: 'advanceClock', hours: 2 }); expect(P(s, 'avery').state).toBe('Paused'); expect(subscriptionOf(s, 'avery')!.pausedByBilling).toBe(true); expect(s.outbox.some((m) => m.kind === 'access-ended')).toBe(true);
    expect(() => run(s, { id: 'u_dana', role: 'parent', familyId: 'f_pine' }, { type: 'resume', playerId: 'avery' })).toThrow(/paused for billing/);
    s = run(s, SYS, bill('e4', 'invoice_paid', 'avery', { amount: 6900 })); expect(P(s, 'avery').state).toBe('Work ready'); expect(P(s, 'avery').billing).toBe('paid'); expect(s.outbox.filter((m) => m.kind === 'payment-receipt')).toHaveLength(1);
  });
  it('cancel keeps access to period end, then ends it; MRR follows status', () => {
    let s = seed(); expect(mrr(s)).toBe(13900 + 22900);
    s = run(s, SYS, bill('c1', 'subscription_updated', 'riley', { status: 'active', cancelAtPeriodEnd: true })); expect(P(s, 'riley').state).toBe('Submitted'); expect(mrr(s)).toBe(13900 + 22900);
    s = run(s, SYS, { type: 'advanceClock', hours: 24 * 10 }); expect(P(s, 'riley').billing).toBe('canceled'); expect(P(s, 'riley').state).toBe('Paused'); expect(mrr(s)).toBe(13900);
    s = run(s, SYS, bill('c2', 'subscription_deleted', 'riley', { status: 'canceled' })); expect(subscriptionOf(s, 'riley')!.status).toBe('canceled');
  });
  it('checkout completed pays the invited family; onboarding needs payment (comp skips)', () => {
    let s = run(seed(), { id: 'public', role: 'public' }, { type: 'acceptInvite', token: DEMO_INVITE.token, parentName: 'Robin Banks', email: 'robin@demo.test', userId: 'u_robin' });
    const ROBIN: Actor = { id: 'u_robin', role: 'parent', familyId: 'f_banks' }; const ob: Command = { type: 'completeOnboarding', playerId: 'theo', position: 'Guard', goal: 'Handle', learnStyle: 'Watch', rhythm: '3 days' };
    s = run(s, ROBIN, { type: 'recordConsent', playerId: 'theo', guardianName: 'Robin Banks', agreed: true }); expect(() => run(s, ROBIN, ob)).toThrow(/pay first/);
    expect(s.outbox.some((m) => m.kind === 'consent-request' && m.to === 'robin@demo.test')).toBe(true);
    const evs = mockStripeEvents(s, 'theo', 'checkout', 'Development'); for (const e of evs) s = run(s, SYS, stripeToCommand(e, mockPriceToTier)!);
    expect(P(s, 'theo').tier).toBe('Development'); expect(P(s, 'theo').billing).toBe('paid'); expect(s.outbox.some((m) => m.kind === 'payment-receipt' && m.to === 'robin@demo.test')).toBe(true);
    expect(run(s, ROBIN, ob).players.find((p) => p.id === 'theo')!.state).toBe('Plan building');
    let c = run(seed(), OPS, { type: 'setBilling', playerId: 'theo', billing: 'comp' }); c = run(c, { id: 'public', role: 'public' }, { type: 'acceptInvite', token: DEMO_INVITE.token, userId: 'u_robin' }); c = run(c, ROBIN, { type: 'recordConsent', playerId: 'theo', guardianName: 'Robin Banks', agreed: true }, ob); expect(P(c, 'theo').state).toBe('Plan building');
  });
});

describe('capacity and waitlist', () => {
  const waitlisted = () => { let s = run(seed(), HEAD, { type: 'updateSettings', patch: { capacity: 5 } }); const ids: string[] = [];
    for (const [n, e] of [['Kai Rook', 'lou@demo.test'], ['Mo Lane', 'pat@demo.test']]) { const r = dispatch(s, { type: 'submitApplication', playerName: n, parentName: 'P', email: e, answers: { age: '13–14', days: '3–4 days', need: 'Plan + regular feedback', goal: 'x' }, next: 'apply' }, { id: 'public', role: 'public' }); ids.push(r.created!.playerId!); s = run(r.snapshot, OPS, { type: 'createInvite', playerId: r.created!.playerId! }); s = { ...s, clockOffsetMs: s.clockOffsetMs + 60e3 }; }
    return { s, ids }; };
  it('blocks checkout when full and offers the waitlist; Inner Circle cap is separate', () => {
    const { s, ids } = waitlisted(); expect(capacity(s).open).toBe(0); expect(P(s, ids[0]).state).toBe('Waitlist');
    expect(checkoutBlock(s, P(s, ids[0]))).toMatchObject({ waitlist: true }); expect(checkoutBlock(s, P(s, 'theo'), 'Foundation')).toBeNull(); expect(checkoutBlock(s, P(s, 'theo'), 'Inner Circle')).toBeNull();
    const ic = run(seed(), HEAD, { type: 'updateSettings', patch: { innerCircleCap: 1 } }); expect(checkoutBlock(ic, P(ic, 'theo'), 'Inner Circle')).toMatchObject({ waitlist: true, error: expect.stringMatching(/Inner Circle is full/) });
    expect(checkoutBlock(ic, P(ic, 'avery'))!.error).toMatch(/Already subscribed/);
    let back = run(s, SYS, bill('x1', 'subscription_deleted', 'riley')); // riley leaves → Kai offered; riley can’t jump back in
    back = run(back, SYS, bill('x2', 'subscription_deleted', 'avery')); expect(P(back, ids[1]).state).toBe('Invited');
    expect(checkoutBlock(back, P(back, 'riley'))).toMatchObject({ waitlist: true }); back = run(back, CHRIS, { type: 'joinWaitlist', playerId: 'riley' }); expect(P(back, 'riley').state).toBe('Waitlist');
  });
  it('a spot opening offers the longest-waiting family a 48 h link; an expired offer goes to the next family', () => {
    const { s, ids } = waitlisted(); let t = run(s, SYS, bill('w1', 'subscription_deleted', 'riley'));
    expect(P(t, ids[0]).state).toBe('Invited'); expect(P(t, ids[1]).state).toBe('Waitlist'); const off = t.outbox.filter((m) => m.kind === 'waitlist-open'); expect(off).toHaveLength(1); expect(off[0].to).toBe('lou@demo.test'); expect(off[0].body).toMatch(/token=[a-f0-9]{48}/);
    t = run(t, SYS, { type: 'advanceClock', hours: 49 }); expect(P(t, ids[0]).state).toBe('Waitlist'); expect(P(t, ids[1]).state).toBe('Invited'); expect(t.outbox.filter((m) => m.kind === 'waitlist-open').map((m) => m.to)).toEqual(['lou@demo.test', 'pat@demo.test']);
    expect(clock(t).getTime()).toBeGreaterThan(clock(s).getTime());
  });
  it('checkout endpoint: 409 + waitlist when Inner Circle is full, simulator URL otherwise; live keys refused; prices required', async () => {
    const env = await makeEnv(); const head = await login(env, 'head@demo.test'); await head.cmd({ type: 'updateSettings', patch: { innerCircleCap: 1 } });
    const fam = client(env); await fam.post('/api/auth/accept-invite', { token: DEMO_INVITE.token, parentName: 'Robin Banks', email: 'robin@demo.test', password: 'robin-pass-1' });
    const full = await fam.post('/api/billing/checkout', { playerId: 'theo', tier: 'Inner Circle' }); expect(full.status).toBe(409); expect(full.body.waitlist).toBe(true);
    const ok = await fam.post('/api/billing/checkout', { playerId: 'theo', tier: 'Foundation' }); expect(ok.status).toBe(200); expect(ok.body.url).toMatch(/#\/checkout\?p=theo&tier=Foundation$/);
    expect((await fam.post('/api/billing/checkout', { playerId: 'avery' })).status).toBe(404); // not their player
    const live = await makeEnv({ STRIPE_SECRET_KEY: 'sk_live_nope' }); const f2 = client(live); await f2.post('/api/auth/accept-invite', { token: DEMO_INVITE.token, parentName: 'R', email: 'r@demo.test', password: 'robin-pass-1' });
    expect((await f2.post('/api/billing/checkout', { playerId: 'theo' })).body.error).toMatch(/test mode only/);
    expect((await f2.post('/api/billing/simulate', { playerId: 'theo', outcome: 'checkout' })).status).toBe(403);
    const test = await makeEnv({ STRIPE_SECRET_KEY: 'sk_test_x' }); const f3 = client(test); await f3.post('/api/auth/accept-invite', { token: DEMO_INVITE.token, parentName: 'R', email: 'r@demo.test', password: 'robin-pass-1' });
    expect((await f3.post('/api/billing/checkout', { playerId: 'theo' })).body.error).toMatch(/STRIPE_PRICE/);
  });
  it('Stripe client sends metadata on the session and the subscription (form-encoded)', async () => {
    let seen: { url: string; body: string; headers: Record<string, string> } | null = null;
    const fake = (async (u: string, init: RequestInit) => { seen = { url: u, body: String(init.body), headers: init.headers as Record<string, string> }; return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await new StripeClient('sk_test_123', fake).checkout({ price: 'price_f', playerId: 'theo', tier: 'Foundation', email: 'robin@demo.test', successUrl: 'https://a/#/welcome?p=theo&paid=1', cancelUrl: 'https://a/#/welcome?p=theo' });
    expect(r.url).toContain('checkout.stripe.com'); const b = decodeURIComponent(seen!.body); expect(seen!.url).toBe('https://api.stripe.com/v1/checkout/sessions'); expect(seen!.headers.authorization).toBe('Bearer sk_test_123');
    for (const x of ['mode=subscription', 'metadata[player_id]=theo', 'subscription_data[metadata][player_id]=theo', 'line_items[0][price]=price_f', 'customer_email=robin@demo.test']) expect(b).toContain(x);
    expect(form({ a: { b: 1 }, c: null })).toEqual(['a%5Bb%5D=1']);
  });
});
