const router = require('express').Router();
const crypto = require('crypto');
const sharp = require('sharp');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const { filterOwnedPhotoIds } = require('../permissions');
const errors = require('../utils/errors');
const { extractMetadata } = require('../extractMetadata');
const {
  upload, parseCoord, sanitizeNextcloudUrl, setTags, deletePhotos, processAndUpload,
} = require('../uploadHelpers');
const { addIdentificationJob } = require('../queue/producer');
const { uploadPhoto, downloadPhoto, deletePhoto } = require('../storage');
const db = require('../db');
const {
  renderPhotoListPage, renderUploadPage, renderPhotoDetailPage, renderPhotoEditPage,
} = require('./photosViews');
const {
  fetchPhotoPage, fetchPhotoStats, fetchLatestAlbum, bulkApplyTag, bulkRemoveTag,
  insertPhoto, fetchPhotoWithTags, fetchPhotoForEdit, getPhotoOwner,
} = require('../repositories/photos');
const { fetchPersonFacesForPhoto } = require('../repositories/personFaces');
const { fetchAlbumsForPhoto, fetchAlbumsForPhotoEdit } = require('../repositories/albums');

function parseFrom(raw) {
  if (typeof raw !== 'string') return null;
  return /^\/photos$|^\/albums\/\d+$|^\/travels\/[a-z0-9-]+$/.test(raw) ? raw : null;
}

// NC-4/5: Nextcloud import sub-router — must be registered before /:id to avoid shadowing
router.use('/nextcloud-import', require('./nextcloudImport'));

// US-P1: Photo list — Family Wall layout
router.get('/', requireEditor, wrapAsync(async (req, res) => {
  const isEditor = req.session.role === 'editor' || req.session.role === 'admin';

  // NC-5: query active import for the progress banner (fail silently on DB error)
  let activeImport = null;
  if (isEditor) {
    try {
      const { rows: importRows } = await db.query(
        `SELECT id, total, done, failed
           FROM nextcloud_imports
          WHERE user_id = $1
            AND done + failed < total
          ORDER BY created_at DESC
          LIMIT 1`,
        [req.session.userId],
      );
      activeImport = importRows[0] || null;
    } catch { /* fail silently — do not block the photos page */ }
  }

  const [{ photos, nextCursor }, stats, latestAlbum] = await Promise.all([
    fetchPhotoPage(null, 24),
    fetchPhotoStats(),
    fetchLatestAlbum(),
  ]);
  const rows = photos.map(p => ({ ...p, canEdit: canModify(req.session, p) }));
  res.send(renderPhotoListPage({
    rows, uploaders: stats.uploaders, topTags: stats.topTags,
    total: stats.total, nextCursor, latestAlbum, session: req.session, activeImport,
  }));
}));

// Cursor-based pagination for lazy loading (must be before /:id)
router.get('/api/page', requireEditor, wrapAsync(async (req, res) => {
  const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : null;
  const limit  = Math.min(parseInt(req.query.limit, 10) || 24, 100);
  if (cursor !== null && !Number.isFinite(cursor)) return errors.badRequest(res, 'Invalid cursor');
  const { photos, nextCursor } = await fetchPhotoPage(cursor, limit);
  res.json({
    photos: photos.map(p => ({
      id: p.id, filename: p.filename, title: p.title,
      canEdit: canModify(req.session, p),
    })),
    nextCursor,
  });
}));

// Bulk tag selected photos
router.post('/bulk-tag', requireEditor, wrapAsync(async (req, res) => {
  const tag = (req.body.tag || '').trim().toLowerCase();
  const raw = req.body.photo_ids;
  if (!tag || !raw) return res.redirect('/photos');

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect('/photos');

  const allowedIds = await filterOwnedPhotoIds(req.session, ids);
  if (!allowedIds.length) return res.redirect('/photos');

  await bulkApplyTag(tag, allowedIds);

  res.redirect('/photos');
}));

// Bulk untag selected photos
router.post('/bulk-untag', requireEditor, wrapAsync(async (req, res) => {
  const tag = (req.body.tag || '').trim().toLowerCase();
  const raw = req.body.photo_ids;
  if (!tag || !raw) return res.redirect('/photos');

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect('/photos');

  const allowedIds = await filterOwnedPhotoIds(req.session, ids);
  if (!allowedIds.length) return res.redirect('/photos');

  await bulkRemoveTag(tag, allowedIds);
  res.redirect('/photos');
}));

// Bulk delete selected photos
router.post('/bulk-delete', requireEditor, wrapAsync(async (req, res) => {
  const raw = req.body.photo_ids;
  if (!raw) return res.redirect('/photos');

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect('/photos');

  const allowedIds = await filterOwnedPhotoIds(req.session, ids);
  if (!allowedIds.length) return res.redirect('/photos');

  await deletePhotos(allowedIds);
  res.redirect('/photos');
}));

