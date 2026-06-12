-- SitePhoto Merged Migrations
-- This file combines all migrations v1-v15 into a single file
-- Run this on an existing database to bring it up to the latest schema
-- For new databases, use init-db.sql instead

-- ============================================
-- V1: Photo EXIF and GPS metadata
-- ============================================
ALTER TABLE photos ADD COLUMN IF NOT EXISTS taken_at DATE;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS exposure_time TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS focal_length NUMERIC(8,2);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS nextcloud_url TEXT;

-- ============================================
-- V2: Album refactor + Travel feature tables
-- ============================================
-- Add album_id to photos (one album per photo)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL;

-- Migrate album_photos → photos.album_id (first album per photo wins), then drop the table
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'album_photos') THEN
    UPDATE photos p
    SET album_id = (
      SELECT ap.album_id FROM album_photos ap
      WHERE ap.photo_id = p.id
      ORDER BY ap.album_id ASC
      LIMIT 1
    )
    WHERE p.album_id IS NULL;

    DROP TABLE album_photos;
  END IF;
END $$;

-- Travel feature tables
CREATE TABLE IF NOT EXISTS travels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  gpx_filename VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS travel_albums (
  travel_id INTEGER NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_id, album_id)
);

CREATE TABLE IF NOT EXISTS travel_photos (
  travel_id INTEGER NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_id, photo_id)
);

CREATE TABLE IF NOT EXISTS travel_access (
  travel_id INTEGER NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_id, viewer_id)
);

-- ============================================
-- V3: Tag categories + Saved recipes
-- ============================================
-- Tag categories (TG-3)
ALTER TABLE tags ADD COLUMN IF NOT EXISTS
  category VARCHAR(20) CHECK (category IN ('people','places','years','themes'));

-- Auto-categorise year-like tags (e.g. "2023", "2024")
UPDATE tags SET category = 'years'
  WHERE category IS NULL AND name ~ '^\d{4}$';

-- Saved recipes (TG-7)
CREATE TABLE IF NOT EXISTS tag_recipes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  query_json  JSONB NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- V4: Tag management + Recipe enhancements
-- ============================================
-- Tag management
ALTER TABLE tags ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- Recipe enhancements
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS use_count INT NOT NULL DEFAULT 0;
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- ============================================
-- V5: Recipe sharing (RS-1)
-- ============================================
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS share_token UUID;
CREATE UNIQUE INDEX IF NOT EXISTS tag_recipes_share_token_idx ON tag_recipes (share_token) WHERE share_token IS NOT NULL;
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS shared_by INT REFERENCES users(id) ON DELETE SET NULL;

-- ============================================
-- V6: many-to-many albums (MA-1)
-- Reverses IMP-5: restores album_photos join table, drops album_id from photos.
-- ============================================
CREATE TABLE IF NOT EXISTS album_photos (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (album_id, photo_id)
);

-- Migrate existing one-album-per-photo data
INSERT INTO album_photos (album_id, photo_id)
  SELECT album_id, id FROM photos WHERE album_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE photos DROP COLUMN IF EXISTS album_id;

-- ============================================
-- V7: Travel slugs + GPX parsed stats (DS-11)
-- Adds slug (URL-friendly identifier) and server-parsed GPX fields to travels.
-- ============================================
ALTER TABLE travels ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS travels_slug_idx ON travels (slug) WHERE slug IS NOT NULL;

-- Backfill: generate slug from title for any existing rows (normally none in dev)
UPDATE travels
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL;

-- GPX parsed stats stored server-side at upload time
ALTER TABLE travels ADD COLUMN IF NOT EXISTS gpx_distance_km  NUMERIC(10,2);
ALTER TABLE travels ADD COLUMN IF NOT EXISTS gpx_duration_min INTEGER;
ALTER TABLE travels ADD COLUMN IF NOT EXISTS gpx_trackpoints  INTEGER;
ALTER TABLE travels ADD COLUMN IF NOT EXISTS gpx_geojson      JSONB;

-- ============================================
-- V8: Reference photo per people tag (AI-2 teaching)
-- Allows editors to mark one photo as the visual reference for a person tag.
-- The identify-people route sends this image to Ollama alongside the query
-- photo so the model has a visual example to compare against.
-- ============================================
ALTER TABLE tags ADD COLUMN IF NOT EXISTS reference_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL;

-- ============================================
-- V9: S3 storage key for photos (V4 migration)
-- New uploads store files in OVH Object Storage instead of local disk.
-- s3_key mirrors filename for new uploads; NULL for photos still on disk
-- (legacy photos migrated via the one-shot migration script).
-- ============================================
ALTER TABLE photos ADD COLUMN IF NOT EXISTS s3_key TEXT;

-- ============================================
-- V10: persistent session store (connect-pg-simple)
-- ============================================
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR      NOT NULL COLLATE "default",
  "sess"   JSON         NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
) WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================
-- V11: user preferences (ACC-2) and avatar (ACC-3)
-- ============================================
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language      VARCHAR(10) NOT NULL DEFAULT 'en',
  theme         VARCHAR(10) NOT NULL DEFAULT 'light',
  notif_enabled BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_s3_key TEXT;

-- ============================================
-- V12: Nextcloud integration (NC-1/2/3/4)
-- ============================================
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

-- ============================================
-- V13: add place column to photos (NC-4 Nextcloud import)
-- ============================================
ALTER TABLE photos ADD COLUMN IF NOT EXISTS place TEXT;

-- ============================================
-- V14: backfill original_filename column on photos (NC import fix)
-- Column exists in init-db.sql but was never added via migration.
-- Existing rows get filename as the fallback (it holds the same value for pre-NC photos).
-- ============================================
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NOT NULL DEFAULT '';
UPDATE photos SET original_filename = filename WHERE original_filename = '';
ALTER TABLE photos ALTER COLUMN original_filename DROP DEFAULT;

-- ============================================
-- V15: person_faces table for manual face crops (AI-3)
-- ============================================
CREATE TABLE IF NOT EXISTS person_faces (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name  TEXT    NOT NULL,
  photo_id     INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  bbox         JSONB   NOT NULL,
  crop_s3_key  TEXT    NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS person_faces_user_name_idx ON person_faces(user_id, person_name);
