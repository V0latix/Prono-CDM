PRAGMA foreign_keys=off;

CREATE TABLE user_profiles_new (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  favorite_team TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO user_profiles_new (
  user_id,
  photo_url,
  tagline,
  favorite_team,
  created_at,
  updated_at
)
SELECT
  user_id,
  photo_url,
  tagline,
  favorite_team,
  created_at,
  updated_at
FROM user_profiles;

DROP TABLE user_profiles;
ALTER TABLE user_profiles_new RENAME TO user_profiles;

PRAGMA foreign_keys=on;
