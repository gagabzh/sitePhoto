const router = require('express').Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { page, esc } = require('../layout');
const { requireEditor } = require('../middleware');
const { optimizePhoto } = require('../imageOptimizer');

function canModify(session, album) {
  return session.role === 'admin' || album.user_id === session.userId;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_TYPES.includes(file.mimetype)),
});

// ── Album list ───────────────────────────────────────────────────────────────

router.get('/', requireEditor, async (req, res) => {
  const { rows } = await db.query(`
    SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
      COUNT(DISTINCT ap.photo_id)::int AS photo_count,
      (SELECT p.filename FROM photos p
       JOIN album_photos ap2 ON ap2.photo_id = p.id
       WHERE ap2.album_id = a.id
       ORDER BY ap2.added_at ASC LIMIT 1) AS cover_filename
    FROM albums a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN album_photos ap ON ap.album_id = a.id
    GROUP BY a.id, u.name
    ORDER BY a.created_at DESC
  `);

  const grid = rows.length === 0
    ? '<p>No albums yet. <a href="/albums/new">Create the first one.</a></p>'
    : `<div class="photo-grid">${rows.map(a => `
        <div class="album-card">
          <a href="/albums/${a.id}">
            ${a.cover_filename
              ? `<img class="album-cover" src="/uploads/${esc(a.cover_filename)}" alt="${esc(a.title)}">`
              : `<div class="album-cover-empty">🖼</div>`}
            <div class="album-meta">
              <strong>${esc(a.title)}</strong>
              <small>${a.photo_count} photo${a.photo_count !== 1 ? 's' : ''} · by ${esc(a.creator)}</small>
              ${a.description ? `<p style="margin:0.4rem 0 0;font-size:0.85rem;color:#555">${esc(a.description)}</p>` : ''}
            </div>
          </a>
          ${canModify(req.session, a) ? `
            <div style="padding:0 0.85rem 0.85rem;display:flex;gap:0.4rem">
              <a class="btn btn-sm btn-secondary" href="/albums/${a.id}/edit">Edit</a>
              <form class="inline" method="POST" action="/albums/${a.id}/delete"
                onsubmit="return confirm('Delete album \\'${esc(a.title)}\\'?')">
                <button class="btn btn-sm btn-danger btn-icon" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
              </form>
            </div>` : ''}
        </div>`).join('')}
      </div>`;

  res.send(page('Albums', `
    <div class="top-bar">
      <h1>Albums</h1>
      <div class="row">
        <a class="btn" href="/albums/new">+ New album</a>
        <a class="btn btn-secondary" href="/albums/new/folder">+ From folder</a>
      </div>
    </div>
    ${grid}
  `, req.session));
});

// ── US-A1: Create album ──────────────────────────────────────────────────────

