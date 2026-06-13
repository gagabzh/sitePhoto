-- Migration V16: US-AI5 - AI Identification Queue
-- Adds table for storing AI-generated person identification proposals awaiting review
-- Required for US-AI5: Review and validate AI identification proposals

-- Dependency: This migration requires the person_faces table (v15)

BEGIN;

-- Create the identification proposals table
CREATE TABLE IF NOT EXISTS ai_identification_proposals (
  id           SERIAL PRIMARY KEY,
  photo_id     INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_name  TEXT NOT NULL,
  bbox         JSONB NOT NULL,  -- {x, y, width, height} in [0,1] normalized coordinates
  confidence   DECIMAL(5,4),    -- Confidence score from AI (0-1), nullable for legacy data
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'rejected', 'edited')),
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  edited_name  TEXT,            -- If user corrected the name during review
  rejection_reason TEXT,        -- Optional reason for rejection (e.g., 'wrong person', 'not a face')
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS ai_identification_proposals_photo_idx 
  ON ai_identification_proposals(photo_id);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_status_idx 
  ON ai_identification_proposals(status);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_user_idx 
  ON ai_identification_proposals(user_id);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_created_idx 
  ON ai_identification_proposals(created_at DESC);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_person_idx 
  ON ai_identification_proposals(person_name);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_status_user_idx 
  ON ai_identification_proposals(status, user_id);

CREATE INDEX IF NOT EXISTS ai_identification_proposals_status_created_idx 
  ON ai_identification_proposals(status, created_at DESC);

-- Composite index for filtering by user and status (common query pattern)
CREATE INDEX IF NOT EXISTS ai_identification_proposals_user_status_idx 
  ON ai_identification_proposals(user_id, status);

-- Table comment for documentation
COMMENT ON TABLE ai_identification_proposals IS 
  'Queue of AI-generated person identification proposals awaiting human review. '
  'Each row represents a face detected by AI with a suggested person name. '
  'Proposals start as "pending" and transition to "accepted" or "rejected" after review.';

-- Column comments
COMMENT ON COLUMN ai_identification_proposals.person_name IS 
  'The name of the person suggested by the AI model';

COMMENT ON COLUMN ai_identification_proposals.bbox IS 
  'Bounding box coordinates in normalized [0,1] format: {x, y, width, height}';

COMMENT ON COLUMN ai_identification_proposals.confidence IS 
  'AI confidence score (0-1) for this identification, null if not available';

COMMENT ON COLUMN ai_identification_proposals.status IS 
  'Current state: pending=awaiting review, accepted=user confirmed, rejected=user declined, edited=user corrected name';

COMMENT ON COLUMN ai_identification_proposals.edited_name IS 
  'If user changed the name during acceptance, stores the corrected name';

COMMENT ON COLUMN ai_identification_proposals.rejection_reason IS 
  'Optional reason for rejection, useful for AI improvement analysis';

-- Add identification status column to photos table for tracking
ALTER TABLE photos ADD COLUMN IF NOT EXISTS ai_identification_status VARCHAR(20) 
  DEFAULT NULL 
  CHECK (ai_identification_status IN ('pending', 'in_progress', 'completed', 'failed', NULL));

COMMENT ON COLUMN photos.ai_identification_status IS 
  'Status of AI identification for this photo: pending=queued, in_progress=being processed, completed=done, failed=error';

-- Add index for the new column
CREATE INDEX IF NOT EXISTS photos_ai_identification_status_idx 
  ON photos(ai_identification_status) WHERE ai_identification_status IS NOT NULL;

-- Function to get identification counts for a user
CREATE OR REPLACE FUNCTION get_ai_identification_counts(p_user_id INTEGER)
RETURNS TABLE (
  status VARCHAR(20),
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(proposals.status, 'no_proposals') as status,
    COUNT(*) as count
  FROM ai_identification_proposals proposals
  WHERE proposals.user_id = p_user_id
  GROUP BY ROLLUP(proposals.status);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_ai_identification_counts(INTEGER) IS 
  'Returns count of identification proposals grouped by status for a user';

-- View for quick access to pending proposals with photo metadata
CREATE OR REPLACE VIEW v_ai_identification_pending AS
SELECT 
  p.id,
  p.photo_id,
  p.user_id,
  p.person_name,
  p.bbox,
  p.confidence,
  p.created_at,
  photos.title as photo_title,
  photos.filename as photo_filename,
  photos.s3_key as photo_s3_key,
  photos.taken_at as photo_date,
  users.name as user_name,
  users.role as user_role
FROM ai_identification_proposals p
JOIN photos ON p.photo_id = photos.id
JOIN users ON p.user_id = users.id
WHERE p.status = 'pending'
ORDER BY p.created_at DESC;

COMMENT ON VIEW v_ai_identification_pending IS 
  'View showing all pending AI identification proposals with photo and user metadata';

-- Trigger to update photo identification status when proposals are created
CREATE OR REPLACE FUNCTION update_photo_identification_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If a new pending proposal is added, mark photo as pending
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE photos 
    SET ai_identification_status = 'pending'
    WHERE id = NEW.photo_id
      AND (ai_identification_status IS NULL OR ai_identification_status != 'completed');
    RETURN NEW;
  END IF;
  
  -- If all pending proposals for a photo are resolved, update photo status
  IF TG_OP = 'UPDATE' AND NEW.status != 'pending' THEN
    UPDATE photos 
    SET ai_identification_status = 
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM ai_identification_proposals 
          WHERE photo_id = NEW.photo_id AND status = 'pending'
        ) THEN 'pending'
        WHEN NOT EXISTS (
          SELECT 1 FROM ai_identification_proposals 
          WHERE photo_id = NEW.photo_id AND status IN ('pending', 'accepted', 'rejected', 'edited')
        ) THEN NULL
        ELSE 'completed'
      END
    WHERE id = NEW.photo_id;
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_identification_proposal_status_change
  AFTER INSERT OR UPDATE ON ai_identification_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_photo_identification_status();

COMMENT ON TRIGGER trg_ai_identification_proposal_status_change ON ai_identification_proposals IS 
  'Automatically updates photos.ai_identification_status based on proposal status changes';

-- Migration metadata
INSERT INTO schema_migrations (version, applied_at) 
VALUES ('v16', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Rollback instructions (if needed)
-- DROP TABLE IF EXISTS ai_identification_proposals;
-- ALTER TABLE photos DROP COLUMN IF EXISTS ai_identification_status;
-- DROP FUNCTION IF EXISTS get_ai_identification_counts(INTEGER);
-- DROP VIEW IF EXISTS v_ai_identification_pending;
-- DROP FUNCTION IF EXISTS update_photo_identification_status();
-- DROP TRIGGER IF EXISTS trg_ai_identification_proposal_status_change ON ai_identification_proposals;
