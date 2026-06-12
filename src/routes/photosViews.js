const { page, esc } = require('../layout');
const { selectionBar, selectionScript } = require('../components');
const { singleUploadFields, nextcloudFolderUrl, nextcloudFileUrl } = require('../uploadHelpers');

function renderPhotoListPage({ rows, uploaders, topTags, total, nextCursor, latestAlbum, session, activeImport }) {
  const firstname = esc((session.name || '').split(' ')[0]);
  const isEditor = session.role === 'editor' || session.role === 'admin';

  // NC-5: import progress banner (server-side rendered for page-reload recovery)
  const importBannerHtml = (isEditor && activeImport) ? renderImportBanner(activeImport) : '';

  if (rows.length === 0) {
    return page('Photos', `
      ${importBannerHtml}
      <div class="wall-greet">
        <h1>hi <span style="color:var(--accent)">${firstname}</span>, welcome home.</h1>
        <p class="wall-count">0 photos</p>
      </div>
      <p>No photos yet. <a href="/photos/upload">Upload the first one.</a></p>
      ${isEditor ? importProgressScript(activeImport) : ''}
    `, session, true);
  }

  const heroHtml = `
    <div class="wall-hero">
      ${rows.slice(0, 4).map(p => `
        <a href="/photos/${p.id}?from=/photos">
          <img class="wall-hero-img" src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
        </a>`).join('')}
    </div>`;

  const chunks = [];
  for (let i = 0; i < rows.length; i += 9) chunks.push(rows.slice(i, i + 9));
  const mosaicHtml = chunks.map(chunk => `
    <div class="wall-mosaic">
      ${chunk.map(p => `
        <div class="wall-cell${p.canEdit ? ' sel-tile' : ''}"${p.canEdit ? ` data-photo-id="${p.id}" data-href="/photos/${p.id}?from=/photos"` : ''}>
          <a href="/photos/${p.id}?from=/photos"><img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}"></a>
          ${p.canEdit ? `<button class="hovercheck" type="button" aria-label="Select this photo" tabindex="-1">+</button>
          <div class="press-ring"></div>
          <span class="sel-cbox" role="checkbox" aria-checked="false" aria-label="${esc(p.title)}"></span>` : ''}
        </div>`).join('')}
    </div>`).join('');

  const whoHtml = uploaders.map(([name, count]) => `
    <li>
      <span class="wall-who-av">${esc(name[0].toUpperCase())}</span>
      <span>${esc(name)}</span>
      <span class="wall-who-count">${count}</span>
    </li>`).join('');

  const tagsHtml = topTags.map(([name]) =>
    `<a class="tag" href="/tags/${encodeURIComponent(name)}">${esc(name)}</a>`
  ).join('');

  const albumHtml = latestAlbum
    ? `${latestAlbum.cover_filename
        ? `<img class="wall-album-cover" src="/uploads/${esc(latestAlbum.cover_filename)}" alt="${esc(latestAlbum.title)}">`
        : `<div class="wall-album-cover wall-album-cover-empty">no photos</div>`}
       <a class="wall-album-title" href="/albums/${latestAlbum.id}">${esc(latestAlbum.title)}</a>`
    : '<p style="font-size:0.85rem">No albums yet.</p>';

  return page('Photos', `
    ${importBannerHtml}
    <div class="wall-greet">
      <h1>hi <span style="color:var(--accent)">${firstname}</span>, welcome home.</h1>
      <p class="wall-count">${total} photo${total !== 1 ? 's' : ''}</p>
    </div>
    ${heroHtml}
    <form method="POST" action="/photos/bulk-tag" data-sel-form>
      <div class="wall-cols">
        <div>
          ${selectionBar({ showTag: true, tagAction: '/photos/bulk-tag', untagAction: '/photos/bulk-untag', deleteAction: '/photos/bulk-delete' })}
          <div class="row" style="justify-content:flex-end;margin-bottom:0.75rem;gap:8px">
            <button class="btn btn-secondary btn-sm" id="sel-select-btn" type="button">select</button>
            ${isEditor ? `<a class="btn btn-secondary" href="/photos/nextcloud-import">Import from Nextcloud</a>` : ''}
            <a class="btn" href="/photos/upload">+ Upload</a>
          </div>
          ${mosaicHtml}
          ${nextCursor && session.role !== 'viewer' ? `<div id="photo-sentinel" data-cursor="${nextCursor}"></div>` : ''}
        </div>
        <aside class="wall-side">
          <div class="wall-panel">
            <h3 class="wall-section-h">who's around</h3>
            <ul class="wall-who">${whoHtml}</ul>
          </div>
          ${topTags.length ? `
          <div class="wall-panel">
            <h3 class="wall-section-h">browse by tag</h3>
            <div class="wall-tags">${tagsHtml}</div>
          </div>` : ''}
          <div class="wall-panel">
            <h3 class="wall-section-h">latest album</h3>
            ${albumHtml}
          </div>
        </aside>
      </div>
    </form>
    ${selectionScript()}
    ${nextCursor && session.role !== 'viewer' ? `<script>
(function(){
  var sentinel=document.getElementById('photo-sentinel');
  if(!sentinel) return;
  var cursor=sentinel.dataset.cursor,loading=false;
  function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function renderCell(p){
    var e=p.canEdit;
    return '<div class="wall-cell'+(e?' sel-tile':'')+'"'
      +(e?' data-photo-id="'+p.id+'" data-href="/photos/'+p.id+'?from=/photos"':'')+'>'
      +'<a href="/photos/'+p.id+'?from=/photos"><img src="/uploads/'+escHtml(p.filename)+'" alt="'+escHtml(p.title)+'" loading="lazy"></a>'
      +(e?'<button class="hovercheck" type="button" aria-label="Select this photo" tabindex="-1">+</button>'
        +'<div class="press-ring"></div>'
        +'<span class="sel-cbox" role="checkbox" aria-checked="false" aria-label="'+escHtml(p.title)+'"></span>':'')
      +'</div>';
  }
  var observer=new IntersectionObserver(function(entries){
    if(!entries[0].isIntersecting||loading) return;
    loading=true;
    fetch('/photos/api/page?cursor='+cursor+'&limit=24')
      .then(function(r){return r.json();})
      .then(function(d){
        for(var i=0;i<d.photos.length;i+=9){
          var chunk=d.photos.slice(i,i+9);
          var div=document.createElement('div');
          div.className='wall-mosaic';
          div.innerHTML=chunk.map(renderCell).join('');
          sentinel.parentNode.insertBefore(div,sentinel);
          var newTiles=Array.from(div.querySelectorAll('.sel-tile'));
          if(newTiles.length&&window.registerSelTiles) window.registerSelTiles(newTiles);
        }
        if(d.nextCursor){cursor=d.nextCursor;loading=false;}
        else{observer.disconnect();sentinel.remove();}
      })
      .catch(function(){loading=false;});
  },{rootMargin:'400px'});
  observer.observe(sentinel);
})();
</script>` : ''}
    ${isEditor ? importProgressScript(activeImport) : ''}
  `, session, true);
}

