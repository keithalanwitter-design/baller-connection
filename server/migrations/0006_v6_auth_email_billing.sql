-- Baller Connection v6: magic-link sign-in, email delivery (HTML, preferences, retries, dead letter), Stripe billing.
-- One-time sign-in links: only an HMAC of the token is stored; 15-minute expiry; single use.
CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'login',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_user ON magic_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
-- Per-user email preferences (JSON) and waitlist spot offers.
ALTER TABLE users ADD COLUMN prefs TEXT;
ALTER TABLE invites ADD COLUMN kind TEXT;
-- Outbox: HTML part, preference category, retry bookkeeping (status 'dead' = dead-letter list).
ALTER TABLE outbox ADD COLUMN html TEXT;
ALTER TABLE outbox ADD COLUMN category TEXT;
ALTER TABLE outbox ADD COLUMN user_id TEXT;
ALTER TABLE outbox ADD COLUMN attempts INTEGER;
ALTER TABLE outbox ADD COLUMN send_after TEXT;
ALTER TABLE outbox ADD COLUMN last_error TEXT;
CREATE INDEX IF NOT EXISTS idx_outbox_status_send_after ON outbox(status, send_after);
-- Stripe subscriptions (one per player) and processed webhook event ids (idempotency).
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  family_id TEXT,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  customer_id TEXT,
  subscription_id TEXT UNIQUE,
  current_period_end TEXT,
  cancel_at_period_end INTEGER,
  past_due_since TEXT,
  paused_by_billing INTEGER,
  started_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_player_id ON subscriptions(player_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  kind TEXT,
  at TEXT NOT NULL,
  player_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_billing_events_at ON billing_events(at);
