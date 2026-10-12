-- v4: promise ledger support, personalization, structured feedback, message context, reflections, cycle reviews,
-- hashed invite tokens/codes, optimistic concurrency (players.rev). 0001 stays as committed; this migration brings existing DBs up to server/schema.ts.
ALTER TABLE players ADD COLUMN rev INTEGER;
ALTER TABLE players ADD COLUMN frustration TEXT;
ALTER TABLE players ADD COLUMN proud_of TEXT;
ALTER TABLE players ADD COLUMN about_me TEXT;
ALTER TABLE players ADD COLUMN tournament_date TEXT;
ALTER TABLE cycles ADD COLUMN adjusted_at TEXT;
ALTER TABLE submissions ADD COLUMN reviewed INTEGER;
UPDATE submissions SET reviewed = 1 WHERE reviewed IS NULL;
ALTER TABLE reviews ADD COLUMN went_well TEXT;
ALTER TABLE reviews ADD COLUMN adjust TEXT;
ALTER TABLE reviews ADD COLUMN why TEXT;
ALTER TABLE reviews ADD COLUMN next_rep TEXT;
ALTER TABLE reviews ADD COLUMN link_url TEXT;
ALTER TABLE reviews ADD COLUMN reaction TEXT;
ALTER TABLE reviews ADD COLUMN reacted_at TEXT;
ALTER TABLE messages ADD COLUMN context TEXT;
ALTER TABLE messages ADD COLUMN ref_id TEXT;
UPDATE messages SET context = 'general' WHERE context IS NULL;
-- Invites: plaintext token/code columns are replaced by SHA-256 hashes. SQLite can't hash, so old pending invites are revoked (ops resends a fresh link).
CREATE TABLE invites_v4 (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT,
  accepted_at TEXT,
  accepted_by TEXT,
  status TEXT NOT NULL
);
INSERT INTO invites_v4 SELECT id, player_id, email, 'revoked:' || id, 'revoked', sent_at, expires_at, created_by, accepted_at, accepted_by, CASE WHEN status = 'pending' THEN 'revoked' ELSE status END FROM invites;
DROP TABLE invites;
ALTER TABLE invites_v4 RENAME TO invites;
CREATE INDEX IF NOT EXISTS idx_invites_player_id ON invites(player_id);
CREATE INDEX IF NOT EXISTS idx_invites_code_hash ON invites(code_hash);
CREATE INDEX IF NOT EXISTS idx_invites_status ON invites(status);
CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  week TEXT NOT NULL,
  text TEXT,
  feel INTEGER,
  at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reflections_player_id_week ON reflections(player_id, week);
CREATE TABLE IF NOT EXISTS cycle_reviews (
  id TEXT PRIMARY KEY,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  improved TEXT,
  hardest TEXT,
  want_next TEXT,
  player_at TEXT,
  summary TEXT,
  ratings_before TEXT,
  ratings_after TEXT,
  next_focus TEXT,
  coach_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cycle_reviews_player_id ON cycle_reviews(player_id);
CREATE INDEX IF NOT EXISTS idx_cycle_reviews_cycle_id ON cycle_reviews(cycle_id);
