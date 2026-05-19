const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { page, esc } = require('../layout');
const { requireEditor, wrapAsync } = require('../middleware');
const { optimizePhoto } = require('../imageOptimizer');
const { extractMetadata } = require('../extractMetadata');
const { bulkBar, bulkScript } = require('../components');
const {
  UPLOAD_DIR, upload, parseCoord, sanitizeNextcloudUrl, setTags, singleUploadFields, deletePhotos,
} = require('../uploadHelpers');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function canModify(session, photo) {
  return session.role === 'admin' || photo.user_id === session.userId;
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

  const rows = photosResult.rows;
  const latestAlbum = (albumResult && albumResult.rows && albumResult.rows[0]) || null;

  const firstname = esc((req.session.name || '').split(' ')[0]);

  if (rows.length === 0) {
    return res.send(page('Photos', `
      <div class="wall-greet">
        <h1>hi <span style="color:var(--accent)">${firstname}</span>, welcome home.</h1>
        <p class="wall-count">0 photos</p>
      </div>
      <p>No photos yet. <a href="/photos/upload">Upload the first one.</a></p>
    `, req.session));
  }

  // Derive uploaders and top tags from photo data (no extra DB round-trip)
  const uploaderCounts = {};
  const tagCounts = {};
  for (const p of rows) {
    uploaderCounts[p.uploader] = (uploaderCounts[p.uploader] || 0) + 1;
    for (const t of p.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
  const uploaders = Object.entries(uploaderCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTags   = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Hero strip — first 4 photos, display-only
  const heroHtml = `
    <div class="wall-hero">
      ${rows.slice(0, 4).map(p => `
        <a href="/photos/${p.id}">
          <img class="wall-hero-img" src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
        </a>`).join('')}
    </div>`;

  // Wall mosaic — all photos chunked in groups of 9
  const chunks = [];
  for (let i = 0; i < rows.length; i += 9) chunks.push(rows.slice(i, i + 9));
  const mosaicHtml = chunks.map(chunk => `
    <div class="wall-mosaic">
      ${chunk.map(p => {
        const owns = canModify(req.session, p);
        return `
        <div class="wall-cell${owns ? ' photo-card-selectable' : ''}">
          ${owns ? `<label class="wall-checkbox"><input type="checkbox" name="photo_ids" value="${p.id}"></label>` : ''}
          <a href="/photos/${p.id}"><img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}"></a>
        </div>`;
      }).join('')}
    </div>`).join('');

  // Sidebar — who's around
  const whoHtml = uploaders.map(([name, count]) => `
    <li>
      <span class="wall-who-av">${esc(name[0].toUpperCase())}</span>
      <span>${esc(name)}</span>
      <span class="wall-who-count">${count}</span>
    </li>`).join('');

  // Sidebar — top tags
  const tagsHtml = topTags.map(([name]) =>
    `<a class="tag" href="/tags/${encodeURIComponent(name)}">${esc(name)}</a>`
  ).join('');

  // Sidebar — latest album
  const albumHtml = latestAlbum
    ? `${latestAlbum.cover_filename
        ? `<img class="wall-album-cover" src="/uploads/${esc(latestAlbum.cover_filename)}" alt="${esc(latestAlbum.title)}">`
        : `<div class="wall-album-cover wall-album-cover-empty">no photos</div>`}
       <a class="wall-album-title" href="/albums/${latestAlbum.id}">${esc(latestAlbum.title)}</a>`
    : '<p style="font-size:0.85rem">No albums yet.</p>';

  res.send(page('Photos', `
    <div class="wall-greet">
      <h1>hi <span style="color:var(--accent)">${firstname}</span>, welcome home.</h1>
      <p class="wall-count">${rows.length} photo${rows.length !== 1 ? 's' : ''}</p>
    </div>
    ${heroHtml}
    <form method="POST" action="/photos/bulk-tag">
      <div class="wall-cols">
        <div>
          ${bulkBar({ showTag: true, deleteAction: '/photos/bulk-delete' })}
          <div class="row" style="justify-content:flex-end;margin-bottom:0.75rem">
            <a class="btn" href="/photos/upload">+ Upload</a>
          </div>
          ${mosaicHtml}
        </div>
        <aside class="wall-side">
          <div class="wall-panel">
            <h3 class="wall-section-h">who's around</h3>
            <ul class="wall-who">${whoHtml}</ul>
          </div>
          ${topTags.length ? `
          <div class="wall-panel">
            <h3 class="wall-section-h">browse by tag</h3>
            <div class="wall-tags">${tagsHtml}</div>
          </div>` : ''}
          <div class="wall-panel">
            <h3 class="wall-section-h">latest album</h3>
            ${albumHtml}
          </div>
        </aside>
      </div>
    </form>
    ${bulkScript()}
  `, req.session));
}));

