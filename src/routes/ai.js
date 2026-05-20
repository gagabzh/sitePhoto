const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { generate } = require('../ollama');
const { requireEditor, wrapAsync } = require('../middleware');
const { UPLOAD_DIR } = require('../uploadHelpers');

// ── POST /api/ai/identify-people ──────────────────────────────────────────────
// Accepts { photoId }. Encodes the photo as base64, asks Ollama to identify
// known people in the image, and returns an array of name suggestions.
// If Ollama is unreachable the endpoint returns a clear error (never crashes).

router.post('/identify-people', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photoId, 10);
  if (!Number.isInteger(photoId)) return res.status(400).json({ error: 'invalid photoId' });

  const { rows } = await db.query('SELECT filename FROM photos WHERE id = $1', [photoId]);
  if (!rows.length) return res.status(404).json({ error: 'photo not found' });

  const { rows: tagRows } = await db.query(
    "SELECT id, name FROM tags WHERE category = 'people' ORDER BY name"
  );
  const knownPeople = tagRows.map(t => t.name);

  let imageB64;
  try {
    const filepath = path.join(UPLOAD_DIR, rows[0].filename);
    imageB64 = fs.readFileSync(filepath).toString('base64');
  } catch {
    return res.status(500).json({ error: 'Could not read photo file' });
  }

  const prompt = knownPeople.length
    ? `You are identifying people in a photo. Known people in this library: ${knownPeople.join(', ')}.\n\nLook at the photo. List only the names of known people you can confidently identify, one per line. If you see someone not in the list write "unknown". If no people are visible write "none". Do not explain — only list names.`
    : `You are identifying people in a photo. Look at the photo. If you see people, describe each one briefly (e.g. "young woman with red hair"). If no people are visible write "none". Do not explain — only list descriptions.`;

  let ollamaResponse;
  try {
    ollamaResponse = await generate({ prompt, images: [imageB64] });
  } catch (err) {
    return res.status(503).json({ error: err.message, suggestions: [] });
  }

  const responseText = (ollamaResponse.response || '').toLowerCase();
  const suggestions = knownPeople.length
    ? tagRows
        .filter(t => responseText.includes(t.name.toLowerCase()))
        .map(t => ({ tagId: t.id, name: t.name }))
    : [];

  res.json({ suggestions, rawResponse: ollamaResponse.response });
}));

// ── POST /api/ai/confirm-tag ──────────────────────────────────────────────────
// Adds a confirmed AI suggestion tag to a photo.
// Accepts { photoId, tagId }.

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
