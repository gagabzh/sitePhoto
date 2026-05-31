const { esc } = require('./layout');

function photoThumb(photo, { owns = false } = {}) {
  if (!owns) {
    return `<div class="photo-thumb">
      <a href="/photos/${photo.id}">
        <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}">
      </a>
    </div>`;
  }
  return `<div class="photo-thumb sel-tile" data-photo-id="${photo.id}" data-href="/photos/${photo.id}">
    <a href="/photos/${photo.id}">
      <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}">
    </a>
    <button class="hovercheck" type="button" aria-label="Select this photo" tabindex="-1">+</button>
    <div class="press-ring"></div>
    <span class="sel-cbox" role="checkbox" aria-checked="false" aria-label="${esc(photo.title)}"></span>
  </div>`;
}

function selectionBar({ showTag = false, tagAction = null, untagAction = null, removeAction = null, deleteAction = null } = {}) {
  const tagRow = showTag ? [
    `<div class="sel-seg">`,
    `<button type="button" class="sel-active" id="sel-tag-mode-add">+ tag</button>`,
    `<button type="button" id="sel-tag-mode-remove">− untag</button>`,
    `</div>`,
    `<input class="sel-tag-input" id="sel-tag-input" type="text" name="tag"`,
    ` placeholder="tag to apply…" autocomplete="off" list="sel-tag-datalist">`,
    `<datalist id="sel-tag-datalist"></datalist>`,
    `<button class="btn btn-sm" id="sel-apply-btn" type="submit"`,
    tagAction   ? ` formaction="${esc(tagAction)}"` : '',
    untagAction ? ` data-tag-action="${esc(tagAction || '')}" data-untag-action="${esc(untagAction)}"` : '',
    `>apply</button>`,
    `<div class="sel-vsep"></div>`,
  ].join('') : '';

  const removeRow = removeAction
    ? `<button class="btn btn-sm btn-secondary" id="sel-remove-btn" type="submit" formaction="${esc(removeAction)}">remove from album</button>`
    : '';
  const deleteRow = deleteAction
    ? `<button class="btn btn-sm btn-danger" id="sel-delete-btn" type="submit" formaction="${esc(deleteAction)}">delete <span id="sel-delete-count">0</span></button>`
    : '';

  return `<div class="sel-bar" id="sel-bar">
    <div class="sel-r1">
      <span class="sel-master" id="sel-master" role="checkbox" aria-checked="false" tabindex="0" aria-label="Select all photos"></span>
      <span class="sel-count-pill">
        <span class="sel-n" id="sel-count">0</span> selected
        <span class="sel-of" id="sel-of-n"></span>
      </span>
      <div class="sel-seg">
        <button type="button" id="sel-all">all</button>
        <button type="button" id="sel-none">none</button>
        <button type="button" id="sel-invert">invert</button>
      </div>
      <div style="flex:1"></div>
      <span class="sel-kbd-hint"><kbd>⇧</kbd> range \xb7 <kbd>Esc</kbd> exit</span>
      <button class="btn btn-sm" id="sel-done" type="button">done</button>
    </div>
    <div class="sel-r2">
      ${tagRow}${removeRow}
      <button class="btn btn-sm btn-secondary" id="sel-download-btn" type="button">↓ download</button>
      <div style="flex:1"></div>
      ${deleteRow}
    </div>
  </div>`;
}

