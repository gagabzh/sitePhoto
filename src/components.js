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
  return `<div class="bulk-bar" id="bulk-bar" style="display:none">
    ${showTag ? `<span style="font-size:0.9rem;font-weight:500">Tag selected:</span>
      <input type="text" name="tag" placeholder="e.g. Paris"
        style="width:180px;padding:0.4rem 0.6rem;font-size:0.9rem;border:1px solid #ccc;border-radius:4px">
      <button class="btn btn-sm" type="submit">Apply tag</button>` : ''}
    ${removeAction ? `<button class="btn btn-sm btn-secondary" type="submit" formaction="${esc(removeAction)}"
      onclick="return confirm('Remove selected photos from album?')">Remove from album</button>` : ''}
    ${deleteAction ? `<button class="btn btn-sm btn-danger" type="submit" formaction="${esc(deleteAction)}"
      onclick="return confirm('Delete selected photos permanently?')">Delete selected</button>` : ''}
  </div>`;
}

function bulkScript() {
  return `<script>
    (function () {
      var bar = document.getElementById('bulk-bar');
      var boxes = document.querySelectorAll('input[name="photo_ids"]');
      function update() {
        bar.style.display = Array.prototype.some.call(boxes, function (b) { return b.checked; }) ? 'flex' : 'none';
      }
      boxes.forEach(function (b) { b.addEventListener('change', update); });
    })();
  </script>`;
}

module.exports = { photoThumb, bulkBar, bulkScript };
