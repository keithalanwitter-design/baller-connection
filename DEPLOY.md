# Deploying Baller Connection v6

One Worker serves the API, the built app (static assets) and the cron jobs, with D1 as the database. Same origin means the session cookie is first-party. No credentials are stored in this repo.

## Prerequisites
- A Cloudflare account and **Node 22+** (Wrangler 4 requires it).
- `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN` in CI). Run `npx wrangler whoami` to check.

## 1 · Create the database
```bash
npx wrangler d1 create baller-connection
```
Paste the printed `database_id` into `wrangler.toml` (`REPLACE_WITH_ID_FROM_wrangler_d1_create`).

## 2 · Apply migrations (incremental; Wrangler tracks them in `d1_migrations`)
```bash
npm run db:migrate:remote        # = wrangler d1 migrations apply baller-connection --remote
```
To change the schema later, add `server/migrations/0006_<name>.sql` and run the same command. Never edit an applied file.

> v4 adds `0004_v4.sql`: new columns, plus reflections and cycle_reviews. Invites are rebuilt with hashed tokens and codes, so **any pending v3 invites are revoked and must be re-sent**.

> v5 adds `0005_v5_clips.sql` (the clips table plus new columns). Run the same migrations command.

> v8 adds `0009_v8_google.sql` (`oauth_identities` for Google sign-in). Additive only.

> v7 adds `0007_v7_games_timeline.sql` (games, wins, timeline_notes; new columns for affirmation, Player Card settings, pressure reps and shot logs) and `0008_v7_push.sql` (push_subscriptions). Additive only. Run the same command.

> v6 adds `0006_v6_auth_email_billing.sql`: magic-link tokens, email preferences, outbox retry columns, `subscriptions` and `billing_events`. Additive only. **v6 requires payment before onboarding** (Settings → `requirePayment`). Families already onboarded stay as they are; set billing to *comp* for anyone you don't want to charge.

### Clip storage (R2), needed for v5 uploads
```bash
npx wrangler r2 bucket create baller-connection-clips   # private: do NOT enable public access or an r2.dev URL
```
`wrangler.toml` already binds it as `CLIPS`. Without the bucket, `POST /api/clips` answers 503 and everything else still works. Clips are served only through `GET /api/clips/:id` after an access check. The 15-minute cron removes clips after 90 days and deletes their bytes.

## 3 · Secrets and vars
```bash
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY       # or: POSTMARK_SERVER_TOKEN  (EMAIL_API_KEY still works for either)
npx wrangler secret put STRIPE_SECRET_KEY    # sk_test_… first; live keys are refused unless STRIPE_ALLOW_LIVE = "1"
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_… printed by `npm run stripe:setup -- --webhook …`
```
In `wrangler.toml` `[vars]`:
- `APP_URL`: the public URL (used in invite and password links).
- `EMAIL_PROVIDER`: `resend` | `postmark` | `log` (`log` = no sending; every email goes to the Outbox page).
- `EMAIL_FROM`: a sender on a domain you have verified with the provider.
- `STRIPE_PRICE_FOUNDATION`, `STRIPE_PRICE_DEVELOPMENT`, `STRIPE_PRICE_INNER_CIRCLE`: price ids from `npm run stripe:setup`. Prices are $69 / $139 / $229 per month.
- `STRIPE_ALLOW_LIVE = "1"`: only when you deliberately switch to live keys.
- `DEMO = "0"`: never enable in production. It opens `/api/demo/*` and the clock controls.
- First boot, no demo data: set `OWNER_EMAIL` and `OWNER_NAME` (vars). The DB starts empty with one head-coach account. Open `/#/forgot`, enter that email, and set the password from the emailed link.