function selectionScript() {
  return `<script>(function(){
    var LONG_MS=450;
    var mode='browse',sel=new Set(),lastId=null,tagMode='add';
    var bar=document.getElementById('sel-bar');
    var selBtn=document.getElementById('sel-select-btn');
    var doneBtn=document.getElementById('sel-done');
    var master=document.getElementById('sel-master');
    var countEl=document.getElementById('sel-count');
    var ofEl=document.getElementById('sel-of-n');
    var allBtn=document.getElementById('sel-all');
    var noneBtn=document.getElementById('sel-none');
    var invBtn=document.getElementById('sel-invert');
    var tagAddBtn=document.getElementById('sel-tag-mode-add');
    var tagRemBtn=document.getElementById('sel-tag-mode-remove');
    var tagInput=document.getElementById('sel-tag-input');
    var applyBtn=document.getElementById('sel-apply-btn');
    var deleteBtn=document.getElementById('sel-delete-btn');
    var delCount=document.getElementById('sel-delete-count');
    var theForm=document.querySelector('[data-sel-form]');
    var tiles=Array.from(document.querySelectorAll('.sel-tile'));
    var total=tiles.length;
    function tid(el){return el.dataset.photoId;}

    /* First-visit coachmark */
    (function(){
      if(localStorage.getItem('sel-coached')||!tiles[0]) return;
      var cm=document.createElement('div');
      cm.className='sel-coachmark';cm.textContent='hold to select →';
      tiles[0].style.position='relative';
      tiles[0].appendChild(cm);
      var t=setTimeout(dismiss,5000);
      function dismiss(){clearTimeout(t);if(cm.parentNode)cm.remove();localStorage.setItem('sel-coached','1');}
      tiles[0].addEventListener('pointerdown',dismiss,{once:true});
    })();

    /* Populate tag autocomplete datalist */
    var dl=document.getElementById('sel-tag-datalist');
    if(dl) fetch('/api/tags/index').then(function(r){return r.json();}).then(function(d){
      (d.tags||[]).forEach(function(t){var o=document.createElement('option');o.value=t.name;dl.appendChild(o);});
    }).catch(function(){});

    /* UI sync */
    function updateUI(){
      var n=sel.size;
      if(countEl) countEl.textContent=n;
      if(ofEl) ofEl.textContent='of '+total;
      if(delCount) delCount.textContent=n;
      if(master){
        var isAll=n===total&&total>0,isSome=n>0&&n<total;
        master.classList.toggle('sel-all',isAll);
        master.classList.toggle('sel-some',isSome);
        master.setAttribute('aria-checked',isAll?'true':isSome?'mixed':'false');
      }
      tiles.forEach(function(t){
        var on=sel.has(tid(t));
        t.classList.toggle('sel-on',on);
        var cb=t.querySelector('.sel-cbox');
        if(cb){cb.textContent=on?'✓':'';cb.setAttribute('aria-checked',on?'true':'false');}
      });
    }

    function enterSelection(seedId){
      if(mode==='selecting') return;
      mode='selecting';
      if(seedId!=null){sel.add(String(seedId));lastId=String(seedId);}
      if(bar){bar.style.display='block';requestAnimationFrame(function(){bar.classList.add('sel-open');});}
      if(selBtn) selBtn.style.display='none';
      tiles.forEach(function(t){t.classList.add('sel-selecting');});
      updateUI();
    }
    function exitSelection(){
      if(mode==='browse') return;
      mode='browse';sel.clear();lastId=null;
      if(bar){
        bar.classList.remove('sel-open');bar.classList.add('sel-closing');
        setTimeout(function(){bar.style.display='none';bar.classList.remove('sel-closing');},180);
      }
      if(selBtn) selBtn.style.display='';
      tiles.forEach(function(t){t.classList.remove('sel-selecting','sel-on');});
      updateUI();
    }
    function toggle(id){
      id=String(id);
      if(sel.has(id)) sel.delete(id); else{sel.add(id);lastId=id;}
      updateUI();
    }
    // intentional: selects only loaded tiles — correct UX for infinite scroll
    function selectAll(){tiles.forEach(function(t){sel.add(tid(t));});updateUI();}
    function selectNone(){sel.clear();updateUI();}
    function invertSel(){tiles.forEach(function(t){var id=tid(t);if(sel.has(id))sel.delete(id);else sel.add(id);});updateUI();}
    function rangeSelectTo(id){
      id=String(id);
      if(!lastId){toggle(id);return;}
      var ids=tiles.map(tid);
      var a=ids.indexOf(lastId),b=ids.indexOf(id);
      if(a<0||b<0){toggle(id);return;}
      var lo=Math.min(a,b),hi=Math.max(a,b);
      for(var i=lo;i<=hi;i++) sel.add(ids[i]);
      updateUI();
    }

    /* Inject hidden photo_ids before form submit */
    if(theForm) theForm.addEventListener('submit',function(){
      theForm.querySelectorAll('.sel-hidden').forEach(function(i){i.remove();});
      sel.forEach(function(id){
        var inp=document.createElement('input');
        inp.type='hidden';inp.name='photo_ids';inp.value=id;inp.className='sel-hidden';
        theForm.appendChild(inp);
      });
    });

    /* Per-tile event setup — called for initial tiles and lazy-loaded tiles via registerSelTiles */
    function setupTile(tile){
      var timer=null,fired=false,sx=0,sy=0;
      tile.addEventListener('pointerdown',function(e){
        if(e.button&&e.button!==0) return;
        fired=false;sx=e.clientX;sy=e.clientY;
        tile.classList.add('sel-pressing');
        timer=setTimeout(function(){
          fired=true;tile.classList.remove('sel-pressing');
          if(navigator.vibrate) navigator.vibrate(10);
          if(mode==='browse') enterSelection(tid(tile));
          else{toggle(tid(tile));lastId=tid(tile);}
        },LONG_MS);
      });
      function cancel(){clearTimeout(timer);tile.classList.remove('sel-pressing');}
      tile.addEventListener('pointermove',function(e){
        if(Math.abs(e.clientX-sx)>10||Math.abs(e.clientY-sy)>10) cancel();
      });
      tile.addEventListener('pointerleave',cancel);
      tile.addEventListener('pointercancel',cancel);
      tile.addEventListener('pointerup',function(e){
        clearTimeout(timer);tile.classList.remove('sel-pressing');
        if(fired) return;
        if(Math.abs(e.clientX-sx)>10||Math.abs(e.clientY-sy)>10) return;
        if(mode==='selecting'){
          if(e.shiftKey&&lastId) rangeSelectTo(tid(tile));
          else toggle(tid(tile));
        }
      });
      tile.addEventListener('click',function(e){
        if(mode==='selecting') e.preventDefault();
      });
      var hc=tile.querySelector('.hovercheck');
      if(hc) hc.addEventListener('click',function(e){
        e.stopPropagation();
        if(mode==='browse') enterSelection(tid(tile));
        else toggle(tid(tile));
      });
    }
    tiles.forEach(setupTile);

    /* Toolbar row-1 buttons */
    if(selBtn) selBtn.addEventListener('click',function(){enterSelection(null);});
    if(doneBtn) doneBtn.addEventListener('click',exitSelection);
    if(master){
      master.addEventListener('click',function(){if(sel.size===total&&total>0)selectNone();else selectAll();});
      master.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();master.click();}});
    }
    if(allBtn)  allBtn.addEventListener('click',selectAll);
    if(noneBtn) noneBtn.addEventListener('click',selectNone);
    if(invBtn)  invBtn.addEventListener('click',invertSel);

    /* Tag mode toggle */
    function setTagMode(m){
      tagMode=m;
      if(tagAddBtn) tagAddBtn.classList.toggle('sel-active',m==='add');
      if(tagRemBtn) tagRemBtn.classList.toggle('sel-active',m==='remove');
      if(tagInput)  tagInput.placeholder=m==='add'?'tag to apply…':'tag to remove…';
      if(applyBtn){
        applyBtn.textContent=m==='add'?'apply':'remove';
        if(applyBtn.dataset.tagAction&&applyBtn.dataset.untagAction)
          applyBtn.setAttribute('formaction',m==='add'?applyBtn.dataset.tagAction:applyBtn.dataset.untagAction);
      }
    }
    if(tagAddBtn) tagAddBtn.addEventListener('click',function(){setTagMode('add');});
    if(tagRemBtn) tagRemBtn.addEventListener('click',function(){setTagMode('remove');});

    /* Delete confirmation */
    if(deleteBtn) deleteBtn.addEventListener('click',function(e){
      if(!sel.size){e.preventDefault();return;}
      if(!confirm('Delete '+sel.size+' photo'+(sel.size!==1?'s':'')+' permanently?')) e.preventDefault();
    });

    /* Download (stub) */
    var dlBtn=document.getElementById('sel-download-btn');
    if(dlBtn) dlBtn.addEventListener('click',function(){
      if(!sel.size) return;
      alert('Download — coming soon.');
    });

    /* Keyboard shortcuts */
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'){exitSelection();return;}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){
        if(document.activeElement&&document.activeElement.tagName==='INPUT') return;
        e.preventDefault();
        if(mode==='browse') enterSelection(null);
        selectAll();
      }
    });

    /* Registration hook for tiles appended after initial render (e.g. lazy loading) */
    window.registerSelTiles=window.registerSelTiles||function(newTiles){
      newTiles.forEach(function(tile){
        tiles.push(tile);
        setupTile(tile);
        if(mode==='selecting') tile.classList.add('sel-selecting');
      });
      total=tiles.length;
      updateUI();
    };
  })();</script>`;
}

