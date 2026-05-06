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
      ORDER BY ap.added_at ASC
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
