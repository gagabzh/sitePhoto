-- Recipe sharing (RS-1)
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS share_token UUID;
CREATE UNIQUE INDEX IF NOT EXISTS tag_recipes_share_token_idx ON tag_recipes (share_token) WHERE share_token IS NOT NULL;
ALTER TABLE tag_recipes ADD COLUMN IF NOT EXISTS shared_by INT REFERENCES users(id) ON DELETE SET NULL;
