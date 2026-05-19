-- V6: many-to-many albums (MA-1)
-- Reverses IMP-5: restores album_photos join table, drops album_id from photos.

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
