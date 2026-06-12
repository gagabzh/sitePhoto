-- SitePhoto Database Schema
-- Base initialization for local development
-- NOTE: For production, use migrations/v*.sql files in sequence
-- This file provides a clean starting point for development environments

-- Users table: core authentication and authorization
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  avatar_s3_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Albums table: photo collections
CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Photos table: main photo metadata
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  mime_type VARCHAR(50) NOT NULL,
  size INTEGER NOT NULL,
  taken_at DATE,
  exposure_time TEXT,
  focal_length NUMERIC(8,2),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  nextcloud_url TEXT,
  nextcloud_share_url TEXT,
  place TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tags table: categorization
CREATE TABLE IF NOT EXISTS tags (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(20) CHECK (category IN ('people','places','years','themes'))
);

-- Tag recipes: saved search queries
CREATE TABLE IF NOT EXISTS tag_recipes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  query_json  JSONB NOT NULL,
  share_token UUID,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Photo-Tag relationship (many-to-many)
CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);

-- Album access control (viewer permissions)
CREATE TABLE IF NOT EXISTS album_access (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (album_id, viewer_id)
);

-- Travel records: trips and journeys
CREATE TABLE IF NOT EXISTS travels (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  gpx_filename VARCHAR(255),
  share_token UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Travel-Album relationship (many-to-many)
CREATE TABLE IF NOT EXISTS travel_albums (
  travel_id INTEGER NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_id, album_id)
);

-- Travel-Photo relationship (many-to-many)
CREATE TABLE IF NOT EXISTS travel_photos (
  travel_id INTEGER NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_id, photo_id)
);

-- Travel access control (viewer permissions)
CREATE TABLE IF NOT EXISTS travel_access (
  travel_id INTEGER NOT NULL REFERENCES travels(id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_id, viewer_id)
);

-- Session store for connect-pg-simple (persistent sessions)
-- Required for production deployments to survive restarts
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR      NOT NULL COLLATE "default",
  "sess"   JSON         NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
) WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- User preferences (theme, language, notifications)
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language      VARCHAR(10) NOT NULL DEFAULT 'en',
  theme         VARCHAR(10) NOT NULL DEFAULT 'light',
  notif_enabled BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Person faces: manual face tagging for AI learning (AI-3)
-- Stores face crops and person names for few-shot injection
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS photos_user_id_idx ON photos(user_id);
CREATE INDEX IF NOT EXISTS photos_album_id_idx ON photos(album_id);
CREATE INDEX IF NOT EXISTS tags_name_idx ON tags(name);
CREATE INDEX IF NOT EXISTS photo_tags_photo_id_idx ON photo_tags(photo_id);
CREATE INDEX IF NOT EXISTS photo_tags_tag_id_idx ON photo_tags(tag_id);
CREATE INDEX IF NOT EXISTS album_access_album_id_idx ON album_access(album_id);
CREATE INDEX IF NOT EXISTS album_access_viewer_id_idx ON album_access(viewer_id);

-- Comments for tables (optional, for documentation)
COMMENT ON TABLE users IS 'User accounts with role-based permissions';
COMMENT ON TABLE photos IS 'Photo metadata and file references';
COMMENT ON TABLE albums IS 'Photo collections/albums';
COMMENT ON TABLE tags IS 'Tag categories for photo organization';
COMMENT ON TABLE person_faces IS 'Manual face tags for AI learning (few-shot injection)';
