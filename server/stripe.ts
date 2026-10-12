/**
 * Stripe over plain fetch + WebCrypto (works in Workers and Node; no SDK). Test mode only unless STRIPE_ALLOW_LIVE=1.
 * Without STRIPE_SECRET_KEY the server runs the built-in simulator: same webhook handler, events signed with a local secret.
 */
import { PRICE_ENV, TIERS } from '../shared/billing';
import type { Tier } from '../shared/domain';

export interface StripeEnv { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_PRICE_FOUNDATION?: string; STRIPE_PRICE_DEVELOPMENT?: string; STRIPE_PRICE_INNER_CIRCLE?: string; STRIPE_ALLOW_LIVE?: string }
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
async function hmacHex(secret: string, msg: string) { const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg))); }
const safeEq = (a: string, b: string) => { let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/** Builds a `Stripe-Signature` header (t=…,v1=…) the way Stripe does. Used by the simulator and tests. */
export async function signStripe(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) { return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`; }
/** Verifies a Stripe webhook signature: HMAC-SHA256 over "t.payload", any v1 match, timestamp within `toleranceSec` (replay guard). */
export async function verifyStripe(payload: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false; const parts = header.split(',').map((x) => x.trim().split('=')); const t = Number(parts.find(([k]) => k === 't')?.[1]); const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const want = await hmacHex(secret, `${t}.${payload}`); return sigs.some((s) => safeEq(s, want));
}
export const stripeMode = (env: StripeEnv): 'live' | 'test' | 'simulated' => (!env.STRIPE_SECRET_KEY ? 'simulated' : env.STRIPE_SECRET_KEY.startsWith('sk_live_') || env.STRIPE_SECRET_KEY.startsWith('rk_live_') ? 'live' : 'test');
export function priceId(env: StripeEnv, tier: Tier) { return env[PRICE_ENV[tier]]; }
export const priceToTier = (env: StripeEnv) => (id?: string | null): Tier | null => (id ? TIERS.find((t) => priceId(env, t) === id) ?? null : null);

/** Stripe's form encoding (nested keys as a[b][c]). */
export function form(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => { const key = prefix ? `${prefix}[${k}]` : k; if (v === undefined || v === null) return []; if (typeof v === 'object') return form(v as Record<string, unknown>, key); return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`]; });
}
export class StripeClient {
  constructor(private key: string, private f: typeof fetch = fetch) {}
  private async call<T>(path: string, params: Record<string, unknown>, idem?: string): Promise<T> {
    const r = await this.f(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/x-www-form-urlencoded', ...(idem ? { 'idempotency-key': idem } : {}) }, body: form(params).join('&') });
    const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } }; if (!r.ok) throw new Error(`Stripe: ${j.error?.message ?? r.status}`); return j;
  }
  /** Subscription checkout. Metadata rides on both the session and the subscription so every later webhook knows the player. */
  checkout(o: { price: string; playerId: string; tier: Tier; email?: string | null; customer?: string | null; successUrl: string; cancelUrl: string; idem?: string }) {
    const meta = { player_id: o.playerId, tier: o.tier };
    return this.call<{ id: string; url: string }>('checkout/sessions', { mode: 'subscription', 'line_items[0][price]': o.price, 'line_items[0][quantity]': 1, client_reference_id: o.playerId, ...(o.customer ? { customer: o.customer } : o.email ? { customer_email: o.email } : {}), metadata: meta, subscription_data: { metadata: meta }, allow_promotion_codes: 'true', success_url: o.successUrl, cancel_url: o.cancelUrl }, o.idem);
  }
  portal(customer: string, returnUrl: string) { return this.call<{ url: string }>('billing_portal/sessions', { customer, return_url: returnUrl }); }
}
