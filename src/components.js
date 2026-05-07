const { esc } = require('./layout');

function photoThumb(photo, { owns = false } = {}) {
  return `<div class="photo-thumb">
    <a href="/photos/${photo.id}">
      <img src="/uploads/${esc(photo.filename)}" alt="${esc(photo.title)}">
    </a>
    ${owns ? `<label class="photo-checkbox-label"><input type="checkbox" name="photo_ids" value="${photo.id}"></label>` : ''}
  </div>`;
}

function bulkBar({ showTag = false, removeAction = null, deleteAction = null } = {}) {
  return `<div class="bulk-bar">
    <label style="display:flex;align-items:center;gap:0.4rem;font-family:'Kalam',cursive;font-size:0.9rem;cursor:pointer;white-space:nowrap">
      <input type="checkbox" id="select-all"> Select all
    </label>
    <div id="bulk-actions" style="display:none;flex:1;align-items:center;justify-content:space-between;gap:0.75rem">
      <div style="display:flex;align-items:center;gap:0.75rem">
        ${showTag ? `<span style="font-family:'Kalam',cursive;font-size:0.9rem;white-space:nowrap">Tag selected:</span>
          <input type="text" name="tag" placeholder="e.g. Paris"
            style="width:160px;padding:0.35rem 0.6rem;font-family:'Kalam',cursive;font-size:0.9rem;border:1.5px solid var(--ink);background:var(--paper);color:var(--ink)">
          <button class="btn btn-sm" type="submit">Apply tag</button>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem">
        ${removeAction ? `<button class="btn btn-sm btn-secondary" type="submit" formaction="${esc(removeAction)}"
          onclick="return confirm('Remove selected photos from album?')">Remove from album</button>` : ''}
        ${deleteAction ? `<button class="btn btn-sm btn-danger" type="submit" formaction="${esc(deleteAction)}"
          onclick="return confirm('Delete selected photos permanently?')">Delete selected</button>` : ''}
      </div>
    </div>
  </div>`;
}

function bulkScript() {
  return `<script>
    (function () {
      var actions  = document.getElementById('bulk-actions');
      var selectAll = document.getElementById('select-all');
      var boxes    = document.querySelectorAll('input[name="photo_ids"]');

      function update() {
        var checked = Array.prototype.filter.call(boxes, function(b) { return b.checked; });
        if (actions) {
          actions.style.display = checked.length ? 'flex' : 'none';
        }
        if (selectAll) {
          selectAll.checked       = checked.length === boxes.length && boxes.length > 0;
          selectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
        }
      }

      boxes.forEach(function(b) { b.addEventListener('change', update); });

      if (selectAll) {
        selectAll.addEventListener('change', function() {
          boxes.forEach(function(b) { b.checked = selectAll.checked; });
          update();
        });
      }
    })();
  </script>`;
}

function lbOverlay() {
  return `<div id="lb" class="lb-overlay" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <button class="lb-close" id="lb-close" aria-label="Close">✕</button>
    <button class="lb-btn lb-prev" id="lb-prev" aria-label="Previous">‹</button>
    <div class="lb-img-wrap">
      <img id="lb-img" src="" alt="">
      <div class="lb-caption" id="lb-caption"></div>
    </div>
    <button class="lb-btn lb-next" id="lb-next" aria-label="Next">›</button>
    <div class="lb-counter" id="lb-counter"></div>
  </div>`;
}

function lbScript() {
  return `<script>
    (function () {
      var overlay  = document.getElementById('lb');
      var img      = document.getElementById('lb-img');
      var caption  = document.getElementById('lb-caption');
      var counter  = document.getElementById('lb-counter');
      var btnClose = document.getElementById('lb-close');
      var btnPrev  = document.getElementById('lb-prev');
      var btnNext  = document.getElementById('lb-next');

      var photos = Array.prototype.map.call(
        document.querySelectorAll('[data-lb-src]'),
        function (el) { return { src: el.getAttribute('data-lb-src'), title: el.getAttribute('data-lb-title') || '' }; }
      );
      var current = 0;

      function show(i) {
        current = (i + photos.length) % photos.length;
        img.src = photos[current].src;
        img.alt = photos[current].title;
        caption.textContent = photos[current].title;
        counter.textContent = (current + 1) + ' / ' + photos.length;
        btnPrev.style.display = photos.length > 1 ? '' : 'none';
        btnNext.style.display = photos.length > 1 ? '' : 'none';
        overlay.classList.add('lb-open');
        document.body.style.overflow = 'hidden';
      }

      function close() {
        overlay.classList.remove('lb-open');
        img.src = '';
        document.body.style.overflow = '';
      }

      document.querySelectorAll('[data-lb-src]').forEach(function (el, idx) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          show(idx);
        });
      });

      btnClose.addEventListener('click', close);
      btnPrev.addEventListener('click', function () { show(current - 1); });
      btnNext.addEventListener('click', function () { show(current + 1); });

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });

      document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('lb-open')) return;
        if (e.key === 'Escape')     close();
        if (e.key === 'ArrowLeft')  show(current - 1);
        if (e.key === 'ArrowRight') show(current + 1);
      });
    })();
  </script>`;
}

module.exports = { photoThumb, bulkBar, bulkScript, lbOverlay, lbScript };
