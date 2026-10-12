import { TIER_INFO, type BillingEventKind, type Command, type Player, type Snapshot, type Subscription, type Tier } from './domain';
import { capacity, clock, PRE_ROSTER } from './workflow';

/** v6 billing rules shared by the engine, the server (Stripe) and the browser demo. Stripe is the source of truth; these rules decide entitlements. */
export const TIERS: Tier[] = ['Foundation', 'Development', 'Inner Circle'];
export const PRICE_CENTS: Record<Tier, number> = { Foundation: TIER_INFO.Foundation.price * 100, Development: TIER_INFO.Development.price * 100, 'Inner Circle': TIER_INFO['Inner Circle'].price * 100 };
export const PRICE_ENV: Record<Tier, 'STRIPE_PRICE_FOUNDATION' | 'STRIPE_PRICE_DEVELOPMENT' | 'STRIPE_PRICE_INNER_CIRCLE'> = { Foundation: 'STRIPE_PRICE_FOUNDATION', Development: 'STRIPE_PRICE_DEVELOPMENT', 'Inner Circle': 'STRIPE_PRICE_INNER_CIRCLE' };
export const subscriptionOf = (s: Snapshot, playerId: string): Subscription | undefined => (s.subscriptions ?? []).find((x) => x.playerId === playerId);
export const isPaid = (p: Player) => p.billing === 'paid' || p.billing === 'comp' || p.billing === 'past_due';
export const graceEnds = (s: Snapshot, sub?: Subscription) => (sub?.pastDueSince ? new Date(new Date(sub.pastDueSince).getTime() + (s.settings.graceDays ?? 7) * 864e5).toISOString() : null);

/** Monthly recurring revenue (cents): active and in-grace subscriptions. */
export function mrr(s: Snapshot) { return (s.subscriptions ?? []).filter((x) => x.status === 'active' || x.status === 'past_due').reduce((a, x) => a + PRICE_CENTS[x.tier], 0); }
export type BillingLabel = 'Active' | 'Ends at period end' | 'Past due (grace)' | 'Paused (payment)' | 'Canceled' | 'Comp' | 'Not paid yet' | 'Paused in billing';
export function billingLabel(s: Snapshot, p: Player): BillingLabel {
  if (p.billing === 'comp') return 'Comp'; const sub = subscriptionOf(s, p.id);
  if (!sub || sub.status === 'incomplete') return p.billing === 'paid' ? 'Active' : 'Not paid yet';
  if (sub.status === 'canceled' || p.billing === 'canceled') return 'Canceled';
  if (sub.status === 'paused') return 'Paused in billing';
  if (sub.status === 'past_due') return sub.pausedByBilling ? 'Paused (payment)' : 'Past due (grace)';
  return sub.cancelAtPeriodEnd ? 'Ends at period end' : 'Active';
}

export interface CheckoutBlock { error: string; waitlist?: boolean }
/** Why checkout can't start for this player/tier right now (null = go). Roster cap: 15 total, 4 Inner Circle. */
export function checkoutBlock(s: Snapshot, p: Player, tier: Tier = p.tier): CheckoutBlock | null {
  const c = capacity(s); const sub = subscriptionOf(s, p.id);
  if (p.billing === 'comp') return { error: `${p.name} is complimentary: no payment needed.` };
  if (sub && (sub.status === 'active' || sub.status === 'past_due') && !sub.cancelAtPeriodEnd) return { error: 'Already subscribed. Use “Manage billing” to change plan, update the card or cancel.' };
  if (p.state === 'Waitlist') return { error: `The roster is full (${c.used}/${c.max}). ${p.name} is on the waitlist; we’ll email a time-limited link the moment a spot opens.`, waitlist: true };
  if (PRE_ROSTER.includes(p.state)) return { error: 'Payment opens after the fit review, once you have an invite.' };
  const returning = p.billing === 'canceled'; // a canceled player no longer holds a roster spot
  if (returning && c.open <= 0) return { error: `The roster is full right now (${c.used}/${c.max}). Join the waitlist and we’ll email you when a spot opens.`, waitlist: true };
  const innerTaken = c.inner - (p.tier === 'Inner Circle' && !returning ? 1 : 0);
  if (tier === 'Inner Circle' && innerTaken >= c.innerMax) return { error: `Inner Circle is full (${c.inner}/${c.innerMax}). Pick Development or join the Inner Circle waitlist.`, waitlist: true };
  return null;
}

