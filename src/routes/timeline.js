const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');

function groupByMonth(rows) {
  const groups = [];
  const index = new Map();
  for (const p of rows) {
    const d = new Date(p.display_date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!index.has(key)) {
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const group = { key, label, photos: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).photos.push(p);
  }
  return groups;
}

async function fetchPhotos(session, albumFilter, tagFilter) {
  const isViewer = session.role === 'viewer';
  const params = [];
  const joins = [];
  const conditions = [];

  if (isViewer) {
    joins.push('JOIN album_photos ap ON ap.photo_id = p.id');
    joins.push('JOIN album_access aa ON aa.album_id = ap.album_id');
    params.push(session.userId);
    conditions.push(`aa.viewer_id = $${params.length}`);
  }

  if (albumFilter) {
    if (!isViewer) joins.push('JOIN album_photos ap ON ap.photo_id = p.id');
    params.push(albumFilter);
    conditions.push(`ap.album_id = $${params.length}`);
  }

  if (tagFilter) {
    joins.push('JOIN photo_tags pt ON pt.photo_id = p.id');
    joins.push('JOIN tags t ON t.id = pt.tag_id');
    params.push(tagFilter);
    conditions.push(`t.name = $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await db.query(`
    SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader,
      COALESCE(p.taken_at, p.created_at::date) AS display_date
    FROM photos p
    JOIN users u ON u.id = p.user_id
    ${joins.join('\n    ')}
    ${where}
    ORDER BY display_date DESC, p.id DESC
  `, params.length ? params : []);
  return rows;
}

async function fetchFilterOptions(session) {
  const isViewer = session.role === 'viewer';

  const [albumsRes, tagsRes] = await Promise.all([
    isViewer
      ? db.query(
          `SELECT a.id, a.title FROM albums a
           JOIN album_access aa ON aa.album_id = a.id
           WHERE aa.viewer_id = $1 ORDER BY a.title`,
          [session.userId]
        )
      : db.query('SELECT id, title FROM albums ORDER BY title'),
    isViewer
      ? db.query(
          `SELECT DISTINCT t.name FROM tags t
           JOIN photo_tags pt ON pt.tag_id = t.id
           JOIN photos p ON p.id = pt.photo_id
           JOIN album_photos ap ON ap.photo_id = p.id
           JOIN album_access aa ON aa.album_id = ap.album_id
           WHERE aa.viewer_id = $1 ORDER BY t.name`,
          [session.userId]
        )
      : db.query('SELECT name FROM tags ORDER BY name'),
  ]);

  return { albums: albumsRes.rows, tags: tagsRes.rows };
}

// ── TL1-TL2: Timeline ────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const albumFilter = req.query.album || null;
  const tagFilter = req.query.tag || null;

  const [photos, { albums, tags }] = await Promise.all([
    fetchPhotos(req.session, albumFilter, tagFilter),
    fetchFilterOptions(req.session),
  ]);

  const groups = groupByMonth(photos);

  // Filter bar
  const albumOptions = albums.map(a =>
    `<option value="${a.id}" ${String(albumFilter) === String(a.id) ? 'selected' : ''}>${esc(a.title)}</option>`
  ).join('');
  const tagOptions = tags.map(t =>
    `<option value="${esc(t.name)}" ${tagFilter === t.name ? 'selected' : ''}>${esc(t.name)}</option>`
  ).join('');

  const filterBar = `
    <form class="filter-bar" method="GET" action="/timeline">
      <label style="font-size:0.9rem;font-weight:500;display:flex;align-items:center;gap:0.4rem">
        Album
        <select name="album">
          <option value="">All</option>
          ${albumOptions}
        </select>
      </label>
      <label style="font-size:0.9rem;font-weight:500;display:flex;align-items:center;gap:0.4rem">
        Tag
        <select name="tag">
          <option value="">All</option>
          ${tagOptions}
        </select>
      </label>
      <button class="btn btn-sm" type="submit">Filter</button>
      ${albumFilter || tagFilter ? '<a class="btn btn-sm btn-secondary" href="/timeline">Clear</a>' : ''}
    </form>`;

  const content = groups.length === 0
    ? '<p style="color:#888">No photos found.</p>'
    : groups.map(({ label, photos: groupPhotos }) => `
        <h2 class="timeline-month">${esc(label)}</h2>
        <div class="photo-grid">${groupPhotos.map(p => `
          <div class="photo-card">
            <a href="/photos/${p.id}">
              <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
              <div class="photo-meta">
                <strong>${esc(p.title)}</strong>
                <span class="uploader">by ${esc(p.uploader)}</span>
              </div>
            </a>
          </div>`).join('')}
        </div>`).join('');

  res.send(page('Timeline', `
    <div class="top-bar">
      <h1>Timeline</h1>
    </div>
    ${filterBar}
    ${content}
  `, req.session));
});

module.exports = router;
