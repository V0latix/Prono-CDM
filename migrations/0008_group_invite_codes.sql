ALTER TABLE prediction_groups ADD COLUMN invite_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_groups_invite_code
  ON prediction_groups(invite_code)
  WHERE invite_code IS NOT NULL;
