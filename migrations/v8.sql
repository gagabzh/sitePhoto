-- V8: Reference photo per people tag (AI-2 teaching)
-- Allows editors to mark one photo as the visual reference for a person tag.
-- The identify-people route sends this image to Ollama alongside the query
-- photo so the model has a visual example to compare against.

ALTER TABLE tags ADD COLUMN IF NOT EXISTS reference_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL;
