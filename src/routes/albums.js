const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const { filterAlbumPhotoIds } = require('../permissions');
const { optimizePhoto } = require('../imageOptimizer');
const { extractMetadata } = require('../extractMetadata');
const {
  UPLOAD_DIR, upload, parseCoord, sanitizeNextcloudUrl, setTags, deletePhotos,
} = require('../uploadHelpers');
const {
  renderAlbumListPage, renderNewAlbumPage, renderNewFromFolderPage, renderAlbumDetailPage,
  renderAlbumEditPage, renderAlbumAccessPage, renderAddPhotosPage,
  renderUploadToAlbumPage, renderBatchUploadPage,
} = require('./albumsViews');
const {
  fetchAlbumList, createAlbum, getAlbum, getAlbumOwner, getAlbumWithCreator,
  fetchAlbumPhotos, checkViewerAccess, bulkRemovePhotosFromAlbum,
  fetchViewerAccessLists, addViewerAccess, removeViewerAccess,
  updateAlbum, deleteAlbum, fetchPhotosNotInAlbum, linkPhotoToAlbum,
  removePhotoFromAlbum, insertNewAlbumPhoto,
} = require('../repositories/albums');
const { insertPhoto } = require('../repositories/photos');

function parseFrom(raw) {
  if (typeof raw !== 'string') return null;
  return /^\/albums$|^\/travels\/[a-z0-9-]+$/.test(raw) ? raw : null;
}

// ── Album list (all roles) ───────────────────────────────────────────────────

router.get('/', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const rows = await fetchAlbumList(req.session);
  res.send(renderAlbumListPage({ rows, isViewer, session: req.session }));
}));

// ── US-A1: Create album ──────────────────────────────────────────────────────

router.get('/new', requireEditor, (req, res) => {
  res.send(renderNewAlbumPage({ session: req.session }));
});

// ── Create album from folder ─────────────────────────────────────────────────

router.get('/new/folder', requireEditor, (req, res) => {
  res.send(renderNewFromFolderPage({ session: req.session }));
});

