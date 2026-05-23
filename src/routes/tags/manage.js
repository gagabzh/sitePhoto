const router = require('express').Router();
const { page } = require('../../layout');
const { requireEditor, wrapAsync } = require('../../middleware');
const { buildManageQuery, fetchTagsCsv, fetchManageData } = require('../../repositories/tags');
const { renderManagePage } = require('./manageViews');
const { renderManageScript } = require('./manageScript');

// ── GET /manage — tag admin table ─────────────────────────────────────────────

router.get('/manage', requireEditor, wrapAsync(async (req, res) => {
  const search   = String(req.query.search || '').trim();
  const kind     = ['people','places','years','themes'].includes(req.query.kind) ? req.query.kind : 'all';
  const sort     = ['popularity','alpha','recent','lastUsed'].includes(req.query.sort) ? req.query.sort : 'popularity';
  const pageNum  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const unused   = req.query.unused === '1';
  const dupes    = req.query.dupes  === '1';
  const editId   = parseInt(req.query.edit, 10) || null;
  const PAGE_SIZE = 25;
  const offset   = (pageNum - 1) * PAGE_SIZE;

  if (req.query.export === 'csv') {
    const rows = await fetchTagsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tags.csv"');
    let csv = 'id,name,category,aliases,description,photo_count\n';
    for (const r of rows) {
      const aliases = (r.aliases || []).join('|');
      const desc    = (r.description || '').replace(/"/g, '""');
      csv += `${r.id},"${r.name}","${r.category || ''}","${aliases}","${desc}",${r.photo_count}\n`;
    }
    return res.send(csv);
  }

  const querySpec  = buildManageQuery({ search, kind, sort, unused, dupes, offset, PAGE_SIZE });
  const data       = await fetchManageData(querySpec, editId);
  const totalPages = Math.max(1, Math.ceil(data.totalTags / PAGE_SIZE));

  const html = renderManagePage({ ...data, totalPages, search, kind, sort, pageNum, unused, dupes, PAGE_SIZE })
    + renderManageScript(data.editTag);

  res.send(page('Manage Tags', html, req.session, true));
}));

module.exports = router;
