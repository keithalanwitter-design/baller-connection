-- Baller Connection v9: a coach who sees your reps between sessions.
-- Player: agreed rhythm, the coach's first look, roles agreement, streaks off by default, "show me again", parent sentence, rough-week choice.
ALTER TABLE players ADD COLUMN rhythm_plan TEXT;
ALTER TABLE players ADD COLUMN first_look TEXT;
ALTER TABLE players ADD COLUMN agreement TEXT;
ALTER TABLE players ADD COLUMN gamify INTEGER;
ALTER TABLE players ADD COLUMN probe TEXT;
ALTER TABLE players ADD COLUMN parent_note TEXT;
ALTER TABLE players ADD COLUMN week_choice TEXT;
-- Teach-back: the player's words on a review (JSON: change, notice, mark, note).
ALTER TABLE reviews ADD COLUMN teach_back TEXT;
-- Game note: what carried over, what didn't, and the coach's read.
ALTER TABLE games ADD COLUMN carried TEXT;
ALTER TABLE games ADD COLUMN missed TEXT;
ALTER TABLE games ADD COLUMN mark TEXT;
ALTER TABLE games ADD COLUMN mark_note TEXT;
ALTER TABLE games ADD COLUMN marked_at TEXT;
-- In-person (or video) session notes that set the next focus.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  coach_id TEXT,
  date TEXT NOT NULL,
  note TEXT,
  focus TEXT,
  cue TEXT,
  at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_player_id ON sessions(player_id);
