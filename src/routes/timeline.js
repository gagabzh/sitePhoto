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

async function fetchPhotos(session, albumFilter, tagFilter, fromFilter, toFilter) {
  const isViewer = session.role === 'viewer';
  const params = [];
  const joins = [];
  const conditions = [];

  if (isViewer) {
    joins.push('JOIN album_access aa ON aa.album_id = p.album_id');
    params.push(session.userId);
    conditions.push(`aa.viewer_id = $${params.length}`);
  }

  if (albumFilter) {
    params.push(albumFilter);
    conditions.push(`p.album_id = $${params.length}`);
  }

  if (tagFilter) {
    joins.push('JOIN photo_tags pt ON pt.photo_id = p.id');
    joins.push('JOIN tags t ON t.id = pt.tag_id');
    params.push(tagFilter);
    conditions.push(`t.name = $${params.length}`);
  }

  conditions.push('p.taken_at IS NOT NULL');

  if (fromFilter) {
    params.push(fromFilter);
    conditions.push(`p.taken_at::date >= $${params.length}::date`);
  }

  if (toFilter) {
    params.push(toFilter);
    conditions.push(`p.taken_at::date <= $${params.length}::date`);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await db.query(`
    SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader,
      p.taken_at AS display_date
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
           JOIN album_access aa ON aa.album_id = p.album_id
           WHERE aa.viewer_id = $1 ORDER BY t.name`,
          [session.userId]
        )
      : db.query('SELECT name FROM tags ORDER BY name'),
  ]);

  return { albums: albumsRes.rows, tags: tagsRes.rows };
}

// ── TL1-TL2: Timeline ────────────────────────────────────────────────────────

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  return isNaN(Date.parse(s)) ? null : s;
}

router.get('/', async (req, res) => {
  const albumFilter = req.query.album || null;
  const tagFilter = req.query.tag || null;
  const fromFilter = parseDate(req.query.from);
  const toFilter   = parseDate(req.query.to);

  const [photos, { albums, tags }] = await Promise.all([
    fetchPhotos(req.session, albumFilter, tagFilter, fromFilter, toFilter),
    fetchFilterOptions(req.session),
  ]);

  const groups = groupByMonth(photos);

  // Stats derived from fetched photos — no extra DB query
  const totalPhotos = photos.length;
  const uniqueUploaders = new Set(photos.map(p => p.uploader)).size;
  const years = photos.map(p => new Date(p.display_date).getUTCFullYear());
  const firstYear = years.length ? Math.min(...years) : null;

  // Filter selects
  const albumOptions = albums.map(a =>
    `<option value="${a.id}" ${String(albumFilter) === String(a.id) ? 'selected' : ''}>${esc(a.title)}</option>`
  ).join('');
  const tagOptions = tags.map(t =>
    `<option value="${esc(t.name)}" ${tagFilter === t.name ? 'selected' : ''}>${esc(t.name)}</option>`
  ).join('');

  const filterBar = `
    <form class="tl-filter-bar" method="GET" action="/timeline">
      <label>Album
        <select name="album">
          <option value="">All</option>
          ${albumOptions}
        </select>
      </label>
      <label>Tag
        <select name="tag">
          <option value="">All</option>
          ${tagOptions}
        </select>
      </label>
      <label>From <input type="date" name="from" value="${fromFilter || ''}"></label>
      <label>To <input type="date" name="to" value="${toFilter || ''}"></label>
      <button class="btn btn-sm" type="submit">Filter</button>
      ${albumFilter || tagFilter || fromFilter || toFilter ? '<a class="btn btn-sm btn-secondary" href="/timeline">Clear</a>' : ''}
    </form>`;

  // "When" label helpers
  const today = new Date();
  const nowKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const prevKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

  function whenLabel(key) {
    if (key === nowKey) return 'now';
    if (key === prevKey) return 'last mo.';
    const [y, m] = key.split('-');
    return new Date(Date.UTC(+y, +m - 1, 1))
      .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      .toLowerCase();
  }

  // Grid variant and render
  function gridVariant(n) {
    if (n <= 1) return 'k1';
    if (n === 2) return 'k2';
    if (n === 3) return 'k3';
    if (n >= 5) return 'k5';
    return 'k4';
  }

  const moreParams = new URLSearchParams();
  if (albumFilter) moreParams.set('album', albumFilter);
  if (tagFilter) moreParams.set('tag', tagFilter);
  if (fromFilter) moreParams.set('from', fromFilter);
  if (toFilter) moreParams.set('to', toFilter);
  const moreHref = '/timeline' + (moreParams.toString() ? '?' + moreParams.toString() : '');

  function renderGrid(gp) {
    const n = gp.length;
    const v = gridVariant(n);
    const maxShown = { k1: 1, k2: 2, k3: 3, k4: 4, k5: 5 }[v];
    const shown = gp.slice(0, maxShown);
    const extra = n - maxShown;

    const cells = shown.map(p => `
      <div class="tl-cell">
        <a href="/photos/${p.id}">
          <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
        </a>
      </div>`).join('');

    const moreCell = extra > 0 ? `
      <div class="tl-cell">
        <a class="tl-more" href="${moreHref}">+${extra} more</a>
      </div>` : '';

    return `<div class="tl-grid ${v}">${cells}${moreCell}</div>`;
  }

  const content = groups.length === 0
    ? '<p class="tl-empty">No photos found.</p>'
    : `<div class="tl-timeline">${groups.map(({ key, label, photos: gp }) => {
        const uploaders = [...new Set(gp.map(p => p.uploader))].join(' · ');
        return `
          <div class="tl-entry">
            <div class="tl-when">
              <span class="tl-when-dot"></span>${whenLabel(key)}
              <span class="tl-when-yr">${key.split('-')[0]}</span>
            </div>
            <div>
              <h3>${esc(label)}</h3>
              <p class="tl-meta">${gp.length} photo${gp.length !== 1 ? 's' : ''} · <em>${esc(uploaders)}</em></p>
              ${renderGrid(gp)}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  res.send(page('Timeline', `
    <div class="tl-hero">
      <div>
        <h1>Timeline</h1>
        <p class="tl-headline">everything we've <em>seen together,</em><br>in order.</p>
        <p class="tl-lede">a shared archive — scroll backwards in time.</p>
      </div>
      <div class="tl-stats">
        <b>${totalPhotos}</b> photo${totalPhotos !== 1 ? 's' : ''}<br>
        <b>${uniqueUploaders}</b> ${uniqueUploaders === 1 ? 'person' : 'people'}<br>
        ${firstYear ? `<b>${firstYear}</b> first photo` : ''}
      </div>
    </div>
    ${filterBar}
    ${content}
  `, req.session));
});

module.exports = router;
