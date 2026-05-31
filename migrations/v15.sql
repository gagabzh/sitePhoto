-- v15: person_faces table for manual face crops (AI-3)
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
