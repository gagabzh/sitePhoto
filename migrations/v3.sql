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
