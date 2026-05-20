-- V7: Travel slugs + GPX parsed stats (DS-11)
-- Adds slug (URL-friendly identifier) and server-parsed GPX fields to travels.

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