// US-P1: Upload form
router.get('/upload', requireEditor, (req, res) => {
  const errors = {
    type: 'Only JPEG, PNG, GIF and WebP images are accepted.',
    size: 'File is too large (max 10 MB).',
    fail: 'Upload failed. Please try again.',
  };
  res.send(renderUploadPage({ error: errors[req.query.error] || null, session: req.session }));
});

// US-P1/P2: Handle upload
router.post('/upload', requireEditor, (req, res, next) => {
  upload.single('photo')(req, res, async (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.redirect('/photos/upload?error=size');
    if (err || !req.file) return res.redirect('/photos/upload?error=type');

    const { title, description, tags, taken_at, latitude, longitude, nextcloud_url } = req.body;
    try {
      const [{ filename, size: finalSize }, exif] = await Promise.all([
        processAndUpload(req.file),
        extractMetadata(req.file.buffer),
      ]);
      const ncUrl = sanitizeNextcloudUrl(nextcloud_url);
      const resolvedTakenAt = taken_at || (exif.takenAt ? exif.takenAt.toISOString().split('T')[0] : null);
      const resolvedLat = exif.latitude  ?? parseCoord(latitude, -90, 90)   ?? null;
      const resolvedLon = exif.longitude ?? parseCoord(longitude, -180, 180) ?? null;
      const photoId = await insertPhoto({
        userId: req.session.userId, filename, s3Key: filename, originalFilename: req.file.originalname,
        title, description: description || null, mimeType: req.file.mimetype, size: finalSize,
        takenAt: resolvedTakenAt, exposureTime: exif.exposureTime || null, focalLength: exif.focalLength || null,
        lat: resolvedLat, lon: resolvedLon, ncUrl,
      });
      if (tags) await setTags(photoId, tags);
      addIdentificationJob({ photoId, userId: req.session.userId, photoS3Key: filename }).catch(() => {});
      res.redirect(`/photos/${photoId}`);
    } catch (e) {
      next(e);
    }
  });
});

// View single photo (all authenticated users)
router.get('/:id', wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const photo = await fetchPhotoWithTags(req.params.id);
  if (!photo) return errors.notFound(res, 'Photo', false);

  let photoAlbums = [];
  try {
    photoAlbums = await fetchAlbumsForPhoto(req.params.id, req.session);
  } catch { /* fail silently — page still renders */ }

  let personFaces = [];
  try {
    personFaces = await fetchPersonFacesForPhoto(req.params.id);
  } catch { /* fail silently — page still renders */ }

  const canEdit = canModify(req.session, photo);
  res.send(renderPhotoDetailPage({ photo, canEdit, from, photoAlbums, personFaces, session: req.session }));
}));

// US-P3: Edit form
router.get('/:id/edit', requireEditor, wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const [photo, albumChoices] = await Promise.all([
    fetchPhotoForEdit(req.params.id),
    fetchAlbumsForPhotoEdit(req.params.id, req.session),
  ]);
  if (!photo) return errors.notFound(res, 'Photo', false);
  if (!canModify(req.session, photo)) return errors.accessDenied(res, false);

  res.send(renderPhotoEditPage({ photo, from, albumChoices, session: req.session }));
}));

// US-P3: Save edits
router.post('/:id', requireEditor, wrapAsync(async (req, res) => {
  const photo = await getPhotoOwner(req.params.id);
  if (!photo) return errors.notFound(res, 'Photo', false);
  if (!canModify(req.session, photo)) return errors.accessDenied(res, false);

  const { title, description, tags, taken_at, latitude, longitude, nextcloud_url } = req.body;
  const ncUrl = sanitizeNextcloudUrl(nextcloud_url);
  const lat = parseCoord(latitude, -90, 90);
  const lon = parseCoord(longitude, -180, 180);

  const availableAlbums = await fetchAlbumsForPhotoEdit(req.params.id, req.session);
  const availableIds = new Set(availableAlbums.map(a => a.id));
  const currentlyChecked = new Set(availableAlbums.filter(a => a.checked).map(a => a.id));
  const rawAlbumIds = [].concat(req.body.album_ids || []).map(Number).filter(n => n > 0);
  const requestedIds = new Set(rawAlbumIds.filter(id => availableIds.has(id)));
  const toAdd    = [...requestedIds].filter(id => !currentlyChecked.has(id));
  const toRemove = [...currentlyChecked].filter(id => !requestedIds.has(id));

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE photos SET title = $1, description = $2, taken_at = $3, nextcloud_url = $4, latitude = $5, longitude = $6, updated_at = NOW() WHERE id = $7',
      [title, description || null, taken_at || null, ncUrl, lat, lon, req.params.id]
    );
    for (const albumId of toAdd) {
      await client.query(
        'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [albumId, req.params.id]
      );
    }
    for (const albumId of toRemove) {
      await client.query(
        'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2',
        [albumId, req.params.id]
      );
    }
    // Inline setTags inside the transaction so tag changes are atomic with photo/album changes
    await client.query('DELETE FROM photo_tags WHERE photo_id = $1', [req.params.id]);
    const tagNames = String(tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (tagNames.length) {
      const { rows: tagRows } = await client.query(
        'INSERT INTO tags (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [tagNames]
      );
      await client.query(
        'INSERT INTO photo_tags (photo_id, tag_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
        [req.params.id, tagRows.map(r => r.id)]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {}); // ignore rollback error — original error takes priority
    throw e;
  } finally {
    client.release();
  }

  res.redirect(`/photos/${req.params.id}`);
}));

