const { page, esc } = require('../layout');
const { canModify } = require('../middleware');
const { selectionBar, selectionScript, lbOverlay, lbScript } = require('../components');
const { singleUploadFields, batchUploadFields } = require('../uploadHelpers');

const TRASH = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

function renderAlbumListPage({ rows, isViewer, session }) {
  const totalPhotos = rows.reduce((s, a) => s + (a.photo_count || 0), 0);

  const emptyMsg = isViewer
    ? `<p class="tl-empty">You haven't been granted access to any albums yet.</p>`
    : `<p class="tl-empty">No albums yet. <a href="/albums/new">Create the first one.</a></p>`;

  const bookCards = rows.map(a => `
    <div class="ab-book">
      <div class="ab-spine"></div>
      <a href="/albums/${a.id}" class="ab-cover">
        ${a.cover_filename
          ? `<img class="ab-cover-img" src="/uploads/${esc(a.cover_filename)}" alt="${esc(a.title)}">`
          : `<div class="ab-cover-empty">no photos yet</div>`}
        ${a.photo_count > 0
          ? `<span class="ab-ribbon">${a.photo_count} PHOTO${a.photo_count !== 1 ? 'S' : ''}</span>`
          : `<span class="ab-ribbon ab-ribbon-empty">EMPTY</span>`}
        <div class="ab-label">
          <h3>${esc(a.title)}</h3>
          <div class="ab-label-sub">by ${esc(a.creator)}</div>
        </div>
      </a>
      <div class="ab-meta-row">
        <span class="ab-meta-who">${esc(a.creator)}</span>
        ${canModify(session, a) ? `<span class="ab-meta-acts">
          <a class="btn btn-sm btn-secondary" href="/albums/${a.id}/edit">edit</a>
          <form class="inline" method="POST" action="/albums/${a.id}/delete"
            onsubmit="return confirm('Delete this album?')">
            <button class="btn btn-sm btn-danger btn-icon" title="Delete">${TRASH}</button>
          </form>
        </span>` : ''}
      </div>
    </div>`).join('');

  const newBook = isViewer ? '' : `
    <a href="/albums/new" class="ab-new">
      <span class="ab-new-plus">+</span>
      start a new album
    </a>`;

  const grid = rows.length === 0
    ? emptyMsg
    : `<div class="ab-grid">${bookCards}${newBook}</div>`;

  const controls = isViewer ? '' : `
    <div class="ab-actions">
      <a class="btn btn-secondary" href="/albums/new/folder">↑ from folder</a>
      <a class="btn" href="/albums/new">+ New album</a>
    </div>`;

  return page('Albums', `
    <div class="ab-page-h">
      <div>
        <h1>our <em>albums</em>.</h1>
        <p class="ab-sub">${rows.length} album${rows.length !== 1 ? 's' : ''} · ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}</p>
      </div>
      ${controls}
    </div>
    ${grid}
  `, session);
}

function renderNewAlbumPage({ session }) {
  return page('New album', `
    <div class="top-bar">
      <h1>New album</h1>
      <a class="btn btn-secondary" href="/albums">← Back</a>
    </div>
    <div class="card" style="max-width:480px">
      <form class="form-col" method="POST" action="/albums">
        <label>Title <input type="text" name="title" required autofocus></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <div class="row">
          <button class="btn" type="submit">Create</button>
          <a class="btn btn-secondary" href="/albums">Cancel</a>
        </div>
      </form>
    </div>
  `, session);
}

function renderNewFromFolderPage({ session }) {
  return page('New album from folder', `
    <div class="top-bar">
      <h1>New album from folder</h1>
      <a class="btn btn-secondary" href="/albums">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form class="form-col" method="POST" action="/albums/new/folder" enctype="multipart/form-data">
        <label>Album title <input type="text" name="title" required autofocus></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>
          Photos
          <small>Select a folder or multiple image files (JPEG, PNG, GIF, WebP · max 10 MB each)</small>
          <input type="file" name="photos" accept="image/*" multiple webkitdirectory required>
        </label>
        ${batchUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Create album</button>
          <a class="btn btn-secondary" href="/albums">Cancel</a>
        </div>
      </form>
    </div>
  `, session);
}

