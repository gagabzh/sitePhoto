const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');

async function fetchGeoPhotos(session, albumFilter, tagFilter) {
  const isViewer = session.role === 'viewer';
  const params = [];
  const joins = [];
  const conditions = ['p.latitude IS NOT NULL', 'p.longitude IS NOT NULL'];

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
    ? `SELECT DISTINCT a.id, a.title FROM albums a
       JOIN album_access aa ON aa.album_id = a.id
       JOIN album_photos ap ON ap.album_id = a.id
       JOIN photos p ON p.id = ap.photo_id
       WHERE aa.viewer_id = $1 AND p.latitude IS NOT NULL
       ORDER BY a.title`
    : `SELECT DISTINCT a.id, a.title FROM albums a
       JOIN album_photos ap ON ap.album_id = a.id
       JOIN photos p ON p.id = ap.photo_id
       WHERE p.latitude IS NOT NULL
       ORDER BY a.title`;

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

  const args = isViewer ? [session.userId] : [];
  const [albumRes, tagRes] = await Promise.all([
    db.query(albumSql, args),
    db.query(tagSql, args),
  ]);
  return { albums: albumRes.rows, tags: tagRes.rows };
}

router.get('/', async (req, res) => {
  const albumFilter = req.query.album ? parseInt(req.query.album) : null;
  const tagFilter   = req.query.tag   || null;

  const [photos, { albums, tags }] = await Promise.all([
    fetchGeoPhotos(req.session, albumFilter, tagFilter),
    fetchFilterOptions(req.session),
  ]);

  const albumOptions = albums.map(a =>
    `<option value="${a.id}"${albumFilter === a.id ? ' selected' : ''}>${esc(a.title)}</option>`
  ).join('');

  const tagOptions = tags.map(t =>
    `<option value="${esc(t.name)}"${tagFilter === t.name ? ' selected' : ''}>${esc(t.name)}</option>`
  ).join('');

  const photosJson = JSON.stringify(photos.map(p => ({
    id: p.id,
    title: p.title,
    filename: p.filename,
    lat: p.latitude,
    lon: p.longitude,
  })));

  const mapContent = photos.length === 0
    ? `<p style="text-align:center;color:#888;padding:3rem 0">No photos with GPS coordinates found.</p>`
    : `<div id="map" style="height:600px;border-radius:8px;overflow:hidden"></div>
       <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
       <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
       <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
       <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
       <script>
         (function(){
           var photos = ${photosJson};
           var map = L.map('map');
           L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
             attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
           }).addTo(map);
           var cluster = L.markerClusterGroup({ spiderfyOnMaxZoom: true, maxClusterRadius: 40 });
           var bounds = [];
           photos.forEach(function(p){
             var popup = '<a href="/photos/'+p.id+'" style="display:block;text-align:center">'
               +'<img src="/uploads/'+p.filename+'" style="width:120px;height:80px;object-fit:cover;border-radius:4px;display:block;margin:0 auto 0.4rem">'
               +'<strong>'+p.title+'</strong></a>';
             cluster.addLayer(L.marker([p.lat,p.lon]).bindPopup(popup));
             bounds.push([p.lat,p.lon]);
           });
           map.addLayer(cluster);
           if(bounds.length===1){ map.setView(bounds[0],13); }
           else { map.fitBounds(bounds,{padding:[32,32]}); }
         })();
       </script>`;

  res.send(page('Map', `
    <div class="top-bar" style="margin-bottom:1rem">
      <h1>Map</h1>
    </div>
    <form method="GET" action="/map" class="filter-bar" style="margin-bottom:1rem">
      <select name="album" onchange="this.form.submit()">
        <option value="">All albums</option>
        ${albumOptions}
      </select>
      <select name="tag" onchange="this.form.submit()">
        <option value="">All tags</option>
        ${tagOptions}
      </select>
      ${albumFilter || tagFilter ? `<a href="/map" class="btn btn-secondary btn-sm">Clear</a>` : ''}
    </form>
    ${mapContent}
  `, req.session));
});

module.exports = router;