function renderUploadPage({ error, session }) {
  const errorHtml = error ? `<p class="msg-error">${error}</p>` : '';
  return page('Upload a photo', `
    <div class="top-bar">
      <h1>Upload a photo</h1>
      <a class="btn btn-secondary" href="/photos">← Back</a>
    </div>
    <div class="card" style="max-width:520px">
      ${errorHtml}
      <form class="form-col" method="POST" action="/photos/upload" enctype="multipart/form-data">
        <label>Photo <input type="file" name="photo" accept="image/*" required></label>
        <label>Title <input type="text" name="title" required></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>Tags <small>(comma-separated, e.g. Paris, John Doe)</small>
          <input type="text" name="tags" placeholder="Paris, John Doe">
        </label>
        ${singleUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Upload</button>
          <a class="btn btn-secondary" href="/photos">Cancel</a>
        </div>
      </form>
    </div>
  `, session, true);
}

function backLabel(from) {
  if (!from) return '← back to photos';
  if (/^\/albums\/\d+$/.test(from)) return '← back to album';
  if (from === '/photos') return '← back to photos';
  if (/^\/travels\/[a-z0-9-]+$/.test(from)) return '← back to travel';
  return '← back to photos';
}

function renderPhotoDetailPage({ photo, canEdit, from, photoAlbums, personFaces, session }) {
  // IMP-5: Consolidate tags and people tags
  // Build a set of person names from personFaces for identifying people tags
  const personNameSet = new Set((personFaces || []).map(f => f.person_name));
  
  // Create a map of face IDs by person name for the remove button
  const faceIdByName = new Map();
  (personFaces || []).forEach(f => {
    if (!faceIdByName.has(f.person_name)) {
      faceIdByName.set(f.person_name, []);
    }
    faceIdByName.get(f.person_name).push(f.id);
  });
  
  // Separate tags into regular and people tags
  const regularTags = (photo.tags || []).filter(t => !personNameSet.has(t));
  const peopleTagNames = (photo.tags || []).filter(t => personNameSet.has(t));
  
  // Render people tags with remove buttons (for editor)
  const peopleTagsHtml = peopleTagNames.length > 0
    ? peopleTagNames.map(name => {
        const faceIds = faceIdByName.get(name) || [];
        const removeBtns = canEdit && faceIds.length > 0
          ? faceIds.map(faceId => `
            <button class="remove-face-btn" data-face-id="${faceId}"
              style="background:none;border:none;cursor:pointer;color:var(--ink-faint);font-size:0.9rem;line-height:1;padding:0;margin-left:0.25rem"
              aria-label="Remove face tag">&#x2717;</button>`).join('')
          : '';
        return `<a class="tag tag-person" href="/tags/${encodeURIComponent(name)}" aria-label="Person: ${esc(name)}">${esc(name)}${removeBtns}</a>`;
      }).join('')
    : '';
  
  // Render regular tags (clickable)
  const regularTagsHtml = regularTags.length > 0
    ? regularTags.map(t => `<a class="tag" href="/tags/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')
    : '';
  
  // Combined tags display
  const allTagsHtml = regularTagsHtml + peopleTagsHtml;
  const hasTags = regularTags.length > 0 || peopleTagNames.length > 0;
  const tagsSectionHtml = hasTags
    ? `<div class="tags" style="margin-top:0.75rem">${allTagsHtml}</div>`
    : `<p style="color:var(--ink-faint);font-size:0.85rem;margin-top:0.75rem">No tags</p>`;

  return page(photo.title, `
    <div style="max-width:820px;margin:0 auto">
      <div class="top-bar" style="margin-bottom:1rem">
        <a href="${esc(from || '/photos')}" class="back-link" style="color:#888;font-size:0.9rem;text-decoration:none">${backLabel(from)}</a>
        ${canEdit ? `
          <div class="row">
            <a class="btn btn-secondary" href="/photos/${photo.id}/edit${from ? '?from=' + encodeURIComponent(from) : ''}">Edit</a>
            <form class="inline" method="POST" action="/photos/${photo.id}/delete"
              onsubmit="return confirm('Delete this photo permanently?')">
              ${from ? `<input type="hidden" name="from" value="${esc(from)}">` : ''}
              <button class="btn btn-danger btn-icon" title="Delete"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
            </form>
          </div>` : ''}
      </div>
      <div style="position:relative;display:inline-block;width:100%">
        <img id="photo-img" src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}"
          style="width:100%;max-height:560px;object-fit:contain;background:#111;margin-bottom:1.5rem;display:block">
        ${canEdit ? `<div id="bbox-overlay" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair"></div>` : ''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
        <div>
          <h1 style="margin-bottom:0.25rem">${esc(photo.title)}</h1>
          <p style="color:#888;margin-top:0;font-size:0.9rem">by ${esc(photo.uploader)}</p>
          ${photo.description ? `<p>${esc(photo.description)}</p>` : ''}
          ${tagsSectionHtml}
          ${(() => {
            const albums = photoAlbums || [];
            if (!albums.length) {
              return `<p style="color:var(--ink-faint);font-size:0.85rem;margin-top:0.75rem">Not in any album.</p>`;
            }
            const links = albums.map(a =>
              `<a class="tag" href="/albums/${a.id}">${esc(a.title)}</a>`
            ).join('');
            return `<div class="tags" style="margin-top:0.75rem">${links}</div>`;
          })()}
          ${photo.latitude != null && photo.longitude != null ? `
          <div id="photo-map" style="height:220px;border-radius:8px;margin-top:0.75rem"></div>
          <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
          <script src="/vendor/leaflet/leaflet.js"></script>
          <script>
            (function(){
              var m = L.map('photo-map').setView([${photo.latitude},${photo.longitude}],13);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(m);
              L.marker([${photo.latitude},${photo.longitude}]).addTo(m);
            })();
          </script>` : ''}
          ${(photo.taken_at || photo.exposure_time || photo.focal_length) ? `
          <dl class="photo-exif">
            ${photo.taken_at ? `<dt>Date de prise</dt><dd>${esc(new Date(photo.taken_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))}</dd>` : ''}
            ${photo.exposure_time ? `<dt>Exposition</dt><dd>${esc(photo.exposure_time)}</dd>` : ''}
            ${photo.focal_length ? `<dt>Focale</dt><dd>${esc(String(photo.focal_length))} mm</dd>` : ''}
          </dl>` : ''}
          ${photo.nextcloud_url ? (() => {
            const folderUrl = nextcloudFolderUrl(photo.nextcloud_url);
            const fileUrl = nextcloudFileUrl(photo.nextcloud_url, photo.filename);
            if (!folderUrl) return '';
            return `
              <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap">
                <a class="btn btn-nextcloud" href="${esc(folderUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open in Nextcloud (opens in new tab)">
                  Open in Nextcloud
                </a>
                ${fileUrl ? `<a class="btn" href="${esc(fileUrl)}" download>Download original</a>` : ''}
              </div>`;
          })() : ''}

          ${canEdit ? `
          <div id="ai-people" style="margin-top:1.25rem">
            <button id="tag-person-btn" style="margin-top:0.5rem;font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:1px">&#x270E; Tag a person</button>
            <button id="ai-people-btn" class="btn btn-secondary" style="font-size:0.85rem;margin-left:0.5rem">Identify people</button>
            <div id="ai-people-chips" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem"></div>
          </div>
          <script>
            (function(){
              var btn = document.getElementById('ai-people-btn');
              var chips = document.getElementById('ai-people-chips');
              var PHOTO_ID = ${photo.id};
              var pendingIdentifyPhotoId = null;
              
              // Listen for WebSocket event
              document.addEventListener('identify-people-complete', function(ev) {
                if (pendingIdentifyPhotoId !== PHOTO_ID) return;
                pendingIdentifyPhotoId = null;
                btn.disabled = false;
                btn.textContent = 'Identify people';
                
                if (ev.detail.error) {
                  chips.innerHTML = '<span style="color:var(--danger);font-size:0.85rem">' + ev.detail.error + '</span>';
                  return;
                }
                
                const suggestions = ev.detail.suggestions || [];
                if (!suggestions.length) {
                  chips.innerHTML = '<span style="color:var(--ink-faint);font-size:0.85rem">No known people identified.</span>';
                  return;
                }
                
                suggestions.forEach(function(s){
                  var chip = document.createElement('span');
                  chip.style.cssText = 'display:inline-flex;align-items:center;gap:0.35rem;background:var(--paper-2);border-radius:999px;padding:0.25rem 0.75rem;font-size:0.85rem';
                  chip.innerHTML = '<span>' + s.name + '?</span>'
                    + '<button title="Add tag" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:1rem;line-height:1;padding:0">✓</button>'
                    + '<button title="Dismiss" style="background:none;border:none;cursor:pointer;color:var(--ink-faint);font-size:1rem;line-height:1;padding:0">✗</button>';
                  chip.querySelectorAll('button')[0].addEventListener('click', function(){
                    var payload = {photoId: PHOTO_ID, tagId: s.tagId, personName: s.name};
                    if (s.bbox) payload.bbox = s.bbox;
                    fetch('/api/ai/confirm-tag', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
                      .then(function(){
                        chip.innerHTML = '<span style="color:var(--accent)">' + s.name + ' ✓</span>';
                      });
                  });
                  chip.querySelectorAll('button')[1].addEventListener('click', function(){ chip.remove(); });
                  chips.appendChild(chip);
                });
              });
              
              btn.addEventListener('click', function(){
                btn.disabled = true; 
                btn.textContent = 'Identifying…';
                chips.innerHTML = '';
                pendingIdentifyPhotoId = PHOTO_ID;
                
                fetch('/api/ai/identify-people', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({photoId:PHOTO_ID})})
                  .then(function(r){ return r.json(); })
                  .then(function(d){
                    if (d.queued) {
                      btn.textContent = 'waiting for Instance-2…';
                    } else {
                      // Fallback for old sync response
                      pendingIdentifyPhotoId = null;
                      btn.disabled = false; 
                      btn.textContent = 'Identify people';
                      if (d.error && !d.suggestions) { 
                        chips.innerHTML = '<span style="color:var(--danger);font-size:0.85rem">' + d.error + '</span>';
                      } else if (!d.suggestions || !d.suggestions.length) {
                        chips.innerHTML = '<span style="color:var(--ink-faint);font-size:0.85rem">No known people identified.</span>';
                      } else {
                        d.suggestions.forEach(function(s){
                          var chip = document.createElement('span');
                          chip.style.cssText = 'display:inline-flex;align-items:center;gap:0.35rem;background:var(--paper-2);border-radius:999px;padding:0.25rem 0.75rem;font-size:0.85rem';
                          chip.innerHTML = '<span>' + s.name + '?</span>'
                            + '<button title="Add tag" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:1rem;line-height:1;padding:0">✓</button>'
                            + '<button title="Dismiss" style="background:none;border:none;cursor:pointer;color:var(--ink-faint);font-size:1rem;line-height:1;padding:0">✗</button>';
                          chip.querySelectorAll('button')[0].addEventListener('click', function(){
                            fetch('/api/ai/confirm-tag', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({photoId:PHOTO_ID, tagId:s.tagId})})
                              .then(function(){ chip.innerHTML = '<span style="color:var(--accent)">' + s.name + ' ✓</span>'; });
                          });
                          chip.querySelectorAll('button')[1].addEventListener('click', function(){ chip.remove(); });
                          chips.appendChild(chip);
                        });
                      }
                    }
                  })
                  .catch(function(){ 
                    pendingIdentifyPhotoId = null;
                    btn.disabled=false; 
                    btn.textContent='Identify people'; 
                    chips.innerHTML='<span style="color:var(--danger);font-size:0.85rem">Could not reach AI service.</span>'; 
                  });
              });
            })();
          </script>` : ''}
        </div>
      </div>
    </div>
    ${canEdit ? `<script>
(function(){
  var PHOTO_ID = ${photo.id};
  var img = document.getElementById('photo-img');
  var overlay = document.getElementById('bbox-overlay');
  var tagBtn = document.getElementById('tag-person-btn');
  var tagsContainer = document.querySelector('.tags');
  var drawing = false, startX = 0, startY = 0, rect = null, nameForm = null;

  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  // Remove-face buttons (already rendered server-side + dynamically added)
  function bindRemoveBtn(btn) {
    btn.addEventListener('click', function(){
      var faceId = btn.dataset.faceId;
      fetch('/photos/' + PHOTO_ID + '/tag-person/' + faceId, { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } })
        .then(function(r){
          if (r.ok || r.status === 204) { btn.closest('a').remove(); }
          else { alert('Could not remove face tag.'); }
        })
        .catch(function(){ alert('Network error removing face tag.'); });
    });
  }
  // Bind remove buttons for server-rendered tags and dynamically added ones
  function bindAllRemoveBtns() {
    if (!tagsContainer) return;
    Array.from(tagsContainer.querySelectorAll('.remove-face-btn')).forEach(bindRemoveBtn);
  }
  // Initial bind for server-rendered remove buttons
  bindAllRemoveBtns();

  if (!tagBtn) return;

  function startTagging() {
    overlay.style.display = 'block';
    tagBtn.textContent = '× Cancel tagging';
    tagBtn.removeEventListener('click', startTagging);
    tagBtn.addEventListener('click', resetMode);
  }

  function resetMode() {
    overlay.style.display = 'none';
    drawing = false;
    if (rect) { rect.remove(); rect = null; }
    if (nameForm) { nameForm.remove(); nameForm = null; }
    tagBtn.textContent = '✎ Tag a person';
    tagBtn.removeEventListener('click', resetMode);
    tagBtn.addEventListener('click', startTagging);
  }

  tagBtn.addEventListener('click', startTagging);

  overlay.addEventListener('mousedown', function(e){
    if (nameForm) return;
    drawing = true;
    var bounds = overlay.getBoundingClientRect();
    startX = e.clientX - bounds.left;
    startY = e.clientY - bounds.top;
    if (rect) rect.remove();
    rect = document.createElement('div');
    rect.style.cssText = 'position:absolute;border:2px dashed var(--accent);pointer-events:none;box-sizing:border-box';
    rect.style.left = startX + 'px';
    rect.style.top = startY + 'px';
    rect.style.width = '0';
    rect.style.height = '0';
    overlay.appendChild(rect);
  });

  overlay.addEventListener('mousemove', function(e){
    if (!drawing || !rect) return;
    var bounds = overlay.getBoundingClientRect();
    var curX = e.clientX - bounds.left;
    var curY = e.clientY - bounds.top;
    rect.style.left = Math.min(startX, curX) + 'px';
    rect.style.top  = Math.min(startY, curY) + 'px';
    rect.style.width  = Math.abs(curX - startX) + 'px';
    rect.style.height = Math.abs(curY - startY) + 'px';
  });

  overlay.addEventListener('mouseup', function(e){
    if (!drawing) return;
    drawing = false;
    var bounds = overlay.getBoundingClientRect();
    var curX = e.clientX - bounds.left;
    var curY = e.clientY - bounds.top;
    var rx = Math.min(startX, curX), ry = Math.min(startY, curY);
    var rw = Math.abs(curX - startX), rh = Math.abs(curY - startY);
    if (rw < 5 || rh < 5) { if (rect) { rect.remove(); rect = null; } return; }

    // Show inline form at bottom of rect
    nameForm = document.createElement('div');
    nameForm.style.cssText = 'position:absolute;background:var(--paper);border:1.5px solid var(--ink);padding:0.5rem;z-index:10;font-family:var(--hand-tight);font-size:0.9rem';
    nameForm.style.left = rx + 'px';
    nameForm.style.top  = (ry + rh + 6) + 'px';
    nameForm.innerHTML =
      '<input id="face-name-input" type="text" placeholder="Person name" style="font-family:var(--hand-tight);font-size:0.9rem;border:1.5px solid var(--ink);padding:0.25rem 0.5rem;margin-right:0.4rem" autofocus>'
      + '<button id="face-save-btn" style="font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;margin-right:0.3rem">Save</button>'
      + '<button id="face-cancel-btn" style="font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:1px">Cancel</button>'
      + '<div id="face-msg" style="font-size:0.8rem;margin-top:0.25rem;color:var(--accent)"></div>';
    overlay.appendChild(nameForm);

    document.getElementById('face-cancel-btn').addEventListener('click', function(){
      resetMode();
    });

    document.addEventListener('keydown', function onEsc(ev){
      if (ev.key === 'Escape') { resetMode(); document.removeEventListener('keydown', onEsc); }
    });

    document.getElementById('face-save-btn').addEventListener('click', function(){
      var nameVal = (document.getElementById('face-name-input').value || '').trim();
      if (!nameVal) { document.getElementById('face-msg').textContent = 'Name is required.'; return; }

      // Compute fractions using natural image dimensions
      var naturalW = img.naturalWidth;
      var naturalH = img.naturalHeight;
      var rendered = img.getBoundingClientRect();
      // The <img> uses object-fit:contain — rendered dimensions may include letterbox
      // We compute the actual image area within the rendered box
      var imgAspect = naturalW / naturalH;
      var boxAspect = rendered.width / rendered.height;
      var imgDisplayW, imgDisplayH, imgOffsetX, imgOffsetY;
      if (imgAspect > boxAspect) {
        imgDisplayW = rendered.width;
        imgDisplayH = rendered.width / imgAspect;
        imgOffsetX = 0;
        imgOffsetY = (rendered.height - imgDisplayH) / 2;
      } else {
        imgDisplayH = rendered.height;
        imgDisplayW = rendered.height * imgAspect;
        imgOffsetX = (rendered.width - imgDisplayW) / 2;
        imgOffsetY = 0;
      }

      // Overlay is positioned over the whole img element (including letterbox)
      // Adjust rx/ry relative to the actual image content area
      var adjX = rx - imgOffsetX;
      var adjY = ry - imgOffsetY;

      var bboxX = adjX / imgDisplayW;
      var bboxY = adjY / imgDisplayH;
      var bboxW = rw / imgDisplayW;
      var bboxH = rh / imgDisplayH;

      // Clamp to [0, 1]
      bboxX = Math.max(0, Math.min(1, bboxX));
      bboxY = Math.max(0, Math.min(1, bboxY));
      bboxW = Math.max(0, Math.min(1 - bboxX, bboxW));
      bboxH = Math.max(0, Math.min(1 - bboxY, bboxH));

      fetch('/photos/' + PHOTO_ID + '/tag-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ personName: nameVal, bbox: { x: bboxX, y: bboxY, width: bboxW, height: bboxH } }),
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
        .then(function(res){
          if (!res.ok) { document.getElementById('face-msg').textContent = res.data.error || 'Error saving.'; return; }
          var link = document.createElement('a');
          link.className = 'tag tag-person';
          link.href = '/tags/' + encodeURIComponent(nameVal);
          link.setAttribute('aria-label', 'Person: ' + escHtml(nameVal));
          link.style.cssText = 'display:inline-flex;align-items:center;gap:0.35rem';
          link.innerHTML = escHtml(nameVal)
            + '<button class="remove-face-btn" data-face-id="' + res.data.id + '"'
            + ' style="background:none;border:none;cursor:pointer;color:var(--ink-faint);font-size:0.9rem;line-height:1;padding:0;margin-left:0.25rem" aria-label="Remove face tag">&#x2717;</button>';
          bindRemoveBtn(link.querySelector('.remove-face-btn'));
          // Remove the "No tags" placeholder if present
          if (tagsContainer) {
            var placeholder = tagsContainer.querySelector('p[style*="ink-faint"]');
            if (placeholder) placeholder.remove();
            tagsContainer.appendChild(link);
          }
          resetMode();
        })
        .catch(function(){ document.getElementById('face-msg').textContent = 'Network error.'; });
    });
  });
})();
</script>` : ''}
  `, session, true);
}

function renderPhotoEditPage({ photo, from, albumChoices, session }) {
  return page(`Edit — ${photo.title}`, `
    <div class="top-bar">
      <h1>Edit photo</h1>
      <a class="btn btn-secondary back-link" href="${esc(from || '/photos/' + photo.id)}">${backLabel(from)}</a>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:start">
      <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}"
        style="width:100%;border-radius:8px;max-height:400px;object-fit:contain;background:#111">
      <div class="card">
        <form class="form-col" method="POST" action="/photos/${photo.id}">
          <label>Title <input type="text" name="title" value="${esc(photo.title)}" required></label>
          <label>Description <textarea name="description" rows="4">${esc(photo.description || '')}</textarea></label>
          <label>Tags <small>(comma-separated)</small>
            <input type="text" name="tags" value="${esc(photo.tags.join(', '))}">
          </label>
          <label>Date taken
            <input type="date" name="taken_at" value="${photo.taken_at ? new Date(photo.taken_at).toISOString().split('T')[0] : ''}">
          </label>
          <label>Location <small>(optional — search a place or click × to remove)</small>
            <div class="tag-ac-wrap loc-search-wrap">
              <input type="text" class="loc-search-input" autocomplete="off"
                placeholder="${photo.latitude != null ? parseFloat(photo.latitude).toFixed(5) + ', ' + parseFloat(photo.longitude).toFixed(5) : 'Search a place…'}">
              <button type="button" class="loc-clear-btn"${photo.latitude == null ? ' style="display:none"' : ''}>× clear</button>
            </div>
            <input type="hidden" name="latitude"  value="${photo.latitude  ?? ''}">
            <input type="hidden" name="longitude" value="${photo.longitude ?? ''}">
          </label>
          <label>Nextcloud link <small>(optional — leave blank to remove)</small>
            <input type="url" name="nextcloud_url" value="${esc(photo.nextcloud_url || '')}">
          </label>
          ${albumChoices && albumChoices.length ? `
<fieldset style="border:1.5px solid var(--ink);padding:0.75rem 1rem;margin-top:1rem">
  <legend style="font-family:var(--mono);font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;padding:0 0.4rem">Albums</legend>
  <div style="${albumChoices.length > 10 ? 'max-height:240px;overflow-y:auto' : ''}">
    ${albumChoices.map(a => `
    <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;font-family:var(--hand-tight);font-size:0.9rem">
      <input type="checkbox" name="album_ids" value="${a.id}"${a.checked ? ' checked' : ''}>
      ${esc(a.title)}
    </label>`).join('')}
  </div>
</fieldset>` : ''}
          <div class="row">
            <button class="btn" type="submit">Save</button>
            <a class="btn btn-secondary" href="/photos/${photo.id}${from ? '?from=' + encodeURIComponent(from) : ''}">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  `, session);
}

// NC-5: server-side rendered import progress banner
function renderImportBanner(imp) {
  const done   = imp.done   || 0;
  const total  = imp.total  || 0;
  const failed = imp.failed || 0;
  const complete = (done + failed) >= total;
  let message;
  if (complete && failed === total && done === 0) {
    message = `Import failed — 0 of ${total} photos could be imported. Check the Nextcloud share link.`;
  } else if (complete) {
    message = failed > 0
      ? `Import complete — ${done} of ${total} imported, ${failed} failed.`
      : `Import complete — ${done} of ${total} photos imported.`;
  } else {
    message = failed > 0
      ? `Importing from Nextcloud — ${done} of ${total} photos done (${failed} failed)`
      : `Importing from Nextcloud — ${done} of ${total} photos done`;
  }
  return `<div id="nc-import-banner" style="position:sticky;top:0;z-index:100;background:var(--paper-2);border-bottom:1.5px solid var(--ink);padding:0.6rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;font-family:var(--hand-tight);font-size:0.9rem" data-import-id="${imp.id}" data-complete="${complete ? '1' : '0'}">
  <span id="nc-banner-text">${esc(message)}</span>
  <button type="button" id="nc-banner-close" style="background:none;border:none;cursor:pointer;font-size:1.2rem;line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center" aria-label="Dismiss import banner">&#x2715;</button>
</div>`;
}

// NC-5: client-side socket.io listener for real-time import progress
function importProgressScript(activeImport) {
  const importId = activeImport ? activeImport.id : 'null';
  const complete = activeImport ? ((activeImport.done + activeImport.failed) >= activeImport.total ? 1 : 0) : 0;
  return `<script>
(function(){
  var banner = document.getElementById('nc-import-banner');
  var closeBtn = banner ? document.getElementById('nc-banner-close') : null;
  var activeImportId = ${importId};
  var dismissed = false;

  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      dismissed = true;
      if (banner) banner.style.display = 'none';
    });
    // Auto-dismiss if already complete on load
    if (${complete} && banner) {
      setTimeout(function() { if (!dismissed && banner) banner.style.display = 'none'; }, 5000);
    }
  }

  function bannerText(done, total, failed) {
    var complete = (done + failed) >= total;
    if (complete && failed === total && done === 0) return 'Import failed — 0 of ' + total + ' photos could be imported. Check the Nextcloud share link.';
    if (complete && failed > 0)  return 'Import complete — ' + done + ' of ' + total + ' imported, ' + failed + ' failed.';
    if (complete) return 'Import complete — ' + done + ' of ' + total + ' photos imported.';
    if (failed > 0) return 'Importing from Nextcloud — ' + done + ' of ' + total + ' photos done (' + failed + ' failed)';
    return 'Importing from Nextcloud — ' + done + ' of ' + total + ' photos done';
  }

  function updateBanner(done, total, failed) {
    if (dismissed) return;
    var textEl = document.getElementById('nc-banner-text');
    if (!banner) {
      // Create banner dynamically (user navigated back after import started)
      banner = document.createElement('div');
      banner.id = 'nc-import-banner';
      banner.style.cssText = 'position:sticky;top:0;z-index:100;background:var(--paper-2);border-bottom:1.5px solid var(--ink);padding:0.6rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;font-family:var(--hand-tight);font-size:0.9rem';
      banner.innerHTML = '<span id="nc-banner-text"></span>'
        + '<button type="button" id="nc-banner-close" style="background:none;border:none;cursor:pointer;font-size:1.2rem;line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center" aria-label="Dismiss import banner">&#x2715;</button>';
      document.body.insertBefore(banner, document.body.firstChild);
      document.getElementById('nc-banner-close').addEventListener('click', function() {
        dismissed = true;
        banner.style.display = 'none';
      });
    }
    textEl = document.getElementById('nc-banner-text');
    if (textEl) textEl.textContent = bannerText(done, total, failed);
    banner.style.display = 'flex';

    var complete = (done + failed) >= total;
    if (complete) {
      setTimeout(function() { if (!dismissed && banner) banner.style.display = 'none'; }, 5000);
    }
  }

  // Listen for real-time progress via socket.io (socket is initialised globally in layout)
  if (typeof window._socket !== 'undefined' && window._socket) {
    window._socket.on('nextcloud-import-progress', function(data) {
      if (activeImportId !== null && data.importId !== activeImportId) return;
      if (activeImportId === null) activeImportId = data.importId;
      updateBanner(data.done, data.total, data.failed);
    });
  } else {
    // Socket not yet ready — wait for it
    document.addEventListener('socket-ready', function(e) {
      e.detail.on('nextcloud-import-progress', function(data) {
        if (activeImportId !== null && data.importId !== activeImportId) return;
        if (activeImportId === null) activeImportId = data.importId;
        updateBanner(data.done, data.total, data.failed);
      });
    });
  }
})();
</script>`;
}

module.exports = { renderPhotoListPage, renderUploadPage, renderPhotoDetailPage, renderPhotoEditPage };
