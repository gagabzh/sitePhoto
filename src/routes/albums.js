const router = require('express').Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { page, esc } = require('../layout');
const { requireEditor } = require('../middleware');
const { optimizePhoto } = require('../imageOptimizer');
const { photoThumb, bulkBar, bulkScript } = require('../components');

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

const TRASH = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

// ── Album list (all roles) ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const isViewer = req.session.role === 'viewer';

  const { rows } = isViewer
    ? await db.query(`
        SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
          COUNT(DISTINCT p.id)::int AS photo_count,
          (SELECT p2.filename FROM photos p2 WHERE p2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
        FROM albums a
        JOIN users u ON u.id = a.user_id
        JOIN album_access aa ON aa.album_id = a.id
        LEFT JOIN photos p ON p.album_id = a.id
        WHERE aa.viewer_id = $1
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `, [req.session.userId])
    : await db.query(`
        SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
          COUNT(DISTINCT p.id)::int AS photo_count,
          (SELECT p2.filename FROM photos p2 WHERE p2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
        FROM albums a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN photos p ON p.album_id = a.id
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `);

  const emptyMsg = isViewer
    ? '<p>You haven\'t been granted access to any albums yet.</p>'
    : '<p>No albums yet. <a href="/albums/new">Create the first one.</a></p>';

  const grid = rows.length === 0
    ? emptyMsg
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
                <button class="btn btn-sm btn-danger btn-icon" title="Delete">${TRASH}</button>
              </form>
            </div>` : ''}
        </div>`).join('')}
      </div>`;

  const controls = isViewer ? '' : `
    <div class="row">
      <a class="btn" href="/albums/new">+ New album</a>
      <a class="btn btn-secondary" href="/albums/new/folder">+ From folder</a>
    </div>`;

  res.send(page('Albums', `
    <div class="top-bar">
      <h1>Albums</h1>
      ${controls}
    </div>
    ${grid}
  `, req.session));
});

// ── US-A1: Create album ──────────────────────────────────────────────────────

router.get('/new', requireEditor, (req, res) => {
  res.send(page('New album', `
    <div class="top-bar">
      <h1>New album</h1>
      <a class="btn btn-secondary" href="/albums">← Back</a>
    </div>
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
    <div class="top-bar">
      <h1>New album from folder</h1>
      <a class="btn btn-secondary" href="/albums">← Back</a>
    </div>
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
        await db.query(
          'INSERT INTO photos (user_id, filename, original_filename, title, mime_type, size, album_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [req.session.userId, file.filename, file.originalname, photoTitle, file.mimetype, finalSize, album.id]
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

// ── Album detail (all roles) ─────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const [albumRes, photosRes] = await Promise.all([
    db.query(
      'SELECT a.*, u.name AS creator FROM albums a JOIN users u ON u.id = a.user_id WHERE a.id = $1',
      [req.params.id]
    ),
    db.query(
      'SELECT p.id, p.filename, p.title, p.user_id FROM photos p WHERE p.album_id = $1 ORDER BY p.created_at ASC',
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

  const photoGrid = photos.length === 0
    ? `<p style="color:#888">No photos yet.${canEdit ? ' <a href="/albums/' + album.id + '/photos/add">Add some.</a>' : ''}</p>`
    : `<form method="POST" action="/albums/${album.id}/photos/bulk-remove">
        ${canEdit ? bulkBar({
          removeAction: `/albums/${album.id}/photos/bulk-remove`,
          deleteAction:  `/albums/${album.id}/photos/bulk-delete`,
        }) : ''}
        <div class="photo-grid">${photos.map(p => `
          <div class="photo-card${canEdit ? ' photo-card-selectable' : ''}">
            ${photoThumb(p, { owns: canEdit })}
            <div class="photo-meta"><strong>${esc(p.title)}</strong></div>
          </div>`).join('')}
        </div>
      </form>
      ${canEdit ? bulkScript() : ''}`;

  res.send(page(album.title, `
    <div class="top-bar">
      <div>
        <h1 style="margin-bottom:0.25rem">${esc(album.title)}</h1>
        <p style="color:#888;margin:0;font-size:0.9rem">by ${esc(album.creator)}
          · ${photos.length} photo${photos.length !== 1 ? 's' : ''}</p>
        ${album.description ? `<p style="margin-top:0.75rem">${esc(album.description)}</p>` : ''}
      </div>
      <div class="row">
        <a class="btn btn-secondary" href="/albums">← Back</a>
        ${canEdit ? `
          <a class="btn" href="/albums/${album.id}/photos/upload">↑ Upload photo</a>
          <a class="btn btn-secondary" href="/albums/${album.id}/photos/add">+ Add photos</a>
          <a class="btn btn-secondary" href="/albums/${album.id}/access">Access</a>
          <a class="btn btn-secondary" href="/albums/${album.id}/edit">Edit</a>
          <form class="inline" method="POST" action="/albums/${album.id}/delete"
            onsubmit="return confirm('Delete this album?')">
            <button class="btn btn-danger btn-icon" title="Delete">${TRASH}</button>
          </form>` : ''}
      </div>
    </div>
    ${photoGrid}
  `, req.session));
});

