CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(20) CHECK (category IN ('people','places','years','themes'))
);

CREATE TABLE IF NOT EXISTS tag_recipes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  query_json  JSONB NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS album_access (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (album_id, viewer_id)
);

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

-- V10: persistent session store (connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR      NOT NULL COLLATE "default",
  "sess"   JSON         NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
) WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- V11: user preferences (ACC-2) and avatar (ACC-3)
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language      VARCHAR(10) NOT NULL DEFAULT 'en',
  theme         VARCHAR(10) NOT NULL DEFAULT 'light',
  notif_enabled BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_s3_key TEXT;
