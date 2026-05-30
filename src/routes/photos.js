const router = require('express').Router();
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const { filterOwnedPhotoIds } = require('../permissions');
const { extractMetadata } = require('../extractMetadata');
const {
  upload, parseCoord, sanitizeNextcloudUrl, setTags, deletePhotos, processAndUpload,
} = require('../uploadHelpers');
const { addIdentificationJob } = require('../queue/producer');
const db = require('../db');
const {
  renderPhotoListPage, renderUploadPage, renderPhotoDetailPage, renderPhotoEditPage,
} = require('./photosViews');
const {
  fetchPhotoPage, fetchPhotoStats, fetchLatestAlbum, bulkApplyTag, bulkRemoveTag,
  insertPhoto, fetchPhotoWithTags, fetchPhotoForEdit, getPhotoOwner, updatePhoto,
} = require('../repositories/photos');
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
  if (cursor !== null && !Number.isFinite(cursor)) return res.status(400).json({ error: 'Invalid cursor' });
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
  if (!photo) return res.status(404).send('Photo not found');

  let photoAlbums = [];
  try {
    photoAlbums = await fetchAlbumsForPhoto(req.params.id, req.session);
  } catch { /* fail silently — page still renders */ }

  const canEdit = canModify(req.session, photo);
  res.send(renderPhotoDetailPage({ photo, canEdit, from, photoAlbums, session: req.session }));
}));

// US-P3: Edit form
router.get('/:id/edit', requireEditor, wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const [photo, albumChoices] = await Promise.all([
    fetchPhotoForEdit(req.params.id),
    fetchAlbumsForPhotoEdit(req.params.id, req.session),
  ]);
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  res.send(renderPhotoEditPage({ photo, from, albumChoices, session: req.session }));
}));

// US-P3: Save edits
router.post('/:id', requireEditor, wrapAsync(async (req, res) => {
  const photo = await getPhotoOwner(req.params.id);
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

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
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await setTags(req.params.id, tags || '');
  res.redirect(`/photos/${req.params.id}`);
}));

// US-P4: Delete
router.post('/:id/delete', requireEditor, wrapAsync(async (req, res) => {
  const photo = await getPhotoOwner(req.params.id);
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  await deletePhotos([parseInt(req.params.id)]);
  res.redirect('/photos');
}));

module.exports = router;
