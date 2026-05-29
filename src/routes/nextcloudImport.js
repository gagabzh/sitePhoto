'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { requireEditor, wrapAsync } = require('../middleware');
const { page } = require('../layout');
const db = require('../db');
const { addNextcloudImportJob } = require('../queue/producer');
const { isValidNextcloudShareUrl, propfindShare } = require('../nextcloudWebdav');

// Rate limit: 10 preview requests per 5 minutes per user.
// The route is always behind requireEditor so userId is always set;
// using userId as key avoids the express-rate-limit IPv6 fallback warning.
const previewLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  // userId is guaranteed to be set by requireAuth/requireEditor before this runs
  keyGenerator: (req) => `user:${req.session.userId}`,
  handler: (req, res) => res.status(429).json({ error: 'Too many preview requests — try again in a few minutes.' }),
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  // Suppress the IPv6 fallback validation — key is always a userId string, not an IP
  validate: { xForwardedForHeader: false },
});

const MAX_FILES = 500;

function renderImportPage(session) {
  return page('Import from Nextcloud', `
    <div class="top-bar">
      <h1>Import from Nextcloud</h1>
      <a class="btn btn-secondary" href="/photos">← Back</a>
    </div>
    <div class="card" style="max-width:600px" id="nc-import-card">
      <p style="font-family:var(--mono);font-size:0.8rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:2px;margin-bottom:1.25rem">Step 1 — Locate folder</p>
      <div class="form-col" id="nc-step1">
        <label>Nextcloud folder share link
          <input type="url" id="nc-url" placeholder="https://cloud.example.com/s/abc123" style="width:100%">
        </label>
        <p id="nc-error" style="color:var(--accent);font-size:0.875rem;display:none"></p>
        <div class="row">
          <button class="btn" id="nc-preview-btn" type="button">Preview</button>
          <a class="btn btn-secondary" href="/photos">Cancel</a>
        </div>
      </div>
      <div id="nc-step2" style="display:none">
        <p style="font-family:var(--mono);font-size:0.8rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:2px;margin:1.25rem 0">Step 2 — Options</p>
        <div id="nc-preview-summary" style="background:var(--paper-2);border:1.5px solid var(--ink);padding:0.75rem 1rem;margin-bottom:1rem;font-family:var(--hand-tight)"></div>
        <div class="form-col">
          <label>Tags <small>(optional, comma-separated)</small>
            <input type="text" id="nc-tags" placeholder="Paris, Vacation">
          </label>
          <label>Place <small>(optional)</small>
            <input type="text" id="nc-place" placeholder="Paris, France">
          </label>
          <label>Album name <small>(optional — creates a new album)</small>
            <input type="text" id="nc-album" placeholder="Summer 2024">
          </label>
          <p id="nc-confirm-error" style="color:var(--accent);font-size:0.875rem;display:none"></p>
          <div class="row">
            <button class="btn" id="nc-start-btn" type="button" disabled>Start import</button>
            <button class="btn btn-secondary" id="nc-back-btn" type="button">← Back</button>
          </div>
        </div>
      </div>
    </div>
    ${importFormScript()}
  `, session);
}

function importFormScript() {
  return `<script>
(function() {
  var csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
  var previewBtn = document.getElementById('nc-preview-btn');
  var startBtn   = document.getElementById('nc-start-btn');
  var backBtn    = document.getElementById('nc-back-btn');
  var step1      = document.getElementById('nc-step1');
  var step2      = document.getElementById('nc-step2');
  var urlInput   = document.getElementById('nc-url');
  var errorEl    = document.getElementById('nc-error');
  var confirmErr = document.getElementById('nc-confirm-error');
  var summaryEl  = document.getElementById('nc-preview-summary');

  function showError(el, msg) { el.textContent = msg; el.style.display = 'block'; }
  function hideError(el) { el.style.display = 'none'; }

  previewBtn.addEventListener('click', function() {
    var url = urlInput.value.trim();
    hideError(errorEl);
    if (!url) { showError(errorEl, 'Please enter a Nextcloud folder share link.'); return; }
    previewBtn.disabled = true;
    previewBtn.textContent = 'Checking…';
    fetch('/photos/nextcloud-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ shareUrl: url }),
    })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        previewBtn.disabled = false; previewBtn.textContent = 'Preview';
        if (!res.ok) { showError(errorEl, res.data.error || 'Could not reach Nextcloud.'); return; }
        var files = res.data.files, total = res.data.total;
        if (total === 0) { showError(errorEl, 'No photos found in this folder.'); return; }
        var shown = files.slice(0, 20);
        var more  = total > 20 ? ' (and ' + (total - 20) + ' more)' : '';
        summaryEl.innerHTML = '<strong>Found ' + total + ' photo' + (total !== 1 ? 's' : '') + ' in this folder' + more + '.</strong>'
          + '<ul style="margin:0.5rem 0 0;padding-left:1.25rem;max-height:180px;overflow-y:auto">'
          + shown.map(function(f) {
              return '<li style="font-size:0.85rem">' + f.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                + ' <span style="color:var(--ink-faint)">(' + (f.size ? (f.size/1024).toFixed(0) + ' KB' : '?') + ')</span></li>';
            }).join('') + '</ul>';
        step1.style.display = 'none'; step2.style.display = 'block'; startBtn.disabled = false;
      })
      .catch(function() {
        previewBtn.disabled = false; previewBtn.textContent = 'Preview';
        showError(errorEl, 'Could not reach Nextcloud. Try again.');
      });
  });

  backBtn.addEventListener('click', function() {
    step2.style.display = 'none'; step1.style.display = 'block';
    startBtn.disabled = true; hideError(confirmErr);
  });

  startBtn.addEventListener('click', function() {
    hideError(confirmErr);
    var tags = document.getElementById('nc-tags').value.trim();
    var place = document.getElementById('nc-place').value.trim();
    var albumName = document.getElementById('nc-album').value.trim();
    var tagList = tags ? tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
    startBtn.disabled = true; startBtn.textContent = 'Starting…';
    fetch('/photos/nextcloud-import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ shareUrl: urlInput.value.trim(), tags: tagList, place: place || null, albumName: albumName || null }),
    })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        startBtn.disabled = false; startBtn.textContent = 'Start import';
        if (!res.ok) { showError(confirmErr, res.data.error || 'Import failed. Try again.'); return; }
        window.location.href = '/photos';
      })
      .catch(function() {
        startBtn.disabled = false; startBtn.textContent = 'Start import';
        showError(confirmErr, 'Could not start import. Try again.');
      });
  });
})();
</script>`;
}

