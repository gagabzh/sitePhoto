const { esc } = require('../../layout');

function renderManagePage(data) {
  const { tags, totalTags, stats, unusedCnt, dupesCnt, editTag, totalPages,
          search, kind, sort, pageNum, unused, dupes, PAGE_SIZE } = data;
  const offset = (pageNum - 1) * PAGE_SIZE;

  function buildUrl(overrides) {
    const params = {
      ...(search  ? { search } : {}),
      ...(kind    !== 'all'        ? { kind }  : {}),
      ...(sort    !== 'popularity' ? { sort }  : {}),
      ...(pageNum > 1              ? { page: pageNum } : {}),
      ...(unused  ? { unused: '1' } : {}),
      ...(dupes   ? { dupes:  '1' } : {}),
    };
    Object.assign(params, overrides);
    if (params.page === 1) delete params.page;
    if (params.kind === 'all') delete params.kind;
    if (params.sort === 'popularity') delete params.sort;
    if (params.unused === '0' || !params.unused) delete params.unused;
    if (params.dupes  === '0' || !params.dupes)  delete params.dupes;
    if (!params.search) delete params.search;
    const qs = new URLSearchParams(params).toString();
    return '/tags/manage' + (qs ? '?' + qs : '');
  }

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
      const contribs = (t.contributors || []).slice(0, 3).map((n, _i) => {
        const init = (n || '?')[0].toUpperCase();
        return `<span class="tm-av" title="${esc(n)}">${esc(init)}</span>`;
      }).join('') + (t.contributor_count > 3 ? `<span class="tm-av">+${t.contributor_count - 3}</span>` : '');
      const unusedCls = t.photo_count === 0 ? ' unused' : '';
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

  function renderPager() {
    const prevDisabled = pageNum <= 1;
    const nextDisabled = pageNum >= totalPages;
    const start = offset + 1;
    const end   = Math.min(offset + PAGE_SIZE, totalTags);
    let btns = '';
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
      <div class="df" id="tm-dr-ai-section" style="display:${t.category === 'people' ? '' : 'none'}">
        <label>AI DESCRIPTION</label>
        <div>
          <button type="button" id="tm-dr-ai-pick" style="font-family:'Kalam',cursive;font-size:13px;padding:4px 10px;border:1.5px dashed var(--ink-faint);background:none;cursor:pointer;color:var(--ink-soft);">✦ pick photos to describe</button>
          <div id="tm-dr-ai-grid" style="display:none;margin-top:8px;display:none;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto;"></div>
          <button type="button" id="tm-dr-ai-gen" style="display:none;margin-top:8px;font-family:'Kalam',cursive;font-size:13px;padding:4px 12px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;">Generate description</button>
        </div>
      </div>
      <button class="btn btn-primary" id="tm-dr-save" style="margin-top:auto;">save</button>
      <div class="tm-dz">
        <h4>DANGER ZONE</h4>
        <button class="tm-dz-btn" id="tm-dr-delete">🗑 delete this tag</button>
      </div>
    </div>`;
  }

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

  const kindLinks = ['all','people','places','years','themes'].map(k =>
    `<a href="${buildUrl({ kind: k, page: 1 })}" class="${kind === k ? 'on' : ''}">${k}</a>`
  ).join('');
  const sortLinks = [['popularity','popularity'],['alpha','a → z'],['recent','most recent'],['lastUsed','last used']].map(([v, lbl]) =>
    `<a href="${buildUrl({ sort: v, page: 1 })}" class="${sort === v ? 'on' : ''}">${lbl}</a>`
  ).join('');
  const unusedToggleUrl = buildUrl({ unused: unused ? '0' : '1', page: 1 });
  const dupesToggleUrl  = buildUrl({ dupes:  dupes  ? '0' : '1', page: 1 });

  return `<div class="tm-page">
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
  </div>`;
}

module.exports = { renderManagePage };
