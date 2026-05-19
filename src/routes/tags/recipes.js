const router = require('express').Router();
const db = require('../../db');
const { page, esc } = require('../../layout');
const { SECTIONS } = require('../../combinator');
const { wrapAsync } = require('../../middleware');

// ── GET /recipes/fork/:token — redirect to tag view with shared recipe ────────

router.get('/recipes/fork/:token', wrapAsync(async (req, res) => {
  const { token } = req.params;
  const { rows } = await db.query(
    'SELECT query_json FROM tag_recipes WHERE share_token = $1',
    [token]
  );
  if (!rows.length) return res.status(404).send(page('Recipe not found',
    '<p style="padding:40px;font-family:\'Kalam\',cursive;font-size:18px;color:var(--ink-soft)">This share link is invalid or has been removed.</p>',
    req.session));
  const q = rows[0].query_json;
  const params = [];
  for (const sec of ['people','places','years','themes','other']) {
    const s = (q.sections && q.sections[sec]) || { on: [], not: [] };
    if (s.on && s.on.length)  params.push(`${sec}=${s.on.map(encodeURIComponent).join(',')}`);
    if (s.not && s.not.length) params.push(`${sec}.not=${s.not.map(encodeURIComponent).join(',')}`);
  }
  params.push(`_shared=${encodeURIComponent(token)}`);
  res.redirect('/tags?' + params.join('&'));
}));

// ── GET /recipes — saved recipes management ───────────────────────────────────

