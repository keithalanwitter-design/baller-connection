-- v3: simple login throttling (5 failures / 15 min per identifier).
CREATE TABLE IF NOT EXISTS login_attempts (
  ident TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ident ON login_attempts(ident, at);