// AI-3: Tag a person face on a photo
router.post('/:id/tag-person', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.params.id, 10);
  const { personName: rawName, bbox } = req.body;

  // Validate personName
  const personName = typeof rawName === 'string' ? rawName.trim() : '';
  if (!personName || personName.length > 100) {
    return errors.validation(res, 'personName is required and must be ≤ 100 characters');
  }

  // Validate bbox
  if (!bbox || typeof bbox !== 'object') {
    return errors.validation(res, 'bbox is required');
  }
  const { x, y, width, height } = bbox;
  if (
    typeof x !== 'number' || typeof y !== 'number' ||
    typeof width !== 'number' || typeof height !== 'number' ||
    x < 0 || x > 1 || y < 0 || y > 1 ||
    width < 0 || width > 1 || height < 0 || height > 1
  ) {
    return errors.validation(res, 'bbox fields must be numbers in [0, 1]');
  }
  if (x + width > 1 || y + height > 1) {
    return errors.validation(res, 'bbox extends beyond image boundary');
  }

  // Fetch photo (include user_id for ownership check)
  const { rows: photoRows } = await db.query(
    'SELECT id, filename, s3_key, user_id FROM photos WHERE id = $1',
    [photoId]
  );
  if (!photoRows.length) return errors.notFound(res, 'Photo');
  const photo = photoRows[0];

  // Ownership check — only the photo owner or admin may tag faces
  if (!canModify(req.session, photo)) return errors.accessDenied(res);

  // Download full-resolution from S3
  const buffer = await downloadPhoto(photo.s3_key);

  // Get image dimensions
  const { width: imgWidth, height: imgHeight } = await sharp(buffer).metadata();

  // Compute crop region
  const cropX      = Math.round(x * imgWidth);
  const cropY      = Math.round(y * imgHeight);
  const cropWidth  = Math.round(width * imgWidth);
  const cropHeight = Math.round(height * imgHeight);

  if (cropWidth < 20 || cropHeight < 20) {
    return errors.validation(res, 'Bounding box is too small (minimum 20×20 px)');
  }

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
    [personName.toLowerCase()]
  );
  const tagId = tagRows[0].id;

  // Insert person_faces record
  const { rows: faceRows } = await db.query(
    `INSERT INTO person_faces (user_id, person_name, photo_id, bbox, crop_s3_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [req.session.userId, personName, photoId, JSON.stringify({ x, y, width, height }), cropKey]
  );

  // Link person tag to photo so it appears in tag search
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [photoId, tagId]
  );

  res.status(201).json({ id: faceRows[0].id, personName, cropKey });
}));

// AI-3: Delete a person face tag
router.delete('/:photoId/tag-person/:personFaceId', requireEditor, wrapAsync(async (req, res) => {
  const photoId     = parseInt(req.params.photoId, 10);
  const faceId      = parseInt(req.params.personFaceId, 10);

  // Fetch face record
  const { rows: faceRows } = await db.query(
    'SELECT id, user_id, crop_s3_key FROM person_faces WHERE id = $1 AND photo_id = $2',
    [faceId, photoId]
  );
  if (!faceRows.length) return errors.notFound(res, 'Face tag');
  const face = faceRows[0];

  // Ownership check — owner or admin
  if (face.user_id !== req.session.userId && req.session.role !== 'admin') {
    return errors.accessDenied(res);
  }

  // Delete S3 crop — fire and forget, guard against non-face keys
  if (!face.crop_s3_key.startsWith('faces/')) {
    console.error('[tag-person] Refusing to delete non-face S3 key:', face.crop_s3_key);
    return errors.serverError(res);
  }
  deletePhoto(face.crop_s3_key).catch(err => {
    console.warn('[tag-person] S3 crop delete failed:', err.message);
  });

  // Delete DB record
  await db.query('DELETE FROM person_faces WHERE id = $1', [faceId]);

  res.status(204).end();
}));

// US-P4: Delete
router.post('/:id/delete', requireEditor, wrapAsync(async (req, res) => {
  const photo = await getPhotoOwner(req.params.id);
  if (!photo) return errors.notFound(res, 'Photo', false);
  if (!canModify(req.session, photo)) return errors.accessDenied(res, false);

  const from = parseFrom(req.body.from);
  await deletePhotos([parseInt(req.params.id)]);
  res.redirect(from || '/photos');
}));

module.exports = router;
