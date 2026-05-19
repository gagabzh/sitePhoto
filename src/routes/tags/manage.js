const router = require('express').Router();
const db = require('../../db');
const { page, esc } = require('../../layout');
const { requireEditor } = require('../../middleware');

// ── GET /manage — tag admin table ─────────────────────────────────────────────

router.get('/manage', requireEditor, async (req, res) => {
  const search  = String(req.query.search || '').trim();
  const kind    = ['people','places','years','themes'].includes(req.query.kind) ? req.query.kind : 'all';
  const sort    = ['popularity','alpha','recent','lastUsed'].includes(req.query.sort) ? req.query.sort : 'popularity';
  const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
  const unused  = req.query.unused === '1';
  const dupes   = req.query.dupes  === '1';
  const editId  = parseInt(req.query.edit, 10) || null;
  const PAGE_SIZE = 25;
  const offset  = (pageNum - 1) * PAGE_SIZE;

  // ── CSV export ───────────────────────────────────────────────────────────────
  if (req.query.export === 'csv') {
    const { rows } = await db.query(`
      SELECT t.id, t.name, t.category, t.aliases, t.description,
        COUNT(DISTINCT pt.photo_id)::int AS photo_count
      FROM tags t
      LEFT JOIN photo_tags pt ON pt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name
    `);
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

  // ── Build dynamic WHERE ──────────────────────────────────────────────────────
  const conditions = [];
  const vals = [];
  if (search) {
    vals.push('%' + search.toLowerCase() + '%');
    conditions.push(`(lower(t.name) LIKE $${vals.length} OR lower(t.aliases::text) LIKE $${vals.length})`);
  }
  if (kind !== 'all') {
    vals.push(kind);
    conditions.push(`t.category = $${vals.length}`);
  }
  if (unused) {
    conditions.push(`NOT EXISTS (SELECT 1 FROM photo_tags pt2 WHERE pt2.tag_id = t.id)`);
  }
  if (dupes) {
    conditions.push(`EXISTS (
      SELECT 1 FROM tags t2
      WHERE t2.id != t.id
        AND left(lower(t.name),4) = left(lower(t2.name),4)
        AND length(t.name) >= 3 AND length(t2.name) >= 3
    )`);
  }
  const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const orderMap = {
    popularity: 'COUNT(DISTINCT pt.photo_id) DESC, t.name',
    alpha:      't.name',
    recent:     'MAX(COALESCE(p.taken_at::timestamp, p.created_at)) DESC NULLS LAST',
    lastUsed:   'MAX(COALESCE(p.taken_at::timestamp, p.created_at)) DESC NULLS LAST',
  };
  const orderClause = orderMap[sort] || orderMap.popularity;

  const mainSql = `
    SELECT t.id, t.name, t.category, t.aliases, t.description,
      COUNT(DISTINCT pt.photo_id)::int AS photo_count,
      MAX(COALESCE(p.taken_at::timestamp, p.created_at)) AS last_used,
      COUNT(DISTINCT p.user_id)::int AS contributor_count,
      ARRAY_AGG(DISTINCT u.name) FILTER (WHERE u.name IS NOT NULL) AS contributors,
      (SELECT ph.filename FROM photos ph JOIN photo_tags pt2 ON ph.id = pt2.photo_id
       WHERE pt2.tag_id = t.id ORDER BY ph.created_at DESC LIMIT 1) AS cover_filename
    FROM tags t
    LEFT JOIN photo_tags pt ON pt.tag_id = t.id
    LEFT JOIN photos p ON p.id = pt.photo_id
    LEFT JOIN users u ON u.id = p.user_id
    ${whereClause}
    GROUP BY t.id
    ORDER BY ${orderClause}
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS cnt
    FROM tags t
    ${whereClause}
  `;

  const statsSql = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.category = 'people')::int AS people,
      COUNT(*) FILTER (WHERE t.category = 'places')::int AS places,
      COUNT(*) FILTER (WHERE t.category = 'years')::int  AS years,
      COUNT(*) FILTER (WHERE t.category = 'themes')::int AS themes
    FROM tags t
  `;

  const unusedSql = `
    SELECT COUNT(*)::int AS cnt
    FROM tags t
    WHERE NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.tag_id = t.id)
  `;

  const dupesSql = `
    SELECT COUNT(DISTINCT t1.id)::int AS cnt
    FROM tags t1 JOIN tags t2 ON t1.id < t2.id
    WHERE left(lower(t1.name),4) = left(lower(t2.name),4)
      AND length(t1.name) >= 3 AND length(t2.name) >= 3
  `;

  const [tagsResult, countResult, statsResult, unusedResult, dupesResult, editResult] = await Promise.all([
    db.query(mainSql, vals),
    db.query(countSql, vals),
    db.query(statsSql),
    db.query(unusedSql),
    db.query(dupesSql),
    editId ? db.query('SELECT id, name, category, aliases, description FROM tags WHERE id = $1', [editId]) : Promise.resolve({ rows: [] }),
  ]);

  const tags       = tagsResult.rows;
  const totalTags  = countResult.rows[0].cnt;
  const stats      = statsResult.rows[0];
  const unusedCnt  = unusedResult.rows[0].cnt;
  const dupesCnt   = dupesResult.rows[0].cnt;
  const totalPages = Math.max(1, Math.ceil(totalTags / PAGE_SIZE));
  const editTag    = editResult.rows[0] || null;

  // ── Helper: build URL with one param changed ─────────────────────────────────
  function buildUrl(overrides) {
    const params = {
      ...(search  ? { search } : {}),
      ...(kind    !== 'all'         ? { kind }  : {}),
      ...(sort    !== 'popularity'  ? { sort }  : {}),
      ...(pageNum > 1               ? { page: pageNum } : {}),
      ...(unused  ? { unused: '1' } : {}),
      ...(dupes   ? { dupes:  '1' } : {}),
    };
    Object.assign(params, overrides);
    // Remove falsy/default values
    if (params.page === 1) delete params.page;
    if (params.kind === 'all') delete params.kind;
    if (params.sort === 'popularity') delete params.sort;
    if (params.unused === '0' || !params.unused) delete params.unused;
    if (params.dupes  === '0' || !params.dupes)  delete params.dupes;
    if (!params.search) delete params.search;
    const qs = new URLSearchParams(params).toString();
    return '/tags/manage' + (qs ? '?' + qs : '');
  }

  // ── Helper: relative time ────────────────────────────────────────────────────
  function relTime(d) {
    if (!d) return 'never';
    const now  = Date.now();
    const diff = now - new Date(d).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30)  return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return new Date(d).getFullYear().toString();
  }

  // ── Render rows ──────────────────────────────────────────────────────────────
  function renderRows() {
    if (!tags.length) {
      return `<tr><td colspan="8" style="padding:40px;text-align:center;font-family:'Caveat',cursive;font-size:22px;color:var(--ink-faint);">
        ${search ? `no tags match '${esc(search)}'.` : 'no tags yet. start tagging photos and they\'ll show up here.'}
      </td></tr>`;
    }
    return tags.map(t => {
      const catCls = t.category || 'themes';
      const catLbl = t.category ? t.category.charAt(0).toUpperCase() + t.category.slice(1) : '—';
      const cover = t.cover_filename
        ? `<img class="tm-cover" src="/uploads/${esc(t.cover_filename)}" alt="">`
        : `<div class="tm-cover"></div>`;
      const aliases = (t.aliases || []).length
        ? `<span class="tm-alias">${esc((t.aliases || []).join(', '))}</span>`
        : '';
      const kindChip = t.category
        ? `<span class="tm-kchip ${catCls}">${esc(catLbl)}</span>`
        : `<span class="tm-kchip themes">—</span>`;
      const contribs = (t.contributors || []).slice(0, 3).map((n, i) => {
        const init = (n || '?')[0].toUpperCase();
        return `<span class="tm-av" title="${esc(n)}">${esc(init)}</span>`;
      }).join('') + (t.contributor_count > 3 ? `<span class="tm-av">+${t.contributor_count - 3}</span>` : '');
      const unusedCls = t.photo_count === 0 ? ' unused' : '';
      const editUrl   = buildUrl({ edit: t.id, page: pageNum });
      return `<tr data-id="${t.id}"${unusedCls ? ' class="unused"' : ''}>
        <td><input class="tm-ck" type="checkbox" data-id="${t.id}" aria-label="Select ${esc(t.name)}"></td>
        <td>${cover}</td>
        <td>
          <span class="tm-name" data-edit="${t.id}"><span class="hash">#</span>${esc(t.name)}</span>
          ${aliases}
        </td>
        <td>${kindChip}</td>
        <td class="tm-mono">${t.photo_count}</td>
        <td><div class="tm-avstack">${contribs}</div></td>
        <td class="tm-mono" style="font-size:11px">${relTime(t.last_used)}</td>
        <td>
          <div class="tm-row-actions">
            <button class="tm-act" data-edit="${t.id}" title="Edit">✎</button>
            <button class="tm-act danger" data-del="${t.id}" data-name="${esc(t.name)}" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Render pagination ────────────────────────────────────────────────────────
  function renderPager() {
    const prevDisabled = pageNum <= 1;
    const nextDisabled = pageNum >= totalPages;
    const start = offset + 1;
    const end   = Math.min(offset + PAGE_SIZE, totalTags);
    let btns = '';
    // Show up to 7 page buttons
    const range = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
    } else {
      range.push(1);
      if (pageNum > 3) range.push('…');
      for (let i = Math.max(2, pageNum - 1); i <= Math.min(totalPages - 1, pageNum + 1); i++) range.push(i);
      if (pageNum < totalPages - 2) range.push('…');
      range.push(totalPages);
    }
    btns += `<a href="${buildUrl({ page: Math.max(1, pageNum - 1) })}" class="${prevDisabled ? 'disabled' : ''}">‹</a>`;
    for (const p of range) {
      if (p === '…') btns += `<a class="disabled">…</a>`;
      else btns += `<a href="${buildUrl({ page: p })}" class="${p === pageNum ? 'on' : ''}">${p}</a>`;
    }
    btns += `<a href="${buildUrl({ page: Math.min(totalPages, pageNum + 1) })}" class="${nextDisabled ? 'disabled' : ''}">›</a>`;
    return `<div class="tm-pager">
      <span>// showing ${start}–${end} of ${totalTags}</span>
      <div class="tm-pager-btns">${btns}</div>
      <span>page ${pageNum} of ${totalPages}</span>
    </div>`;
  }

  // ── Render drawer ────────────────────────────────────────────────────────────
  function renderDrawer() {
    const open = editTag ? ' open' : '';
    const t = editTag || {};
    const aliasList = (t.aliases || []).map(a =>
      `<span class="tm-alias-pill">${esc(a)}<button type="button" class="tm-alias-rm" data-alias="${esc(a)}" aria-label="Remove alias">×</button></span>`
    ).join('');
    return `<div class="tm-drawer${open}" id="tm-drawer" data-id="${t.id || ''}">
      <button class="tm-drawer-close" id="tm-drawer-close" aria-label="Close">×</button>
      <h3><span class="hash">#</span><span id="tm-dr-title">${esc(t.name || '')}</span></h3>
      <div class="df">
        <label>NAME</label>
        <input type="text" id="tm-dr-name" value="${esc(t.name || '')}" maxlength="100" autocomplete="off">
      </div>
      <div class="df">
        <label>KIND</label>
        <select id="tm-dr-kind">
          <option value="" ${!t.category ? 'selected' : ''}>— none —</option>
          <option value="people" ${t.category === 'people' ? 'selected' : ''}>people</option>
          <option value="places" ${t.category === 'places' ? 'selected' : ''}>places</option>
          <option value="years"  ${t.category === 'years'  ? 'selected' : ''}>years</option>
          <option value="themes" ${t.category === 'themes' ? 'selected' : ''}>themes</option>
        </select>
      </div>
      <div class="df">
        <label>ALIASES</label>
        <div class="tm-alias-pills" id="tm-alias-pills">${aliasList}
          <button type="button" class="tm-alias-add" id="tm-alias-add">+ add</button>
        </div>
        <input type="text" id="tm-alias-input" placeholder="new alias…" style="display:none;margin-top:6px" maxlength="100">
      </div>
      <div class="df">
        <label>DESCRIPTION</label>
        <textarea id="tm-dr-desc" rows="3" maxlength="500" placeholder="optional description…">${esc(t.description || '')}</textarea>
      </div>
      <button class="btn btn-primary" id="tm-dr-save" style="margin-top:auto;">save</button>
      <div class="tm-dz">
        <h4>DANGER ZONE</h4>
        <button class="tm-dz-btn" id="tm-dr-delete">🗑 delete this tag</button>
      </div>
    </div>`;
  }

  // ── Render merge modal ────────────────────────────────────────────────────────
  const mergeModal = `<div id="tm-merge-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;align-items:center;justify-content:center;">
    <div style="background:var(--paper);border:2px solid var(--ink);padding:24px;max-width:420px;width:90%;box-shadow:6px 6px 0 var(--ink);">
      <h3 style="font-family:'Caveat',cursive;font-size:28px;margin:0 0 12px;">merge tags</h3>
      <p style="font-family:'Kalam',cursive;font-size:14px;margin:0 0 14px;color:var(--ink-soft);">choose the canonical name to keep. the others will be removed and all photos re-pointed.</p>
      <div id="tm-merge-options" style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;"></div>
      <div style="display:flex;gap:8px;">
        <button id="tm-merge-cancel" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 14px;border:1.5px solid var(--ink);background:var(--paper);cursor:pointer;">cancel</button>
        <button id="tm-merge-confirm" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 14px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;">↳ merge</button>
      </div>
    </div>
  </div>`;

  // ── Render new-tag modal ──────────────────────────────────────────────────────
  const newTagModal = `<div id="tm-new-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;align-items:center;justify-content:center;">
    <div style="background:var(--paper);border:2px solid var(--ink);padding:24px;max-width:380px;width:90%;box-shadow:6px 6px 0 var(--ink);">
      <h3 style="font-family:'Caveat',cursive;font-size:28px;margin:0 0 16px;">new tag</h3>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
        <label style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;color:var(--ink-faint);">NAME</label>
        <input id="tm-new-name" type="text" maxlength="100" autocomplete="off" style="font-family:'Kalam',cursive;font-size:14px;padding:6px 10px;border:1.5px solid var(--ink);background:var(--paper);outline:none;">
        <label style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;color:var(--ink-faint);">KIND</label>
        <select id="tm-new-kind" style="font-family:'Kalam',cursive;font-size:14px;padding:6px 10px;border:1.5px solid var(--ink);background:var(--paper);outline:none;">
          <option value="">— none —</option>
          <option value="people">people</option>
          <option value="places">places</option>
          <option value="years">years</option>
          <option value="themes">themes</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="tm-new-cancel" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 14px;border:1.5px solid var(--ink);background:var(--paper);cursor:pointer;">cancel</button>
        <button id="tm-new-save" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 14px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;">+ create</button>
      </div>
    </div>
  </div>`;

  // ── Toolbar kind/sort link helpers ────────────────────────────────────────────
  const kindLinks = ['all','people','places','years','themes'].map(k =>
    `<a href="${buildUrl({ kind: k, page: 1 })}" class="${kind === k ? 'on' : ''}">${k}</a>`
  ).join('');
  const sortLinks = [['popularity','popularity'],['alpha','a → z'],['recent','most recent'],['lastUsed','last used']].map(([v, lbl]) =>
    `<a href="${buildUrl({ sort: v, page: 1 })}" class="${sort === v ? 'on' : ''}">${lbl}</a>`
  ).join('');
  const unusedToggleUrl = buildUrl({ unused: unused ? '0' : '1', page: 1 });
  const dupesToggleUrl  = buildUrl({ dupes:  dupes  ? '0' : '1', page: 1 });

  const body = `<div class="tm-page">
    <div style="padding:24px 20px 16px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;border-bottom:1.5px dashed var(--ink-faint);">
      <div>
        <h1 style="font-family:'Caveat',cursive;font-size:48px;font-weight:700;margin:0;line-height:1;">manage <em style="color:var(--accent);font-style:italic;">tags.</em></h1>
        <p style="font-family:'Kalam',cursive;font-size:14px;color:var(--ink-soft);margin:6px 0 0;">${stats.total} tags across your archive. keep it tidy.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <a href="/tags/manage?export=csv" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 12px;border:1.5px solid var(--ink);background:var(--paper);text-decoration:none;color:var(--ink);">↓ export csv</a>
        <button id="tm-new-btn" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 12px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;">+ new tag</button>
      </div>
    </div>

    <div class="tm-stats">
      <div class="tm-stat">
        <div class="num">${stats.total}</div>
        <div class="lbl">TOTAL TAGS</div>
      </div>
      <div class="tm-stat">
        <div class="num">${stats.people}<span style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--ink-faint);"> / </span>${stats.places}<span style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--ink-faint);"> / </span>${stats.years}<span style="font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--ink-faint);"> / </span>${stats.themes}</div>
        <div class="lbl">PEOPLE / PLACES / YEARS / THEMES</div>
      </div>
      <div class="tm-stat">
        <div class="num"><em>${unusedCnt}</em></div>
        <div class="lbl">UNUSED TAGS</div>
      </div>
      <div class="tm-stat">
        <div class="num"><em>${dupesCnt}</em></div>
        <div class="lbl">SUSPECTED DUPLICATES</div>
      </div>
    </div>

    <div class="tm-toolbar">
      <form method="GET" action="/tags/manage" style="display:contents">
        ${kind !== 'all' ? `<input type="hidden" name="kind" value="${esc(kind)}">` : ''}
        ${sort !== 'popularity' ? `<input type="hidden" name="sort" value="${esc(sort)}">` : ''}
        ${unused ? `<input type="hidden" name="unused" value="1">` : ''}
        ${dupes  ? `<input type="hidden" name="dupes"  value="1">` : ''}
        <input class="tm-search" type="text" name="search" value="${esc(search)}" placeholder="find a tag — try 'pe' or 'noel'…" autocomplete="off">
      </form>
      <span class="tl">KIND</span>
      <div class="tm-seg">${kindLinks}</div>
      <span class="tl">FILTER</span>
      <a href="${unusedToggleUrl}" class="tm-pill-toggle${unused ? ' on' : ''}">unused only</a>
      <a href="${dupesToggleUrl}"  class="tm-pill-toggle${dupes  ? ' on' : ''}">show duplicates ⚠</a>
      <span class="tl">SORT</span>
      <div class="tm-seg">${sortLinks}</div>
    </div>

    <div class="tm-bulk" id="tm-bulk">
      <span class="sel-count"><em id="tm-sel-n">0</em> selected</span>
      <button class="tm-bulk-btn" id="tm-bulk-merge">↳ merge into one</button>
      <button class="tm-bulk-btn danger" id="tm-bulk-delete">🗑 delete</button>
      <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-faint);">esc to clear</span>
    </div>

    <table class="tm-table">
      <thead>
        <tr>
          <th><input class="tm-ck" type="checkbox" id="tm-ck-all" aria-label="Select all"></th>
          <th></th>
          <th>TAG</th>
          <th>KIND</th>
          <th>PHOTOS</th>
          <th>CONTRIBUTORS</th>
          <th>LAST USED</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tm-tbody">
        ${renderRows()}
      </tbody>
    </table>

    ${totalTags > PAGE_SIZE ? renderPager() : ''}

    <div id="tm-backdrop" class="tm-backdrop"></div>
    ${renderDrawer()}
    <div class="tm-toast" id="tm-toast">saved ✓</div>
    ${mergeModal}
    ${newTagModal}
  </div>

  <script>(function(){
    var selectedIds = new Set();

    function e(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function showToast(msg){
      var t=document.getElementById('tm-toast');
      t.textContent=msg||'saved ✓';
      t.classList.add('show');
      setTimeout(function(){t.classList.remove('show');},2000);
    }

    function updateBulkBar(){
      var bar=document.getElementById('tm-bulk');
      var n=document.getElementById('tm-sel-n');
      if(n) n.textContent=selectedIds.size;
      if(bar) bar.classList.toggle('show', selectedIds.size>0);
    }

    // Checkbox selection
    document.querySelectorAll('.tm-ck[data-id]').forEach(function(ck){
      ck.addEventListener('change',function(){
        if(this.checked) selectedIds.add(String(this.dataset.id));
        else selectedIds.delete(String(this.dataset.id));
        var row=this.closest('tr');
        if(row) row.classList.toggle('sel',this.checked);
        updateBulkBar();
      });
    });

    var ckAll=document.getElementById('tm-ck-all');
    if(ckAll){
      ckAll.addEventListener('change',function(){
        document.querySelectorAll('.tm-ck[data-id]').forEach(function(ck){
          ck.checked=ckAll.checked;
          var row=ck.closest('tr');
          if(row) row.classList.toggle('sel',ckAll.checked);
          if(ckAll.checked) selectedIds.add(String(ck.dataset.id));
          else selectedIds.delete(String(ck.dataset.id));
        });
        updateBulkBar();
      });
    }

    document.addEventListener('keydown',function(ev){
      if(ev.key==='Escape'){
        selectedIds.clear();
        document.querySelectorAll('.tm-ck[data-id]').forEach(function(ck){ck.checked=false;ck.closest('tr')&&ck.closest('tr').classList.remove('sel');});
        if(ckAll) ckAll.checked=false;
        updateBulkBar();
        closeDrawer();
      }
    });

    // ── Drawer ────────────────────────────────────────────────────────────────
    var drawer=document.getElementById('tm-drawer');
    var drawerClose=document.getElementById('tm-drawer-close');
    var backdrop=document.getElementById('tm-backdrop');

    function openDrawer(id){
      if(!drawer) return;
      var url=new URL(window.location.href);
      url.searchParams.set('edit',id);
      history.replaceState(null,'',url.toString());
      fetch('/api/tags/'+id+'/detail').then(function(r){return r.json();}).then(function(t){
        drawer.dataset.id=t.id;
        var titleEl=document.getElementById('tm-dr-title');
        var nameEl=document.getElementById('tm-dr-name');
        var kindEl=document.getElementById('tm-dr-kind');
        var descEl=document.getElementById('tm-dr-desc');
        if(titleEl) titleEl.textContent='#'+t.name;
        if(nameEl)  nameEl.value=t.name;
        if(kindEl)  kindEl.value=t.category||'';
        if(descEl)  descEl.value=t.description||'';
        renderAliasPills(t.aliases||[]);
        drawer.classList.add('open');
        if(backdrop) backdrop.classList.add('show');
      }).catch(function(){
        drawer.classList.add('open');
        if(backdrop) backdrop.classList.add('show');
      });
    }

    function closeDrawer(){
      if(!drawer) return;
      drawer.classList.remove('open');
      if(backdrop) backdrop.classList.remove('show');
      var url=new URL(window.location.href);
      url.searchParams.delete('edit');
      history.replaceState(null,'',url.toString());
    }

    if(drawerClose) drawerClose.addEventListener('click', closeDrawer);
    if(backdrop) backdrop.addEventListener('click', closeDrawer);

    var saveBtn=document.getElementById('tm-dr-save');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      doSave().then(function(){ location.reload(); });
    });

    // Open drawer from row
    document.querySelectorAll('[data-edit]').forEach(function(el){
      el.addEventListener('click',function(ev){
        ev.preventDefault();
        openDrawer(this.dataset.edit);
      });
    });

    function doSave(){
      var id=drawer&&drawer.dataset.id;
      if(!id) return;
      var nameEl=document.getElementById('tm-dr-name');
      var kindEl=document.getElementById('tm-dr-kind');
      var descEl=document.getElementById('tm-dr-desc');
      var body={};
      if(nameEl) body.name=nameEl.value;
      if(kindEl) body.category=kindEl.value||null;
      if(descEl) body.description=descEl.value;
      body.aliases=currentAliases;
      return fetch('/api/tags/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){ if(r.ok) showToast('saved ✓'); });
    }

    // ── Alias pills ───────────────────────────────────────────────────────────
    var currentAliases=(${JSON.stringify((editTag && editTag.aliases) || [])}).slice();

    function renderAliasPills(aliases){
      currentAliases=aliases.slice();
      var container=document.getElementById('tm-alias-pills');
      if(!container) return;
      var addBtn=document.getElementById('tm-alias-add');
      container.innerHTML='';
      aliases.forEach(function(a){
        var sp=document.createElement('span');
        sp.className='tm-alias-pill';
        sp.innerHTML=e(a)+'<button type="button" class="tm-alias-rm" data-alias="'+e(a)+'" aria-label="Remove">×</button>';
        container.appendChild(sp);
      });
      container.appendChild(addBtn||createAddBtn());
    }

    function createAddBtn(){
      var btn=document.createElement('button');
      btn.type='button'; btn.className='tm-alias-add'; btn.id='tm-alias-add';
      btn.textContent='+ add';
      btn.addEventListener('click',showAliasInput);
      return btn;
    }

    function showAliasInput(){
      var inp=document.getElementById('tm-alias-input');
      if(!inp) return;
      inp.style.display='';
      inp.focus();
    }

    var aliasInput=document.getElementById('tm-alias-input');
    if(aliasInput){
      aliasInput.addEventListener('keydown',function(ev){
        if(ev.key==='Enter'){ev.preventDefault();commitAlias();}
        if(ev.key==='Escape'){this.value='';this.style.display='none';}
      });
      aliasInput.addEventListener('blur',function(){
        if(this.value.trim()) commitAlias();
        else this.style.display='none';
      });
    }

    function commitAlias(){
      var inp=document.getElementById('tm-alias-input');
      if(!inp) return;
      var val=inp.value.trim().toLowerCase();
      inp.value='';inp.style.display='none';
      if(!val||currentAliases.includes(val)) return;
      currentAliases.push(val);
      renderAliasPills(currentAliases);
      doSave();
    }

    document.addEventListener('click',function(ev){
      if(ev.target.classList.contains('tm-alias-rm')){
        var a=ev.target.dataset.alias;
        currentAliases=currentAliases.filter(function(x){return x!==a;});
        renderAliasPills(currentAliases);
        doSave();
      }
      var addBtn=ev.target.closest('#tm-alias-add');
      if(addBtn) showAliasInput();
    });

    // ── Delete row action ─────────────────────────────────────────────────────
    document.querySelectorAll('[data-del]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var id=this.dataset.id||this.dataset.del;
        var name=this.dataset.name||'this tag';
        if(!confirm('delete tag "'+name+'"? this cannot be undone.')) return;
        fetch('/api/tags/'+id,{method:'DELETE'}).then(function(r){
          if(r.status===204||r.ok){
            var row=document.querySelector('tr[data-id="'+id+'"]');
            if(row) row.remove();
            showToast('deleted');
          }
        });
      });
    });

    // ── Bulk delete ───────────────────────────────────────────────────────────
    var bulkDel=document.getElementById('tm-bulk-delete');
    if(bulkDel){
      bulkDel.addEventListener('click',function(){
        if(!selectedIds.size) return;
        if(!confirm('delete '+selectedIds.size+' tag(s)? this cannot be undone.')) return;
        var ids=Array.from(selectedIds);
        Promise.all(ids.map(function(id){return fetch('/api/tags/'+id,{method:'DELETE'});}))
          .then(function(){
            ids.forEach(function(id){
              var row=document.querySelector('tr[data-id="'+id+'"]');
              if(row) row.remove();
            });
            selectedIds.clear();
            updateBulkBar();
            showToast('deleted '+ids.length+' tag(s)');
          });
      });
    }

    // ── Bulk merge ────────────────────────────────────────────────────────────
    var mergeModal=document.getElementById('tm-merge-modal');
    var mergeCancel=document.getElementById('tm-merge-cancel');
    var mergeConfirm=document.getElementById('tm-merge-confirm');
    var mergeOptions=document.getElementById('tm-merge-options');
    var mergeTarget=null;

    var bulkMerge=document.getElementById('tm-bulk-merge');
    if(bulkMerge){
      bulkMerge.addEventListener('click',function(){
        if(selectedIds.size<2){alert('select at least 2 tags to merge.');return;}
        mergeOptions.innerHTML='';
        mergeTarget=null;
        selectedIds.forEach(function(id){
          var row=document.querySelector('tr[data-id="'+id+'"]');
          var name=row?row.querySelector('.tm-name').textContent.replace(/^#/,'').trim():id;
          var lbl=document.createElement('label');
          lbl.style.cssText='display:flex;gap:8px;align-items:center;font-family:Kalam,cursive;font-size:14px;cursor:pointer;';
          var radio=document.createElement('input');
          radio.type='radio';radio.name='merge-target';radio.value=id;
          radio.addEventListener('change',function(){mergeTarget=id;});
          lbl.appendChild(radio);
          lbl.appendChild(document.createTextNode('#'+name));
          mergeOptions.appendChild(lbl);
        });
        mergeModal.style.display='flex';
      });
    }

    if(mergeCancel) mergeCancel.addEventListener('click',function(){mergeModal.style.display='none';});
    if(mergeConfirm){
      mergeConfirm.addEventListener('click',function(){
        if(!mergeTarget){alert('pick a canonical tag.');return;}
        var sources=Array.from(selectedIds).filter(function(id){return id!==mergeTarget;});
        fetch('/api/tags/merge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetId:parseInt(mergeTarget),sourceIds:sources.map(Number)})})
          .then(function(r){return r.json();}).then(function(){
            mergeModal.style.display='none';
            selectedIds.clear();
            updateBulkBar();
            showToast('merged!');
            setTimeout(function(){location.reload();},800);
          });
      });
    }

    // ── New tag modal ─────────────────────────────────────────────────────────
    var newModal=document.getElementById('tm-new-modal');
    var newBtn=document.getElementById('tm-new-btn');
    var newCancel=document.getElementById('tm-new-cancel');
    var newSave=document.getElementById('tm-new-save');

    if(newBtn) newBtn.addEventListener('click',function(){newModal.style.display='flex';document.getElementById('tm-new-name').focus();});
    if(newCancel) newCancel.addEventListener('click',function(){newModal.style.display='none';});
    if(newSave){
      newSave.addEventListener('click',function(){
        var name=document.getElementById('tm-new-name').value.trim();
        var kind=document.getElementById('tm-new-kind').value;
        if(!name){alert('name required');return;}
        fetch('/api/tags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,category:kind||null})})
          .then(function(r){return r.json();}).then(function(d){
            if(d.error){alert(d.error);return;}
            newModal.style.display='none';
            showToast('tag created!');
            setTimeout(function(){location.reload();},600);
          });
      });
    }

    // ── Open drawer if edit param ─────────────────────────────────────────────
    ${editTag ? `drawer && drawer.classList.add('open'); backdrop && backdrop.classList.add('show');` : ''}

  })();</script>`;

  res.send(page('Manage Tags', body, req.session));
});

module.exports = router;