// ---------- Stripe event → engine command (pure; the server verifies the signature first) ----------
export interface StripeEvent { id: string; type: string; created?: number; data: { object: Record<string, any> } } // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (sec?: number | null) => (sec ? new Date(sec * 1000).toISOString() : null);
/** Map one Stripe event to a `billingEvent` command; null = an event type we don't act on. `priceToTier` maps Stripe price ids to tiers. */
export function stripeToCommand(e: StripeEvent, priceToTier: (priceId?: string | null) => Tier | null): Extract<Command, { type: 'billingEvent' }> | null {
  const o = e.data?.object ?? {}; const meta = (o.metadata ?? {}) as Record<string, string>;
  const item = o.items?.data?.[0]; const priceId: string | undefined = item?.price?.id ?? o.lines?.data?.[0]?.price?.id ?? o.lines?.data?.[0]?.pricing?.price_details?.price;
  const subMeta = (o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {}) as Record<string, string>;
  const base = { type: 'billingEvent' as const, eventId: e.id, playerId: meta.player_id ?? subMeta.player_id ?? o.client_reference_id ?? null, customerId: typeof o.customer === 'string' ? o.customer : o.customer?.id ?? null };
  const tierOf = (m: Record<string, string>) => priceToTier(priceId) ?? ((TIERS as string[]).includes(m.tier) ? (m.tier as Tier) : null);
  const kinds: Record<string, BillingEventKind> = { 'checkout.session.completed': 'checkout_completed', 'customer.subscription.updated': 'subscription_updated', 'customer.subscription.deleted': 'subscription_deleted', 'invoice.paid': 'invoice_paid', 'invoice.payment_failed': 'invoice_failed' };
  const kind = kinds[e.type]; if (!kind) return null;
  if (kind === 'checkout_completed') { if (o.mode && o.mode !== 'subscription') return null; return { ...base, kind, subscriptionId: typeof o.subscription === 'string' ? o.subscription : o.subscription?.id ?? null, tier: tierOf(meta) }; }
  if (kind === 'subscription_updated' || kind === 'subscription_deleted') return { ...base, kind, subscriptionId: o.id ?? null, tier: tierOf(meta), status: o.status ?? null, periodEnd: iso(item?.current_period_end ?? o.current_period_end), cancelAtPeriodEnd: !!o.cancel_at_period_end, paused: !!o.pause_collection };
  const subId = typeof o.subscription === 'string' ? o.subscription : o.subscription?.id ?? o.parent?.subscription_details?.subscription ?? null;
  return { ...base, kind, subscriptionId: subId, tier: tierOf(subMeta), amount: kind === 'invoice_paid' ? o.amount_paid ?? null : o.amount_due ?? null, periodEnd: iso(o.lines?.data?.[0]?.period?.end) };
}

/** Test-mode simulator: Stripe-shaped events for what a real checkout / portal / card failure would send. Used by the in-app mock checkout and the demo. */
export type MockOutcome = 'checkout' | 'invoice_failed' | 'invoice_paid' | 'cancel' | 'cancel_now' | 'reactivate' | `switch:${Tier}`;
export function mockStripeEvents(s: Snapshot, playerId: string, outcome: MockOutcome, tier?: Tier): StripeEvent[] {
  const p = s.players.find((x) => x.id === playerId); if (!p) return []; const sub = subscriptionOf(s, playerId); const now = clock(s); const sec = Math.floor(now.getTime() / 1000);
  const r = () => Math.random().toString(36).slice(2, 10); const t: Tier = tier ?? sub?.tier ?? p.tier; const cus = sub?.customerId ?? `cus_test_${r()}`; const sid = sub?.subscriptionId ?? `sub_test_${r()}`;
  const periodEnd = sub?.currentPeriodEnd ? Math.floor(new Date(sub.currentPeriodEnd).getTime() / 1000) : sec + 30 * 86400;
  const meta = { player_id: playerId, tier: t }; const ev = (type: string, object: Record<string, unknown>): StripeEvent => ({ id: `evt_test_${r()}${r()}`, type, created: sec, data: { object } });
  const subObj = (extra: Record<string, unknown>) => ({ id: sid, object: 'subscription', customer: cus, status: 'active', metadata: meta, cancel_at_period_end: false, pause_collection: null, items: { data: [{ current_period_end: periodEnd, price: { id: `price_test_${t.replace(' ', '_').toLowerCase()}` } }] }, ...extra });
  const invoice = (paid: boolean) => ({ id: `in_test_${r()}`, object: 'invoice', customer: cus, subscription: sid, amount_paid: paid ? PRICE_CENTS[t] : 0, amount_due: PRICE_CENTS[t], subscription_details: { metadata: meta }, lines: { data: [{ period: { end: paid && sub?.status !== 'past_due' && outcome !== 'checkout' ? periodEnd + 30 * 86400 : periodEnd } }] } });
  switch (outcome) {
    case 'checkout': return [ev('checkout.session.completed', { id: `cs_test_${r()}`, object: 'checkout.session', mode: 'subscription', customer: cus, subscription: sid, client_reference_id: playerId, metadata: meta }), ev('invoice.paid', { ...invoice(true), lines: { data: [{ period: { end: sec + 30 * 86400 } }] } })];
    case 'invoice_failed': return [ev('invoice.payment_failed', invoice(false)), ev('customer.subscription.updated', subObj({ status: 'past_due' }))];
    case 'invoice_paid': return [ev('invoice.paid', invoice(true)), ev('customer.subscription.updated', subObj({ status: 'active' }))];
    case 'cancel': return [ev('customer.subscription.updated', subObj({ cancel_at_period_end: true }))];
    case 'reactivate': return [ev('customer.subscription.updated', subObj({ cancel_at_period_end: false }))];
    case 'cancel_now': return [ev('customer.subscription.deleted', subObj({ status: 'canceled' }))];
    default: { const nt = outcome.slice(7) as Tier; return [ev('customer.subscription.updated', subObj({ metadata: { ...meta, tier: nt }, items: { data: [{ current_period_end: periodEnd, price: { id: `price_test_${nt.replace(' ', '_').toLowerCase()}` } }] } }))]; }
  }
}
/** Test-mode price ids used by the simulator (`price_test_foundation`, …). */
export const mockPriceToTier = (id?: string | null): Tier | null => (id ? TIERS.find((t) => `price_test_${t.replace(' ', '_').toLowerCase()}` === id) ?? null : null);
