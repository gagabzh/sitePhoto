const { page, esc } = require('../layout');

function renderMapPage({ photos, albums, tags, placeTags, albumFilter, tagFilter,
                          hasLocFilter, latFilter, lonFilter, radiusFilter, session }) {
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
    ? JSON.stringify({ lat: latFilter, lon: lonFilter, radius: radiusFilter })
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
       <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
       <link rel="stylesheet" href="/vendor/leaflet.markercluster/MarkerCluster.css">
       <link rel="stylesheet" href="/vendor/leaflet.markercluster/MarkerCluster.Default.css">
       <script src="/vendor/leaflet/leaflet.js"></script>
       <script src="/vendor/leaflet.markercluster/leaflet.markercluster.js"></script>
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

  return page('Map', `
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
  `, session);
}

module.exports = { renderMapPage };
