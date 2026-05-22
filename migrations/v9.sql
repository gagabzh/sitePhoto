-- V9: S3 storage key for photos (V4 migration)
-- New uploads store files in OVH Object Storage instead of local disk.
-- s3_key mirrors filename for new uploads; NULL for photos still on disk
-- (legacy photos migrated via the one-shot migration script).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS s3_key TEXT;
