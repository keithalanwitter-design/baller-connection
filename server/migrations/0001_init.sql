-- Baller Connection schema (Cloudflare D1 / SQLite).
-- Each entity table keeps indexed columns for lookups plus the full typed record as JSON in `data`.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, player_id TEXT, state TEXT, tier TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cycles (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS habits (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS digests (id TEXT PRIMARY KEY, player_id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, player_id TEXT, at TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_players_state ON players(state);
CREATE INDEX IF NOT EXISTS idx_assign_player ON assignments(player_id);
CREATE INDEX IF NOT EXISTS idx_sub_player ON submissions(player_id);
CREATE INDEX IF NOT EXISTS idx_msg_player ON messages(player_id);
CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);
