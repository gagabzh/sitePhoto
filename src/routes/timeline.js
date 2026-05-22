const router = require('express').Router();
const { wrapAsync } = require('../middleware');
const { renderTimelinePage } = require('./timelineViews');
const { fetchPhotos, fetchFilterOptions } = require('../repositories/timeline');

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
