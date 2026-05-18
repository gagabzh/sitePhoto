const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');

async function fetchGeoPhotos(session, albumFilter, tagFilter, latFilter, lonFilter, radiusKm) {
  const isViewer = session.role === 'viewer';
  const params = [];
  const joins = [];
  const conditions = ['p.latitude IS NOT NULL', 'p.longitude IS NOT NULL'];

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
       JOIN photos p ON p.album_id = a.id
       JOIN album_access aa ON aa.album_id = a.id
       WHERE aa.viewer_id = $1 AND p.latitude IS NOT NULL
       GROUP BY a.id
       ORDER BY COUNT(p.id) DESC`
    : `SELECT a.id, a.title, COUNT(p.id) AS photo_count
       FROM albums a
       JOIN photos p ON p.album_id = a.id
       WHERE p.latitude IS NOT NULL
       GROUP BY a.id
       ORDER BY COUNT(p.id) DESC`;

  const tagSql = isViewer
    ? `SELECT DISTINCT t.name FROM tags t
       JOIN photo_tags pt ON pt.tag_id = t.id
       JOIN photos p ON p.id = pt.photo_id
       JOIN album_access aa ON aa.album_id = p.album_id
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
       JOIN album_access aa ON aa.album_id = p.album_id
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

router.get('/', async (req, res) => {
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

  const albumOptions = albums.map(a =>
    `<option value="${a.id}"${albumFilter === a.id ? ' selected' : ''}>${esc(a.title)}</option>`
  ).join('');

  const tagOptions = tags.map(t =>
    `<option value="${esc(t.name)}"${tagFilter === t.name ? ' selected' : ''}>${esc(t.name)}</option>`
  ).join('');

  const clearLink = (albumFilter || tagFilter || hasLocFilter)
    ? `<a href="/map" class="btn btn-secondary btn-sm">Clear</a>` : '';

  const locPlaceholder = hasLocFilter
    ? `${latFilter.toFixed(5)}, ${lonFilter.toFixed(5)}`
    : 'Search a place…';

  const placeList = placeTags.map(t => {
    const active = tagFilter === t.name ? ' active' : '';
    const href = '/map?tag=' + encodeURIComponent(t.name) + (albumFilter ? '&album=' + albumFilter : '');
    return `<a class="map-place${active}" href="${href}">
      <span class="map-place-pin">📍</span>
      <span class="map-place-name">${esc(t.name)}</span>
      <span class="map-place-n">${t.photo_count}</span>
    </a>`;
  }).join('');

  const photosJson = JSON.stringify(photos.map(p => ({
    id: p.id,
    title: p.title,
    filename: p.filename,
    lat: p.latitude,
    lon: p.longitude,
  })));

  const zoneJson = hasLocFilter
    ? JSON.stringify({ lat: effectiveLat, lon: effectiveLon, radius: radiusFilter })
    : 'null';

  const mapContent = photos.length === 0
    ? `<div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:300px;font-family:'Kalam',cursive;color:var(--ink-faint)">No photos with GPS coordinates found.</div>`
    : `<div id="map"></div>
       <div id="map-strip" class="map-strip" style="display:none">
         <div class="map-strip-head">
           <h3 id="strip-title"></h3>
           <span id="strip-where" class="map-strip-where"></span>
           <button id="strip-close" class="map-strip-close" type="button" aria-label="Close">×</button>
         </div>
         <div id="strip-photos" class="map-strip-photos"></div>
       </div>
       <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
       <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
       <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
       <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
       <script>
         (function(){
           var photos = ${photosJson};
           var zone   = ${zoneJson};
           var map = L.map('map', { center: [20, 0], zoom: 2 });
           L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
             attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
             subdomains:'abcd', maxZoom:20
           }).addTo(map);
           var cluster = L.markerClusterGroup({ spiderfyOnMaxZoom: true, maxClusterRadius: 40, zoomToBoundsOnClick: false });
           var bounds = [];

           var strip      = document.getElementById('map-strip');
           var stripTitle = document.getElementById('strip-title');
           var stripWhere = document.getElementById('strip-where');
           var stripPhotos = document.getElementById('strip-photos');
           var stripClose  = document.getElementById('strip-close');

           function showStrip(title, where, list) {
             stripTitle.textContent = title;
             stripWhere.textContent = where;
             var shown = list.slice(0, 5);
             var extra = list.length - 5;
             stripPhotos.innerHTML = shown.map(function(p) {
               return '<a href="/photos/'+p.id+'">'
                 +'<img src="/uploads/'+p.filename+'" alt="'+p.title+'">'
                 +'</a>';
             }).join('') + (extra > 0
               ? '<a class="map-strip-more" href="/photos">+'+extra+' more</a>'
               : '');
             strip.style.display = 'block';
           }

           stripClose.addEventListener('click', function() {
             strip.style.display = 'none';
           });

           photos.forEach(function(p) {
             var marker = L.marker([p.lat, p.lon]);
             marker.photoData = p;
             marker.on('click', function() {
               showStrip(p.title, p.lat.toFixed(4)+'°, '+p.lon.toFixed(4)+'°', [p]);
             });
             cluster.addLayer(marker);
             bounds.push([p.lat, p.lon]);
           });

           cluster.on('clusterclick', function(e) {
             var childMarkers = e.layer.getAllChildMarkers();
             var list = childMarkers.map(function(m) { return m.photoData; });
             var lat = e.latlng.lat.toFixed(4);
             var lon = e.latlng.lng.toFixed(4);
             showStrip(list.length+' photos here', lat+'°, '+lon+'°', list);
           });

           map.addLayer(cluster);
           if (zone) {
             L.circle([zone.lat, zone.lon], {
               radius: zone.radius * 1000,
               color: 'var(--accent, #b35c2e)',
               weight: 2,
               fillOpacity: 0.06,
               dashArray: '6 4'
             }).addTo(map);
           }
           setTimeout(function() {
             map.invalidateSize();
             if (zone) {
               var dLat = zone.radius / 111.32;
               var dLon = zone.radius / (111.32 * Math.cos(zone.lat * Math.PI / 180));
               map.fitBounds(
                 [[zone.lat - dLat, zone.lon - dLon], [zone.lat + dLat, zone.lon + dLon]],
                 { padding: [20, 20] }
               );
             } else if (bounds.length === 1) {
               map.setView(bounds[0], 11);
             } else if (bounds.length > 1) {
               map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
             }
           }, 0);
         })();
       </script>`;

  res.send(page('Map', `
    <div class="map-frame">
      <aside class="map-side">
        <h1>where we've been.</h1>
        <p class="map-sub">click a pin · or pick a place below</p>

        <form method="GET" action="/map" class="map-filter-form">
          <select name="album" onchange="this.form.submit()">
            <option value="">All albums</option>
            ${albumOptions}
          </select>
          <select name="tag" onchange="this.form.submit()">
            <option value="">All tags</option>
            ${tagOptions}
          </select>

          <div class="map-loc-section">
            <p class="map-loc-label">Zone search</p>
            <div class="loc-search-wrap" data-lat-name="lat" data-lon-name="lon">
              <input type="text" class="loc-search-input" placeholder="${locPlaceholder}" autocomplete="off">
              <button type="button" class="loc-clear-btn" style="${hasLocFilter ? '' : 'display:none'}">×</button>
            </div>
            <input type="hidden" name="lat" value="${hasLocFilter ? latFilter : ''}">
            <input type="hidden" name="lon" value="${hasLocFilter ? lonFilter : ''}">
            <div class="map-radius-row">
              <label>Radius <input type="number" name="radius" value="${radiusFilter}" min="1" max="500" class="map-radius-input"> km</label>
              <button type="submit" class="btn btn-primary btn-sm">Apply</button>
            </div>
          </div>

          ${clearLink}
        </form>

        ${placeTags.length ? `
          <h4 class="map-side-h">PLACES</h4>
          ${placeList}
        ` : ''}
      </aside>

      <div class="map-area">
        ${mapContent}
      </div>
    </div>
  `, req.session));
});

module.exports = router;