// ── Bulk remove photos from album (set album_id to NULL) ─────────────────────

router.post('/:id/photos/bulk-remove', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const raw = req.body.photo_ids;
  if (!raw) return res.redirect(`/albums/${req.params.id}`);

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect(`/albums/${req.params.id}`);

  await db.query(
    'UPDATE photos SET album_id = NULL WHERE album_id = $1 AND id = ANY($2::int[])',
    [req.params.id, ids]
  );
  res.redirect(`/albums/${req.params.id}`);
});

// ── Bulk delete photos from album ────────────────────────────────────────────

router.post('/:id/photos/bulk-delete', requireEditor, async (req, res) => {
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
        'SELECT p.id, p.filename FROM photos p WHERE p.album_id = $1 AND p.id = ANY($2::int[])',
        [req.params.id, ids]
      )
    : await db.query(
        'SELECT p.id, p.filename FROM photos p WHERE p.album_id = $1 AND p.id = ANY($2::int[]) AND p.user_id = $3',
        [req.params.id, ids, req.session.userId]
      );

  if (!rows.length) return res.redirect(`/albums/${req.params.id}`);

  const allowedIds = rows.map(r => r.id);
  await db.query('DELETE FROM photos WHERE id = ANY($1::int[])', [allowedIds]);
  for (const photo of rows) {
    fs.promises.unlink(path.join(UPLOAD_DIR, photo.filename)).catch(() => {});
  }
  res.redirect(`/albums/${req.params.id}`);
});

// ── US-A3: Edit album ────────────────────────────────────────────────────────

router.get('/:id/edit', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  res.send(page(`Edit — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Edit album</h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back</a>
    </div>
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

// ── AC1-AC2: Manage viewer access ────────────────────────────────────────────

router.get('/:id/access', requireEditor, async (req, res) => {
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

  const currentList = withAccess.rows.length === 0
    ? '<p style="color:#888">No viewers have access yet.</p>'
    : `<ul class="access-list">${withAccess.rows.map(u => `
        <li style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid #eee">
          <span>${esc(u.name)} <small style="color:#888">${esc(u.email)}</small></span>
          <form class="inline" method="POST" action="/albums/${album.id}/access/remove">
            <input type="hidden" name="viewer_id" value="${u.id}">
            <button class="btn btn-sm btn-danger btn-icon" title="Revoke">${TRASH}</button>
          </form>
        </li>`).join('')}
      </ul>`;

  const addSection = withoutAccess.rows.length === 0
    ? '<p style="color:#888">All viewers already have access.</p>'
    : `<form method="POST" action="/albums/${album.id}/access/add" style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <select name="viewer_id" style="flex:1;padding:0.5rem;border:1px solid #ccc;border-radius:4px;font-size:1rem">
          ${withoutAccess.rows.map(u => `<option value="${u.id}">${esc(u.name)} — ${esc(u.email)}</option>`).join('')}
        </select>
        <button class="btn" type="submit">Grant access</button>
      </form>`;

  res.send(page(`Access — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Access — <em>${esc(album.title)}</em></h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back to album</a>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:start">
      <div class="card">
        <h2 style="margin-top:0;font-size:1rem">Who has access</h2>
        ${currentList}
      </div>
      <div class="card">
        <h2 style="margin-top:0;font-size:1rem">Grant access to a viewer</h2>
        ${addSection}
      </div>
    </div>
  `, req.session));
});

router.post('/:id/access/add', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'INSERT INTO album_access (album_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.body.viewer_id]
  );
  res.redirect(`/albums/${req.params.id}/access`);
});

router.post('/:id/access/remove', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'DELETE FROM album_access WHERE album_id = $1 AND viewer_id = $2',
    [req.params.id, req.body.viewer_id]
  );
  res.redirect(`/albums/${req.params.id}/access`);
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

// ── US-A2: Add photos to album (moves photo from its current album) ──────────

router.get('/:id/photos/add', requireEditor, async (req, res) => {
  const { rows: albumRows } = await db.query('SELECT * FROM albums WHERE id = $1', [req.params.id]);
  const album = albumRows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  const { rows: photos } = await db.query(
    `SELECT p.id, p.filename, p.title, u.name AS uploader
     FROM photos p
     JOIN users u ON u.id = p.user_id
     WHERE p.album_id != $1 OR p.album_id IS NULL
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
    'UPDATE photos SET album_id = $1 WHERE id = $2',
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
    'UPDATE photos SET album_id = NULL WHERE id = $2 AND album_id = $1',
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
    <div class="top-bar">
      <h1>Upload photo to <em>${esc(album.title)}</em></h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back</a>
    </div>
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
        'INSERT INTO photos (user_id, filename, original_filename, title, description, mime_type, size, album_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [req.session.userId, req.file.filename, req.file.originalname, title, description || null, req.file.mimetype, finalSize, albumId]
      );
      if (tags) {
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
      res.redirect(`/albums/${albumId}`);
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
