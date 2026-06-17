const router = require('express').Router();
const path = require('path');
const db = require('../db');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const { filterAlbumPhotoIds } = require('../permissions');
const errors = require('../utils/errors');
const { extractMetadata } = require('../extractMetadata');
const {
  upload, parseCoord, sanitizeNextcloudUrl, setTags, deletePhotos, processAndUpload,
} = require('../uploadHelpers');
const { addIdentificationJob } = require('../queue/producer');
const { parseState, buildWhere, SECTIONS } = require('../combinator');
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
  removePhotoFromAlbum, insertNewAlbumPhoto, setAlbumCover,
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
        const [{ filename, size: finalSize }, meta] = await Promise.all([
          processAndUpload(file),
          extractMetadata(file.buffer),
        ]);

        const lat = meta.latitude ?? sharedLat;
        const lon = meta.longitude ?? sharedLon;
        const photoTitle = path.basename(file.originalname, path.extname(file.originalname));

        const { rows: [photo] } = await db.query(
          `INSERT INTO photos
            (user_id, filename, s3_key, original_filename, title, mime_type, size, taken_at, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [req.session.userId, filename, filename, file.originalname, photoTitle,
           file.mimetype, finalSize, meta.takenAt || null, lat, lon]
        );
        await insertNewAlbumPhoto(albumId, photo.id);
        if (tags) await setTags(photo.id, tags);
        addIdentificationJob({ photoId: photo.id, userId: req.session.userId, photoS3Key: filename }).catch(() => {});
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

// ── RA-1: Create snapshot album from a tag recipe ────────────────────────────
// MUST be registered before POST /:id to prevent Express capturing "from-recipe"
// as an :id parameter value.

router.post('/from-recipe', requireEditor, wrapAsync(async (req, res) => {
  const recipeId = parseInt(req.body.recipeId, 10);
  const albumName = String(req.body.albumName || '').trim();

  // Validate albumName first (cheap checks before DB)
  if (!albumName) {
    return res.status(422).json({ error: 'Album name is required' });
  }
  if (albumName.length > 255) {
    return res.status(422).json({ error: 'Album name must be 255 characters or fewer' });
  }
  if (isNaN(recipeId)) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  // Fetch recipe — owned by user, or admin may access any
  const { rows: recipeRows } = await db.query(
    'SELECT id, name, query_json, user_id FROM tag_recipes WHERE id = $1',
    [recipeId]
  );
  if (!recipeRows.length) {
    return res.status(404).json({ error: 'Recipe not found' });
  }
  const recipe = recipeRows[0];
  if (recipe.user_id !== req.session.userId && req.session.role !== 'admin') {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  // Validate recipe has at least one filter
  const queryJson = recipe.query_json;
  const hasFilters = SECTIONS.some(s => {
    const sec = queryJson.sections && queryJson.sections[s];
    return sec && (sec.on && sec.on.length > 0 || sec.not && sec.not.length > 0);
  });
  if (!hasFilters) {
    return res.status(422).json({ error: 'Recipe has no filters' });
  }

  // Resolve matching photos using the same combinator logic (non-viewer: sees all photos)
  const state = parseState(queryJson.sections
    ? Object.fromEntries(
        SECTIONS.flatMap(s => {
          const sec = queryJson.sections[s] || {};
          const entries = [];
          if (sec.on && sec.on.length) entries.push([s, sec.on.join(',')]);
          if (sec.not && sec.not.length) entries.push([`${s}.not`, sec.not.join(',')]);
          if (sec.logic) entries.push([`logic.${s}`, sec.logic]);
          return entries;
        })
      )
    : {}
  );
  const { where, vals } = buildWhere(state, false, req.session.userId);
  const { rows: photoRows } = await db.query(
    `SELECT DISTINCT p.id FROM photos p ${where} ORDER BY p.id`,
    vals
  );

  // Execute in a single transaction: INSERT album → bulk INSERT album_photos
  const client = await db.pool.connect();
  let albumId;
  let photoCount = 0;
  try {
    await client.query('BEGIN');

    // Insert album row
    const { rows: [newAlbum] } = await client.query(
      'INSERT INTO albums (user_id, title) VALUES ($1, $2) RETURNING id',
      [req.session.userId, albumName]
    );
    albumId = newAlbum.id;

    // Bulk-insert album_photos if any photos matched
    if (photoRows.length > 0) {
      const placeholders = photoRows.map((_, i) => `($1, $${i + 2})`).join(',');
      await client.query(
        `INSERT INTO album_photos (album_id, photo_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        [albumId, ...photoRows.map(r => r.id)]
      );
      photoCount = photoRows.length;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return res.status(201).json({ albumId, photoCount });
}));

