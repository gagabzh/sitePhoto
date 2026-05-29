-- V13: add place column to photos (NC-4 Nextcloud import)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS place TEXT;
