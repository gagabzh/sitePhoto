const router = require('express').Router();
const { wrapAsync } = require('../middleware');
const { renderMapPage } = require('./mapViews');
const { fetchGeoPhotos, fetchFilterOptions } = require('./mapQueries');

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