// ── Album detail (all roles) ─────────────────────────────────────────────────

router.get('/:id', wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const [album, photos] = await Promise.all([
    getAlbumWithCreator(req.params.id),
    fetchAlbumPhotos(req.params.id),
  ]);

  if (!album) return errors.notFound(res, 'Album', false);

  if (req.session.role === 'viewer') {
    const hasAccess = await checkViewerAccess(req.params.id, req.session.userId);
    if (!hasAccess) return errors.accessDenied(res, false);
  }

  const canEdit = canModify(req.session, album);
  res.send(renderAlbumDetailPage({ album, photos, canEdit, from, session: req.session }));
}));

// ── Bulk remove photos from album ────────────────────────────────────────────

router.post('/:id/photos/bulk-remove', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

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
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

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
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  res.send(renderAlbumEditPage({ album, session: req.session }));
}));

// ── AC1-AC2: Manage viewer access ────────────────────────────────────────────

router.get('/:id/access', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

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
  if (!Number.isInteger(viewerId)) return errors.badRequest(res, 'Invalid id');
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  await addViewerAccess(req.params.id, viewerId);
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id/access/remove', requireEditor, wrapAsync(async (req, res) => {
  const viewerId = parseInt(req.body.viewer_id, 10);
  if (!Number.isInteger(viewerId)) return errors.badRequest(res, 'Invalid id');
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  await removeViewerAccess(req.params.id, viewerId);
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  const { title, description } = req.body;
  await updateAlbum(req.params.id, title, description || null);
  res.redirect(`/albums/${req.params.id}`);
}));

// ── US-A3: Delete album ──────────────────────────────────────────────────────

router.post('/:id/delete', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  await deleteAlbum(req.params.id);
  res.redirect('/albums');
}));

// ── ALB-3: Choose album cover photo ────────────────────────────────────────────

router.post('/:id/cover', requireEditor, wrapAsync(async (req, res) => {
  const albumId = parseInt(req.params.id, 10);
  const photoId = parseInt(req.body.photoId, 10);

  if (!Number.isFinite(albumId) || !Number.isFinite(photoId)) {
    return errors.badRequest(res, 'Invalid album or photo ID');
  }

  const album = await getAlbumOwner(albumId);
  if (!album) return errors.notFound(res, 'Album');
  if (!canModify(req.session, album)) return errors.accessDenied(res);

  const success = await setAlbumCover(albumId, photoId, req.session.userId);
  if (!success) {
    return errors.badRequest(res, 'Photo not in this album');
  }

  res.json({ success: true });
}));

// ── US-A2: Add photos to album (moves photo from its current album) ──────────

router.get('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  const photos = await fetchPhotosNotInAlbum(req.params.id);

  res.send(renderAddPhotosPage({ album, photos, session: req.session }));
}));

router.post('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photo_id, 10);
  if (!Number.isInteger(photoId)) return errors.badRequest(res, 'Invalid id', false);
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  await linkPhotoToAlbum(req.params.id, photoId);
  res.redirect(`/albums/${req.params.id}/photos/add`);
}));

// ── US-A2: Remove photo from album ──────────────────────────────────────────

router.post('/:id/photos/remove', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photo_id, 10);
  if (!Number.isInteger(photoId)) return errors.badRequest(res, 'Invalid id', false);
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  await removePhotoFromAlbum(req.params.id, photoId);
  res.redirect(`/albums/${req.params.id}`);
}));