## 3a · Email with Resend (default provider)
**What Keith supplies:** (1) a Resend account, (2) access to the DNS for the sending domain, (3) one API key. Nothing else.
1. **Domain.** In Resend → **Domains** → *Add domain*, use a sending subdomain such as `mail.yourdomain.com` (keeps your main domain's reputation separate). Region: the default is fine.
2. **DNS records.** Resend shows the exact values. Add them at your DNS host. On Cloudflare DNS, set them to **DNS only** (grey cloud), not proxied:
   | Type | Name (host) | Value | Purpose |
   |---|---|---|---|
   | TXT | `resend._domainkey.mail` | `p=MIGf…` (long key from Resend) | DKIM signature |
   | MX | `send.mail` | `feedback-smtp.<region>.amazonses.com`, priority 10 | bounce / return path |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | SPF for the return path |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` | DMARC (recommended; move to `p=quarantine` after a clean week) |
   Keep one SPF record per name. If one already exists on that name, merge the `include:`.
3. Wait until Resend shows the domain as **Verified** (usually minutes, up to a few hours).
4. **API key.** Resend → **API Keys** → *Create* → permission **Sending access**, limited to that domain. Store it:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```
   and in `wrangler.toml` `[vars]`: `EMAIL_PROVIDER = "resend"` (the default) and `EMAIL_FROM = "Baller Connection <coach@mail.yourdomain.com>"`.
5. **Test it once** from your machine, before deploying:
   ```bash
   RESEND_API_KEY=re_… EMAIL_FROM="Baller Connection <coach@mail.yourdomain.com>" npm run email:test -- you@yourdomain.com
   ```
   It sends exactly one email and prints Resend's error in plain words if the key or domain is wrong. Without a key it sends nothing and lists what's missing.
6. Behaviour: without `RESEND_API_KEY` nothing leaves the server and every email appears in **Ops → Outbox**. Every non-essential email has a one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post` → `POST /api/unsubscribe`). Sign-in, invite, consent and payment emails always send. Quiet hours (default 9 PM–7 AM, program timezone) delay non-urgent mail. Failures retry at 1 m, 5 m, 30 m and 2 h. After 5 attempts, or a permanent 4xx, the email moves to **Ops → Outbox → Dead letters** with a Retry button.
- Postmark still works (`EMAIL_PROVIDER = "postmark"` + `POSTMARK_SERVER_TOKEN`) if you ever switch.

## 3b-g · Google sign-in (OpenID Connect)
**What Keith supplies:** a Google Cloud project, plus the **Client ID** and **Client secret** it creates. Steps in [Google Cloud Console](https://console.cloud.google.com/):
1. Top bar → project picker → **New project** (e.g. `baller-connection`) → select it.
2. **APIs & Services → OAuth consent screen** (shown as **Google Auth Platform** in newer consoles) → *Get started*:
   - App name `Baller Connection`, user support email, developer contact email.
   - Audience: **External**.
   - **Branding**: add your app domain (`https://yourdomain.com`), privacy policy `https://yourdomain.com/#/privacy`, terms `https://yourdomain.com/#/terms`, and the **authorized domain** `yourdomain.com`.
   - **Data access / scopes**: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are non-sensitive scopes, so no Google review is needed.
   - **Publish app** (Audience → *Publish*) when ready. Until then, only the **Test users** you list can sign in.
3. **Clients → Create client** → Application type **Web application**, name `Baller Connection web`.
   - **Authorized JavaScript origins**: `https://yourdomain.com` (your `APP_URL` origin).
   - **Authorized redirect URIs**, exactly: `https://yourdomain.com/api/auth/google/callback` (`APP_URL` + `/api/auth/google/callback`. Scheme, host and path must match character for character). For local testing also add `http://localhost:8787/api/auth/google/callback`.
4. Copy the **Client ID** and **Client secret**:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   and in `wrangler.toml` `[vars]`: `GOOGLE_CLIENT_ID = "1234-abc.apps.googleusercontent.com"`. `APP_URL` must be set to the same origin as the redirect URI.
5. Check: `curl https://yourdomain.com/api/health` shows `"google":true`. The sign-in page shows **Continue with Google**.

How it behaves:
- Authorization code flow with **PKCE (S256)**, a random `state` and `nonce` held in a signed, HttpOnly, 10-minute cookie scoped to `/api/auth/google`.
- The ID token is verified against Google's JWKS (RS256, cached ≤ 1 h, refetched on an unknown `kid`), checking `iss`, `aud` = your client ID, `exp`, `nonce`, and **`email_verified = true`**.
- **No open signup.** A Google account signs in only if its verified email matches an existing account; the link is stored in `oauth_identities` (migration `0009`). A pending invite for that email is sent to the invite page to finish consent. Anyone else is told to apply.
- Players under 13 keep the username + PIN. Magic links and passwords still work.
- The GitHub Pages demo simulates Google with fictional accounts. It never contacts Google.

## 3c · Phone notifications (Web Push / VAPID), optional
Push stays in **log mode** (decides what it would send, sends nothing) until both keys are set; `/api/health` shows `"push":"log"` or `"push":"vapid"`.
1. Generate a key pair **on your own machine** (nothing is generated or committed by the repo):
   ```bash
   node scripts/vapid-keys.mjs          # or: npx web-push generate-vapid-keys
   ```
2. Store them:
   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY      # the private key: secret, never in git
   ```
   and in `wrangler.toml` `[vars]` (public values): `VAPID_PUBLIC_KEY = "<public key>"`, `VAPID_SUBJECT = "mailto:you@yourdomain"`.
   For `npm run serve:local`, put the same three in `.dev.vars` (git-ignored).
3. Deploy. Families install the app (Add to Home Screen on iPhone, iOS 16.4+), open it from the icon, then turn on **Account → Phone notifications**.
- Events pushed: feedback ready, nudges, replies, plan drop, game day card. Each follows the user's email category switch (coaching / updates) and quiet hours; pushes inside quiet hours are dropped (the item stays in the app and the email roundup). Payloads are encrypted (aes128gcm) and signed (VAPID, ES256) with WebCrypto, no extra dependency.
- Only Google, Mozilla, Apple and Microsoft push endpoints are accepted. Endpoints the push service reports as gone (404/410) are deleted. **Sign out everywhere** also removes the user's devices.
- Rotating keys: generate a new pair and redeploy; existing subscriptions stop working, and users turn notifications on again.

## 3b · Stripe (test mode first)
```bash
STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup -- --dry-run                       # shows what it will create
STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup -- --webhook https://<APP_URL>/api/stripe/webhook
```
The script refuses `sk_live_` keys, is idempotent (prices are found by `lookup_key`), and prints the three price ids and the webhook signing secret. Webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
Then in the Stripe Dashboard (test mode) → Settings → Billing → **Customer portal**: allow switching between the three prices, cancellation **at end of billing period**, and payment-method updates.
Test it with card `4242 4242 4242 4242` (success) and `4000 0000 0000 0341` (attaches, then fails on renewal), or `stripe trigger invoice.payment_failed`.
Billing rules the app enforces: plan change updates review limits and reply windows; `past_due` keeps coaching for 7 days (Settings → `graceDays`), then pauses; cancel ends access at period end and offers the spot to the next waitlisted family (link held 48 h). Checkout is blocked when 15 spots (4 Inner Circle) are taken; the family can join the waitlist instead.
Going live: repeat the setup with live keys in a live-mode account, set `STRIPE_ALLOW_LIVE = "1"`, and put the live webhook secret in place.

## 4 · Deploy
```bash
npm run deploy                   # builds the app with BASE=/ and VITE_API_URL=same-origin, then wrangler deploy
```
Cron triggers come from `wrangler.toml`: `*/15 * * * *` (SLA sweep, invite expiry, notification digest emails) and `0 23 * * SUN` (weekly parent digests).

## 5 · Smoke test
```bash
curl https://<APP_URL>/api/health          # {"ok":true,...,"email":"resend","stripe":"test"}
```
Then sign in as the owner, add an assistant and ops from **Team** (each gets a set-password email), and run one invite end to end.

## GitHub Pages
The app is a PWA under the Pages base path: `manifest.webmanifest` (relative `scope`/`start_url`), `sw.js` scoped to `/baller-connection/` (or `/` on the Worker). The service worker caches only the app shell (index, hashed JS/CSS, icons, offline page). It never caches `/api/`, clips, demo videos, or any request with credentials. A new deploy shows an **Update** prompt rather than reloading under the user.
The Pages workflow publishes the **demo** build (in-browser engine, fictional data) and also runs a `wrangler deploy --dry-run` bundle check. Pages never talks to the production API. A live build hosted elsewhere needs `ALLOW_ORIGIN` set to that origin, but cookies are simplest same-origin on the Worker. `/#/demo` or `?demo=1` forces demo mode on any build.

## Local verification (what was run)
- `npx wrangler d1 migrations apply baller-connection --local` then `npx wrangler dev --local --test-scheduled` with `.dev.vars` containing `SESSION_SECRET=…` and `SEED=demo`. `curl "localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"` fires the cron.
- `tests/e2e-multi.mjs` passed against both `wrangler dev` (workerd + local D1) and `npm run serve:local` (Node + SQLite).

## Not in scope yet
Full-game film (clips are capped at 30 s), server-side transcoding/trimming (families trim on the phone; the app shows how), and SMS. Web Push is built in (see 3c) but has not been tried against real push services from this box.
