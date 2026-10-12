-- v5: short practice clips (≤30 s, ≤50 MB; bytes live in R2 / local disk, this table holds metadata),
-- timestamped review notes, review timing, acknowledgment nudges, drill feedback templates, "What I'm working on".
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  assignment_id TEXT,
  submission_id TEXT,
  storage_key TEXT NOT NULL,
  mime TEXT,
  bytes INTEGER,
  duration_sec REAL,
  watch_for TEXT,
  uploaded_by TEXT,
  at TEXT NOT NULL,
  delete_after TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_clips_player_id ON clips(player_id);
CREATE INDEX IF NOT EXISTS idx_clips_delete_after ON clips(delete_after);
ALTER TABLE submissions ADD COLUMN clip_id TEXT;
ALTER TABLE reviews ADD COLUMN notes TEXT;
ALTER TABLE reviews ADD COLUMN seconds_spent INTEGER;
ALTER TABLE reviews ADD COLUMN nudged_at TEXT;
ALTER TABLE players ADD COLUMN working_on TEXT;
ALTER TABLE players ADD COLUMN working_on_week TEXT;
ALTER TABLE drills ADD COLUMN fb_template TEXT;
