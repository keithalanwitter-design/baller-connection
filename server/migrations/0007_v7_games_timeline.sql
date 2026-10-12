-- Baller Connection v7: game logs + post-game check-ins, Wins wall, timeline notes, pressure reps, 5-spot shooting log, Player Card.
ALTER TABLE players ADD COLUMN affirmation TEXT;
-- Player Card settings (JSON): enabled, private link token, showStats, chosen moment. Off by default.
ALTER TABLE players ADD COLUMN card TEXT;
ALTER TABLE drills ADD COLUMN pressure TEXT;
ALTER TABLE assignments ADD COLUMN pressure TEXT;
-- 5-spot shooting log: JSON [[made, attempts] x 5]
ALTER TABLE submissions ADD COLUMN shots TEXT;
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  date TEXT NOT NULL,
  at TEXT NOT NULL,
  opponent TEXT,
  stats TEXT,
  confidence INTEGER,
  focus INTEGER,
  energy INTEGER,
  well_done TEXT,
  replay TEXT,
  focus_tried TEXT,
  cycle_id TEXT,
  focus_text TEXT,
  wants_reply INTEGER,
  due_by TEXT,
  seen_at TEXT,
  seen_by TEXT,
  reply TEXT
);
CREATE INDEX IF NOT EXISTS idx_games_player_id_date ON games(player_id, date);
CREATE TABLE IF NOT EXISTS wins (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  at TEXT NOT NULL,
  kind TEXT,
  text TEXT,
  ref_id TEXT,
  by_user TEXT,
  win_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_wins_player_id ON wins(player_id);
CREATE TABLE IF NOT EXISTS timeline_notes (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  kind TEXT NOT NULL,
  ref_id TEXT,
  date TEXT,
  text TEXT,
  status TEXT,
  by_user TEXT,
  at TEXT,
  drafted INTEGER
);
CREATE INDEX IF NOT EXISTS idx_timeline_notes_player_id ON timeline_notes(player_id);