function lbOverlay() {
  return `<div id="lightbox" class="lb-overlay" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <button class="lb-close" id="lb-close" aria-label="Close">&#x2715;</button>
    <button class="lb-prev" id="lb-prev" aria-label="Previous photo">&#x2190;</button>
    <div class="lb-img-wrap">
      <img id="lb-img" src="" alt="" onerror="this.style.display='none';document.getElementById('lb-err').style.display='block';">
      <div id="lb-err" style="display:none;color:var(--paper);font-family:var(--hand);font-size:18px;text-align:center;padding:2rem;">Photo unavailable</div>
      <div class="lb-caption" id="lb-caption"></div>
    </div>
    <button class="lb-next" id="lb-next" aria-label="Next photo">&#x2192;</button>
    <div class="lb-counter" id="lb-counter"></div>
  </div>`;
}

function lbScript() {
  return `<script>
    (function () {
      var overlay  = document.getElementById('lightbox');
      var img      = document.getElementById('lb-img');
      var errMsg   = document.getElementById('lb-err');
      var caption  = document.getElementById('lb-caption');
      var counter  = document.getElementById('lb-counter');
      var btnClose = document.getElementById('lb-close');
      var btnPrev  = document.getElementById('lb-prev');
      var btnNext  = document.getElementById('lb-next');
      var focusTrap = [btnClose, btnPrev, btnNext];
      var triggerEl = null;

      var photos = (typeof LB_PHOTOS !== 'undefined') ? LB_PHOTOS : [];
      var current = 0;

      function updateNav() {
        if (photos.length <= 1) {
          btnPrev.setAttribute('disabled', '');
          btnNext.setAttribute('disabled', '');
        } else {
          if (current === 0) {
            btnPrev.setAttribute('disabled', '');
          } else {
            btnPrev.removeAttribute('disabled');
          }
          if (current === photos.length - 1) {
            btnNext.setAttribute('disabled', '');
          } else {
            btnNext.removeAttribute('disabled');
          }
        }
      }

      function show(i, trigger) {
        if (!photos.length) return;
        current = (i + photos.length) % photos.length;
        img.style.display = '';
        errMsg.style.display = 'none';
        img.src = photos[current].src;
        img.alt = photos[current].title || '';
        caption.textContent = photos[current].title || '';
        counter.textContent = (current + 1) + ' / ' + photos.length;
        updateNav();
        if (trigger) triggerEl = trigger;
        overlay.classList.add('lb-open');
        document.body.style.overflow = 'hidden';
        btnClose.focus();
      }

      function close() {
        overlay.classList.remove('lb-open');
        img.src = '';
        document.body.style.overflow = '';
        if (triggerEl) { triggerEl.focus(); triggerEl = null; }
      }

      /* Thumbnail click handlers — index matches LB_PHOTOS array position */
      document.querySelectorAll('[data-lb-index]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          show(parseInt(el.getAttribute('data-lb-index'), 10), el);
        });
      });

      /* Editor fullscreen button */
      document.querySelectorAll('.ad-lb-btn[data-lb-index]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          show(parseInt(btn.getAttribute('data-lb-index'), 10), btn);
        });
      });

      btnClose.addEventListener('click', close);
      btnPrev.addEventListener('click', function () { if (!btnPrev.disabled) show(current - 1, triggerEl); });
      btnNext.addEventListener('click', function () { if (!btnNext.disabled) show(current + 1, triggerEl); });

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });

      document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('lb-open')) return;
        if (e.key === 'Escape')     { close(); return; }
        if (e.key === 'ArrowLeft')  { if (!btnPrev.disabled) show(current - 1, triggerEl); return; }
        if (e.key === 'ArrowRight') { if (!btnNext.disabled) show(current + 1, triggerEl); return; }
        /* Focus trap: Tab cycles only through close/prev/next */
        if (e.key === 'Tab') {
          var focusable = focusTrap.filter(function (b) { return !b.disabled; });
          if (!focusable.length) { e.preventDefault(); return; }
          var idx = focusable.indexOf(document.activeElement);
          e.preventDefault();
          if (e.shiftKey) {
            focusable[(idx - 1 + focusable.length) % focusable.length].focus();
          } else {
            focusable[(idx + 1) % focusable.length].focus();
          }
        }
      });
    })();
  </script>`;
}

module.exports = { photoThumb, selectionBar, selectionScript, lbOverlay, lbScript };
