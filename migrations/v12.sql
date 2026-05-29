-- V12: Nextcloud integration (NC-1/2/3/4)

-- NC-1/2/3: Nextcloud URL on individual photos
ALTER TABLE photos ADD COLUMN IF NOT EXISTS nextcloud_url TEXT;

-- NC-4: import tracking
CREATE TABLE IF NOT EXISTS nextcloud_imports (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_url  TEXT         NOT NULL,
  total      INTEGER      NOT NULL,
  done       INTEGER      NOT NULL DEFAULT 0,
  failed     INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
