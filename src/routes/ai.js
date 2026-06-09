const router = require('express').Router();
const db = require('../db');
const { requireEditor, wrapAsync } = require('../middleware');
const { addIdentificationJob } = require('../queue/producer');

// ── POST /api/ai/identify-people ──────────────────────────────────────────────
// Accepts { photoId }. Enqueues a manual-identify-photo job on Instance-2.
// The worker sends the photo + reference photos to Ollama and POSTs results
// to /internal/identify-people-result, which notifies the client via WebSocket.

router.post('/identify-people', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photoId, 10);
  const userId = req.session.userId;
  
  if (!Number.isInteger(photoId)) return res.status(400).json({ error: 'invalid photoId' });
  if (!userId) return res.status(401).json({ error: 'not authenticated' });

  const { rows: photoRows } = await db.query('SELECT s3_key FROM photos WHERE id = $1', [photoId]);
  if (!photoRows.length) return res.status(404).json({ error: 'photo not found' });

  await addIdentificationJob({
    photoId,
    userId,
    photoS3Key: photoRows[0].s3_key,
    source: 'manual'
  });

  res.json({ queued: true });
}));

// ── POST /api/ai/confirm-tag ──────────────────────────────────────────────────
// Adds a confirmed AI suggestion tag to a photo. Accepts { photoId, tagId }.

router.post('/confirm-tag', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photoId, 10);
  const tagId   = parseInt(req.body.tagId,   10);
  if (!Number.isInteger(photoId) || !Number.isInteger(tagId)) {
    return res.status(400).json({ error: 'invalid params' });
  }

  const [{ rows: photos }, { rows: tags }] = await Promise.all([
    db.query('SELECT id FROM photos WHERE id = $1', [photoId]),
    db.query('SELECT id FROM tags WHERE id = $1', [tagId]),
  ]);
  if (!photos.length) return res.status(404).json({ error: 'photo not found' });
  if (!tags.length)   return res.status(404).json({ error: 'tag not found' });

  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [photoId, tagId]
  );
  res.json({ ok: true });
}));

module.exports = router;
