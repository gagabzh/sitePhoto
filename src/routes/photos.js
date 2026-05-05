const router = require('express').Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { page, esc } = require('../layout');
const { requireEditor } = require('../middleware');
const { optimizePhoto } = require('../imageOptimizer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

async function setTags(photoId, rawTags) {
  await db.query('DELETE FROM photo_tags WHERE photo_id = $1', [photoId]);
  const names = String(rawTags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  for (const name of names) {
    const { rows } = await db.query(
      'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [name]
    );
    await db.query(
      'INSERT INTO photo_tags (photo_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [photoId, rows[0].id]
    );
  }
}

function canModify(session, photo) {
  return session.role === 'admin' || photo.user_id === session.userId;
}

// US-P1: Photo list (editor/admin)
router.get('/', requireEditor, async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.id, p.filename, p.title, p.user_id, u.name AS uploader,
      COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM photos p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    GROUP BY p.id, u.name
    ORDER BY p.created_at DESC
  `);

  const grid = rows.length === 0
    ? '<p>No photos yet. <a href="/photos/upload">Upload the first one.</a></p>'
    : `<div class="photo-grid">${rows.map(p => `
        <div class="photo-card">
          <a href="/photos/${p.id}">
            <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
            <div class="photo-meta">
              <strong>${esc(p.title)}</strong>
              <span class="uploader">by ${esc(p.uploader)}</span>
              ${p.tags.length ? `<div class="tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>
          </a>
        </div>`).join('')}
      </div>`;

  res.send(page('Photos', `
    <div class="top-bar">
      <h1>Photos</h1>
      <a class="btn" href="/photos/upload">+ Upload</a>
    </div>
    ${grid}
  `, req.session));
});

// US-P1: Upload form
router.get('/upload', requireEditor, (req, res) => {
  const errors = {
    type: 'Only JPEG, PNG, GIF and WebP images are accepted.',
    size: 'File is too large (max 10 MB).',
    fail: 'Upload failed. Please try again.',
  };
  const error = errors[req.query.error] ? `<p class="msg-error">${errors[req.query.error]}</p>` : '';

  res.send(page('Upload a photo', `
    <h1>Upload a photo</h1>
    <div class="card" style="max-width:520px">
      ${error}
      <form class="form-col" method="POST" action="/photos/upload" enctype="multipart/form-data">
        <label>Photo <input type="file" name="photo" accept="image/*" required></label>
        <label>Title <input type="text" name="title" required></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>Tags <small>(comma-separated, e.g. Paris, John Doe)</small>
          <input type="text" name="tags" placeholder="Paris, John Doe">
        </label>
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

    const { title, description, tags } = req.body;
    try {
      const filepath = path.join(UPLOAD_DIR, req.file.filename);
      const finalSize = await optimizePhoto(filepath, req.file.mimetype);
      const { rows } = await db.query(
        'INSERT INTO photos (user_id, filename, original_filename, title, description, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [req.session.userId, req.file.filename, req.file.originalname, title, description || null, req.file.mimetype, finalSize]
      );
      if (tags) await setTags(rows[0].id, tags);
      res.redirect(`/photos/${rows[0].id}`);
    } catch (e) {
      next(e);
    }
  });
});

// View single photo (all authenticated users)
router.get('/:id', async (req, res) => {
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
      <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}"
        style="width:100%;max-height:560px;object-fit:contain;border-radius:8px;background:#111;margin-bottom:1.5rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
        <div>
          <h1 style="margin-bottom:0.25rem">${esc(photo.title)}</h1>
          <p style="color:#888;margin-top:0;font-size:0.9rem">by ${esc(photo.uploader)}</p>
          ${photo.description ? `<p>${esc(photo.description)}</p>` : ''}
          ${photo.tags.length ? `<div class="tags">${photo.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        ${canEdit ? `
          <div class="row" style="flex-shrink:0">
            <a class="btn btn-secondary" href="/photos/${photo.id}/edit">Edit</a>
            <form class="inline" method="POST" action="/photos/${photo.id}/delete"
              onsubmit="return confirm('Delete this photo permanently?')">
              <button class="btn btn-danger btn-icon" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
            </form>
          </div>` : ''}
      </div>
      <a href="/photos" style="color:#888;font-size:0.9rem;text-decoration:none">← Back to photos</a>
    </div>
  `, req.session));
});

// US-P3: Edit form
router.get('/:id/edit', requireEditor, async (req, res) => {
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
    <h1>Edit photo</h1>
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
          <div class="row">
            <button class="btn" type="submit">Save</button>
            <a class="btn btn-secondary" href="/photos/${photo.id}">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  `, req.session));
});

// US-P3: Save edits
router.post('/:id', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id FROM photos WHERE id = $1', [req.params.id]);
  const photo = rows[0];
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  const { title, description, tags } = req.body;
  await db.query(
    'UPDATE photos SET title = $1, description = $2, updated_at = NOW() WHERE id = $3',
    [title, description || null, req.params.id]
  );
  await setTags(req.params.id, tags || '');
  res.redirect(`/photos/${req.params.id}`);
});

// US-P4: Delete
router.post('/:id/delete', requireEditor, async (req, res) => {
  const { rows } = await db.query('SELECT user_id, filename FROM photos WHERE id = $1', [req.params.id]);
  const photo = rows[0];
  if (!photo) return res.status(404).send('Photo not found');
  if (!canModify(req.session, photo)) return res.status(403).send('Access denied');

  await db.query('DELETE FROM photos WHERE id = $1', [req.params.id]);
  fs.promises.unlink(path.join(UPLOAD_DIR, photo.filename)).catch(() => {});
  res.redirect('/photos');
});

module.exports = router;
