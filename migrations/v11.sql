-- V11: user preferences (ACC-2) and avatar (ACC-3)

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language      VARCHAR(10) NOT NULL DEFAULT 'en',
  theme         VARCHAR(10) NOT NULL DEFAULT 'light',
  notif_enabled BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_s3_key TEXT;