router.get('/recipes', wrapAsync(async (req, res) => {
  const search   = String(req.query.search || '').trim().toLowerCase();
  const view     = req.query.view === 'list' ? 'list' : 'cards';
  const scopeAll = req.session.role === 'admin' && req.query.scope === 'all';

  if (scopeAll) {
    // Admin all-recipes view ─────────────────────────────────────────────────
    const { rows: allRecipes } = await db.query(
      `SELECT tr.id, tr.name, tr.query_json, tr.pinned, tr.use_count, tr.last_used_at,
              tr.created_at, tr.user_id AS owner_id, u.name AS owner_name
       FROM tag_recipes tr JOIN users u ON u.id = tr.user_id
       WHERE tr.shared_by IS NULL
       ORDER BY tr.name ASC, u.name ASC`
    );

    const filtered = search
      ? allRecipes.filter(r => {
          if (r.name.toLowerCase().includes(search)) return true;
          if (r.owner_name.toLowerCase().includes(search)) return true;
          const secs = (r.query_json || {}).sections || {};
          for (const s of Object.values(secs)) {
            if ((s.on || []).some(t => t.toLowerCase().includes(search))) return true;
            if ((s.not || []).some(t => t.toLowerCase().includes(search))) return true;
          }
          return false;
        })
      : allRecipes;

    // Detect exact-duplicate query_json groups
    const sigMap = {};
    for (const r of filtered) {
      const sig = JSON.stringify(r.query_json);
      if (!sigMap[sig]) sigMap[sig] = [];
      sigMap[sig].push(r.id);
    }
    const dupIds = new Set(
      Object.values(sigMap).filter(ids => ids.length > 1).flat()
    );

    function renderRecipePills(query_json) {
      const secs  = (query_json || {}).sections || {};
      const pills = [];
      let first   = true;
      for (const sec of SECTIONS) {
        const s = secs[sec]; if (!s) continue;
        const ons = s.on || [], nots = s.not || [];
        if (!ons.length && !nots.length) continue;
        if (!first) pills.push(`<span class="tr-op">AND</span>`);
        first = false;
        ons.forEach((tag, i) => { if (i > 0) pills.push(`<span class="tr-op">AND</span>`); pills.push(`<span class="tr-pill inc">${esc(tag)}</span>`); });
        nots.forEach(tag => { pills.push(`<span class="tr-op">NOT</span>`); pills.push(`<span class="tr-pill exc">${esc(tag)}</span>`); });
      }
      return pills.length ? pills.join(' ') : `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-faint)">(empty)</span>`;
    }

    function recipeUrl(query_json) {
      const secs = (query_json || {}).sections || {};
      const p = [];
      for (const sec of SECTIONS) {
        const s = secs[sec]; if (!s) continue;
        (s.on  || []).forEach(t => p.push(sec + '=' + encodeURIComponent(t)));
        (s.not || []).forEach(t => p.push(sec + '.not=' + encodeURIComponent(t)));
      }
      return '/tags' + (p.length ? '?' + p.join('&') : '');
    }

    const rows = filtered.map(r => {
      const isDup = dupIds.has(r.id);
      const mono  = new Date(r.created_at).toLocaleDateString('en', {month:'short', day:'numeric', year:'numeric'});
      return `<div class="tr-row${isDup ? ' tr-row-dup' : ''}" data-id="${r.id}">
        <span class="tr-row-owner">${esc(r.owner_name)}</span>
        <span class="rname">${esc(r.name)}${isDup ? ' <span class="tr-dup-badge">⚠ duplicate</span>' : ''}</span>
        <div class="tr-pills">${renderRecipePills(r.query_json)}</div>
        <span class="mono n">${r.use_count} uses</span>
        <span class="mono">${mono}</span>
        <div class="tr-row-actions">
          <a href="${esc(recipeUrl(r.query_json))}" class="primary">open ↗</a>
          <button data-del-recipe="${r.id}" data-name="${esc(r.name)}" class="danger">🗑</button>
        </div>
      </div>`;
    }).join('');

    const viewAllUrl = p => `/tags/recipes?scope=all${search ? `&search=${encodeURIComponent(search)}` : ''}${p}`;
    const body = `<div class="tr-page">
      <div style="padding:24px 20px 16px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;border-bottom:1.5px dashed var(--ink-faint);">
        <div>
          <h1 style="font-family:'Caveat',cursive;font-size:48px;font-weight:700;margin:0;line-height:1;">all <em style="color:var(--accent);font-style:italic;">recipes.</em></h1>
          <p style="font-family:'Kalam',cursive;font-size:14px;color:var(--ink-soft);margin:6px 0 0;">${filtered.length} recipes across all users${dupIds.size ? ` · <span style="color:var(--danger)">${dupIds.size} duplicates detected</span>` : ''}</p>
        </div>
        <a href="/tags/recipes" style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-soft);text-decoration:none;">← my recipes</a>
      </div>
      <div class="tr-filter">
        <form method="GET" action="/tags/recipes" style="display:contents">
          <input type="hidden" name="scope" value="all">
          <input class="tr-search" type="text" name="search" value="${esc(search)}" placeholder="search by name, owner, tag…" autocomplete="off">
        </form>
      </div>
      <div class="tr-sec-h" style="border-top:none">
        all users · sorted by name
        <span class="tr-sec-count">// ${filtered.length} total</span>
      </div>
      <div class="tr-list" style="padding:0 20px 40px">
        ${rows || `<div class="tr-empty">no recipes found.</div>`}
      </div>
    </div>
    <script>(function(){
      function showToast(msg){var t=document.getElementById('tm-toast');if(!t){t=document.createElement('div');t.id='tm-toast';t.className='tm-toast';document.body.appendChild(t);}t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2000);}
      document.querySelectorAll('[data-del-recipe]').forEach(function(btn){
        btn.addEventListener('click',function(ev){
          ev.stopPropagation();
          var id=this.dataset.delRecipe, name=this.dataset.name||'this recipe';
          if(!confirm('delete recipe "'+name+'"?')) return;
          fetch('/api/recipes/'+id,{method:'DELETE'}).then(function(r){
            if(r.status===204||r.ok){showToast('deleted');setTimeout(function(){location.reload();},500);}
          });
        });
      });
    })();</script>`;

    return res.send(page('All Recipes', body, req.session));
  }

  // My-recipes view (default) ────────────────────────────────────────────────
  const [{ rows: recipes }, { rows: sharedWithMe }] = await Promise.all([
    db.query(
      `SELECT id, name, query_json, pinned, use_count, last_used_at, created_at
       FROM tag_recipes WHERE user_id = $1 AND shared_by IS NULL ORDER BY pinned DESC, created_at DESC`,
      [req.session.userId]
    ),
    db.query(
      `SELECT tr.id, tr.name, tr.query_json, tr.pinned, tr.use_count, tr.last_used_at, tr.created_at,
              u.name AS shared_by_name
       FROM tag_recipes tr JOIN users u ON u.id = tr.shared_by
       WHERE tr.user_id = $1 AND tr.shared_by IS NOT NULL ORDER BY tr.created_at DESC`,
      [req.session.userId]
    ),
  ]);

  // Filter by search
  const filtered = search
    ? recipes.filter(r => {
        if (r.name.toLowerCase().includes(search)) return true;
        const qj = r.query_json || {};
        const secs = qj.sections || {};
        for (const sec of Object.keys(secs)) {
          const s = secs[sec];
          if ((s.on  || []).some(t => t.toLowerCase().includes(search))) return true;
          if ((s.not || []).some(t => t.toLowerCase().includes(search))) return true;
        }
        return false;
      })
    : recipes;

  const pinned   = filtered.filter(r => r.pinned);
  const unpinned = filtered.filter(r => !r.pinned);

  // ── Recipe pills renderer ─────────────────────────────────────────────────
  function renderRecipePills(query_json) {
    const secs   = (query_json || {}).sections || {};
    const pills  = [];
    let first    = true;
    for (const sec of SECTIONS) {
      const s = secs[sec];
      if (!s) continue;
      const ons  = s.on  || [];
      const nots = s.not || [];
      if (!ons.length && !nots.length) continue;
      if (!first) pills.push(`<span class="tr-op">AND</span>`);
      first = false;
      ons.forEach((tag, i) => {
        if (i > 0) pills.push(`<span class="tr-op">AND</span>`);
        pills.push(`<span class="tr-pill inc">${esc(tag)}</span>`);
      });
      nots.forEach(tag => {
        pills.push(`<span class="tr-op">NOT</span>`);
        pills.push(`<span class="tr-pill exc">${esc(tag)}</span>`);
      });
    }
    if (!pills.length) return `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink-faint);">(empty recipe)</span>`;
    return pills.join(' ');
  }

  // ── Reconstruct combinator URL from query_json ────────────────────────────
  function recipeUrl(query_json) {
    const secs = (query_json || {}).sections || {};
    const params = [];
    for (const sec of SECTIONS) {
      const s = secs[sec];
      if (!s) continue;
      (s.on  || []).forEach(t => params.push(sec + '=' + encodeURIComponent(t)));
      (s.not || []).forEach(t => params.push(sec + '.not=' + encodeURIComponent(t)));
    }
    return '/tags' + (params.length ? '?' + params.join('&') : '');
  }

  // ── Render a recipe card ──────────────────────────────────────────────────
  function renderCard(r) {
    const starCls = r.pinned ? '' : ' unpinned';
    const starIcon = r.pinned ? '★' : '☆';
    const createdDate = new Date(r.created_at).toLocaleDateString('en', {month:'short', year:'numeric'});
    return `<div class="tr-card" data-id="${r.id}">
      <button class="tr-star${starCls}" data-pin="${r.id}" data-pinned="${r.pinned ? '1' : '0'}" title="${r.pinned ? 'unpin' : 'pin'}">${starIcon}</button>
      <div class="tr-covers">
        <div class="tc"></div>
        <div class="tc"></div>
        <div class="tc"></div>
      </div>
      <div class="tr-card-body">
        <h3>${esc(r.name)}</h3>
        <div class="tr-pills">${renderRecipePills(r.query_json)}</div>
        <div class="tr-by">by you · ${createdDate}</div>
        <div class="tr-meta">
          <span><b>${r.use_count}</b> uses</span>
          <span>${r.last_used_at ? 'last: ' + new Date(r.last_used_at).toLocaleDateString('en', {month:'short', day:'numeric'}) : 'never opened'}</span>
        </div>
      </div>
      <div class="tr-card-footer">
        <a href="${esc(recipeUrl(r.query_json))}" class="primary">open ↗</a>
        <button class="icon" data-share="${r.id}" title="Share link">⤴</button>
        <button class="icon" data-share-to="${r.id}" data-name="${esc(r.name)}" title="Share to user">👤</button>
        <button class="icon" data-dup="${r.id}" title="Duplicate">⎘</button>
        <button class="icon danger" data-del-recipe="${r.id}" data-name="${esc(r.name)}" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  // ── Render a list row ─────────────────────────────────────────────────────
  function renderRow(r) {
    const starCls  = r.pinned ? '' : ' muted';
    const starIcon = r.pinned ? '★' : '☆';
    const mono = new Date(r.created_at).toLocaleDateString('en', {month:'short', day:'numeric', year:'numeric'});
    return `<div class="tr-row" data-id="${r.id}">
      <button class="star-btn${starCls}" data-pin="${r.id}" data-pinned="${r.pinned ? '1' : '0'}">${starIcon}</button>
      <span class="rname">${esc(r.name)}</span>
      <div class="tr-pills">${renderRecipePills(r.query_json)}</div>
      <span class="mono n">${r.use_count} uses</span>
      <span class="mono">${mono}</span>
      <div class="tr-row-actions">
        <a href="${esc(recipeUrl(r.query_json))}" class="primary">open ↗</a>
        <button data-share="${r.id}" title="Share link">⤴</button>
        <button data-share-to="${r.id}" data-name="${esc(r.name)}" title="Share to user">👤</button>
        <button data-dup="${r.id}" title="Duplicate">⎘</button>
        <button class="danger" data-del-recipe="${r.id}" data-name="${esc(r.name)}" title="Delete">🗑</button>
      </div>
    </div>`;
  }

  // ── Render a shared-with-me card (no pin/dup/del — simple) ───────────────
  function renderSharedCard(r) {
    const createdDate = new Date(r.created_at).toLocaleDateString('en', {month:'short', year:'numeric'});
    return `<div class="tr-card" data-id="${r.id}">
      <div class="tr-shared-from">shared by ${esc(r.shared_by_name)}</div>
      <div class="tr-covers">
        <div class="tc"></div><div class="tc"></div><div class="tc"></div>
      </div>
      <div class="tr-card-body">
        <h3>${esc(r.name)}</h3>
        <div class="tr-pills">${renderRecipePills(r.query_json)}</div>
        <div class="tr-by">from ${esc(r.shared_by_name)} · ${createdDate}</div>
      </div>
      <div class="tr-card-footer">
        <a href="${esc(recipeUrl(r.query_json))}" class="primary">open ↗</a>
        <button class="icon danger" data-del-recipe="${r.id}" data-name="${esc(r.name)}" title="Remove">🗑</button>
      </div>
    </div>`;
  }

  // ── View toggle URL ───────────────────────────────────────────────────────
  function viewUrl(v) {
    const p = new URLSearchParams({ ...(search ? { search } : {}), view: v });
    return '/tags/recipes?' + p.toString();
  }

  // ── Build pinned section ──────────────────────────────────────────────────
  let pinnedSection = '';
  if (pinned.length) {
    const cards = pinned.map(renderCard).join('') +
      `<a href="/tags" class="tr-card tr-empty-card">
        <div style="font-family:'Caveat',cursive;font-size:60px;line-height:1;color:var(--ink-faint);">+</div>
        <div style="font-family:'Caveat',cursive;font-size:18px;color:var(--ink-soft);margin-top:8px;">create new recipe</div>
      </a>`;
    pinnedSection = `
      <div class="tr-sec-h" style="border-top:none">
        ⭐ pinned
        <span class="tr-sec-count">// ${pinned.length} recipe${pinned.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="tr-cards">${cards}</div>`;
  }

  // ── Build all-recipes section ─────────────────────────────────────────────
  let allSection = '';
  const allSecCount = `${filtered.length} total · ${unpinned.length} unpinned`;
  if (!filtered.length) {
    allSection = `<div class="tr-empty">
      ${search ? `no recipes match '${esc(search)}'. <a href="/tags/recipes" style="color:var(--accent);">clear?</a>` :
        'you haven\'t saved any recipes yet. build a query in the <a href="/tags" style="color:var(--accent);">Tag Combinator</a> and hit ★ save.'}
    </div>`;
  } else {
    const rows = (pinned.length > 0 ? unpinned : filtered).map(renderRow).join('');
    const emptyRow = `<div class="tr-row" style="border:1.5px dashed var(--ink-faint);padding:16px;justify-content:center;">
      <a href="/tags" style="font-family:'Kalam',cursive;font-size:14px;color:var(--accent);text-decoration:none;grid-column:1/-1;">+ create new recipe</a>
    </div>`;
    allSection = `
      <div class="tr-sec-h">
        all recipes
        <span class="tr-sec-count">// ${allSecCount}</span>
      </div>
      <div class="tr-list">${rows || `<div class="tr-empty">all recipes are pinned above.</div>`}${emptyRow}</div>`;
  }

  const sharedSection = sharedWithMe.length ? `
    <div class="tr-sec-h" style="border-top:none;background:oklch(95% 0.04 220)">
      📬 shared with you
      <span class="tr-sec-count">// ${sharedWithMe.length}</span>
    </div>
    <div class="tr-cards">${sharedWithMe.map(renderSharedCard).join('')}</div>` : '';

  const body = `<div class="tr-page">
    <div style="padding:24px 20px 16px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;border-bottom:1.5px dashed var(--ink-faint);">
      <div>
        <h1 style="font-family:'Caveat',cursive;font-size:48px;font-weight:700;margin:0;line-height:1;">my saved <em style="color:var(--accent);font-style:italic;">recipes.</em></h1>
        <p style="font-family:'Kalam',cursive;font-size:14px;color:var(--ink-soft);margin:6px 0 0;">${filtered.length} recipe${filtered.length !== 1 ? 's' : ''} — your shortcuts into the archive.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <a href="/tags" style="font-family:'Kalam',cursive;font-size:14px;padding:4px 12px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);text-decoration:none;">+ new recipe</a>
      </div>
    </div>

    <div class="tr-filter">
      <form method="GET" action="/tags/recipes" style="display:contents">
        ${view !== 'cards' ? `<input type="hidden" name="view" value="${esc(view)}">` : ''}
        <input class="tr-search" type="text" name="search" value="${esc(search)}" placeholder="search recipes…" autocomplete="off">
      </form>
      <span class="tl" style="margin-left:8px">VIEW</span>
      <div class="tr-seg">
        <a href="${viewUrl('cards')}" class="${view === 'cards' ? 'on' : ''}">cards</a>
        <a href="${viewUrl('list')}"  class="${view === 'list'  ? 'on' : ''}">list</a>
      </div>
    </div>

    ${sharedSection}
    ${pinnedSection}
    ${allSection}
  </div>

  <!-- Share-to-user modal -->
  <div id="tr-share-modal" class="tr-share-modal-backdrop" style="display:none">
    <div class="tr-share-modal">
      <h3 style="font-family:'Caveat',cursive;font-size:26px;font-weight:700;margin:0 0 12px">share recipe</h3>
      <p id="tr-share-recipe-name" style="font-family:'Kalam',cursive;font-size:13px;color:var(--ink-soft);margin:0 0 12px"></p>
      <input id="tr-share-user-q" type="text" placeholder="search by name…" autocomplete="off"
        style="width:100%;box-sizing:border-box;padding:6px 10px;border:1.5px solid var(--ink);background:var(--paper);font-family:'Kalam',cursive;font-size:14px;margin-bottom:6px">
      <div id="tr-share-results" class="tr-share-results"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:16px">
        ${req.session.role === 'admin' ? `<button id="tr-share-all" style="font-family:'Kalam',cursive;font-size:13px;padding:4px 12px;border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer;">📢 everyone</button>` : '<span></span>'}
        <button id="tr-share-cancel" style="font-family:'Kalam',cursive;font-size:13px;background:none;border:none;cursor:pointer;color:var(--ink-soft)">cancel</button>
      </div>
    </div>
  </div>

  <script>(function(){
    function showToast(msg){
      var t=document.getElementById('tm-toast');
      if(!t){ t=document.createElement('div'); t.id='tm-toast'; t.className='tm-toast'; document.body.appendChild(t); }
      t.textContent=msg;
      t.classList.add('show');
      setTimeout(function(){t.classList.remove('show');},2000);
    }
    function e(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // Pin toggle
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('[data-pin]');
      if(!btn) return;
      var id=btn.dataset.pin;
      var pinned=btn.dataset.pinned==='1';
      fetch('/api/recipes/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({pinned:!pinned})})
        .then(function(r){if(r.ok){showToast(pinned?'unpinned':'pinned ⭐');setTimeout(function(){location.reload();},500);}});
    });

    // Duplicate
    document.querySelectorAll('[data-dup]').forEach(function(btn){
      btn.addEventListener('click',function(ev){
        ev.stopPropagation();
        var id=this.dataset.dup;
        fetch('/api/recipes/'+id+'/duplicate',{method:'POST'})
          .then(function(r){return r.json();}).then(function(d){
            if(d.id){ showToast('duplicated!'); setTimeout(function(){location.reload();},600); }
          });
      });
    });

    // Delete
    document.querySelectorAll('[data-del-recipe]').forEach(function(btn){
      btn.addEventListener('click',function(ev){
        ev.stopPropagation();
        var id=this.dataset.delRecipe;
        var name=this.dataset.name||'this recipe';
        if(!confirm('delete recipe "'+name+'"?')) return;
        fetch('/api/recipes/'+id,{method:'DELETE'}).then(function(r){
          if(r.status===204||r.ok){showToast('deleted');setTimeout(function(){location.reload();},500);}
        });
      });
    });

    // Share link
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('[data-share]');
      if(!btn) return;
      ev.stopPropagation();
      var id=btn.dataset.share;
      fetch('/api/recipes/'+id+'/share',{method:'POST'})
        .then(function(r){return r.json();})
        .then(function(d){
          if(!d.token) return;
          var link=location.origin+'/tags/recipes/fork/'+d.token;
          if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){showToast('link copied ✓');});}
          else{prompt('share link:',link);}
        });
    });

    // Share to user — open modal
    var shareMod=document.getElementById('tr-share-modal');
    var shareQ=document.getElementById('tr-share-user-q');
    var shareRes=document.getElementById('tr-share-results');
    var shareName=document.getElementById('tr-share-recipe-name');
    var shareRecipeId=null;
    var shareTimer=null;

    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('[data-share-to]');
      if(!btn) return;
      ev.stopPropagation();
      shareRecipeId=btn.dataset.shareTo;
      if(shareName) shareName.textContent='"'+(btn.dataset.name||'recipe')+'"';
      if(shareQ){shareQ.value='';shareQ.focus();}
      if(shareRes) shareRes.innerHTML='';
      if(shareMod) shareMod.style.display='flex';
    });

    document.getElementById('tr-share-cancel').addEventListener('click',function(){
      if(shareMod) shareMod.style.display='none';
    });
    if(shareMod) shareMod.addEventListener('click',function(ev){if(ev.target===this)this.style.display='none';});

    var shareAllBtn=document.getElementById('tr-share-all');
    if(shareAllBtn) shareAllBtn.addEventListener('click',function(){
      if(!confirm('Share this recipe with ALL users?')) return;
      this.disabled=true;
      fetch('/api/recipes/'+shareRecipeId+'/share-to',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({everyone:true})})
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.ok){showToast('shared with everyone ✓ ('+d.count+' users)');shareMod.style.display='none';}
        });
    });

    if(shareQ) shareQ.addEventListener('input',function(){
      clearTimeout(shareTimer);
      var q=this.value.trim();
      if(!q){if(shareRes)shareRes.innerHTML='';return;}
      shareTimer=setTimeout(function(){
        fetch('/api/users/search?q='+encodeURIComponent(q))
          .then(function(r){return r.json();})
          .then(function(users){
            if(!shareRes) return;
            if(!users.length){shareRes.innerHTML='<div class="tr-share-none">no users found</div>';return;}
            shareRes.innerHTML=users.map(function(u){
              return '<button class="tr-share-user" data-uid="'+u.id+'" data-uname="'+e(u.name)+'">'+e(u.name)+'</button>';
            }).join('');
            shareRes.querySelectorAll('.tr-share-user').forEach(function(btn){
              btn.addEventListener('click',function(){
                var uid=this.dataset.uid,uname=this.dataset.uname;
                fetch('/api/recipes/'+shareRecipeId+'/share-to',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:parseInt(uid,10)})})
                  .then(function(r){return r.json();})
                  .then(function(d){
                    if(d.ok){showToast('shared with '+uname+' ✓');shareMod.style.display='none';}
                  });
              });
            });
          });
      },250);
    });

  })();</script>`;

  res.send(page('My Recipes', body, req.session));
}));

module.exports = router;
