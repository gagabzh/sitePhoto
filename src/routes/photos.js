const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const { filterOwnedPhotoIds } = require('../permissions');
const { optimizePhoto } = require('../imageOptimizer');
const { extractMetadata } = require('../extractMetadata');
const {
  UPLOAD_DIR, upload, parseCoord, sanitizeNextcloudUrl, setTags, deletePhotos,
} = require('../uploadHelpers');
const {
  renderPhotoListPage, renderUploadPage, renderPhotoDetailPage, renderPhotoEditPage,
} = require('./photosViews');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function parseFrom(raw) {
  if (typeof raw !== 'string') return null;
  return /^\/photos$|^\/albums\/\d+$|^\/travels\/[a-z0-9-]+$/.test(raw) ? raw : null;
}

// US-P1: Photo list — Family Wall layout
router.get('/', requireEditor, wrapAsync(async (req, res) => {
  const [photosResult, albumResult] = await Promise.all([
    db.query(`
      SELECT p.id, p.filename, p.title, p.user_id, u.name AS uploader,
        COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
      FROM photos p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN photo_tags pt ON pt.photo_id = p.id
      LEFT JOIN tags t ON t.id = pt.tag_id
      GROUP BY p.id, u.name
      ORDER BY p.created_at DESC
    `),
    db.query(`
      SELECT a.id, a.title,
        (SELECT p2.filename FROM photos p2 JOIN album_photos ap2 ON ap2.photo_id = p2.id
         WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
      FROM albums a
      ORDER BY a.created_at DESC
      LIMIT 1
    `),
  ]);

  const rows = photosResult.rows.map(p => ({ ...p, canEdit: canModify(req.session, p) }));
  const latestAlbum = (albumResult && albumResult.rows && albumResult.rows[0]) || null;

  const uploaderCounts = {};
  const tagCounts = {};
  for (const p of rows) {
    uploaderCounts[p.uploader] = (uploaderCounts[p.uploader] || 0) + 1;
    for (const t of p.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
  const uploaders = Object.entries(uploaderCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTags   = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  res.send(renderPhotoListPage({ rows, uploaders, topTags, latestAlbum, session: req.session }));
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

  const { rows: [tagRow] } = await db.query(
    'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [tag]
  );
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING',
    [allowedIds, tagRow.id]
  );

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

  await db.query(
    `DELETE FROM photo_tags
     WHERE photo_id = ANY($1::int[])
       AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
    [allowedIds, tag]
  );
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
      const filepath = path.join(UPLOAD_DIR, req.file.filename);
      const exif = await extractMetadata(filepath);
      const finalSize = await optimizePhoto(filepath, req.file.mimetype);
      const ncUrl = sanitizeNextcloudUrl(nextcloud_url);
      const resolvedTakenAt = taken_at || (exif.takenAt ? exif.takenAt.toISOString().split('T')[0] : null);
      const resolvedLat = exif.latitude  ?? parseCoord(latitude, -90, 90)   ?? null;
      const resolvedLon = exif.longitude ?? parseCoord(longitude, -180, 180) ?? null;
      const { rows } = await db.query(
        'INSERT INTO photos (user_id, filename, original_filename, title, description, mime_type, size, taken_at, exposure_time, focal_length, latitude, longitude, nextcloud_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id',
        [req.session.userId, req.file.filename, req.file.originalname, title, description || null, req.file.mimetype, finalSize, resolvedTakenAt, exif.exposureTime || null, exif.focalLength || null, resolvedLat, resolvedLon, ncUrl]
      );
      if (tags) await setTags(rows[0].id, tags);
      res.redirect(`/photos/${rows[0].id}`);
    } catch (e) {
      next(e);
    }
  });
});

// View single photo (all authenticated users)
router.get('/:id', wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const { rows } = await db.query(`
    SELECT p.*, u.name AS uploader,
      COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM photos p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    WHERE p.id = $1
    GROUP BY p.id, u.name
  `, [req.params.id]);

  const photo = rows[0];
  if (!photo) return res.status(404).send('Photo not found');

  const canEdit = canModify(req.session, photo);
  res.send(renderPhotoDetailPage({ photo, canEdit, from, session: req.session }));
}));

// US-P3: Edit form
router.get('/:id/edit', requireEditor, wrapAsync(async (req, res) => {
  const from = parseFrom(req.query.from);
  const { rows } = await db.query(`
    SELECT p.*,
      COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM photos p
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    WHERE p.id = $1
    GROUP BY p.id
  `, [req.params.id]);

  const photo = rows[0];
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  res.send(renderPhotoEditPage({ photo, from, session: req.session }));
}));

// US-P3: Save edits
router.post('/:id', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM photos WHERE id = $1', [req.params.id]);
  const photo = rows[0];
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  const { title, description, tags, taken_at, latitude, longitude, nextcloud_url } = req.body;
  const ncUrl = sanitizeNextcloudUrl(nextcloud_url);
  const lat = parseCoord(latitude, -90, 90);
  const lon = parseCoord(longitude, -180, 180);
  await db.query(
    'UPDATE photos SET title = $1, description = $2, taken_at = $3, nextcloud_url = $4, latitude = $5, longitude = $6, updated_at = NOW() WHERE id = $7',
    [title, description || null, taken_at || null, ncUrl, lat, lon, req.params.id]
  );
  await setTags(req.params.id, tags || '');
  res.redirect(`/photos/${req.params.id}`);
}));

// US-P4: Delete
router.post('/:id/delete', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id, filename FROM photos WHERE id = $1', [req.params.id]);
  const photo = rows[0];
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  await deletePhotos([parseInt(req.params.id)]);
  res.redirect('/photos');
}));

module.exports = router;