// Bulk tag selected photos
router.post('/bulk-tag', requireEditor, wrapAsync(async (req, res) => {
  const tag = (req.body.tag || '').trim().toLowerCase();
  const raw = req.body.photo_ids;
  if (!tag || !raw) return res.redirect('/photos');

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect('/photos');

  const { rows: allowed } = req.session.role === 'admin'
    ? await db.query('SELECT id FROM photos WHERE id = ANY($1::int[])', [ids])
    : await db.query('SELECT id FROM photos WHERE id = ANY($1::int[]) AND user_id = $2', [ids, req.session.userId]);

  if (!allowed.length) return res.redirect('/photos');

  const { rows: [tagRow] } = await db.query(
    'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [tag]
  );
  const allowedIds = allowed.map(r => r.id);
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING',
    [allowedIds, tagRow.id]
  );

  res.redirect('/photos');
}));

// Bulk delete selected photos
router.post('/bulk-delete', requireEditor, wrapAsync(async (req, res) => {
  const raw = req.body.photo_ids;
  if (!raw) return res.redirect('/photos');

  const ids = [].concat(raw).map(Number).filter(n => n > 0);
  if (!ids.length) return res.redirect('/photos');

  const { rows } = req.session.role === 'admin'
    ? await db.query('SELECT id FROM photos WHERE id = ANY($1::int[])', [ids])
    : await db.query('SELECT id FROM photos WHERE id = ANY($1::int[]) AND user_id = $2', [ids, req.session.userId]);

  if (!rows.length) return res.redirect('/photos');

  await deletePhotos(rows.map(r => r.id));
  res.redirect('/photos');
}));

