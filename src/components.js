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
    <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9rem;cursor:pointer">
      <input type="checkbox" id="select-all"> Select all
    </label>
    <div id="bulk-actions" style="display:none">
      ${showTag ? `<span style="font-size:0.9rem;font-weight:500">Tag selected:</span>
        <input type="text" name="tag" placeholder="e.g. Paris"
          style="width:180px;padding:0.4rem 0.6rem;font-size:0.9rem;border:1px solid #ccc;border-radius:4px">
        <button class="btn btn-sm" type="submit">Apply tag</button>` : ''}
      ${removeAction ? `<button class="btn btn-sm btn-secondary" type="submit" formaction="${esc(removeAction)}"
        onclick="return confirm('Remove selected photos from album?')">Remove from album</button>` : ''}
      ${deleteAction ? `<button class="btn btn-sm btn-danger" type="submit" formaction="${esc(deleteAction)}"
        onclick="return confirm('Delete selected photos permanently?')">Delete selected</button>` : ''}
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

module.exports = { photoThumb, bulkBar, bulkScript };