function renderAlbumDetailPage({ album, photos, canEdit, from, session }) {
  const cover = photos[0];
  const coverHtml = cover
    ? `<img src="/uploads/${esc(cover.filename)}" alt="${esc(cover.title)}">`
    : `<div class="ad-cover-empty">no photos yet</div>`;

  const uniqueContributors = new Set(photos.map(p => p.user_id)).size;

  const mosaic = photos.slice(0, 9);
  const rest = photos.slice(9);

  const mosaicCells = mosaic.map(p => `
    <div class="ad-cell${canEdit ? ' sel-tile' : ''}"${canEdit ? ` data-photo-id="${p.id}" data-href="/photos/${p.id}/edit?from=/albums/${album.id}"` : ''}>
      <a href="${canEdit ? `/photos/${p.id}/edit?from=/albums/${album.id}` : `/photos/${p.id}`}"${canEdit ? '' : ` data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}"`}>
        <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
      </a>
      ${canEdit ? `<button class="ad-lb-btn" data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}" title="View fullscreen" type="button">⛶</button>
      <button class="hovercheck" type="button" aria-label="Select this photo" tabindex="-1">+</button>
      <div class="press-ring"></div>
      <span class="sel-cbox" role="checkbox" aria-checked="false" aria-label="${esc(p.title)}"></span>` : ''}
    </div>`).join('');

  const restGrid = rest.length > 0
    ? `<div class="photo-grid" style="margin-top:1rem">${rest.map(p => `
        <div class="photo-card${canEdit ? ' sel-tile' : ''}"${canEdit ? ` data-photo-id="${p.id}" data-href="/photos/${p.id}/edit?from=/albums/${album.id}"` : ''}>
          <div class="photo-thumb">
            <a href="${canEdit ? `/photos/${p.id}/edit?from=/albums/${album.id}` : `/photos/${p.id}`}"${canEdit ? '' : ` data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}"`}>
              <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
            </a>
            ${canEdit ? `<button class="ad-lb-btn" data-lb-src="/uploads/${esc(p.filename)}" data-lb-title="${esc(p.title)}" title="View fullscreen" type="button">⛶</button>
            <button class="hovercheck" type="button" aria-label="Select this photo" tabindex="-1">+</button>
            <div class="press-ring"></div>
            <span class="sel-cbox" role="checkbox" aria-checked="false" aria-label="${esc(p.title)}"></span>` : ''}
          </div>
          <div class="photo-meta"><strong>${esc(p.title)}</strong></div>
        </div>`).join('')}
      </div>` : '';

  const photoSection = photos.length === 0
    ? `<p class="tl-empty">No photos yet.${canEdit ? ` <a href="/albums/${album.id}/photos/add">Add some.</a>` : ''}</p>`
    : `<form method="POST" action="/albums/${album.id}/photos/bulk-remove" data-sel-form>
        ${canEdit ? selectionBar({
          removeAction: `/albums/${album.id}/photos/bulk-remove`,
          deleteAction:  `/albums/${album.id}/photos/bulk-delete`,
        }) : ''}
        <div class="ad-mosaic">${mosaicCells}</div>
        ${restGrid}
      </form>
      ${canEdit ? selectionScript() : ''}
      ${lbOverlay()}
      ${lbScript()}`;

  return page(album.title, `
    <div class="ad-head">
      <div class="ad-cover">${coverHtml}</div>
      <div class="ad-info">
        <div class="ad-crumbs"><a href="/albums">albums</a> / ${esc(album.title)}</div>
        <h1>${esc(album.title)}.</h1>
        ${album.description ? `<p class="ad-desc">${esc(album.description)}</p>` : ''}
        <div class="ad-stats">
          <div><b>${photos.length}</b> photo${photos.length !== 1 ? 's' : ''}</div>
          ${uniqueContributors > 0 ? `<div><b>${uniqueContributors}</b> contributor${uniqueContributors !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <p style="font-family:'Kalam',cursive;font-size:0.85rem;color:var(--ink-soft);margin:0.1rem 0 0;">by ${esc(album.creator)}</p>
        <div class="ad-actions">
          <a class="btn btn-secondary" href="${from || '/albums'}">← Back</a>
          ${canEdit ? `
            <button class="btn btn-secondary btn-sm" id="sel-select-btn" type="button">select</button>
            <a class="btn" href="/albums/${album.id}/photos/upload">↑ Upload</a>
            <a class="btn" href="/albums/${album.id}/photos/batch">↑ Batch</a>
            <a class="btn btn-secondary" href="/albums/${album.id}/photos/add">+ Add photos</a>
            <a class="btn btn-secondary" href="/albums/${album.id}/access">Access</a>
            <a class="btn btn-secondary" href="/albums/${album.id}/edit">Edit</a>
            <form class="inline" method="POST" action="/albums/${album.id}/delete"
              onsubmit="return confirm('Delete this album?')">
              <button class="btn btn-danger btn-icon" title="Delete">${TRASH}</button>
            </form>` : ''}
        </div>
      </div>
    </div>
    ${photoSection}
  `, session);
}

function renderAlbumEditPage({ album, session }) {
  return page(`Edit — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Edit album</h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back</a>
    </div>
    <div class="card" style="max-width:480px">
      <form class="form-col" method="POST" action="/albums/${album.id}">
        <label>Title <input type="text" name="title" value="${esc(album.title)}" required></label>
        <label>Description <textarea name="description" rows="3">${esc(album.description || '')}</textarea></label>
        <div class="row">
          <button class="btn" type="submit">Save</button>
          <a class="btn btn-secondary" href="/albums/${album.id}">Cancel</a>
        </div>
      </form>
    </div>
  `, session);
}

function renderAlbumAccessPage({ album, withAccess, withoutAccess, session }) {
  const viewerList = withAccess.length === 0
    ? `<div class="ac-empty">no viewers have access yet.</div>`
    : withAccess.map(u => `
        <div class="ac-row">
          <span class="ac-av">${esc((u.name || '?')[0].toUpperCase())}</span>
          <div>
            <div class="ac-nm">${esc(u.name)}</div>
            <div class="ac-em">${esc(u.email)}</div>
          </div>
          <form class="inline" method="POST" action="/albums/${album.id}/access/remove">
            <input type="hidden" name="viewer_id" value="${u.id}">
            <button class="btn btn-sm btn-danger btn-icon" title="Revoke">${TRASH}</button>
          </form>
        </div>`).join('');

  const addSection = withoutAccess.length === 0
    ? `<p style="font-family:'Kalam',cursive;font-size:0.85rem;color:var(--ink-soft);margin:0;">All viewers already have access.</p>`
    : withoutAccess.map(u => `
        <form method="POST" action="/albums/${album.id}/access/add">
          <input type="hidden" name="viewer_id" value="${u.id}">
          <div class="ac-cand">
            <span class="ac-cand-av">${esc((u.name || '?')[0].toUpperCase())}</span>
            <div>
              <div class="ac-cand-nm">${esc(u.name)}</div>
              <div class="ac-cand-em">${esc(u.email)}</div>
            </div>
            <button class="btn btn-sm" type="submit" style="margin-left:auto;white-space:nowrap;">Grant access</button>
          </div>
        </form>`).join('');

  return page(`Access — ${esc(album.title)}`, `
    <div class="ac-head">
      <div>
        <div class="ac-crumbs"><a href="/albums">albums</a> / <a href="/albums/${album.id}">${esc(album.title)}</a> / access</div>
        <h1>who can see <em>${esc(album.title)}?</em></h1>
        <p class="ac-sub">${withAccess.length} viewer${withAccess.length !== 1 ? 's' : ''} right now.</p>
      </div>
      <div>
        <a class="btn btn-secondary" href="/albums/${album.id}">← back to album</a>
      </div>
    </div>
    <div class="ac-summary">
      <span class="ac-lock">🔒 private album</span>
      <span>visible only to people listed below.</span>
    </div>
    <div class="ac-body">
      <div class="ac-main">
        <h3>viewers <span class="ac-count">// can see this album</span></h3>
        <p class="ac-hint">remove anyone to revoke their access immediately.</p>
        ${viewerList}
      </div>
      <aside class="ac-side">
        <h4>ADD PEOPLE</h4>
        ${addSection}
      </aside>
    </div>
  `, session);
}

function renderAddPhotosPage({ album, photos, session }) {
  const grid = photos.length === 0
    ? '<p>All photos are already in this album.</p>'
    : `<div class="photo-grid">${photos.map(p => `
        <div class="photo-card">
          <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}"
            style="width:100%;height:180px;object-fit:cover;display:block">
          <div class="photo-meta">
            <strong>${esc(p.title)}</strong>
            <span class="uploader">by ${esc(p.uploader)}</span>
          </div>
          <div style="padding:0 0.75rem 0.75rem">
            <form method="POST" action="/albums/${album.id}/photos/add">
              <input type="hidden" name="photo_id" value="${p.id}">
              <button class="btn btn-sm" style="width:100%">+ Add</button>
            </form>
          </div>
        </div>`).join('')}
      </div>`;

  return page(`Add photos — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Add photos to <em>${esc(album.title)}</em></h1>
      <div class="row">
        <a class="btn" href="/albums/${album.id}/photos/upload">↑ Upload new photo</a>
        <a class="btn btn-secondary" href="/albums/${album.id}">← Back to album</a>
      </div>
    </div>
    ${grid}
  `, session);
}

function renderUploadToAlbumPage({ album, errorMsg, session }) {
  return page(`Upload — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Upload photo to <em>${esc(album.title)}</em></h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back</a>
    </div>
    <div class="card" style="max-width:520px">
      ${errorMsg ? `<p class="msg-error">${errorMsg}</p>` : ''}
      <form class="form-col" method="POST" action="/albums/${album.id}/photos/upload"
        enctype="multipart/form-data">
        <label>Photo <input type="file" name="photo" accept="image/*" required></label>
        <label>Title <input type="text" name="title" required></label>
        <label>Description <textarea name="description" rows="3"></textarea></label>
        <label>Tags <small>(comma-separated, e.g. Paris, John Doe)</small>
          <input type="text" name="tags" placeholder="Paris, John Doe">
        </label>
        ${singleUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Upload</button>
          <a class="btn btn-secondary" href="/albums/${album.id}">Cancel</a>
        </div>
      </form>
    </div>
  `, session);
}

function renderBatchUploadPage({ album, session }) {
  return page(`Batch upload — ${esc(album.title)}`, `
    <div class="top-bar">
      <h1>Batch upload to <em>${esc(album.title)}</em></h1>
      <a class="btn btn-secondary" href="/albums/${album.id}">← Back</a>
    </div>
    <div class="card" style="max-width:600px">
      <form class="form-col" method="POST" action="/albums/${album.id}/photos/batch"
        enctype="multipart/form-data">
        <label>
          Photos
          <small>Select multiple image files (JPEG, PNG, GIF, WebP · max 10 MB each)</small>
          <input type="file" name="photos" accept="image/*" multiple required>
        </label>
        ${batchUploadFields()}
        <div class="row">
          <button class="btn" type="submit">Upload all</button>
        </div>
      </form>
    </div>
  `, session);
}

module.exports = {
  renderAlbumListPage,
  renderNewAlbumPage,
  renderNewFromFolderPage,
  renderAlbumDetailPage,
  renderAlbumEditPage,
  renderAlbumAccessPage,
  renderAddPhotosPage,
  renderUploadToAlbumPage,
  renderBatchUploadPage,
};