// US-P1: Upload form
router.get('/upload', requireEditor, (req, res) => {
  const errors = {
    type: 'Only JPEG, PNG, GIF and WebP images are accepted.',
    size: 'File is too large (max 10 MB).',
    fail: 'Upload failed. Please try again.',
  };
  const error = errors[req.query.error] ? `<p class="msg-error">${errors[req.query.error]}</p>` : '';

  res.send(page('Upload a photo', `
    <div class="top-bar">
      <h1>Upload a photo</h1>
      <a class="btn btn-secondary" href="/photos">← Back</a>
    </div>
    <div class="card" style="max-width:520px">
      ${error}
      <form class="form-col" method="POST" action="/photos/upload" enctype="multipart/form-data">
        <label>Photo <input type="file" name="photo" accept="image/*" required></label>
        <label>Title <input type="text" name="title" required></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>Tags <small>(comma-separated, e.g. Paris, John Doe)</small>
          <input type="text" name="tags" placeholder="Paris, John Doe">
        </label>
        ${singleUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Upload</button>
          <a class="btn btn-secondary" href="/photos">Cancel</a>
        </div>
      </form>
    </div>
  `, req.session));
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

  res.send(page(photo.title, `
    <div style="max-width:820px;margin:0 auto">
      <div class="top-bar" style="margin-bottom:1rem">
        <a href="/photos" style="color:#888;font-size:0.9rem;text-decoration:none">← Back to photos</a>
        ${canEdit ? `
          <div class="row">
            <a class="btn btn-secondary" href="/photos/${photo.id}/edit">Edit</a>
            <form class="inline" method="POST" action="/photos/${photo.id}/delete"
              onsubmit="return confirm('Delete this photo permanently?')">
              <button class="btn btn-danger btn-icon" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
            </form>
          </div>` : ''}
      </div>
      <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}"
        style="width:100%;max-height:560px;object-fit:contain;border-radius:8px;background:#111;margin-bottom:1.5rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
        <div>
          <h1 style="margin-bottom:0.25rem">${esc(photo.title)}</h1>
          <p style="color:#888;margin-top:0;font-size:0.9rem">by ${esc(photo.uploader)}</p>
          ${photo.description ? `<p>${esc(photo.description)}</p>` : ''}
          ${photo.tags.length ? `<div class="tags">${photo.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${photo.latitude != null && photo.longitude != null ? `
          <div id="photo-map" style="height:220px;border-radius:8px;margin-top:0.75rem"></div>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script>
            (function(){
              var m = L.map('photo-map').setView([${photo.latitude},${photo.longitude}],13);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(m);
              L.marker([${photo.latitude},${photo.longitude}]).addTo(m);
            })();
          </script>` : ''}
          ${(photo.taken_at || photo.exposure_time || photo.focal_length) ? `
          <dl class="photo-exif">
            ${photo.taken_at ? `<dt>Date de prise</dt><dd>${esc(new Date(photo.taken_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}</dd>` : ''}
            ${photo.exposure_time ? `<dt>Exposition</dt><dd>${esc(photo.exposure_time)}</dd>` : ''}
            ${photo.focal_length ? `<dt>Focale</dt><dd>${esc(String(photo.focal_length))} mm</dd>` : ''}
          </dl>` : ''}
          ${photo.nextcloud_url ? `<div style="margin-top:1rem"><a class="btn" href="${esc(photo.nextcloud_url)}" target="_blank" rel="noopener noreferrer">Download original</a></div>` : ''}
        </div>
      </div>
    </div>
  `, req.session));
}));

// US-P3: Edit form
router.get('/:id/edit', requireEditor, wrapAsync(async (req, res) => {
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

  res.send(page(`Edit — ${photo.title}`, `
    <div class="top-bar">
      <h1>Edit photo</h1>
      <a class="btn btn-secondary" href="/photos/${photo.id}">← Back</a>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:start">
      <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}"
        style="width:100%;border-radius:8px;max-height:400px;object-fit:contain;background:#111">
      <div class="card">
        <form class="form-col" method="POST" action="/photos/${photo.id}">
          <label>Title <input type="text" name="title" value="${esc(photo.title)}" required></label>
          <label>Description <textarea name="description" rows="4">${esc(photo.description || '')}</textarea></label>
          <label>Tags <small>(comma-separated)</small>
            <input type="text" name="tags" value="${esc(photo.tags.join(', '))}">
          </label>
          <label>Date taken
            <input type="date" name="taken_at" value="${photo.taken_at ? new Date(photo.taken_at).toISOString().split('T')[0] : ''}">
          </label>
          <label>Location <small>(optional — search a place or click × to remove)</small>
            <div class="tag-ac-wrap loc-search-wrap">
              <input type="text" class="loc-search-input" autocomplete="off"
                placeholder="${photo.latitude != null ? parseFloat(photo.latitude).toFixed(5) + ', ' + parseFloat(photo.longitude).toFixed(5) : 'Search a place…'}">
              <button type="button" class="loc-clear-btn"${photo.latitude == null ? ' style="display:none"' : ''}>× clear</button>
            </div>
            <input type="hidden" name="latitude"  value="${photo.latitude  ?? ''}">
            <input type="hidden" name="longitude" value="${photo.longitude ?? ''}">
          </label>
          <label>Nextcloud link <small>(optional — leave blank to remove)</small>
            <input type="url" name="nextcloud_url" value="${esc(photo.nextcloud_url || '')}">
          </label>
          <div class="row">
            <button class="btn" type="submit">Save</button>
            <a class="btn btn-secondary" href="/photos/${photo.id}">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  `, req.session));
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