// ── Upload photo directly into album ────────────────────────────────────────

router.get('/:id/photos/upload', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  const errors = {
    type: 'Only JPEG, PNG, GIF and WebP images are accepted.',
    size: 'File is too large (max 10 MB).',
    fail: 'Upload failed. Please try again.',
  };
  res.send(renderUploadToAlbumPage({ album, errorMsg: errors[req.query.error] || null, session: req.session }));
}));

router.post('/:id/photos/upload', requireEditor, async (req, res, next) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  upload.single('photo')(req, res, async (err) => {
    const albumId = req.params.id;
    if (err && err.code === 'LIMIT_FILE_SIZE')
      return res.redirect(`/albums/${albumId}/photos/upload?error=size`);
    if (err || !req.file)
      return res.redirect(`/albums/${albumId}/photos/upload?error=type`);

    const { title, description, tags, latitude, longitude, nextcloud_url } = req.body;
    try {
      const [{ filename, size: finalSize }, exif] = await Promise.all([
        processAndUpload(req.file),
        extractMetadata(req.file.buffer),
      ]);
      const ncUrl = sanitizeNextcloudUrl(nextcloud_url);
      const takenAt = exif.takenAt ? exif.takenAt.toISOString().split('T')[0] : null;
      const lat = exif.latitude  ?? parseCoord(latitude, -90, 90)   ?? null;
      const lon = exif.longitude ?? parseCoord(longitude, -180, 180) ?? null;
      const photoId = await insertPhoto({
        userId: req.session.userId, filename, s3Key: filename, originalFilename: req.file.originalname,
        title, description: description || null, mimeType: req.file.mimetype, size: finalSize,
        takenAt, exposureTime: exif.exposureTime || null, focalLength: exif.focalLength || null,
        lat, lon, ncUrl,
      });
      await insertNewAlbumPhoto(albumId, photoId);
      if (tags) await setTags(photoId, tags);
      addIdentificationJob({ photoId, userId: req.session.userId, photoS3Key: filename }).catch(() => {});
      res.redirect(`/albums/${albumId}`);
    } catch (e) {
      next(e);
    }
  });
});

// ── IMP-2: Batch upload to album ─────────────────────────────────────────────

router.get('/:id/photos/batch', requireEditor, wrapAsync(async (req, res) => {
  const album = await getAlbum(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  res.send(renderBatchUploadPage({ album, session: req.session }));
}));

router.post('/:id/photos/batch', requireEditor, async (req, res, next) => {
  const album = await getAlbumOwner(req.params.id);
  if (!album) return errors.notFound(res, 'Album', false);
  if (!canModify(req.session, album)) return errors.accessDenied(res, false);

  upload.array('photos', 200)(req, res, async (err) => {
    if (err) return next(err);

    const sharedTags = req.body.tags || '';
    const sharedLat = parseCoord(req.body.latitude, -90, 90);
    const sharedLon = parseCoord(req.body.longitude, -180, 180);

    try {
      for (const file of (req.files || [])) {
        const [{ filename, size: finalSize }, meta] = await Promise.all([
          processAndUpload(file),
          extractMetadata(file.buffer),
        ]);

        const lat = meta.latitude ?? sharedLat;
        const lon = meta.longitude ?? sharedLon;
        const photoTitle = path.basename(file.originalname, path.extname(file.originalname));

        const { rows: [photo] } = await db.query(
          `INSERT INTO photos
            (user_id, filename, s3_key, original_filename, title, mime_type, size, taken_at, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [req.session.userId, filename, filename, file.originalname, photoTitle,
           file.mimetype, finalSize, meta.takenAt || null, lat, lon]
        );
        await insertNewAlbumPhoto(req.params.id, photo.id);
        if (sharedTags) await setTags(photo.id, sharedTags);
        addIdentificationJob({ photoId: photo.id, userId: req.session.userId, photoS3Key: filename }).catch(() => {});
      }
      res.redirect(`/albums/${req.params.id}`);
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
