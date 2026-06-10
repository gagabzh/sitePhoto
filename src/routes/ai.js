const router = require('express').Router();
const crypto = require('crypto');
const sharp = require('sharp');
const db = require('../db');
const { requireEditor, wrapAsync } = require('../middleware');
const { addIdentificationJob } = require('../queue/producer');
const { uploadPhoto, downloadPhoto } = require('../storage');

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
// Adds a confirmed AI suggestion tag to a photo.
// Accepts { photoId, tagId, personName, bbox? }.
// If bbox is provided and it's a people tag, also creates a person_faces entry.

router.post('/confirm-tag', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photoId, 10);
  const tagId   = parseInt(req.body.tagId,   10);
  const personName = req.body.personName;
  const bbox = req.body.bbox;
  
  if (!Number.isInteger(photoId) || !Number.isInteger(tagId)) {
    return res.status(400).json({ error: 'invalid params' });
  }

  const [{ rows: photos }, { rows: tags }] = await Promise.all([
    db.query('SELECT id, s3_key, user_id FROM photos WHERE id = $1', [photoId]),
    db.query('SELECT id, name, category FROM tags WHERE id = $1', [tagId]),
  ]);
  if (!photos.length) return res.status(404).json({ error: 'photo not found' });
  if (!tags.length)   return res.status(404).json({ error: 'tag not found' });

  const photo = photos[0];
  const tag = tags[0];
  
  // Check if this is a people tag
  const isPeopleTag = tag.category === 'people';
  
  // Link tag to photo
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [photoId, tagId]
  );

  // If this is a people tag with a bounding box, store the face crop
  if (isPeopleTag && bbox && personName) {
    try {
      // Validate bbox
      if (!bbox.x || !bbox.y || !bbox.width || !bbox.height) {
        console.warn('[ai/confirm-tag] Invalid bbox format');
      } else if (
        typeof bbox.x !== 'number' || typeof bbox.y !== 'number' ||
        typeof bbox.width !== 'number' || typeof bbox.height !== 'number' ||
        bbox.x < 0 || bbox.x > 1 || bbox.y < 0 || bbox.y > 1 ||
        bbox.width < 0 || bbox.width > 1 || bbox.height < 0 || bbox.height > 1
      ) {
        console.warn('[ai/confirm-tag] Bbox values out of range [0, 1]');
      } else if (bbox.x + bbox.width > 1 || bbox.y + bbox.height > 1) {
        console.warn('[ai/confirm-tag] Bbox extends beyond image boundary');
      } else {
        // Download full-resolution from S3
        const buffer = await downloadPhoto(photo.s3_key);
        
        // Get image dimensions
        const { width: imgWidth, height: imgHeight } = await sharp(buffer).metadata();
        
        // Compute crop region
        const cropX      = Math.round(bbox.x * imgWidth);
        const cropY      = Math.round(bbox.y * imgHeight);
        const cropWidth  = Math.round(bbox.width * imgWidth);
        const cropHeight = Math.round(bbox.height * imgHeight);
        
        if (cropWidth < 20 || cropHeight < 20) {
          console.warn('[ai/confirm-tag] Bounding box is too small (minimum 20×20 px)');
        } else {
          // Crop and encode
          const cropBuffer = await sharp(buffer)
            .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
            .jpeg({ quality: 85 })
            .toBuffer();
          
          // Upload crop to S3
          const cropKey = 'faces/' + crypto.randomUUID() + '.jpg';
          await uploadPhoto(cropKey, cropBuffer, 'image/jpeg');
          
          // Insert person_faces record
          await db.query(
            `INSERT INTO person_faces (user_id, person_name, photo_id, bbox, crop_s3_key)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [req.session.userId, personName.toLowerCase(), photoId, JSON.stringify(bbox), cropKey]
          );
        }
      }
    } catch (err) {
      console.error('[ai/confirm-tag] Failed to store face crop:', err.message);
      // Continue - tag was still added to photo_tags
    }
  }

  res.json({ ok: true });
}));

module.exports = router;