// GET /photos/nextcloud-import — import form page
router.get('/', requireEditor, (req, res) => {
  res.send(renderImportPage(req.session));
});

// POST /photos/nextcloud-import — preview: PROPFIND and return file list
router.post('/', requireEditor, previewLimiter, wrapAsync(async (req, res) => {
  const shareUrl = (req.body.shareUrl || '').trim();

  if (!isValidNextcloudShareUrl(shareUrl)) {
    return res.status(422).json({ error: 'Not a valid Nextcloud folder share link.' });
  }

  let files;
  try {
    files = await propfindShare(shareUrl);
  } catch (err) {
    const status = err.httpStatus || 502;
    return res.status(status).json({ error: err.message });
  }

  if (files.length > MAX_FILES) {
    return res.status(422).json({ error: `Folder contains too many photos (max ${MAX_FILES}). Split the folder and re-import.` });
  }

  return res.json({ files, total: files.length });
}));

// POST /photos/nextcloud-import/confirm — start the actual import
router.post('/confirm', requireEditor, wrapAsync(async (req, res) => {
  const shareUrl  = (req.body.shareUrl  || '').trim();
  const tags      = Array.isArray(req.body.tags) ? req.body.tags.map(String) : [];
  const place     = req.body.place     ? String(req.body.place).trim()     : null;
  const albumName = req.body.albumName ? String(req.body.albumName).trim() : null;

  if (!isValidNextcloudShareUrl(shareUrl)) {
    return res.status(422).json({ error: 'Not a valid Nextcloud folder share link.' });
  }

  // Re-run PROPFIND (folder contents may have changed since preview)
  let files;
  try {
    files = await propfindShare(shareUrl);
  } catch (err) {
    const status = err.httpStatus || 502;
    return res.status(status).json({ error: err.message });
  }

  if (files.length > MAX_FILES) {
    return res.status(422).json({ error: `Folder contains too many photos (max ${MAX_FILES}). Split the folder and re-import.` });
  }

  if (files.length === 0) {
    return res.status(422).json({ error: 'No photos found in this folder.' });
  }

  const userId = req.session.userId;

  // Create album if requested
  let albumId = null;
  if (albumName) {
    const existing = await db.query(
      'SELECT id FROM albums WHERE user_id = $1 AND title = $2',
      [userId, albumName],
    );
    if (existing.rows.length > 0) {
      return res.status(422).json({ error: 'An album with this name already exists.' });
    }
    const { rows: [newAlbum] } = await db.query(
      'INSERT INTO albums (user_id, title) VALUES ($1, $2) RETURNING id',
      [userId, albumName],
    );
    albumId = newAlbum.id;
  }

  // Insert the import tracking row BEFORE enqueueing jobs
  const { rows: [importRow] } = await db.query(
    'INSERT INTO nextcloud_imports (user_id, share_url, total) VALUES ($1, $2, $3) RETURNING id',
    [userId, shareUrl, files.length],
  );
  const importId = importRow.id;

  // Enqueue one job per image file
  for (const file of files) {
    await addNextcloudImportJob({
      shareUrl,
      fileName: file.name,
      mimeType: file.mimeType,
      userId,
      tags,
      place,
      albumId,
      importId,
    });
  }

  return res.json({ importId, total: files.length });
}));

// GET /photos/nextcloud-import/:importId — status poll for page-reload recovery
router.get('/:importId', requireEditor, wrapAsync(async (req, res) => {
  const importId = parseInt(req.params.importId, 10);
  if (!Number.isFinite(importId)) return res.status(400).json({ error: 'Invalid importId' });

  const { rows } = await db.query(
    'SELECT id, total, done, failed FROM nextcloud_imports WHERE id = $1 AND user_id = $2',
    [importId, req.session.userId],
  );
  if (!rows.length) return res.status(404).json({ error: 'Import not found' });

  return res.json(rows[0]);
}));

module.exports = router;
