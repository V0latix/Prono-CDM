CREATE TABLE IF NOT EXISTS login_attempts (
  pseudo_key TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  last_failed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);
