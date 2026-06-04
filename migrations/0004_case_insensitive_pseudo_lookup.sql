CREATE INDEX IF NOT EXISTS idx_users_pseudo_nocase_lookup
  ON users(pseudo COLLATE NOCASE);