router.post('/new/folder', requireEditor, (req, res, next) => {
  upload.array('photos', 200)(req, res, async (err) => {
    if (err) return next(err);
    const { title, description, tags } = req.body;
    const sharedLat = parseCoord(req.body.latitude, -90, 90);
    const sharedLon = parseCoord(req.body.longitude, -180, 180);
    try {
      const albumId = await createAlbum(req.session.userId, title, description || null);

      for (const file of (req.files || [])) {
        const filepath = path.join(UPLOAD_DIR, file.filename);
        const [finalSize, meta] = await Promise.all([
          optimizePhoto(filepath, file.mimetype),
          extractMetadata(filepath),
        ]);

        const lat = meta.latitude ?? sharedLat;
        const lon = meta.longitude ?? sharedLon;
        const photoTitle = path.basename(file.originalname, path.extname(file.originalname));

        const { rows: [photo] } = await db.query(
          `INSERT INTO photos
            (user_id, filename, original_filename, title, mime_type, size, taken_at, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [req.session.userId, file.filename, file.originalname, photoTitle,
           file.mimetype, finalSize, meta.takenAt || null, lat, lon]
        );
        await insertNewAlbumPhoto(albumId, photo.id);
        if (tags) await setTags(photo.id, tags);
      }

      res.redirect(`/albums/${albumId}`);
    } catch (e) {
      next(e);
    }
  });
});

router.post('/', requireEditor, wrapAsync(async (req, res) => {
  const { title, description } = req.body;
  const id = await createAlbum(req.session.userId, title, description || null);
  res.redirect(`/albums/${id}`);
}));

// ── Album detail (all roles) ─────────────────────────────────────────────────

router.get('/:id', wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const [album, photos] = await Promise.all([
    getAlbumWithCreator(req.params.id),
    fetchAlbumPhotos(req.params.id),
  ]);

  if (!album) return res.status(404).send('Album not found');

  if (req.session.role === 'viewer') {
    const hasAccess = await checkViewerAccess(req.params.id, req.session.userId);
    if (!hasAccess) return res.status(403).send('Access denied');
  }

  const canEdit = canModify(req.session, album);
  res.send(renderAlbumDetailPage({ album, photos, canEdit, from, session: req.session }));
}));

// ── Bulk remove photos from album ────────────────────────────────────────────

router.post('/:id/photos/bulk-remove', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const raw = req.body.photo_ids;
  if (!raw) return res.redirect(`/albums/${req.params.id}`);

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect(`/albums/${req.params.id}`);

  await bulkRemovePhotosFromAlbum(req.params.id, ids);
  res.redirect(`/albums/${req.params.id}`);
}));

// ── Bulk delete photos from album ────────────────────────────────────────────

router.post('/:id/photos/bulk-delete', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const raw = req.body.photo_ids;
  if (!raw) return res.redirect(`/albums/${req.params.id}`);

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect(`/albums/${req.params.id}`);

  const allowedIds = await filterAlbumPhotoIds(req.session, req.params.id, ids);
  if (!allowedIds.length) return res.redirect(`/albums/${req.params.id}`);

  await deletePhotos(allowedIds);
  res.redirect(`/albums/${req.params.id}`);
}));

// ── US-A3: Edit album ────────────────────────────────────────────────────────

router.get('/:id/edit', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  res.send(renderAlbumEditPage({ album, session: req.session }));
}));

// ── AC1-AC2: Manage viewer access ────────────────────────────────────────────

router.get('/:id/access', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const { withAccess, withoutAccess } = await fetchViewerAccessLists(req.params.id);

  res.send(renderAlbumAccessPage({
    album,
    withAccess,
    withoutAccess,
    session: req.session,
  }));
}));

router.post('/:id/access/add', requireEditor, wrapAsync(async (req, res) => {
  const viewerId = parseInt(req.body.viewer_id, 10);
  if (!Number.isInteger(viewerId)) return res.status(400).send('Invalid id');
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await addViewerAccess(req.params.id, viewerId);
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id/access/remove', requireEditor, wrapAsync(async (req, res) => {
  const viewerId = parseInt(req.body.viewer_id, 10);
  if (!Number.isInteger(viewerId)) return res.status(400).send('Invalid id');
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await removeViewerAccess(req.params.id, viewerId);
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const { title, description } = req.body;
  await updateAlbum(req.params.id, title, description || null);
  res.redirect(`/albums/${req.params.id}`);
}));

// ── US-A3: Delete album ──────────────────────────────────────────────────────

router.post('/:id/delete', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await deleteAlbum(req.params.id);
  res.redirect('/albums');
}));

// ── US-A2: Add photos to album (moves photo from its current album) ──────────

router.get('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const photos = await fetchPhotosNotInAlbum(req.params.id);

  res.send(renderAddPhotosPage({ album, photos, session: req.session }));
}));

router.post('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photo_id, 10);
  if (!Number.isInteger(photoId)) return res.status(400).send('Invalid id');
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await linkPhotoToAlbum(req.params.id, photoId);
  res.redirect(`/albums/${req.params.id}/photos/add`);
}));

// ── US-A2: Remove photo from album ──────────────────────────────────────────

router.post('/:id/photos/remove', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photo_id, 10);
  if (!Number.isInteger(photoId)) return res.status(400).send('Invalid id');
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await removePhotoFromAlbum(req.params.id, photoId);
  res.redirect(`/albums/${req.params.id}`);
}));

// ── Upload photo directly into album ────────────────────────────────────────

router.get('/:id/photos/upload', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const errors = {
    type: 'Only JPEG, PNG, GIF and WebP images are accepted.',
    size: 'File is too large (max 10 MB).',
    fail: 'Upload failed. Please try again.',
  };
  res.send(renderUploadToAlbumPage({ album, errorMsg: errors[req.query.error] || null, session: req.session }));
}));

router.post('/:id/photos/upload', requireEditor, async (req, res, next) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  upload.single('photo')(req, res, async (err) => {
    const albumId = req.params.id;
    if (err && err.code === 'LIMIT_FILE_SIZE')
      return res.redirect(`/albums/${albumId}/photos/upload?error=size`);
    if (err || !req.file)
      return res.redirect(`/albums/${albumId}/photos/upload?error=type`);

    const { title, description, tags, latitude, longitude, nextcloud_url } = req.body;
    try {
      const filepath = path.join(UPLOAD_DIR, req.file.filename);
      const [finalSize, exif] = await Promise.all([
        optimizePhoto(filepath, req.file.mimetype),
        extractMetadata(filepath),
      ]);
      const ncUrl = sanitizeNextcloudUrl(nextcloud_url);
      const takenAt = exif.takenAt ? exif.takenAt.toISOString().split('T')[0] : null;
      const lat = exif.latitude  ?? parseCoord(latitude, -90, 90)   ?? null;
      const lon = exif.longitude ?? parseCoord(longitude, -180, 180) ?? null;
      const photoId = await insertPhoto({
        userId: req.session.userId, filename: req.file.filename, originalFilename: req.file.originalname,
        title, description: description || null, mimeType: req.file.mimetype, size: finalSize,
        takenAt, exposureTime: exif.exposureTime || null, focalLength: exif.focalLength || null,
        lat, lon, ncUrl,
      });
      await insertNewAlbumPhoto(albumId, photoId);
      if (tags) await setTags(photoId, tags);
      res.redirect(`/albums/${albumId}`);
    } catch (e) {
      next(e);
    }
  });
});

// ── IMP-2: Batch upload to album ─────────────────────────────────────────────

router.get('/:id/photos/batch', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  res.send(renderBatchUploadPage({ album, session: req.session }));
}));

router.post('/:id/photos/batch', requireEditor, async (req, res, next) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  upload.array('photos', 200)(req, res, async (err) => {
    if (err) return next(err);

    const sharedTags = req.body.tags || '';
    const sharedLat = parseCoord(req.body.latitude, -90, 90);
    const sharedLon = parseCoord(req.body.longitude, -180, 180);

    try {
      for (const file of (req.files || [])) {
        const filepath = path.join(UPLOAD_DIR, file.filename);
        const [finalSize, meta] = await Promise.all([
          optimizePhoto(filepath, file.mimetype),
          extractMetadata(filepath),
        ]);

        const lat = meta.latitude ?? sharedLat;
        const lon = meta.longitude ?? sharedLon;
        const photoTitle = path.basename(file.originalname, path.extname(file.originalname));

        const { rows: [photo] } = await db.query(
          `INSERT INTO photos
            (user_id, filename, original_filename, title, mime_type, size, taken_at, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [req.session.userId, file.filename, file.originalname, photoTitle,
           file.mimetype, finalSize, meta.takenAt || null, lat, lon]
        );
        await insertNewAlbumPhoto(req.params.id, photo.id);
        if (sharedTags) await setTags(photo.id, sharedTags);
      }
      res.redirect(`/albums/${req.params.id}`);
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
