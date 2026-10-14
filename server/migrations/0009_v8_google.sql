-- Baller Connection v8: Google sign-in. One row per linked Google account (by the stable `sub`), only ever linked to an EXISTING user.
CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL,
  sub TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  PRIMARY KEY (provider, sub)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_identities(user_id);
