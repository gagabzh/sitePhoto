const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
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

function parseFrom(raw) {
  if (typeof raw !== 'string') return null;
  return /^\/albums$|^\/travels\/[a-z0-9-]+$/.test(raw) ? raw : null;
}

// ── Album list (all roles) ───────────────────────────────────────────────────

router.get('/', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';

  const { rows } = isViewer
    ? await db.query(`
        SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
          COUNT(DISTINCT ap.photo_id)::int AS photo_count,
          (SELECT p2.filename FROM photos p2
           JOIN album_photos ap2 ON ap2.photo_id = p2.id
           WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
        FROM albums a
        JOIN users u ON u.id = a.user_id
        JOIN album_access aa ON aa.album_id = a.id
        LEFT JOIN album_photos ap ON ap.album_id = a.id
        WHERE aa.viewer_id = $1
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `, [req.session.userId])
    : await db.query(`
        SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
          COUNT(DISTINCT ap.photo_id)::int AS photo_count,
          (SELECT p2.filename FROM photos p2
           JOIN album_photos ap2 ON ap2.photo_id = p2.id
           WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
        FROM albums a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN album_photos ap ON ap.album_id = a.id
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `);

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
      const { rows: [album] } = await db.query(
        'INSERT INTO albums (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
        [req.session.userId, title, description || null]
      );

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
        await db.query('INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2)', [album.id, photo.id]);
        if (tags) await setTags(photo.id, tags);
      }

      res.redirect(`/albums/${album.id}`);
    } catch (e) {
      next(e);
    }
  });
});

router.post('/', requireEditor, wrapAsync(async (req, res) => {
  const { title, description } = req.body;
  const { rows } = await db.query(
    'INSERT INTO albums (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
    [req.session.userId, title, description || null]
  );
  res.redirect(`/albums/${rows[0].id}`);
}));

// ── Album detail (all roles) ─────────────────────────────────────────────────

router.get('/:id', wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const [albumRes, photosRes] = await Promise.all([
    db.query(
      'SELECT a.*, u.name AS creator FROM albums a JOIN users u ON u.id = a.user_id WHERE a.id = $1',
      [req.params.id]
    ),
    db.query(
      'SELECT p.id, p.filename, p.title, p.user_id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 ORDER BY p.created_at ASC',
      [req.params.id]
    ),
  ]);

  const album = albumRes.rows[0];
  if (!album) return res.status(404).send('Album not found');

  if (req.session.role === 'viewer') {
    const { rows: access } = await db.query(
      'SELECT 1 FROM album_access WHERE album_id = $1 AND viewer_id = $2',
      [req.params.id, req.session.userId]
    );
    if (!access.length) return res.status(403).send('Access denied');
  }

  const photos = photosRes.rows;
  const canEdit = canModify(req.session, album);
  res.send(renderAlbumDetailPage({ album, photos, canEdit, from, session: req.session }));
}));

// ── Bulk remove photos from album ────────────────────────────────────────────

router.post('/:id/photos/bulk-remove', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const raw = req.body.photo_ids;
  if (!raw) return res.redirect(`/albums/${req.params.id}`);

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect(`/albums/${req.params.id}`);

  await db.query(
    'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = ANY($2::int[])',
    [req.params.id, ids]
  );
  res.redirect(`/albums/${req.params.id}`);
}));

// ── Bulk delete photos from album ────────────────────────────────────────────

router.post('/:id/photos/bulk-delete', requireEditor, wrapAsync(async (req, res) => {
  const { rows: albumRows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = albumRows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const raw = req.body.photo_ids;
  if (!raw) return res.redirect(`/albums/${req.params.id}`);

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect(`/albums/${req.params.id}`);

  const { rows } = req.session.role === 'admin'
    ? await db.query(
        'SELECT p.id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 AND p.id = ANY($2::int[])',
        [req.params.id, ids]
      )
    : await db.query(
        'SELECT p.id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 AND p.id = ANY($2::int[]) AND p.user_id = $3',
        [req.params.id, ids, req.session.userId]
      );

  if (!rows.length) return res.redirect(`/albums/${req.params.id}`);

  await deletePhotos(rows.map(r => r.id));
  res.redirect(`/albums/${req.params.id}`);
}));

// ── US-A3: Edit album ────────────────────────────────────────────────────────

router.get('/:id/edit', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  res.send(renderAlbumEditPage({ album, session: req.session }));
}));

// ── AC1-AC2: Manage viewer access ────────────────────────────────────────────

