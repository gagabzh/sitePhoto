const router = require('express').Router();
const db = require('../../db');
const { page, esc } = require('../../layout');
const { wrapAsync } = require('../../middleware');

router.use(require('./combinator'));
router.use(require('./manage'));
router.use(require('./recipes'));

// ── TG-2: Tag autocomplete ────────────────────────────────────────────────────

router.get('/autocomplete', wrapAsync(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  const { rows } = await db.query(
    'SELECT name FROM tags WHERE name LIKE $1 ORDER BY name LIMIT 10',
    [q + '%']
  );
  res.json(rows.map(r => r.name));
}));

// ── V3: Photos by single tag ──────────────────────────────────────────────────

router.get('/:name', wrapAsync(async (req, res) => {
  const tagName  = req.params.name;
  const isViewer = req.session.role === 'viewer';

  const { rows: photos } = isViewer
    ? await db.query(`
        SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader
        FROM photos p
        JOIN users u ON u.id = p.user_id
        JOIN photo_tags pt ON pt.photo_id = p.id
        JOIN tags t ON t.id = pt.tag_id
        JOIN album_access aa ON aa.album_id = p.album_id
        WHERE t.name = $1 AND aa.viewer_id = $2
        ORDER BY p.id DESC
      `, [tagName, req.session.userId])
    : await db.query(`
        SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader
        FROM photos p
        JOIN users u ON u.id = p.user_id
        JOIN photo_tags pt ON pt.photo_id = p.id
        JOIN tags t ON t.id = pt.tag_id
        WHERE t.name = $1
        ORDER BY p.id DESC
      `, [tagName]);

  const grid = photos.length === 0
    ? '<p style="color:#888">No photos found for this tag.</p>'
    : `<div class="photo-grid">${photos.map(p => `
        <div class="photo-card">
          <a href="/photos/${p.id}">
            <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
            <div class="photo-meta">
              <strong>${esc(p.title)}</strong>
              <span class="uploader">by ${esc(p.uploader)}</span>
            </div>
          </a>
        </div>`).join('')}
      </div>`;

  res.send(page(`Tag: ${tagName}`, `
    <div class="top-bar">
      <h1>Tag: <em>${esc(tagName)}</em></h1>
      <a class="btn btn-secondary" href="/tags">← All tags</a>
    </div>
    ${grid}
  `, req.session));
}));

module.exports = router;
