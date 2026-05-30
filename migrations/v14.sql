-- V14: backfill original_filename column on photos (NC import fix)
-- Column exists in init-db.sql but was never added via migration.
-- Existing rows get filename as the fallback (it holds the same value for pre-NC photos).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255) NOT NULL DEFAULT '';
UPDATE photos SET original_filename = filename WHERE original_filename = '';
ALTER TABLE photos ALTER COLUMN original_filename DROP DEFAULT;