router.get('/new', requireEditor, (req, res) => {
  res.send(page('New album', `
    <h1>New album</h1>
    <div class="card" style="max-width:480px">
      <form class="form-col" method="POST" action="/albums">
        <label>Title <input type="text" name="title" required autofocus></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <div class="row">
          <button class="btn" type="submit">Create</button>
          <a class="btn btn-secondary" href="/albums">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

// ── Create album from folder ─────────────────────────────────────────────────

router.get('/new/folder', requireEditor, (req, res) => {
  res.send(page('New album from folder', `
    <h1>New album from folder</h1>
    <div class="card" style="max-width:520px">
      <form class="form-col" method="POST" action="/albums/new/folder" enctype="multipart/form-data">
        <label>Album title <input type="text" name="title" required autofocus></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>
          Photos
          <small>Select a folder or multiple image files (JPEG, PNG, GIF, WebP · max 10 MB each)</small>
          <input type="file" name="photos" accept="image/*" multiple webkitdirectory required>
        </label>
        <div class="row">
          <button class="btn" type="submit">Create album</button>
          <a class="btn btn-secondary" href="/albums">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

router.post('/new/folder', requireEditor, (req, res, next) => {
  upload.array('photos', 200)(req, res, async (err) => {
    if (err) return next(err);
    const { title, description } = req.body;
    try {
      const { rows: [album] } = await db.query(
        'INSERT INTO albums (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
        [req.session.userId, title, description || null]
      );

      for (const file of (req.files || [])) {
        const filepath = path.join(UPLOAD_DIR, file.filename);
        const finalSize = await optimizePhoto(filepath, file.mimetype);
        const photoTitle = path.basename(file.originalname, path.extname(file.originalname));
        const { rows: [photo] } = await db.query(
          'INSERT INTO photos (user_id, filename, original_filename, title, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [req.session.userId, file.filename, file.originalname, photoTitle, file.mimetype, finalSize]
        );
        await db.query(
          'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2)',
          [album.id, photo.id]
        );
      }

      res.redirect(`/albums/${album.id}`);
    } catch (e) {
      next(e);
    }
  });
});

router.post('/', requireEditor, async (req, res) => {
  const { title, description } = req.body;
  const { rows } = await db.query(
    'INSERT INTO albums (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
    [req.session.userId, title, description || null]
  );
  res.redirect(`/albums/${rows[0].id}`);
});

// ── Album detail ─────────────────────────────────────────────────────────────

router.get('/:id', requireEditor, async (req, res) => {
  const [albumRes, photosRes] = await Promise.all([
    db.query(
      'SELECT a.*, u.name AS creator FROM albums a JOIN users u ON u.id = a.user_id WHERE a.id = $1',
      [req.params.id]
    ),
    db.query(
      `SELECT p.id, p.filename, p.title, p.user_id
       FROM photos p
       JOIN album_photos ap ON ap.photo_id = p.id
       WHERE ap.album_id = $1
       ORDER BY ap.added_at ASC`,
      [req.params.id]
    ),
  ]);

  const album = albumRes.rows[0];
  if (!album) return res.status(404).send('Album not found');

  const photos = photosRes.rows;
  const canEdit = canModify(req.session, album);

  const photoGrid = photos.length === 0
    ? `<p style="color:#888">No photos yet.${canEdit ? ' <a href="/albums/' + album.id + '/photos/add">Add some.</a>' : ''}</p>`
    : `<div class="photo-grid">${photos.map(p => `
        <div class="photo-card">
          <a href="/photos/${p.id}">
            <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
            <div class="photo-meta"><strong>${esc(p.title)}</strong></div>
          </a>
          ${canEdit ? `
            <div style="padding:0 0.75rem 0.75rem">
              <form class="inline" method="POST" action="/albums/${album.id}/photos/remove"
                onsubmit="return confirm('Remove from album?')">
                <input type="hidden" name="photo_id" value="${p.id}">
                <button class="btn btn-sm btn-danger btn-icon" style="width:100%" title="Remove"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
              </form>
            </div>` : ''}
        </div>`).join('')}
      </div>`;

  res.send(page(album.title, `
    <div class="top-bar">
      <div>
        <h1 style="margin-bottom:0.25rem">${esc(album.title)}</h1>
        <p style="color:#888;margin:0;font-size:0.9rem">by ${esc(album.creator)}
          · ${photos.length} photo${photos.length !== 1 ? 's' : ''}</p>
        ${album.description ? `<p style="margin-top:0.75rem">${esc(album.description)}</p>` : ''}
      </div>
      ${canEdit ? `
        <div class="row">
          <a class="btn" href="/albums/${album.id}/photos/upload">↑ Upload photo</a>
          <a class="btn btn-secondary" href="/albums/${album.id}/photos/add">+ Add photos</a>
          <a class="btn btn-secondary" href="/albums/${album.id}/edit">Edit</a>
          <form class="inline" method="POST" action="/albums/${album.id}/delete"
            onsubmit="return confirm('Delete this album?')">
            <button class="btn btn-danger btn-icon" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
          </form>
        </div>` : ''}
    </div>
    ${photoGrid}
    <a class="btn btn-secondary" href="/albums" style="margin-top:1.5rem;display:inline-block">← Back to albums</a>
  `, req.session));
});

// ── US-A3: Edit album ────────────────────────────────────────────────────────

router.get('/:id/edit', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  res.send(page(`Edit — ${esc(album.title)}`, `
    <h1>Edit album</h1>
    <div class="card" style="max-width:480px">
      <form class="form-col" method="POST" action="/albums/${album.id}">
        <label>Title <input type="text" name="title" value="${esc(album.title)}" required></label>
        <label>Description <textarea name="description" rows="3">${esc(album.description || '')}</textarea></label>
        <div class="row">
          <button class="btn" type="submit">Save</button>
          <a class="btn btn-secondary" href="/albums/${album.id}">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

router.post('/:id', requireEditor, async (req, res) => {
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
});

// ── US-A3: Delete album ──────────────────────────────────────────────────────

router.post('/:id/delete', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query('DELETE FROM albums WHERE id = $1', [req.params.id]);
  res.redirect('/albums');
});

// ── US-A2: Add photos to album ───────────────────────────────────────────────

router.get('/:id/photos/add', requireEditor, async (req, res) => {
  const { rows: albumRows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = albumRows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const { rows: photos } = await db.query(
    `SELECT p.id, p.filename, p.title, u.name AS uploader
     FROM photos p
     JOIN users u ON u.id = p.user_id
     WHERE p.id NOT IN (
       SELECT photo_id FROM album_photos WHERE album_id = $1
     )
     ORDER BY p.created_at DESC`,
    [req.params.id]
  );

  const grid = photos.length === 0
    ? '<p>All photos are already in this album.</p>'
    : `<div class="photo-grid">${photos.map(p => `
        <div class="photo-card">
          <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}"
            style="width:100%;height:180px;object-fit:cover;display:block">
          <div class="photo-meta">
            <strong>${esc(p.title)}</strong>
            <span class="uploader">by ${esc(p.uploader)}</span>
          </div>
          <div style="padding:0 0.75rem 0.75rem">
            <form method="POST" action="/albums/${album.id}/photos/add">
              <input type="hidden" name="photo_id" value="${p.id}">
              <button class="btn btn-sm" style="width:100%">+ Add</button>
            </form>
          </div>
        </div>`).join('')}
      </div>`;

  res.send(page(`Add photos — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Add photos to <em>${esc(album.title)}</em></h1>
      <div class="row">
        <a class="btn" href="/albums/${album.id}/photos/upload">↑ Upload new photo</a>
        <a class="btn btn-secondary" href="/albums/${album.id}">← Back to album</a>
      </div>
    </div>
    ${grid}
  `, req.session));
});

router.post('/:id/photos/add', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.body.photo_id]
  );
  res.redirect(`/albums/${req.params.id}/photos/add`);
});

// ── US-A2: Remove photo from album ──────────────────────────────────────────

router.post('/:id/photos/remove', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2',
    [req.params.id, req.body.photo_id]
  );
  res.redirect(`/albums/${req.params.id}`);
});

// ── Upload photo directly into album ────────────────────────────────────────

router.get('/:id/photos/upload', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const errors = {
    type: 'Only JPEG, PNG, GIF and WebP images are accepted.',
    size: 'File is too large (max 10 MB).',
    fail: 'Upload failed. Please try again.',
  };
  const error = errors[req.query.error]
    ? `<p class="msg-error">${errors[req.query.error]}</p>` : '';

  res.send(page(`Upload — ${esc(album.title)}`, `
    <h1>Upload photo to <em>${esc(album.title)}</em></h1>
    <div class="card" style="max-width:520px">
      ${error}
      <form class="form-col" method="POST" action="/albums/${album.id}/photos/upload"
        enctype="multipart/form-data">
        <label>Photo <input type="file" name="photo" accept="image/*" required></label>
        <label>Title <input type="text" name="title" required></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>Tags <small>(comma-separated, e.g. Paris, John Doe)</small>
          <input type="text" name="tags" placeholder="Paris, John Doe">
        </label>
        <div class="row">
          <button class="btn" type="submit">Upload</button>
          <a class="btn btn-secondary" href="/albums/${album.id}">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
});

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

    const { title, description, tags } = req.body;
    try {
      const filepath = path.join(UPLOAD_DIR, req.file.filename);
      const finalSize = await optimizePhoto(filepath, req.file.mimetype);
      const { rows: [photo] } = await db.query(
        'INSERT INTO photos (user_id, filename, original_filename, title, description, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [req.session.userId, req.file.filename, req.file.originalname, title, description || null, req.file.mimetype, finalSize]
      );
      if (tags) {
        await db.query('DELETE FROM photo_tags WHERE photo_id = $1', [photo.id]);
        const names = String(tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        for (const name of names) {
          const { rows: [tag] } = await db.query(
            'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
            [name]
          );
          await db.query(
            'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [photo.id, tag.id]
          );
        }
      }
      await db.query(
        'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2)',
        [albumId, photo.id]
      );
      res.redirect(`/albums/${albumId}`);
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
