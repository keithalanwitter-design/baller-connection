/**
 * Creates the three Baller Connection plans in Stripe TEST mode (idempotent: re-running reuses prices by lookup key).
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts [--webhook https://YOUR-APP/api/stripe/webhook]
 *   npx tsx scripts/stripe-setup.ts --dry-run      # prints the plan, calls nothing
 *
 * Refuses live keys. Prints the env lines to paste into `wrangler secret put` / `.dev.vars`.
 */
import { form } from '../server/stripe';
import { PRICE_CENTS, PRICE_ENV, TIERS } from '../shared/billing';

const args = process.argv.slice(2); const dry = args.includes('--dry-run'); const hook = args[args.indexOf('--webhook') + 1] && args.includes('--webhook') ? args[args.indexOf('--webhook') + 1] : null;
const key = process.env.STRIPE_SECRET_KEY ?? '';
const EVENTS = ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];
const lookup = (t: string) => `bc_${t.toLowerCase().replace(/\s+/g, '_')}_monthly`;
if (dry) {
  for (const t of TIERS) console.log(`would create product "Baller Connection ${t}" + monthly price $${PRICE_CENTS[t] / 100} (lookup_key ${lookup(t)}) → ${PRICE_ENV[t]}`);
  if (hook) console.log(`would create webhook endpoint ${hook} for: ${EVENTS.join(', ')}`); process.exit(0);
}
if (!/^(sk|rk)_test_/.test(key)) { console.error('Set STRIPE_SECRET_KEY to a TEST key (sk_test_…). Live keys are refused by this script.'); process.exit(1); }
async function api<T>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}): Promise<T> {
  const q = form(params).join('&'); const r = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && q ? `?${q}` : ''}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? q : undefined });
  const j = (await r.json()) as T & { error?: { message: string } }; if (!r.ok) throw new Error(`${path}: ${j.error?.message ?? r.status}`); return j;
}
const out: string[] = [];
for (const t of TIERS) {
  const found = await api<{ data: { id: string }[] }>('GET', 'prices', { 'lookup_keys[0]': lookup(t), active: 'true' });
  let id = found.data[0]?.id;
  if (!id) { const prod = await api<{ id: string }>('POST', 'products', { name: `Baller Connection ${t}`, metadata: { tier: t } }); id = (await api<{ id: string }>('POST', 'prices', { product: prod.id, currency: 'usd', unit_amount: PRICE_CENTS[t], recurring: { interval: 'month' }, lookup_key: lookup(t), metadata: { tier: t } })).id; console.log(`created ${t}: ${id}`); }
  else console.log(`exists  ${t}: ${id}`);
  out.push(`${PRICE_ENV[t]}=${id}`);
}
if (hook) { const ep = await api<{ id: string; secret: string }>('POST', 'webhook_endpoints', { url: hook, ...Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e])) }); console.log(`webhook ${ep.id} → ${hook}`); out.push(`STRIPE_WEBHOOK_SECRET=${ep.secret}`); }
console.log(`\nAdd these (wrangler.toml [vars] for prices, \`wrangler secret put\` for the webhook secret):\n${out.join('\n')}`);
console.log('\nAlso: Stripe Dashboard (test mode) → Settings → Billing → Customer portal → enable plan switching between the three prices, cancellation "at end of billing period", and payment-method updates.');
