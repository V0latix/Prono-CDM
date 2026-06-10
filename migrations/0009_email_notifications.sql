-- Notifications par email : préférences par utilisateur + journal d'envoi.
-- L'email n'est jamais exposé publiquement (table dédiée, hors user_profiles).

CREATE TABLE IF NOT EXISTS user_notifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Journal des emails envoyés, pour ne jamais envoyer deux fois le même rappel.
CREATE TABLE IF NOT EXISTS notification_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, match_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_token ON user_notifications(token);
