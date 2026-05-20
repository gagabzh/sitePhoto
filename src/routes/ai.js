const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { generate } = require('../ollama');
const { requireEditor, wrapAsync } = require('../middleware');
const { UPLOAD_DIR } = require('../uploadHelpers');

function readB64(filename) {
  return fs.readFileSync(path.join(UPLOAD_DIR, filename)).toString('base64');
}

// ── POST /api/ai/identify-people ──────────────────────────────────────────────
// Accepts { photoId }. Sends the photo (plus any reference photos for known
// people) to Ollama and returns matching name suggestions.
// Degrades gracefully — never crashes when Ollama is unreachable.

router.post('/identify-people', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photoId, 10);
  if (!Number.isInteger(photoId)) return res.status(400).json({ error: 'invalid photoId' });

  const { rows: photoRows } = await db.query('SELECT filename FROM photos WHERE id = $1', [photoId]);
  if (!photoRows.length) return res.status(404).json({ error: 'photo not found' });

  const { rows: tagRows } = await db.query(`
    SELECT t.id, t.name, t.description, t.reference_photo_id, p.filename AS ref_filename
    FROM tags t
    LEFT JOIN photos p ON p.id = t.reference_photo_id
    WHERE t.category = 'people'
    ORDER BY t.name
  `);

  let queryB64;
  try {
    queryB64 = readB64(photoRows[0].filename);
  } catch {
    return res.status(500).json({ error: 'Could not read photo file' });
  }

  // Build images array: reference photos first, query photo last
  const withRef    = tagRows.filter(t => t.ref_filename);
  const withoutRef = tagRows.filter(t => !t.ref_filename);
  const images     = [];

  for (const t of withRef) {
    try { images.push(readB64(t.ref_filename)); }
    catch { /* reference file missing — treat as no reference */ }
  }
  images.push(queryB64);

  const queryImageIndex = images.length; // 1-based for the prompt

  let prompt;
  if (!tagRows.length) {
    prompt = 'Look at the photo. If you see people, describe each one briefly (e.g. "young woman with red hair"). If no people are visible write "none". Do not explain — only list descriptions.';
  } else {
    const refLines = withRef.map((t, i) => {
      const desc = t.description ? ` (${t.description})` : '';
      return `  - Image ${i + 1}: reference photo of ${t.name}${desc}`;
    }).join('\n');

    const noRefLines = withoutRef.map(t => {
      const desc = t.description ? ` (${t.description})` : '';
      return `${t.name}${desc}`;
    }).join(', ');

    prompt = withRef.length
      ? `You are identifying people in a photo. Reference photos are provided to help you recognise known people.\n\nReference photos:\n${refLines}\n\nImage ${queryImageIndex} is the photo to identify.\n\nLook at image ${queryImageIndex}. List only the names of known people you can confidently identify, one per line.${noRefLines ? `\nKnown people without a reference photo: ${noRefLines}.` : ''}\nIf you see someone not in the list write "unknown". If no people are visible write "none". Do not explain — only list names.`
      : `You are identifying people in a photo.\n\nKnown people:\n${tagRows.map(t => `  - ${t.name}${t.description ? ' (' + t.description + ')' : ''}`).join('\n')}\n\nLook at the photo. List only the names of known people you can confidently identify, one per line. If you see someone not in the list write "unknown". If no people are visible write "none". Do not explain — only list names.`;
  }

  let ollamaResponse;
  try {
    ollamaResponse = await generate({ prompt, images });
  } catch (err) {
    return res.status(503).json({ error: err.message, suggestions: [] });
  }

  const responseText = (ollamaResponse.response || '').toLowerCase();
  const suggestions = tagRows
    .filter(t => responseText.includes(t.name.toLowerCase()))
    .map(t => ({ tagId: t.id, name: t.name, hasReference: !!t.ref_filename }));

  res.json({ suggestions, rawResponse: ollamaResponse.response });
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

// ── POST /api/ai/set-reference ────────────────────────────────────────────────
// Sets a photo as the visual reference for a people tag.
// Accepts { tagId, photoId }.

router.post('/set-reference', requireEditor, wrapAsync(async (req, res) => {
  const tagId   = parseInt(req.body.tagId,   10);
  const photoId = parseInt(req.body.photoId, 10);
  if (!Number.isInteger(tagId) || !Number.isInteger(photoId)) {
    return res.status(400).json({ error: 'invalid params' });
  }

  const [{ rows: tags }, { rows: photos }] = await Promise.all([
    db.query("SELECT id FROM tags WHERE id = $1 AND category = 'people'", [tagId]),
    db.query('SELECT id FROM photos WHERE id = $1', [photoId]),
  ]);
  if (!tags.length)   return res.status(404).json({ error: 'people tag not found' });
  if (!photos.length) return res.status(404).json({ error: 'photo not found' });

  await db.query('UPDATE tags SET reference_photo_id = $1 WHERE id = $2', [photoId, tagId]);
  res.json({ ok: true });
}));

module.exports = router;
