PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL COLLATE NOCASE UNIQUE,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  winner_team TEXT,
  winner_code TEXT,
  last_synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  predicted_home_score INTEGER NOT NULL,
  predicted_away_score INTEGER NOT NULL,
  predicted_winner_team TEXT,
  predicted_winner_code TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  exact_score INTEGER NOT NULL DEFAULT 0,
  correct_result INTEGER NOT NULL DEFAULT 0,
  correct_goal_diff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, match_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_feed (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  user_id TEXT,
  match_id TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, user_id, match_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff_at ON matches(kickoff_at);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON activity_feed(created_at);
