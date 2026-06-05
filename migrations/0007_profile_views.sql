CREATE TABLE IF NOT EXISTS profile_views (
  viewer_user_id TEXT NOT NULL,
  viewed_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_user_id, viewed_user_id),
  FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (viewed_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_user_id ON profile_views(viewer_user_id);
