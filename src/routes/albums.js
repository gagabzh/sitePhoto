const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');
const { requireEditor } = require('../middleware');

function canModify(session, album) {
  return session.role === 'admin' || album.user_id === session.userId;
}

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
                <button class="btn btn-sm btn-danger">Delete</button>
              </form>
            </div>` : ''}
        </div>`).join('')}
      </div>`;

  res.send(page('Albums', `
    <div class="top-bar">
      <h1>Albums</h1>
      <a class="btn" href="/albums/new">+ New album</a>
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
                <button class="btn btn-sm btn-danger" style="width:100%">Remove</button>
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
          <a class="btn" href="/albums/${album.id}/photos/add">+ Add photos</a>
          <a class="btn btn-secondary" href="/albums/${album.id}/edit">Edit</a>
          <form class="inline" method="POST" action="/albums/${album.id}/delete"
            onsubmit="return confirm('Delete this album?')">
            <button class="btn btn-danger">Delete</button>
          </form>
        </div>` : ''}
    </div>
    ${photoGrid}
    <a href="/albums" style="color:#888;font-size:0.9rem;text-decoration:none">← Back to albums</a>
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
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back to album</a>
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

module.exports = router;
