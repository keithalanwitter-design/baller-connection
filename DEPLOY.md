# Deploying Baller Connection v5

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

### Clip storage (R2), needed for v5 uploads
```bash
npx wrangler r2 bucket create baller-connection-clips   # private: do NOT enable public access or an r2.dev URL
```
`wrangler.toml` already binds it as `CLIPS`. Without the bucket, `POST /api/clips` answers 503 and everything else still works. Clips are served only through `GET /api/clips/:id` after an access check. The 15-minute cron removes clips after 90 days and deletes their bytes.

## 3 · Secrets and vars
```bash
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
npx wrangler secret put EMAIL_API_KEY        # Resend or Postmark server token
```
In `wrangler.toml` `[vars]`:
- `APP_URL`: the public URL (used in invite and password links).
- `EMAIL_PROVIDER`: `resend` | `postmark` | `log` (`log` = no sending; every email goes to the Outbox page).
- `EMAIL_FROM`: a sender on a domain you have verified with the provider.
- `DEMO = "0"`: never enable in production. It opens `/api/demo/*` and the clock controls.
- First boot, no demo data: set `OWNER_EMAIL` and `OWNER_NAME` (vars). The DB starts empty with one head-coach account. Open `/#/forgot`, enter that email, and set the password from the emailed link.

## 4 · Deploy
```bash
npm run deploy                   # builds the app with BASE=/ and VITE_API_URL=same-origin, then wrangler deploy
```
Cron triggers come from `wrangler.toml`: `*/15 * * * *` (SLA sweep, invite expiry, notification digest emails) and `0 23 * * SUN` (weekly parent digests).

## 5 · Smoke test
```bash
curl https://<APP_URL>/api/health          # {"ok":true,...,"email":"resend"}
```
Then sign in as the owner, add an assistant and ops from **Team** (each gets a set-password email), and run one invite end to end.

## GitHub Pages
The Pages workflow publishes the **demo** build (in-browser engine, fictional data) and also runs a `wrangler deploy --dry-run` bundle check. Pages never talks to the production API. A live build hosted elsewhere needs `ALLOW_ORIGIN` set to that origin, but cookies are simplest same-origin on the Worker. `/#/demo` or `?demo=1` forces demo mode on any build.

## Local verification (what was run)
- `npx wrangler d1 migrations apply baller-connection --local` then `npx wrangler dev --local --test-scheduled` with `.dev.vars` containing `SESSION_SECRET=…` and `SEED=demo`. `curl "localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"` fires the cron.
- `tests/e2e-multi.mjs` passed against both `wrangler dev` (workerd + local D1) and `npm run serve:local` (Node + SQLite).

## Not in scope yet
Stripe (billing is manual), full-game film (clips are capped at 30 s), server-side transcoding/trimming (families trim on the phone; the app shows how), magic-link sign-in (the auth endpoints are isolated so an IdP or magic link can replace them), and push/SMS notifications.
