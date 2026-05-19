const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { page, esc } = require('../layout');
const { requireEditor, wrapAsync } = require('../middleware');
const { optimizePhoto } = require('../imageOptimizer');
const { extractMetadata } = require('../extractMetadata');
const { photoThumb, bulkBar, bulkScript, lbOverlay, lbScript } = require('../components');
const {
  UPLOAD_DIR, upload, parseCoord, sanitizeNextcloudUrl, setTags,
  singleUploadFields, batchUploadFields, deletePhotos,
} = require('../uploadHelpers');

function canModify(session, album) {
  return session.role === 'admin' || album.user_id === session.userId;
}

const TRASH = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

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

  const totalPhotos = rows.reduce((s, a) => s + (a.photo_count || 0), 0);

  const emptyMsg = isViewer
    ? `<p class="tl-empty">You haven't been granted access to any albums yet.</p>`
    : `<p class="tl-empty">No albums yet. <a href="/albums/new">Create the first one.</a></p>`;

  const bookCards = rows.map(a => `
    <div class="ab-book">
      <div class="ab-spine"></div>
      <a href="/albums/${a.id}" class="ab-cover">
        ${a.cover_filename
          ? `<img class="ab-cover-img" src="/uploads/${esc(a.cover_filename)}" alt="${esc(a.title)}">`
          : `<div class="ab-cover-empty">no photos yet</div>`}
        ${a.photo_count > 0
          ? `<span class="ab-ribbon">${a.photo_count} PHOTO${a.photo_count !== 1 ? 'S' : ''}</span>`
          : `<span class="ab-ribbon ab-ribbon-empty">EMPTY</span>`}
        <div class="ab-label">
          <h3>${esc(a.title)}</h3>
          <div class="ab-label-sub">by ${esc(a.creator)}</div>
        </div>
      </a>
      <div class="ab-meta-row">
        <span class="ab-meta-who">${esc(a.creator)}</span>
        ${canModify(req.session, a) ? `<span class="ab-meta-acts">
          <a class="btn btn-sm btn-secondary" href="/albums/${a.id}/edit">edit</a>
          <form class="inline" method="POST" action="/albums/${a.id}/delete"
            onsubmit="return confirm('Delete this album?')">
            <button class="btn btn-sm btn-danger btn-icon" title="Delete">${TRASH}</button>
          </form>
        </span>` : ''}
      </div>
    </div>`).join('');

  const newBook = isViewer ? '' : `
    <a href="/albums/new" class="ab-new">
      <span class="ab-new-plus">+</span>
      start a new album
    </a>`;

  const grid = rows.length === 0
    ? emptyMsg
    : `<div class="ab-grid">${bookCards}${newBook}</div>`;

  const controls = isViewer ? '' : `
    <div class="ab-actions">
      <a class="btn btn-secondary" href="/albums/new/folder">↑ from folder</a>
      <a class="btn" href="/albums/new">+ New album</a>
    </div>`;

  res.send(page('Albums', `
    <div class="ab-page-h">
      <div>
        <h1>our <em>albums</em>.</h1>
        <p class="ab-sub">${rows.length} album${rows.length !== 1 ? 's' : ''} · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}</p>
      </div>
      ${controls}
    </div>
    ${grid}
  `, req.session));
}));

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
    <div class="card" style="max-width:600px">
      <form class="form-col" method="POST" action="/albums/new/folder" enctype="multipart/form-data">
        <label>Album title <input type="text" name="title" required autofocus></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>
          Photos
          <small>Select a folder or multiple image files (JPEG, PNG, GIF, WebP · max 10 MB each)</small>
          <input type="file" name="photos" accept="image/*" multiple webkitdirectory required>
        </label>
        ${batchUploadFields()}
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

  const cover = photos[0];
  const coverHtml = cover
    ? `<img src="/uploads/${esc(cover.filename)}" alt="${esc(cover.title)}">`
    : `<div class="ad-cover-empty">no photos yet</div>`;

  const uniqueContributors = new Set(photos.map(p => p.user_id)).size;

  const mosaic = photos.slice(0, 9);
  const rest = photos.slice(9);

  const mosaicCells = mosaic.map(p => `
    <div class="ad-cell${canEdit ? ' photo-card-selectable' : ''}">
      ${canEdit ? `<label class="wall-checkbox"><input type="checkbox" name="photo_ids" value="${p.id}"></label>` : ''}
      <a href="${canEdit ? `/photos/${p.id}/edit` : `/photos/${p.id}`}"${canEdit ? '' : ` data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}"`}>
        <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
      </a>
      ${canEdit ? `<button class="ad-lb-btn" data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}" title="View fullscreen" type="button">⛶</button>` : ''}
    </div>`).join('');

  const restGrid = rest.length > 0
    ? `<div class="photo-grid" style="margin-top:1rem">${rest.map(p => `
        <div class="photo-card${canEdit ? ' photo-card-selectable' : ''}">
          <div class="photo-thumb">
            <a href="${canEdit ? `/photos/${p.id}/edit` : `/photos/${p.id}`}"${canEdit ? '' : ` data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}"`}>
              <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
            </a>
            ${canEdit ? `<button class="ad-lb-btn" data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}" title="View fullscreen" type="button">⛶</button>` : ''}
            ${canEdit ? `<label class="photo-checkbox-label"><input type="checkbox" name="photo_ids" value="${p.id}"></label>` : ''}
          </div>
          <div class="photo-meta"><strong>${esc(p.title)}</strong></div>
        </div>`).join('')}
      </div>` : '';

  const photoSection = photos.length === 0
    ? `<p class="tl-empty">No photos yet.${canEdit ? ` <a href="/albums/${album.id}/photos/add">Add some.</a>` : ''}</p>`
    : `<form method="POST" action="/albums/${album.id}/photos/bulk-remove">
        ${canEdit ? bulkBar({
          removeAction: `/albums/${album.id}/photos/bulk-remove`,
          deleteAction:  `/albums/${album.id}/photos/bulk-delete`,
        }) : ''}
        <div class="ad-mosaic">${mosaicCells}</div>
        ${restGrid}
      </form>
      ${canEdit ? bulkScript() : ''}
      ${lbOverlay()}
      ${lbScript()}`;

  res.send(page(album.title, `
    <div class="ad-head">
      <div class="ad-cover">${coverHtml}</div>
      <div class="ad-info">
        <div class="ad-crumbs"><a href="/albums">albums</a> / ${esc(album.title)}</div>
        <h1>${esc(album.title)}.</h1>
        ${album.description ? `<p class="ad-desc">${esc(album.description)}</p>` : ''}
        <div class="ad-stats">
          <div><b>${photos.length}</b> photo${photos.length !== 1 ? 's' : ''}</div>
          ${uniqueContributors > 0 ? `<div><b>${uniqueContributors}</b> contributor${uniqueContributors !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <p style="font-family:'Kalam',cursive;font-size:0.85rem;color:var(--ink-soft);margin:0.1rem 0 0;">by ${esc(album.creator)}</p>
        <div class="ad-actions">
          <a class="btn btn-secondary" href="/albums">← Back</a>
          ${canEdit ? `
            <a class="btn" href="/albums/${album.id}/photos/upload">↑ Upload</a>
            <a class="btn" href="/albums/${album.id}/photos/batch">↑ Batch</a>
            <a class="btn btn-secondary" href="/albums/${album.id}/photos/add">+ Add photos</a>
            <a class="btn btn-secondary" href="/albums/${album.id}/access">Access</a>
            <a class="btn btn-secondary" href="/albums/${album.id}/edit">Edit</a>
            <form class="inline" method="POST" action="/albums/${album.id}/delete"
              onsubmit="return confirm('Delete this album?')">
              <button class="btn btn-danger btn-icon" title="Delete">${TRASH}</button>
            </form>` : ''}
        </div>
      </div>
    </div>
    ${photoSection}
  `, req.session));
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

  const viewerList = withAccess.rows.length === 0
    ? `<div class="ac-empty">no viewers have access yet.</div>`
    : withAccess.rows.map(u => `
        <div class="ac-row">
          <span class="ac-av">${esc((u.name || '?')[0].toUpperCase())}</span>
          <div>
            <div class="ac-nm">${esc(u.name)}</div>
            <div class="ac-em">${esc(u.email)}</div>
          </div>
          <form class="inline" method="POST" action="/albums/${album.id}/access/remove">
            <input type="hidden" name="viewer_id" value="${u.id}">
            <button class="btn btn-sm btn-danger btn-icon" title="Revoke">${TRASH}</button>
          </form>
        </div>`).join('');

  const addSection = withoutAccess.rows.length === 0
    ? `<p style="font-family:'Kalam',cursive;font-size:0.85rem;color:var(--ink-soft);margin:0;">All viewers already have access.</p>`
    : withoutAccess.rows.map(u => `
        <form method="POST" action="/albums/${album.id}/access/add">
          <input type="hidden" name="viewer_id" value="${u.id}">
          <div class="ac-cand">
            <span class="ac-cand-av">${esc((u.name || '?')[0].toUpperCase())}</span>
            <div>
              <div class="ac-cand-nm">${esc(u.name)}</div>
              <div class="ac-cand-em">${esc(u.email)}</div>
            </div>
            <button class="btn btn-sm" type="submit" style="margin-left:auto;white-space:nowrap;">Grant access</button>
          </div>
        </form>`).join('');

  res.send(page(`Access — ${esc(album.title)}`, `
    <div class="ac-head">
      <div>
        <div class="ac-crumbs"><a href="/albums">albums</a> / <a href="/albums/${album.id}">${esc(album.title)}</a> / access</div>
        <h1>who can see <em>${esc(album.title)}?</em></h1>
        <p class="ac-sub">${withAccess.rows.length} viewer${withAccess.rows.length !== 1 ? 's' : ''} right now.</p>
      </div>
      <div>
        <a class="btn btn-secondary" href="/albums/${album.id}">← back to album</a>
      </div>
    </div>
    <div class="ac-summary">
      <span class="ac-lock">🔒 private album</span>
      <span>visible only to people listed below.</span>
    </div>
    <div class="ac-body">
      <div class="ac-main">
        <h3>viewers <span class="ac-count">// can see this album</span></h3>
        <p class="ac-hint">remove anyone to revoke their access immediately.</p>
        ${viewerList}
      </div>
      <aside class="ac-side">
        <h4>ADD PEOPLE</h4>
        ${addSection}
      </aside>
    </div>
  `, req.session));
}));

router.post('/:id/access/add', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'INSERT INTO album_access (album_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.body.viewer_id]
  );
  res.redirect(`/albums/${req.params.id}/access`);
}));

router.post('/:id/access/remove', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'DELETE FROM album_access WHERE album_id = $1 AND viewer_id = $2',
    [req.params.id, req.body.viewer_id]
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
}));

router.post('/:id/photos/add', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.body.photo_id]
  );
  res.redirect(`/albums/${req.params.id}/photos/add`);
}));

// ── US-A2: Remove photo from album ──────────────────────────────────────────

router.post('/:id/photos/remove', requireEditor, wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [req.params.id]);
  const album = rows[0];
  if (!album) return res.status(404).send('Album not found');
  if (!canModify(req.session, album)) return res.status(403).send('Access denied');

  await db.query(
    'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2',
    [req.params.id, req.body.photo_id]
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
        ${singleUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Upload</button>
          <a class="btn btn-secondary" href="/albums/${album.id}">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
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

  res.send(page(`Batch upload — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Batch upload to <em>${esc(album.title)}</em></h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form class="form-col" method="POST" action="/albums/${album.id}/photos/batch"
        enctype="multipart/form-data">
        <label>
          Photos
          <small>Select multiple image files (JPEG, PNG, GIF, WebP · max 10 MB each)</small>
          <input type="file" name="photos" accept="image/*" multiple required>
        </label>
        ${batchUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Upload all</button>
        </div>
      </form>
    </div>
  `, req.session));
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
