const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');
const { deletePhotos } = require('../uploadHelpers');
const { readPhotoBuffer } = require('../storage');
const { findDuplicates } = require('../photoHash');
const { wrapAsync } = require('../middleware');
const errors = require('../utils/errors');

// ── GET /admin/ai ─────────────────────────────────────────────────────────────
router.get('/', wrapAsync(async (req, res) => {
  const storedGroups = req.session.duplicateGroups || null;
  const scanned = req.session.duplicateScannedAt
    ? new Date(req.session.duplicateScannedAt).toLocaleString('en-GB')
    : null;

  let groups = null;
  if (storedGroups !== null) {
    // Re-fetch photo data from DB; filter out deleted photos
    const allIds = storedGroups.flat();
    let photoMap = {};
    if (allIds.length > 0) {
      const { rows } = await db.query(
        'SELECT id, filename, title FROM photos WHERE id = ANY($1)',
        [allIds]
      );
      photoMap = Object.fromEntries(rows.map(r => [r.id, r]));
    }
    groups = storedGroups
      .map(g => g.map(id => photoMap[id]).filter(Boolean))
      .filter(g => g.length >= 2);
  }

  const resultsHtml = groups === null ? '' : groups.length === 0
    ? `<p class="msg-ok" style="margin-top:1.5rem">No duplicates found.</p>`
    : groups.map((group, gi) => `
        <div class="card" style="margin-bottom:1.5rem">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
            <strong style="font-size:0.95rem">${group.length} similar photos</strong>
            <form method="POST" action="/admin/ai/dismiss" style="margin:0">
              <input type="hidden" name="groupIndex" value="${gi}">
              <button class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.75rem">Dismiss</button>
            </form>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:1rem">
            ${group.map(p => `
              <div style="text-align:center;max-width:160px">
                <a href="/photos/${p.id}" target="_blank">
                  <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}"
                    style="width:140px;height:105px;object-fit:cover;border-radius:6px;border:1.5px solid var(--paper-2)">
                </a>
                <p style="margin:0.35rem 0 0.25rem;font-size:0.8rem;word-break:break-word">${esc(p.title)}</p>
                <form method="POST" action="/admin/ai/delete" style="margin:0"
                  onsubmit="return confirm('Permanently delete this photo?')">
                  <input type="hidden" name="groupIndex" value="${gi}">
                  <input type="hidden" name="photoId" value="${p.id}">
                  <button class="btn btn-danger" style="font-size:0.75rem;padding:0.2rem 0.6rem">Delete</button>
                </form>
              </div>`).join('')}
          </div>
        </div>`).join('');

  res.send(page('AI Tools — Admin', `
    <div style="max-width:860px;margin:0 auto">
      <h1>AI Tools</h1>

      <section class="card" style="margin-bottom:2rem">
        <h2 style="margin-top:0;font-size:1.1rem">Duplicate detection</h2>
        <p style="color:var(--ink-soft);font-size:0.9rem">
          Scans all photos using a perceptual hash (dHash). Photos with a hash
          distance ≤ 10 are grouped as potential duplicates. Review each group
          and delete unwanted copies — deletion is permanent.
        </p>
        <form method="POST" action="/admin/ai/scan"
          onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Scanning…'">
          <button class="btn">Scan for duplicates</button>
        </form>
        ${scanned ? `<p style="margin-top:0.75rem;font-size:0.8rem;color:var(--ink-faint)">Last scan: ${scanned}</p>` : ''}
      </section>

      ${resultsHtml ? `<section><h2 style="font-size:1.1rem">Results</h2>${resultsHtml}</section>` : ''}
    </div>
  `, req.session));
}));

// ── POST /admin/ai/scan ───────────────────────────────────────────────────────
router.post('/scan', wrapAsync(async (req, res) => {
  const { rows } = await db.query('SELECT id, filename, title FROM photos ORDER BY id');
  const groups = await findDuplicates(rows, readPhotoBuffer);

  // Store only IDs to avoid unbounded session payload growth
  req.session.duplicateGroups = groups.map(g => g.map(p => p.id));
  req.session.duplicateScannedAt = new Date().toISOString();
  res.redirect('/admin/ai');
}));

// ── POST /admin/ai/delete ─────────────────────────────────────────────────────
router.post('/delete', wrapAsync(async (req, res) => {
  const gi = parseInt(req.body.groupIndex, 10);
  const photoId = parseInt(req.body.photoId, 10);
  if (!Number.isInteger(gi) || !Number.isInteger(photoId)) return errors.badRequest(res, 'Invalid params', false);

  const groups = req.session.duplicateGroups;
  if (!groups || !groups[gi]) return res.redirect('/admin/ai');

  await deletePhotos([photoId]);

  // Groups are arrays of IDs; remove deleted ID, drop group if only one remains
  groups[gi] = groups[gi].filter(id => id !== photoId);
  if (groups[gi].length < 2) groups.splice(gi, 1);
  req.session.duplicateGroups = groups;

  res.redirect('/admin/ai');
}));

// ── POST /admin/ai/dismiss ────────────────────────────────────────────────────
router.post('/dismiss', (req, res) => {
  const gi = parseInt(req.body.groupIndex, 10);
  if (!Number.isInteger(gi)) return errors.badRequest(res, 'Invalid params', false);

  const groups = req.session.duplicateGroups;
  if (groups && groups[gi]) {
    groups.splice(gi, 1);
    req.session.duplicateGroups = groups;
  }
  res.redirect('/admin/ai');
});

module.exports = router;
