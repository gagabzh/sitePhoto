'use strict';

const router = require('express').Router();
const { wrapAsync } = require('../middleware');
const { notifyUser } = require('../notifications');
const { downloadPhoto } = require('../storage');
const db = require('../db');
const { downloadFileAsBuffer } = require('../nextcloudWebdav');

function requireWorkerSecret(req, res, next) {
  const secret = process.env.WORKER_API_SECRET;
  if (!secret || req.headers['x-worker-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.post('/identification-result', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { photoId, userId, tags } = req.body;
  if (!photoId || !userId) return res.status(400).json({ error: 'Missing photoId or userId' });

  // Ollama returns a plain string; normalise to a tag list
  const names = String(tags || '')
    .split(/[,\n]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  if (names.length) {
    const { rows: tagRows } = await db.query(
      'INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [names]
    );
    await db.query(
      'INSERT INTO photo_tags (photo_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
      [photoId, tagRows.map(r => r.id)]
    );
  }

  notifyUser(userId, { photoId, tags: names });
  res.json({ ok: true });
}));

router.post('/describe-person-result', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { tagId, description, userId, error } = req.body;
  if (!tagId || !userId) return res.status(400).json({ error: 'Missing tagId or userId' });

  if (error) {
    notifyUser(userId, { tagId, error }, 'describe-person-complete');
  } else {
    await db.query('UPDATE tags SET description = $1 WHERE id = $2', [description || '', tagId]);
    notifyUser(userId, { tagId, description: description || '' }, 'describe-person-complete');
  }
  res.json({ ok: true });
}));

// POST /internal/nextcloud-photo — called by worker to insert imported photo row + tags
// Body: { userId, s3Key, mimeType, shareUrl, latitude, longitude, albumId, tags, importId }
// Returns { photoId }
router.post('/nextcloud-photo', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { userId, s3Key, fileName, mimeType, shareUrl, latitude, longitude, albumId, tags } = req.body;
  if (!userId || !s3Key) {
    return res.status(400).json({ error: 'Missing userId or s3Key' });
  }

  const lat = Number.isFinite(Number(latitude))  ? Number(latitude)  : null;
  const lon = Number.isFinite(Number(longitude)) ? Number(longitude) : null;

  const displayName = fileName || s3Key;
  const { rows: [photo] } = await db.query(
    `INSERT INTO photos (user_id, filename, original_filename, s3_key, title, mime_type, size, nextcloud_url, latitude, longitude, created_at)
     VALUES ($1, $2, $3, $2, $3, $4, 0, $5, $6, $7, NOW())
     RETURNING id`,
    [userId, s3Key, displayName, mimeType || 'image/jpeg', shareUrl || null, lat, lon],
  );
  const photoId = photo.id;

  // Album membership
  if (albumId) {
    await db.query(
      'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [albumId, photoId],
    );
  }

  // Tags
  if (Array.isArray(tags) && tags.length) {
    const cleanTags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
    if (cleanTags.length) {
      const { rows: tagRows } = await db.query(
        'INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [cleanTags],
      );
      await db.query(
        'INSERT INTO photo_tags (photo_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
        [photoId, tagRows.map(r => r.id)],
      );
    }
  }

  res.json({ photoId });
}));

// POST /internal/nextcloud-import-progress — called by worker after each file
// Atomically increments done or failed, then emits a socket.io progress event.
// Body: { userId, importId, succeeded: true|false }
router.post('/nextcloud-import-progress', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { userId, importId, succeeded } = req.body;
  if (!userId || importId == null) {
    return res.status(400).json({ error: 'Missing userId or importId' });
  }

  const col = succeeded ? 'done' : 'failed';
  const { rows } = await db.query(
    `UPDATE nextcloud_imports SET ${col} = ${col} + 1 WHERE id = $1 RETURNING done, total, failed`,
    [importId],
  );
  if (!rows.length) return res.status(404).json({ error: 'Import not found' });

  const { done, total, failed } = rows[0];
  notifyUser(userId, { importId, done, total, failed }, 'nextcloud-import-progress');
  res.json({ ok: true, done, total, failed });
}));

// AI-4: Fetch known face crops for a user — called by worker before Ollama identification
router.get('/known-faces/:userId', requireWorkerSecret, wrapAsync(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Invalid userId' });

  // Fetch most recent crop per distinct person_name, limit 20
  const { rows } = await db.query(
    `SELECT DISTINCT ON (person_name) person_name, crop_s3_key
       FROM person_faces
      WHERE user_id = $1
      ORDER BY person_name, created_at DESC
      LIMIT 20`,
    [userId]
  );

  if (!rows.length) return res.json([]);

  const results = await Promise.all(rows.map(async row => {
    try {
      const buffer = await downloadPhoto(row.crop_s3_key);
      return {
        personName: row.person_name,
        cropBase64: buffer.toString('base64'),
        mimeType: 'image/jpeg',
      };
    } catch {
      return null; // skip missing crops
    }
  }));

  res.json(results.filter(Boolean));
}));

// GET /internal/nextcloud-file — proxy download from Nextcloud for worker
// Query params: shareUrl, fileName
// Returns: file buffer
router.get('/nextcloud-file', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { shareUrl, fileName } = req.query;
  if (!shareUrl || !fileName) {
    return res.status(400).json({ error: 'Missing shareUrl or fileName' });
  }
  
  try {
    const buffer = await downloadFileAsBuffer(shareUrl, fileName);
    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('[internal] nextcloud-file proxy failed:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}));

module.exports = router;
