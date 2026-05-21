const { page, esc } = require('../layout');
const { canModify } = require('../permissions');

function safeJson(v) {
  return JSON.stringify(v).replace(/<\/script>/gi, '<\\/script>');
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}

function fmtDuration(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function miniMapHtml(mapId, geojson, photoPins, opts = {}) {
  const height   = opts.height   || 200;
  const zoom     = opts.zoom     || 2;
  const cssClass = opts.cssClass || '';

  const geojsonJs = geojson   ? safeJson(geojson)   : 'null';
  const pinsJs    = photoPins ? safeJson(photoPins) : '[]';

  return `
    <div id="${mapId}" style="height:${height}px;width:100%" class="${cssClass}"></div>
    <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
    <script src="/vendor/leaflet/leaflet.js"></script>
    <script>(function(){
      var m = L.map('${mapId}', { center:[20,0], zoom:${zoom}, zoomControl:${opts.zoomControl !== false} });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains:'abcd', maxZoom:20
      }).addTo(m);
      var bounds = [];
      var geojson = ${geojsonJs};
      var pins = ${pinsJs};
      if (geojson) {
        var layer = L.geoJSON(geojson, {
          style: { color: 'oklch(62% 0.14 35)', weight: 2.5, dashArray: '8 5', opacity: 0.9 },
          pointToLayer: function() { return null; }
        }).addTo(m);
        var lb = layer.getBounds();
        if (lb.isValid()) { bounds.push(lb.getSouthWest()); bounds.push(lb.getNorthEast()); }
      }
      var photoIcon = L.divIcon({
        html: '<div style="width:12px;height:12px;background:var(--paper);border:2px solid var(--ink);box-shadow:1px 1px 0 rgba(0,0,0,.3)"></div>',
        className: '', iconAnchor:[6,6]
      });
      pins.forEach(function(p){
        if (!p.lat || !p.lon) return;
        var mk = L.marker([p.lat,p.lon], {icon: photoIcon});
        ${opts.clickable ? `mk.on('click', function(){ window.location='/photos/'+p.id; });` : ''}
        mk.addTo(m);
        bounds.push([p.lat,p.lon]);
      });
      setTimeout(function(){
        m.invalidateSize();
        if (bounds.length === 1) m.setView(bounds[0], 11);
        else if (bounds.length > 1) m.fitBounds(bounds, {padding:[16,16], maxZoom:13});
      }, 0);
    })();</script>`;
}

function travelCard(t, session) {
  const isShared = session.role === 'viewer';
  const slug = esc(t.slug || String(t.id));
  const photoPins = (t.geo_pins || []).map(p => ({ lat: p.lat, lon: p.lon, id: p.id }));
  const miniMap = miniMapHtml('tvcard-' + t.id, t.gpx_geojson || null, photoPins, { height: 160, zoomControl: false });

  return `
    <a href="/travels/${slug}" class="tv-card">
      <div class="tv-card-cover">
        ${miniMap}
        <span class="tv-badge ${t.gpx_filename ? 'tv-badge-gpx' : 'tv-badge-nogpx'}">${t.gpx_filename ? 'GPX' : 'NO GPX'}</span>
        ${isShared ? '<span class="tv-badge-shared">SHARED</span>' : ''}
      </div>
      <div class="tv-card-body">
        <h3>${esc(t.title)}</h3>
        ${t.date_range ? `<div class="tv-card-when">${esc(t.date_range)}</div>` : ''}
        <div class="tv-card-desc">${esc((t.description || '').substring(0, 120))}</div>
      </div>
      <div class="tv-card-foot">
        <span><b>${t.album_count || 0}</b> albums</span>
        <span><b>${t.photo_count || 0}</b> photos</span>
        ${t.gpx_distance_km ? `<span><b>${t.gpx_distance_km}</b> km</span>` : ''}
      </div>
    </a>`;
}

function gpxFilledHtml(travel) {
  const stats = [];
  if (travel.gpx_distance_km) stats.push(`${travel.gpx_distance_km} km`);
  if (travel.gpx_duration_min) stats.push(fmtDuration(travel.gpx_duration_min) + ' moving');
  if (travel.gpx_trackpoints) stats.push(`${travel.gpx_trackpoints} trackpoints`);
  const previewId = 'gpx-preview-map';
  const miniMap = travel.gpx_geojson
    ? miniMapHtml(previewId, travel.gpx_geojson, [], { height: 90, zoomControl: false })
    : `<div id="${previewId}" style="height:90px;background:var(--paper-2);display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--ink-faint)">no trace</div>`;
  return `
    <div class="tv-gpx-filled">
      <div class="tv-gpx-preview">${miniMap}</div>
      <div class="tv-gpx-info">
        <b>${esc(travel.gpx_filename)}</b>
        ${stats.length ? stats.join(' · ') : ''}
        <div class="tv-gpx-acts">
          <label class="btn btn-sm btn-secondary" style="cursor:pointer">
            replace <input type="file" name="gpx" accept=".gpx" style="display:none" onchange="this.form.submit()">
          </label>
          <button type="button" class="btn btn-sm btn-danger" id="gpx-remove-btn">remove</button>
        </div>
      </div>
    </div>`;
}

function linkedAlbumsFormHtml(albums) {
  const items = albums.map(a => `
    <div class="tv-linked-item" data-id="${a.id}" data-type="album">
      <div class="tv-linked-thumb">
        ${a.cover_filename ? `<img src="/uploads/${esc(a.cover_filename)}" alt="">` : ''}
      </div>
      <span class="tv-linked-t">${esc(a.title)}<span class="tv-linked-d">${a.photo_count} photos · ${esc(a.creator)}</span></span>
      <button type="button" class="tv-linked-x" data-unlink="album" data-id="${a.id}" title="Unlink">×</button>
    </div>`).join('');
  return `
    <div class="tv-linked-box">
      <div class="tv-linked-head">
        <h4>Albums</h4>
        <span class="tv-linked-n" id="album-count">${albums.length} LINKED</span>
        <span class="tv-linked-head-sp"></span>
        <button type="button" class="btn btn-sm btn-secondary" id="link-albums-btn">+ link album</button>
      </div>
      <div class="tv-linked-list" id="linked-albums-list">
        ${items || '<div class="tv-linked-empty">no albums linked yet</div>'}
      </div>
    </div>`;
}

function linkedPhotosFormHtml(photos) {
  const items = photos.map(p => `
    <div class="tv-linked-item" data-id="${p.id}" data-type="photo">
      <div class="tv-linked-thumb">
        <img src="/uploads/${esc(p.filename)}" alt="">
      </div>
      <span class="tv-linked-t">${esc(p.title || p.filename)}</span>
      <button type="button" class="tv-linked-x" data-unlink="photo" data-id="${p.id}" title="Unlink">×</button>
    </div>`).join('');
  return `
    <div class="tv-linked-box">
      <div class="tv-linked-head">
        <h4>Standalone Photos</h4>
        <span class="tv-linked-n" id="photo-count">${photos.length} LINKED</span>
        <span class="tv-linked-head-sp"></span>
        <button type="button" class="btn btn-sm btn-secondary" id="link-photos-btn">+ link photo</button>
      </div>
      <div class="tv-linked-list" id="linked-photos-list">
        ${items || '<div class="tv-linked-empty">no standalone photos linked yet</div>'}
      </div>
    </div>`;
}

function indexView(travels, session) {
  const isEditor = session.role !== 'viewer';
  const cards = travels.map(t => travelCard(t, session)).join('');

  const body = `
    <div class="tv-page-h">
      <div>
        <h1>travels<em>.</em></h1>
        <p class="tv-sub">trips, adventures, and places we've been.</p>
      </div>
      ${isEditor ? `<div class="tv-page-actions"><a href="/travels/new" class="btn">+ new travel</a></div>` : ''}
    </div>

    ${travels.length === 0
      ? `<div class="tv-empty">
          <h3>no travels yet.</h3>
          <p>Start by creating your first travel.</p>
          ${isEditor ? `<a href="/travels/new" class="btn">+ new travel</a>` : ''}
        </div>`
      : `<div class="tv-grid">
          ${cards}
          ${isEditor ? `<a href="/travels/new" class="tv-new-card">
            <span class="tv-new-plus">+</span>
            <span class="tv-new-label">new travel</span>
          </a>` : ''}
        </div>`}`;

  return page('Travels', body, session);
}

function createFormView(session) {
  const body = `
    <div class="tv-page-h">
      <div><h1>new travel<em>.</em></h1></div>
    </div>
    <form method="POST" action="/travels" id="tv-form" enctype="multipart/form-data">
      <div class="tv-form-wrap">
        <div class="tv-form-main">
          <div class="tv-field">
            <label for="tv-title">Title</label>
            <p class="tv-help">A short name — ideally place and year.</p>
            <input id="tv-title" type="text" name="title" required class="tv-dirty-watch" placeholder="e.g. Patagonia 2024">
          </div>
          <div class="tv-field">
            <label for="tv-desc">Description</label>
            <textarea id="tv-desc" name="description" rows="5" class="tv-dirty-watch" placeholder="Write something..."></textarea>
          </div>
          <div class="tv-field">
            <label>GPX file <span style="font-family:'Kalam',cursive;font-size:0.85rem;font-weight:400;color:var(--ink-soft)">(optional)</span></label>
            <p class="tv-help">Drop a .gpx file to add a GPS trace to the map. Max 10 MB.</p>
            <div class="tv-gpx-zone" id="gpx-zone">
              <div class="tv-gpx-drop" id="gpx-drop">
                <div class="tv-gpx-big">drop a .gpx file here</div>
                <div class="tv-gpx-small">or <label style="cursor:pointer;text-decoration:underline">browse<input type="file" name="gpx" accept=".gpx" id="gpx-input" style="display:none"></label> · .gpx only · max 10 MB</div>
              </div>
            </div>
          </div>
        </div>
        <div class="tv-form-side">
          <div class="tv-form-panel">
            <h5>Visibility</h5>
            <p style="font-family:'Kalam',cursive;font-size:0.82rem;color:var(--ink-soft);margin:0">
              Private until you share it. After creating, go to the edit page to link albums and share with viewers.
            </p>
          </div>
        </div>
      </div>
      <div class="tv-form-actions">
        <span></span>
        <div class="tv-form-actions-r">
          <a href="/travels" class="btn btn-secondary">cancel</a>
          <button type="submit" class="btn">create travel</button>
        </div>
      </div>
    </form>`;

  return page('New Travel', body, session);
}

function editFormView(travel, linkedAlbums, linkedPhotos, allViewers, travelViewers, session) {
  const slug = esc(travel.slug);
  const viewerIds = new Set(travelViewers.map(v => v.id));

  const gpxSection = travel.gpx_filename
    ? gpxFilledHtml(travel)
    : `<div class="tv-gpx-zone" id="gpx-zone">
        <div class="tv-gpx-drop" id="gpx-drop">
          <div class="tv-gpx-big">drop a .gpx file here</div>
          <div class="tv-gpx-small">or <label style="cursor:pointer;text-decoration:underline">browse<input type="file" name="gpx" accept=".gpx" id="gpx-input" style="display:none"></label> · .gpx only · max 10 MB</div>
        </div>
      </div>`;

  const shareRows = allViewers.map(v => `
    <div class="tv-share-row${viewerIds.has(v.id) ? ' on' : ''}" data-id="${v.id}" tabindex="0">
      <span class="tv-av">${esc(v.name[0].toUpperCase())}</span>
      <span><span class="tv-share-nm">${esc(v.name)}</span><span class="tv-share-em">${esc(v.email)}</span></span>
      <span class="tv-share-ck">${viewerIds.has(v.id) ? '✓' : ''}</span>
    </div>`).join('');

  const body = `
    <div class="tv-page-h">
      <div>
        <h1>${esc(travel.title)}<em> — edit</em></h1>
        <p class="tv-sub"><a href="/travels/${slug}" style="color:var(--accent)">← back to travel</a></p>
      </div>
      <span class="tv-dirty" id="dirty-pill">unsaved changes</span>
    </div>

    <form method="POST" action="/travels/${slug}/edit" id="tv-form" enctype="multipart/form-data">
      <div class="tv-form-wrap">
        <div class="tv-form-main">
          <div class="tv-field">
            <label for="tv-title">Title</label>
            <input id="tv-title" type="text" name="title" value="${esc(travel.title)}" required class="tv-dirty-watch">
          </div>
          <div class="tv-field">
            <label for="tv-desc">Description</label>
            <textarea id="tv-desc" name="description" rows="5" class="tv-dirty-watch">${esc(travel.description || '')}</textarea>
          </div>
          <div class="tv-field">
            <label>GPX file</label>
            ${gpxSection}
          </div>
          ${linkedAlbumsFormHtml(linkedAlbums)}
          ${linkedPhotosFormHtml(linkedPhotos)}
        </div>
        <div class="tv-form-side">
          <div class="tv-form-panel">
            <h5>Metadata</h5>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--ink-faint);line-height:2">
              <div>created ${fmtDate(travel.created_at)}</div>
              <div>by ${esc(travel.creator_name)}</div>
              <div>slug: ${slug}</div>
            </div>
          </div>
          <div class="tv-form-panel">
            <h5>Shared With <span style="float:right"><button type="button" class="btn btn-sm btn-secondary" id="share-btn">manage</button></span></h5>
            <div style="font-family:'Kalam',cursive;font-size:0.85rem;color:var(--ink-soft)">
              ${travelViewers.length
                ? travelViewers.map(v => `<div>${esc(v.name)}</div>`).join('')
                : 'Not shared yet.'}
            </div>
          </div>
        </div>
      </div>
      <div class="tv-form-actions">
        ${canModify(session, travel) ? `<button type="button" class="btn btn-danger" id="delete-btn">delete travel…</button>` : '<span></span>'}
        <div class="tv-form-actions-r">
          <a href="/travels/${slug}" class="btn btn-secondary">cancel</a>
          <button type="submit" class="btn">save changes</button>
        </div>
      </div>
    </form>

    <form id="gpx-remove-form" method="POST" action="/travels/${slug}/gpx/remove" style="display:none"></form>

    <!-- Share modal -->
    <div class="tv-bd" id="share-modal">
      <div class="tv-modal" role="dialog" aria-modal="true">
        <div class="tv-modal-h">
          <h3>share travel</h3>
          <span class="tv-modal-sub">pick viewers to grant access</span>
          <button class="tv-modal-x" type="button" data-close="share-modal">×</button>
        </div>
        <div class="tv-modal-b">
          <div class="tv-share-list" id="share-list">
            ${shareRows || '<div style="padding:0.75rem;font-family:\'Kalam\',cursive;font-size:0.85rem;color:var(--ink-faint)">No viewer accounts found.</div>'}
          </div>
          <div class="tv-share-note">
            Sharing this travel automatically grants viewers access to all linked albums and standalone photos.
          </div>
        </div>
        <div class="tv-modal-f">
          <button type="button" class="btn btn-secondary" data-close="share-modal">cancel</button>
          <button type="button" class="btn" id="share-save-btn">save</button>
        </div>
      </div>
    </div>

    <!-- Link content modal -->
    <div class="tv-bd" id="link-modal">
      <div class="tv-modal wide" role="dialog" aria-modal="true">
        <div class="tv-modal-h">
          <h3>link content</h3>
          <span class="tv-modal-sub">add albums or photos to this travel</span>
          <button class="tv-modal-x" type="button" data-close="link-modal">×</button>
        </div>
        <div class="tv-modal-b">
          <div class="tv-lp-tabs">
            <button type="button" class="tv-lp-tab on" data-panel="lp-albums">Albums</button>
            <button type="button" class="tv-lp-tab" data-panel="lp-photos">Photos</button>
          </div>
          <input type="text" class="tv-lp-search" id="lp-search" placeholder="search…">
          <div id="lp-albums" class="tv-lp-grid"></div>
          <div id="lp-photos" class="tv-lp-grid" style="display:none"></div>
        </div>
        <div class="tv-modal-f">
          <span class="tv-lp-status" id="lp-status"></span>
          <button type="button" class="btn btn-secondary" data-close="link-modal">cancel</button>
          <button type="button" class="btn" id="lp-save-btn">save links</button>
        </div>
      </div>
    </div>

    <!-- Delete confirm modal -->
    <div class="tv-bd" id="delete-modal">
      <div class="tv-modal" role="dialog" aria-modal="true">
        <div class="tv-modal-h">
          <h3>delete this travel?</h3>
          <button class="tv-modal-x" type="button" data-close="delete-modal">×</button>
        </div>
        <div class="tv-modal-b tv-del-body">
          <p>This cannot be undone.</p>
          <div class="tv-del-warn">
            The travel page and GPS trace are deleted. Linked albums and photos <strong>stay</strong>. Viewers lose travel-level access; albums shared independently elsewhere are untouched.
          </div>
          <label class="tv-del-confirm">
            Type the travel title to confirm:
            <input type="text" id="del-confirm-input" placeholder="${esc(travel.title)}" autocomplete="off" style="margin-top:0.25rem;width:100%;padding:0.4rem 0.6rem;font-family:'Kalam',cursive;font-size:0.9rem;border:1.5px solid var(--ink);background:var(--paper)">
          </label>
        </div>
        <div class="tv-modal-f">
          <button type="button" class="btn btn-secondary" data-close="delete-modal">cancel</button>
          <form method="POST" action="/travels/${slug}/delete" style="display:inline">
            <button type="submit" class="btn btn-danger" id="del-confirm-btn" disabled>delete forever</button>
          </form>
        </div>
      </div>
    </div>

    <div id="tv-toast" class="tv-toast"></div>

    <script>(function(){
      var SLUG = ${safeJson(travel.slug)};
      var TRAVEL_TITLE = ${safeJson(travel.title)};

      var dirty = false;
      document.querySelectorAll('.tv-dirty-watch').forEach(function(el){
        el.addEventListener('input', function(){ if(!dirty){ dirty=true; document.getElementById('dirty-pill').classList.add('show'); } });
      });
      window.addEventListener('beforeunload', function(e){ if(dirty){ e.preventDefault(); e.returnValue=''; } });
      document.getElementById('tv-form').addEventListener('submit', function(){ dirty=false; });

      function toast(msg) {
        var t = document.getElementById('tv-toast');
        t.textContent = msg; t.classList.add('show');
        setTimeout(function(){ t.classList.remove('show'); }, 2800);
      }

      function openModal(id){ document.getElementById(id).classList.add('open'); }
      function closeModal(id){ document.getElementById(id).classList.remove('open'); }
      document.querySelectorAll('[data-close]').forEach(function(btn){
        btn.addEventListener('click', function(){ closeModal(btn.dataset.close); });
      });
      document.querySelectorAll('.tv-bd').forEach(function(bd){
        bd.addEventListener('click', function(e){ if(e.target===bd) closeModal(bd.id); });
      });
      document.addEventListener('keydown', function(e){ if(e.key==='Escape') document.querySelectorAll('.tv-bd.open').forEach(function(bd){ closeModal(bd.id); }); });

      var removeBtn = document.getElementById('gpx-remove-btn');
      if(removeBtn) removeBtn.addEventListener('click', function(){
        if(confirm('Remove GPX file?')){ document.getElementById('gpx-remove-form').submit(); }
      });

      var zone = document.getElementById('gpx-zone');
      if(zone){
        zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', function(e){
          e.preventDefault(); zone.classList.remove('drag-over');
          var file = e.dataTransfer.files[0];
          if(file) uploadGpx(file);
        });
      }
      var gpxInput = document.getElementById('gpx-input');
      if(gpxInput) gpxInput.addEventListener('change', function(){ if(this.files[0]) uploadGpx(this.files[0]); });

      function uploadGpx(file) {
        var fd = new FormData(); fd.append('gpx', file);
        fetch('/travels/'+SLUG+'/gpx', { method:'POST', body:fd })
          .then(function(r){ return r.json(); })
          .then(function(d){
            if(d.ok) { toast('GPX uploaded'); setTimeout(function(){ location.reload(); },600); }
            else toast(d.error || 'Upload failed');
          }).catch(function(){ toast('Upload failed'); });
      }

      var shareBtn = document.getElementById('share-btn');
      if(shareBtn) shareBtn.addEventListener('click', function(){ openModal('share-modal'); });
      document.querySelectorAll('#share-list .tv-share-row').forEach(function(row){
        row.addEventListener('click', function(){
          row.classList.toggle('on');
          row.querySelector('.tv-share-ck').textContent = row.classList.contains('on') ? '✓' : '';
        });
      });
      var shareSaveBtn = document.getElementById('share-save-btn');
      if(shareSaveBtn) shareSaveBtn.addEventListener('click', function(){
        var ids = [];
        document.querySelectorAll('#share-list .tv-share-row.on').forEach(function(r){ ids.push(parseInt(r.dataset.id)); });
        fetch('/travels/'+SLUG+'/api/share', {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({viewerIds:ids})
        }).then(function(r){ return r.json(); }).then(function(d){
          if(d.ok){ closeModal('share-modal'); toast('Sharing updated'); location.reload(); }
          else toast(d.error || 'Error saving');
        }).catch(function(){ toast('Error saving'); });
      });

      var lpMode = 'album';
      var lpData = { albums: [], photos: [] };
      var lpLoaded = false;
      var lpSelected = {
        albums: new Set(${safeJson(linkedAlbums.map(a => a.id))}),
        photos: new Set(${safeJson(linkedPhotos.map(p => p.id))})
      };

      function openLinkModal(mode) {
        lpMode = mode || 'album';
        openModal('link-modal');
        setLpTab(lpMode);
        if(!lpLoaded) loadLinkable();
      }
      function setLpTab(tab) {
        lpMode = tab;
        document.querySelectorAll('.tv-lp-tab').forEach(function(t){ t.classList.toggle('on', t.dataset.panel === 'lp-'+tab+'s'); });
        document.getElementById('lp-albums').style.display = tab==='album' ? '' : 'none';
        document.getElementById('lp-photos').style.display = tab==='photo' ? '' : 'none';
        renderLpGrid(tab);
      }
      document.querySelectorAll('.tv-lp-tab').forEach(function(t){
        t.addEventListener('click', function(){
          setLpTab(t.dataset.panel === 'lp-albums' ? 'album' : 'photo');
        });
      });
      function loadLinkable() {
        fetch('/travels/'+SLUG+'/api/linkable')
          .then(function(r){ return r.json(); })
          .then(function(d){
            lpLoaded = true;
            lpData.albums = d.albums || [];
            lpData.photos = d.photos || [];
            renderLpGrid('album');
            renderLpGrid('photo');
          }).catch(function(){ toast('Could not load content — try again'); });
      }
      function renderLpGrid(type) {
        var el = document.getElementById('lp-'+type+'s');
        if(!el) return;
        var q = (document.getElementById('lp-search').value||'').toLowerCase();
        var items = type==='album' ? lpData.albums : lpData.photos;
        var sel   = type==='album' ? lpSelected.albums : lpSelected.photos;
        var filtered = q ? items.filter(function(i){ return (i.title||'').toLowerCase().includes(q); }) : items;
        el.innerHTML = filtered.map(function(i){
          var on = sel.has(i.id) ? ' on' : '';
          var thumb = i.cover_filename
            ? '<img src="/uploads/'+i.cover_filename+'" alt="">'
            : (i.filename ? '<img src="/uploads/'+i.filename+'" alt="">' : '');
          var sub = type==='album' ? (i.photo_count+' photos') : (i.taken_at ? i.taken_at.substring(0,10) : '');
          return '<div class="tv-lp-cell'+on+'" data-id="'+i.id+'" data-type="'+type+'">'
            +'<div class="tv-lp-thumb">'+thumb+'</div>'
            +'<div class="tv-lp-meta">'+escHtml(i.title||i.filename||'')+'<span class="tv-lp-n">'+sub+'</span></div>'
            +'<div class="tv-lp-tick">'+(on?' ✓':' ')+'</div>'
            +'</div>';
        }).join('') || '<div style="padding:0.75rem;font-family:Kalam,cursive;font-size:0.85rem;color:var(--ink-faint)">Nothing to link.</div>';
        el.querySelectorAll('.tv-lp-cell').forEach(function(cell){
          cell.addEventListener('click', function(){
            var id = parseInt(cell.dataset.id);
            var type2 = cell.dataset.type;
            var selSet = type2==='album' ? lpSelected.albums : lpSelected.photos;
            if(selSet.has(id)) selSet.delete(id); else selSet.add(id);
            cell.classList.toggle('on');
            cell.querySelector('.tv-lp-tick').textContent = selSet.has(id) ? '✓' : '';
            updateLpStatus();
          });
        });
        updateLpStatus();
      }
      function updateLpStatus() {
        var total = lpSelected.albums.size + lpSelected.photos.size;
        var el = document.getElementById('lp-status');
        if(el) el.textContent = total + ' item' + (total!==1?'s':'') + ' selected';
      }
      var lpSearchEl = document.getElementById('lp-search');
      if(lpSearchEl) lpSearchEl.addEventListener('input', function(){ renderLpGrid(lpMode); });
      var linkAlbumsBtn = document.getElementById('link-albums-btn');
      if(linkAlbumsBtn) linkAlbumsBtn.addEventListener('click', function(){ openLinkModal('album'); });
      var linkPhotosBtn = document.getElementById('link-photos-btn');
      if(linkPhotosBtn) linkPhotosBtn.addEventListener('click', function(){ openLinkModal('photo'); });
      var lpSaveBtn = document.getElementById('lp-save-btn');
      if(lpSaveBtn) lpSaveBtn.addEventListener('click', function(){
        fetch('/travels/'+SLUG+'/api/links', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ albumIds: Array.from(lpSelected.albums), photoIds: Array.from(lpSelected.photos) })
        }).then(function(r){ return r.json(); }).then(function(d){
          if(d.ok){ closeModal('link-modal'); toast('Links saved'); location.reload(); }
          else toast(d.error || 'Error saving links');
        }).catch(function(){ toast('Error saving links'); });
      });

      document.querySelectorAll('[data-unlink]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var type = btn.dataset.unlink;
          var id = parseInt(btn.dataset.id);
          if(type==='album') lpSelected.albums.delete(id);
          else lpSelected.photos.delete(id);
          var item = btn.closest('.tv-linked-item');
          if(item) item.remove();
          fetch('/travels/'+SLUG+'/api/links', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ albumIds: Array.from(lpSelected.albums), photoIds: Array.from(lpSelected.photos) })
          }).then(function(r){ return r.json(); }).then(function(d){ if(d.ok) toast('Links saved'); }).catch(function(){});
        });
      });

      var deleteBtn = document.getElementById('delete-btn');
      if(deleteBtn) deleteBtn.addEventListener('click', function(){ openModal('delete-modal'); });
      var delInput = document.getElementById('del-confirm-input');
      var delBtn   = document.getElementById('del-confirm-btn');
      if(delInput && delBtn) {
        delInput.addEventListener('input', function(){
          delBtn.disabled = delInput.value.trim() !== TRAVEL_TITLE;
        });
      }

      function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
    })();
    </script>`;

  return page(`Edit — ${travel.title}`, body, session);
}

function detailMapView(travel, linkedAlbums, linkedPhotos, travelViewers, session, dateRange) {
  const slug = esc(travel.slug);
  const canEdit = canModify(session, travel);

  const photoPins = linkedPhotos
    .filter(p => p.latitude && p.longitude)
    .map(p => ({ id: p.id, lat: p.latitude, lon: p.longitude, title: p.title || p.filename }));

  const mapHtml = miniMapHtml('tv-map', travel.gpx_geojson || null, photoPins, {
    height: 420, zoomControl: true, clickable: true
  });

  const albumCards = linkedAlbums.map(a => `
    <a href="/albums/${a.id}?from=/travels/${slug}" class="tv-acard">
      <div class="tv-acard-cover">
        ${a.cover_filename
          ? `<img src="/uploads/${esc(a.cover_filename)}" alt="${esc(a.title)}">`
          : `<div class="tv-acard-cover-empty">no photos</div>`}
      </div>
      <div class="tv-acard-body">
        <h4>${esc(a.title)}</h4>
        ${a.description ? `<div class="tv-acard-desc">${esc(a.description.substring(0, 80))}</div>` : ''}
        <div class="tv-acard-meta">${a.photo_count} photos · ${esc(a.creator)}</div>
      </div>
    </a>`).join('');

  const mosaicCells = linkedPhotos.map(p => `
    <div class="tv-mcell">
      <a href="/photos/${p.id}?from=/travels/${slug}">
        <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title || '')}" loading="lazy">
      </a>
    </div>`).join('');

  const stats = [];
  if (travel.gpx_distance_km) stats.push(`<div class="tv-stat"><b>${travel.gpx_distance_km}</b><div>km</div></div>`);
  if (travel.gpx_duration_min) stats.push(`<div class="tv-stat"><b>${fmtDuration(travel.gpx_duration_min)}</b><div>moving</div></div>`);
  if (dateRange.date_start && dateRange.date_end) {
    const days = Math.round((new Date(dateRange.date_end) - new Date(dateRange.date_start)) / 86400000) + 1;
    if (days > 0) stats.push(`<div class="tv-stat"><b>${days}</b><div>days</div></div>`);
  }

  const dateStr = dateRange.date_start
    ? `${fmtDate(dateRange.date_start)}${dateRange.date_end && dateRange.date_end !== dateRange.date_start ? ' → ' + fmtDate(dateRange.date_end) : ''}`
    : '';

  const body = `
    <div class="tv-crumb">
      <a href="/travels">all travels</a> /
      ${esc(travel.title)}
      <div class="tv-view-toggle">
        <span class="tv-view-btn on">map</span>
        <a href="/travels/${slug}?view=journal" class="tv-view-btn">journal</a>
      </div>
    </div>

    <div class="tv-det-head">
      <div>
        <h1>${esc(travel.title)}<em>.</em></h1>
        <div class="tv-det-meta">
          ${dateStr ? `<b>${dateStr}</b> · ` : ''}
          ${travel.photo_count} photos · ${travel.album_count} albums
          ${travel.gpx_distance_km ? ` · ${travel.gpx_distance_km} km` : ''}
        </div>
      </div>
      <div class="tv-det-actions">
        ${canEdit ? `<a href="/travels/${slug}/edit" class="btn btn-secondary btn-sm">edit</a>` : ''}
      </div>
    </div>

    <div class="tv-map-wrap">${mapHtml}</div>

    <div class="tv-body">
      <div class="tv-desc">
        ${travel.description
          ? travel.description.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('')
          : '<p style="font-style:italic;color:var(--ink-faint)">No description.</p>'}
      </div>
      <div class="tv-side">
        ${stats.length ? `
          <div class="tv-panel">
            <h5>Stats</h5>
            <div class="tv-stats">${stats.join('')}</div>
          </div>` : ''}
        ${travelViewers.length ? `
          <div class="tv-panel">
            <h5>Shared with</h5>
            ${travelViewers.map(v => `
              <div class="tv-who">
                <span class="tv-av">${esc(v.name[0].toUpperCase())}</span>
                ${esc(v.name)}
              </div>`).join('')}
          </div>` : ''}
      </div>
    </div>

    ${linkedAlbums.length ? `
      <div class="tv-section-h">
        <h3>Linked albums</h3>
        <span class="tv-section-count">${linkedAlbums.length}</span>
      </div>
      <div class="tv-album-grid">${albumCards}</div>` : ''}

    ${linkedPhotos.length ? `
      <div class="tv-section-h">
        <h3>Photos</h3>
        <span class="tv-section-count">${linkedPhotos.length}</span>
      </div>
      <div class="tv-mosaic">${mosaicCells}</div>` : ''}`;

  return page(travel.title, body, session);
}

function detailJournalView(travel, linkedAlbums, linkedPhotos, travelViewers, session, dateRange) {
  const slug = esc(travel.slug);

  const byDate = {};
  linkedPhotos.forEach(p => {
    const d = p.taken_at ? new Date(p.taken_at).toISOString().substring(0, 10) : 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(p);
  });
  const dates = Object.keys(byDate).sort();

  const photoPins = linkedPhotos
    .filter(p => p.latitude && p.longitude)
    .map(p => ({ id: p.id, lat: p.latitude, lon: p.longitude }));

  const minimapHtml = miniMapHtml('tv-jrn-minimap-el', travel.gpx_geojson || null, photoPins, {
    height: 200, zoomControl: false
  });

  const stats = [];
  if (travel.gpx_distance_km) stats.push(`<b>${travel.gpx_distance_km}</b> km`);
  if (travel.gpx_duration_min) stats.push(`<b>${fmtDuration(travel.gpx_duration_min)}</b> moving`);

  const gridClass = n => n >= 4 ? 'k4' : n === 3 ? 'k3' : n === 2 ? 'k2' : 'k1';

  const stops = dates.map(d => {
    const photos = byDate[d];
    const dt     = d !== 'unknown' ? new Date(d) : null;
    const dayStr = dt ? dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase() : '—';
    const yrStr  = dt ? dt.getFullYear() : '';
    const cells  = photos.slice(0, 4).map(p => `
      <div class="tv-stop-cell">
        <a href="/photos/${p.id}?from=/travels/${slug}">
          <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title || '')}" loading="lazy">
        </a>
      </div>`).join('');
    return `
      <div class="tv-stop">
        <div class="tv-stop-when">
          ${dayStr}
          ${yrStr ? `<span class="tv-stop-yr">${yrStr}</span>` : ''}
        </div>
        <div>
          <h3>${dayStr}</h3>
          <div class="tv-stop-where">${photos.length} photo${photos.length !== 1 ? 's' : ''}</div>
          <div class="tv-stop-grid ${gridClass(Math.min(photos.length, 4))}">${cells}</div>
        </div>
      </div>`;
  }).join('');

  const body = `
    <div class="tv-crumb">
      <a href="/travels">all travels</a> /
      ${esc(travel.title)}
      <div class="tv-view-toggle">
        <a href="/travels/${slug}" class="tv-view-btn">map</a>
        <span class="tv-view-btn on">journal</span>
      </div>
    </div>

    <div class="tv-jrn-hero">
      <div>
        <h1>${esc(travel.title)}<em>.</em></h1>
        <p class="tv-jrn-lede">${esc(travel.description || '')}</p>
      </div>
      <div class="tv-jrn-minimap">${minimapHtml}</div>
    </div>
    ${stats.length ? `<div class="tv-jrn-stats">${stats.join(' · ')}</div>` : ''}

    ${dates.length
      ? `<div class="tv-timeline">${stops}</div>`
      : `<p style="font-family:'Kalam',cursive;color:var(--ink-faint);margin-top:1rem">No photos with dates to display a journal.</p>`}`;

  return page(`${travel.title} — Journal`, body, session);
}

module.exports = {
  indexView,
  createFormView,
  editFormView,
  detailMapView,
  detailJournalView,
};
