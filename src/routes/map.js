const router = require('express').Router();
const db = require('../db');
const { wrapAsync } = require('../middleware');
const { renderMapPage } = require('./mapViews');

async function fetchGeoPhotos(session, albumFilter, tagFilter, latFilter, lonFilter, radiusKm) {
  const isViewer = session.role === 'viewer';
  const params = [];
  const joins = [];
  const conditions = ['p.latitude IS NOT NULL', 'p.longitude IS NOT NULL'];

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

  if (latFilter !== null && lonFilter !== null) {
    const p1 = params.length + 1;
    const p2 = params.length + 2;
    const p3 = params.length + 3;
    params.push(latFilter, lonFilter, radiusKm);
    conditions.push(`
      6371 * 2 * asin(sqrt(
        power(sin((radians(p.latitude::float) - radians($${p1})) / 2), 2)
        + cos(radians($${p1})) * cos(radians(p.latitude::float))
        * power(sin((radians(p.longitude::float) - radians($${p2})) / 2), 2)
      )) <= $${p3}`);
  }

  const sql = `
    SELECT DISTINCT p.id, p.title, p.filename,
      p.latitude::float AS latitude, p.longitude::float AS longitude
    FROM photos p
    ${joins.join(' ')}
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.id DESC`;

  const { rows } = await db.query(sql, params);
  return rows;
}

async function fetchFilterOptions(session) {
  const isViewer = session.role === 'viewer';

  const albumSql = isViewer
    ? `SELECT a.id, a.title, COUNT(p.id) AS photo_count
       FROM albums a
       JOIN album_photos ap ON ap.album_id = a.id
       JOIN photos p ON p.id = ap.photo_id
       JOIN album_access aa ON aa.album_id = a.id
       WHERE aa.viewer_id = $1 AND p.latitude IS NOT NULL
       GROUP BY a.id
       ORDER BY COUNT(p.id) DESC`
    : `SELECT a.id, a.title, COUNT(p.id) AS photo_count
       FROM albums a
       JOIN album_photos ap ON ap.album_id = a.id
       JOIN photos p ON p.id = ap.photo_id
       WHERE p.latitude IS NOT NULL
       GROUP BY a.id
       ORDER BY COUNT(p.id) DESC`;

  const tagSql = isViewer
    ? `SELECT DISTINCT t.name FROM tags t
       JOIN photo_tags pt ON pt.tag_id = t.id
       JOIN photos p ON p.id = pt.photo_id
       JOIN album_photos ap ON ap.photo_id = p.id
       JOIN album_access aa ON aa.album_id = ap.album_id
       WHERE aa.viewer_id = $1 AND p.latitude IS NOT NULL
       ORDER BY t.name`
    : `SELECT DISTINCT t.name FROM tags t
       JOIN photo_tags pt ON pt.tag_id = t.id
       JOIN photos p ON p.id = pt.photo_id
       WHERE p.latitude IS NOT NULL
       ORDER BY t.name`;

  const placeTagSql = isViewer
    ? `SELECT t.name, COUNT(DISTINCT p.id) AS photo_count
       FROM tags t
       JOIN photo_tags pt ON pt.tag_id = t.id
       JOIN photos p ON p.id = pt.photo_id
       JOIN album_photos ap ON ap.photo_id = p.id
       JOIN album_access aa ON aa.album_id = ap.album_id
       WHERE t.category = 'places' AND p.latitude IS NOT NULL AND aa.viewer_id = $1
       GROUP BY t.name ORDER BY COUNT(DISTINCT p.id) DESC`
    : `SELECT t.name, COUNT(DISTINCT p.id) AS photo_count
       FROM tags t
       JOIN photo_tags pt ON pt.tag_id = t.id
       JOIN photos p ON p.id = pt.photo_id
       WHERE t.category = 'places' AND p.latitude IS NOT NULL
       GROUP BY t.name ORDER BY COUNT(DISTINCT p.id) DESC`;

  const args = isViewer ? [session.userId] : [];
  const [albumRes, tagRes, placeTagRes] = await Promise.all([
    db.query(albumSql, args),
    db.query(tagSql, args),
    db.query(placeTagSql, args),
  ]);
  return { albums: albumRes.rows, tags: tagRes.rows, placeTags: placeTagRes.rows };
}

router.get('/', wrapAsync(async (req, res) => {
  const albumFilter  = req.query.album  ? parseInt(req.query.album)  : null;
  const tagFilter    = req.query.tag    || null;
  const latFilter    = req.query.lat    !== undefined ? parseFloat(req.query.lat)    : null;
  const lonFilter    = req.query.lon    !== undefined ? parseFloat(req.query.lon)    : null;
  const radiusFilter = req.query.radius ? Math.min(500, Math.max(1, parseFloat(req.query.radius) || 25)) : 25;

  const hasLocFilter = latFilter !== null && lonFilter !== null && !isNaN(latFilter) && !isNaN(lonFilter);
  const effectiveLat = hasLocFilter ? latFilter : null;
  const effectiveLon = hasLocFilter ? lonFilter : null;

  const [photos, { albums, tags, placeTags }] = await Promise.all([
    fetchGeoPhotos(req.session, albumFilter, tagFilter, effectiveLat, effectiveLon, radiusFilter),
    fetchFilterOptions(req.session),
  ]);

  res.send(renderMapPage({
    photos, albums, tags, placeTags,
    albumFilter, tagFilter, hasLocFilter,
    latFilter: effectiveLat, lonFilter: effectiveLon, radiusFilter,
    session: req.session,
  }));
}));

module.exports = router;