router.get('/:id/access', requireEditor, wrapAsync(async (req, res) => {
  const { rows: albumRows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = albumRows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const [withAccess, withoutAccess] = await Promise.all([
    db.query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN album_access aa ON aa.viewer_id = u.id
       WHERE aa.album_id = $1 ORDER BY u.name`,
      [req.params.id]
    ),
    db.query(
      `SELECT u.id, u.name, u.email FROM users u
       WHERE u.role = 'viewer'
       AND u.id NOT IN (SELECT viewer_id FROM album_access WHERE album_id = $1)
       ORDER BY u.name`,
      [req.params.id]
    ),
  ]);

  res.send(renderAlbumAccessPage({
    album,
    withAccess: withAccess.rows,
    withoutAccess: withoutAccess.rows,
    session: req.session,
  }));
}));

router.post('/:id/access/add', requireEditor, wrapAsync(async (req, res) => {
  const viewerId = parseInt(req.body.viewer_id, 10);
  if (!Number.isInteger(viewerId)) return res.status(400).send('Invalid id');
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'INSERT INTO album_access (album_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, viewerId]
  );
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id/access/remove', requireEditor, wrapAsync(async (req, res) => {
  const viewerId = parseInt(req.body.viewer_id, 10);
  if (!Number.isInteger(viewerId)) return res.status(400).send('Invalid id');
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'DELETE FROM album_access WHERE album_id = $1 AND viewer_id = $2',
    [req.params.id, viewerId]
  );
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const { title, description } = req.body;
  await db.query(
    'UPDATE albums SET title = $1, description = $2, updated_at = NOW() WHERE id = $3',
    [title, description || null, req.params.id]
  );
  res.redirect(`/albums/${req.params.id}`);
}));

// ── US-A3: Delete album ──────────────────────────────────────────────────────

router.post('/:id/delete', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query('DELETE FROM albums WHERE id = $1', [req.params.id]);
  res.redirect('/albums');
}));

// ── US-A2: Add photos to album (moves photo from its current album) ──────────

router.get('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const { rows: albumRows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = albumRows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const { rows: photos } = await db.query(
    `SELECT p.id, p.filename, p.title, u.name AS uploader
     FROM photos p
     JOIN users u ON u.id = p.user_id
     WHERE NOT EXISTS (SELECT 1 FROM album_photos WHERE photo_id = p.id AND album_id = $1)
     ORDER BY p.created_at DESC`,
    [req.params.id]
  );

  res.send(renderAddPhotosPage({ album, photos, session: req.session }));
}));

router.post('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photo_id, 10);
  if (!Number.isInteger(photoId)) return res.status(400).send('Invalid id');
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, photoId]
  );
  res.redirect(`/albums/${req.params.id}/photos/add`);
}));

// ── US-A2: Remove photo from album ──────────────────────────────────────────

router.post('/:id/photos/remove', requireEditor, wrapAsync(async (req, res) => {
  const photoId = parseInt(req.body.photo_id, 10);
  if (!Number.isInteger(photoId)) return res.status(400).send('Invalid id');
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2',
    [req.params.id, photoId]
  );
  res.redirect(`/albums/${req.params.id}`);
}));

// ── Upload photo directly into album ────────────────────────────────────────

router.get('/:id/photos/upload', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
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
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
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
      const { rows: [photo] } = await db.query(
        'INSERT INTO photos (user_id, filename, original_filename, title, description, mime_type, size, taken_at, exposure_time, focal_length, latitude, longitude, nextcloud_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id',
        [req.session.userId, req.file.filename, req.file.originalname, title, description || null,
         req.file.mimetype, finalSize, takenAt, exif.exposureTime || null,
         exif.focalLength || null, lat, lon, ncUrl]
      );
      await db.query('INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2)', [albumId, photo.id]);
      if (tags) await setTags(photo.id, tags);
      res.redirect(`/albums/${albumId}`);
    } catch (e) {
      next(e);
    }
  });
});

// ── IMP-2: Batch upload to album ─────────────────────────────────────────────

router.get('/:id/photos/batch', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  res.send(renderBatchUploadPage({ album, session: req.session }));
}));

router.post('/:id/photos/batch', requireEditor, async (req, res, next) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
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
        await db.query('INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2)', [req.params.id, photo.id]);
        if (sharedTags) await setTags(photo.id, sharedTags);
      }
      res.redirect(`/albums/${req.params.id}`);
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
