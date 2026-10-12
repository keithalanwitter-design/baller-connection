-- Baller Connection v7 PWA: Web Push subscriptions (one row per device/browser). Opt-in only; deleted on unsubscribe, sign-out-everywhere, or when the push service says the endpoint is gone.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
