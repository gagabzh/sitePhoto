'use strict';

const router = require('express').Router();
const crypto = require('crypto');
const sharp = require('sharp');
const { wrapAsync } = require('../middleware');
const { notifyUser } = require('../notifications');
const { downloadPhoto, uploadPhoto } = require('../storage');
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

// ── POST /internal/identify-people-result ─────────────────────────────────────
// Called by worker after processing an identify-photo job.
// Body: { photoId, userId, suggestions, error? }
// Suggestions format: [{ name, hasReference, bbox }]
router.post('/identify-people-result', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { photoId, userId, suggestions, error } = req.body;
  if (!photoId || !userId) return res.status(400).json({ error: 'Missing photoId or userId' });

  if (error) {
    notifyUser(userId, { photoId, error }, 'identify-people-complete');
  } else {
    // Enrich suggestions with tag IDs
    const enrichedSuggestions = await Promise.all(
      (suggestions || []).map(async (s) => {
        // Upsert the tag with category 'people'
        const { rows: tagRows } = await db.query(
          `INSERT INTO tags (name, category) VALUES ($1, 'people')
           ON CONFLICT (name) DO UPDATE SET category = 'people'
           RETURNING id`,
          [s.name.toLowerCase()]
        );
        const tagId = tagRows[0]?.id;
        
        return {
          tagId,
          name: s.name,
          hasReference: s.hasReference || false,
          bbox: s.bbox,
        };
      })
    );
    
    notifyUser(userId, { photoId, suggestions: enrichedSuggestions }, 'identify-people-complete');
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
  const ncUrl = shareUrl ? String(shareUrl) : null;
  const { rows: [photo] } = await db.query(
    `INSERT INTO photos (user_id, filename, original_filename, s3_key, title, mime_type, size, nextcloud_url, latitude, longitude, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, NOW())
     RETURNING id`,
    [userId, s3Key, displayName, s3Key, displayName, mimeType || 'image/jpeg', ncUrl, lat, lon],
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

// ── POST /internal/store-people-faces ──────────────────────────────────────
// Called by worker to store face crops for AI-identified people.
// Body: { photoId, userId, photoS3Key, suggestions }
// For each suggestion with a valid bbox, extracts the face crop and stores in person_faces.
router.post('/store-people-faces', requireWorkerSecret, wrapAsync(async (req, res) => {
  const { photoId, userId, photoS3Key, suggestions } = req.body;
  if (!photoId || !userId || !photoS3Key) {
    return res.status(400).json({ error: 'Missing photoId, userId, or photoS3Key' });
  }

  const photoInt = parseInt(photoId, 10);
  const userInt = parseInt(userId, 10);
  if (!Number.isInteger(photoInt) || !Number.isInteger(userInt)) {
    return res.status(400).json({ error: 'Invalid photoId or userId' });
  }

  const validSuggestions = (suggestions || []).filter(s => 
    s && s.name && s.bbox && 
    s.bbox.x != null && s.bbox.y != null && s.bbox.width != null && s.bbox.height != null
  );

  if (!validSuggestions.length) {
    return res.json({ stored: 0 });
  }

  // Download the photo once
  let buffer;
  try {
    buffer = await downloadPhoto(photoS3Key);
  } catch (err) {
    console.warn('[internal/store-people-faces] Failed to download photo:', err.message);
    return res.status(404).json({ error: 'Photo not found' });
  }

  // Get image dimensions
  const { width: imgWidth, height: imgHeight } = await sharp(buffer).metadata();

  // Store each valid suggestion
  const stored = [];
  for (const suggestion of validSuggestions) {
    const { name, bbox } = suggestion;
    
    // Validate bbox
    if (
      typeof bbox.x !== 'number' || typeof bbox.y !== 'number' ||
      typeof bbox.width !== 'number' || typeof bbox.height !== 'number' ||
      bbox.x < 0 || bbox.x > 1 || bbox.y < 0 || bbox.y > 1 ||
      bbox.width < 0 || bbox.width > 1 || bbox.height < 0 || bbox.height > 1 ||
      bbox.x + bbox.width > 1 || bbox.y + bbox.height > 1
    ) {
      console.warn('[internal/store-people-faces] Invalid bbox:', bbox);
      continue;
    }

    // Compute crop region
    const cropX = Math.round(bbox.x * imgWidth);
    const cropY = Math.round(bbox.y * imgHeight);
    const cropWidth = Math.round(bbox.width * imgWidth);
    const cropHeight = Math.round(bbox.height * imgHeight);

    if (cropWidth < 20 || cropHeight < 20) {
      console.warn('[internal/store-people-faces] Bounding box too small:', bbox);
      continue;
    }

    try {
      // Crop and encode
      const cropBuffer = await sharp(buffer)
        .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
        .jpeg({ quality: 85 })
        .toBuffer();

      // Upload crop to S3
      const cropKey = 'faces/' + crypto.randomUUID() + '.jpg';
      await uploadPhoto(cropKey, cropBuffer, 'image/jpeg');

      // Upsert tag with category 'people'
      const { rows: tagRows } = await db.query(
        `INSERT INTO tags (name, category) VALUES ($1, 'people')
         ON CONFLICT (name) DO UPDATE SET category = 'people'
         RETURNING id`,
        [name.toLowerCase()]
      );
      const tagId = tagRows[0]?.id;

      // Link tag to photo
      if (tagId) {
        await db.query(
          'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [photoInt, tagId]
        );
      }

      // Store face crop
      await db.query(
        `INSERT INTO person_faces (user_id, person_name, photo_id, bbox, crop_s3_key)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [userInt, name.toLowerCase(), photoInt, JSON.stringify(bbox), cropKey]
      );

      stored.push({ name, tagId });
    } catch (err) {
      console.error('[internal/store-people-faces] Failed to store face for', name, ':', err.message);
    }
  }

  // Notify user that identification is complete and face crops have been stored
  if (stored.length > 0) {
    const tagNames = stored.map(s => s.name);
    notifyUser(userId, { photoId, tags: tagNames });
  }

  res.json({ stored: stored.length, tags: stored.map(s => s.name) });
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
