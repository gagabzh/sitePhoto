const router = require('express').Router();
const db = require('../db');
const { wrapAsync } = require('../middleware');
const { renderTimelinePage } = require('./timelineViews');

function groupByInterval(rows, interval) {
  const groups = [];
  const index = new Map();
  for (const p of rows) {
    const d = new Date(p.display_date);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const mm = String(mo + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');

    let key, label, periodFrom, periodTo;
    if (interval === 'year') {
      key = String(y);
      label = key;
      periodFrom = `${y}-01-01`;
      periodTo = `${y}-12-31`;
    } else if (interval === 'day') {
      key = `${y}-${mm}-${dd}`;
      label = d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      periodFrom = key;
      periodTo = key;
    } else {
      key = `${y}-${mm}`;
      label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      periodFrom = `${y}-${mm}-01`;
      periodTo = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
    }

    if (!index.has(key)) {
      const group = { key, label, periodFrom, periodTo, photos: [] };
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
    params.push(session.userId);
    conditions.push(`EXISTS (SELECT 1 FROM album_photos ap JOIN album_access aa ON aa.album_id = ap.album_id WHERE ap.photo_id = p.id AND aa.viewer_id = $${params.length})`);
  }

  if (albumFilter) {
    params.push(albumFilter);
    conditions.push(`EXISTS (SELECT 1 FROM album_photos WHERE photo_id = p.id AND album_id = $${params.length})`);
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

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  return isNaN(Date.parse(s)) ? null : s;
}

const VALID_INTERVALS = new Set(['year', 'month', 'day']);

router.get('/', wrapAsync(async (req, res) => {
  const albumFilter = req.query.album || null;
  const tagFilter = req.query.tag || null;
  const fromFilter = parseDate(req.query.from);
  const toFilter   = parseDate(req.query.to);
  const groupInterval = VALID_INTERVALS.has(req.query.group) ? req.query.group : 'month';

  const [photos, { albums, tags }] = await Promise.all([
    fetchPhotos(req.session, albumFilter, tagFilter, fromFilter, toFilter),
    fetchFilterOptions(req.session),
  ]);

  const groups = groupByInterval(photos, groupInterval);

  // Stats derived from fetched photos — no extra DB query
  const totalPhotos = photos.length;
  const uniqueUploaders = new Set(photos.map(p => p.uploader)).size;
  const years = photos.map(p => new Date(p.display_date).getUTCFullYear());
  const firstYear = years.length ? Math.min(...years) : null;

  res.send(renderTimelinePage({
    groups, totalPhotos, uniqueUploaders, firstYear,
    albums, tags, albumFilter, tagFilter, fromFilter, toFilter, groupInterval,
    session: req.session,
  }));
}));

module.exports = router;
