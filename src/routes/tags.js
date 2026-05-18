const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');
const { parseState, buildWhere, SECTIONS, DEFAULT_LOGIC, LOGIC_OPTS, ORDER_SQL } = require('../combinator');
const { requireEditor } = require('../middleware');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchTagVocabulary(isViewer, userId) {
  const [{ rows: tagRows }, { rows: yearRows }] = await Promise.all([
    isViewer
      ? db.query(`
          SELECT t.name, t.category, COUNT(DISTINCT p.id)::int AS count
          FROM tags t
          JOIN photo_tags pt ON pt.tag_id = t.id
          JOIN photos p ON p.id = pt.photo_id
          JOIN album_access aa ON aa.album_id = p.album_id
          WHERE aa.viewer_id = $1 AND (t.category IS NULL OR t.category != 'years')
          GROUP BY t.name, t.category ORDER BY t.name
        `, [userId])
      : db.query(`
          SELECT t.name, t.category, COUNT(DISTINCT p.id)::int AS count
          FROM tags t
          JOIN photo_tags pt ON pt.tag_id = t.id
          JOIN photos p ON p.id = pt.photo_id
          WHERE (t.category IS NULL OR t.category != 'years')
          GROUP BY t.name, t.category ORDER BY t.name
        `),
    isViewer
      ? db.query(`
          SELECT EXTRACT(YEAR FROM p.taken_at)::int::text AS name, COUNT(DISTINCT p.id)::int AS count
          FROM photos p
          JOIN album_access aa ON aa.album_id = p.album_id
          WHERE p.taken_at IS NOT NULL AND aa.viewer_id = $1
          GROUP BY 1 ORDER BY 1 DESC
        `, [userId])
      : db.query(`
          SELECT EXTRACT(YEAR FROM taken_at)::int::text AS name, COUNT(*)::int AS count
          FROM photos
          WHERE taken_at IS NOT NULL
          GROUP BY 1 ORDER BY 1 DESC
        `),
  ]);

  const grouped = {};
  for (const s of SECTIONS) grouped[s] = [];
  for (const r of tagRows) {
    const key = (r.category && SECTIONS.includes(r.category) && r.category !== 'years') ? r.category : 'other';
    grouped[key].push({ name: r.name, count: r.count });
  }
  grouped.years = yearRows.map(r => ({ name: String(r.name), count: r.count }));
  return grouped;
}

async function fetchInitialResults(state, isViewer, userId) {
  const hasFilters = SECTIONS.some(s =>
    state.sections[s].on.length > 0 || state.sections[s].not.length > 0
  );
  if (!hasFilters) return { total: 0, photos: [], hasFilters: false };

  const { where, vals } = buildWhere(state, isViewer, userId);
  const { rows: cr } = await db.query(
    `SELECT COUNT(DISTINCT p.id)::int AS total FROM photos p ${where}`, vals
  );
  const total = cr[0].total;
  const { rows: photos } = await db.query(`
    SELECT p.id, p.filename, p.title, p.taken_at, u.name AS uploader
    FROM photos p JOIN users u ON u.id = p.user_id
    ${where} ${ORDER_SQL[state.sort] || ORDER_SQL.newest} LIMIT 24 OFFSET 0
  `, vals);
  return { total, photos, hasFilters: true };
}

// ── Render helpers ────────────────────────────────────────────────────────────

const SEC_LABEL = { people: 'PEOPLE', places: 'PLACES', years: 'YEARS', themes: 'THEMES', other: 'OTHER' };
const SEC_PH    = { people: 'filter people…', places: 'filter places…', years: null, themes: 'filter themes…', other: 'filter tags…' };

function renderSection(sec, tags, ss) {
  // Always show the 4 core sections; only hide OTHER when empty
  if (tags.length === 0 && sec === 'other') return '';
  const onSet  = new Set(ss.on);
  const notSet = new Set(ss.not);
  const hasSel = ss.on.length > 0 || ss.not.length > 0;
  const isYears = sec === 'years';

  const search = (!isYears && SEC_PH[sec])
    ? `<input class="cb-search" type="text" placeholder="${esc(SEC_PH[sec])}" autocomplete="off" data-section="${sec}">`
    : '';

  const items = isYears
    ? `<div class="cb-chips" data-list="${sec}">${tags.map(t => {
        const st = onSet.has(t.name) ? 'on' : notSet.has(t.name) ? 'not' : 'off';
        return `<span class="cb-chip" data-state="${st}" data-tag="${esc(t.name)}" data-section="${sec}">${esc(t.name)}</span>`;
      }).join('')}</div>`
    : `<div class="cb-tag-list" data-list="${sec}">${tags.map(t => {
        const st = onSet.has(t.name) ? 'on' : notSet.has(t.name) ? 'not' : 'off';
        return `<label class="cb-tag-item" data-state="${st}" data-tag="${esc(t.name)}" data-section="${sec}">` +
          `<span class="cb-box"></span><span class="cb-name">${esc(t.name)}</span>` +
          `<span class="cb-count" data-tag="${esc(t.name)}" data-section="${sec}">${t.count}</span></label>`;
      }).join('')}</div>`;

  const logicBtns = LOGIC_OPTS[sec].map(opt =>
    `<button class="cb-logic-btn${ss.logic === opt ? ' active' : ''}" data-logic="${opt}">${opt.toUpperCase()}</button>`
  ).join('');

  return `<div class="cb-section" data-section="${sec}">
    <div class="cb-section-head">
      <h4 class="cb-section-h">${SEC_LABEL[sec]}</h4>
      <a class="cb-clear${hasSel ? ' visible' : ''}" data-section="${sec}" href="#">clear</a>
    </div>
    ${search}${items}
    <div class="cb-logic" data-section="${sec}">${logicBtns}</div>
  </div>`;
}

function renderPills(state) {
  const pills = [];
  for (const sec of SECTIONS) {
    for (const tag of state.sections[sec].on)  pills.push({ tag, sec, st: 'on' });
    for (const tag of state.sections[sec].not) pills.push({ tag, sec, st: 'not' });
  }
  if (!pills.length) return `<span class="cb-empty-hint">no filters yet — tick a tag on the left to begin.</span>`;
  return pills.map((pill, i) => {
    const op  = i > 0 ? `<span class="cb-pill-op">${pill.st === 'not' ? 'AND NOT' : 'AND'}</span> ` : '';
    const cls = pill.st === 'not' ? 'cb-pill not' : 'cb-pill';
    return `${op}<span class="${cls}" data-tag="${esc(pill.tag)}" data-section="${esc(pill.sec)}" data-state="${pill.st}">${esc(pill.tag)}<button class="cb-pill-x" aria-label="Remove">\xd7</button></span>`;
  }).join(' ');
}

function renderGrid(photos, view, hasFilters) {
  if (!hasFilters) return `<div id="cb-grid"><div class="cb-no-filter">no filters yet — tick a tag on the left to begin.</div></div>`;
  if (!photos.length) return `<div id="cb-grid"><div class="cb-no-results">nothing matches this recipe yet. loosen a filter?</div></div>`;
  const tiles = photos.map(p => {
    if (view === 'list') {
      return `<div class="cb-tile" data-id="${p.id}">` +
        `<a href="/photos/${p.id}"><img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}" loading="lazy"></a>` +
        `<div class="cb-list-meta"><strong>${esc(p.title)}</strong>` +
        `<small>by ${esc(p.uploader)}${p.taken_at ? ' \xb7 ' + new Date(p.taken_at).getFullYear() : ''}</small></div></div>`;
    }
    return `<div class="cb-tile" data-id="${p.id}">` +
      `<a href="/photos/${p.id}"><img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}" loading="lazy">` +
      `<div class="cb-tile-overlay">${esc(p.title)}</div></a></div>`;
  }).join('');
  return `<div class="cb-grid view-${view}" id="cb-grid">${tiles}</div>`;
}

// ── GET / — Tag Combinator ────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const isViewer   = req.session.role === 'viewer';
  const state      = parseState(req.query);
  const sharedToken = req.query._shared || null;

  const [vocabulary, initial, recipeRows, sharedInfo] = await Promise.all([
    fetchTagVocabulary(isViewer, req.session.userId),
    fetchInitialResults(state, isViewer, req.session.userId),
    db.query('SELECT id, name, query_json FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId])
      .then(r => r.rows),
    sharedToken
      ? db.query(
          `SELECT tr.name, u.name AS owner_name, u.id AS owner_id
           FROM tag_recipes tr JOIN users u ON u.id = tr.user_id
           WHERE tr.share_token = $1`,
          [sharedToken]
        ).then(r => r.rows[0] || null)
      : Promise.resolve(null),
  ]);

  const { total, photos, hasFilters } = initial;
  const hasAnyFilter = SECTIONS.some(s => state.sections[s].on.length > 0 || state.sections[s].not.length > 0);

  const sectionsHtml = SECTIONS.map(sec => renderSection(sec, vocabulary[sec], state.sections[sec])).join('');

  const recipesHtml = recipeRows.map(r =>
    `<div class="cb-recipe-row" data-id="${r.id}" data-query="${esc(JSON.stringify(r.query_json))}">` +
    `<span>★</span><span class="cb-recipe-n">${esc(r.name)}</span>` +
    `<button class="cb-recipe-share" data-share-id="${r.id}" title="Share" aria-label="Share">⤴</button>` +
    `<button class="cb-recipe-del" aria-label="Delete">\xd7</button></div>`
  ).join('');

  // ── Shared recipe banner ──────────────────────────────────────────────────
  let sharedBanner = '';
  if (sharedInfo) {
    let accessWarning = '';
    if (isViewer) {
      const { where: whereAll, vals: valsAll } = require('../combinator').buildWhere(state, false, null);
      const { where: whereMe,  vals: valsMe  } = require('../combinator').buildWhere(state, true, req.session.userId);
      const hasF = SECTIONS.some(s => state.sections[s].on.length > 0 || state.sections[s].not.length > 0);
      if (hasF) {
        const [{ rows: allR }, { rows: meR }] = await Promise.all([
          db.query(`SELECT COUNT(DISTINCT p.id)::int AS n FROM photos p ${whereAll}`, valsAll),
          db.query(`SELECT COUNT(DISTINCT p.id)::int AS n FROM photos p ${whereMe}`,  valsMe),
        ]);
        const hidden = (allR[0].n || 0) - (meR[0].n || 0);
        if (hidden > 0) {
          accessWarning = `<span class="cb-banner-warn">⚠ ${hidden} photo${hidden !== 1 ? 's' : ''} not shared with you — ask ${esc(sharedInfo.owner_name)} for access.</span>`;
        }
      }
    }
    sharedBanner = `<div class="cb-shared-banner">
      <span>Recipe shared by <strong>${esc(sharedInfo.owner_name)}</strong></span>
      ${accessWarning}
      <button class="cb-banner-fork" data-token="${esc(sharedToken)}">+ add to my recipes</button>
    </div>`;
  }

  const body = `
    <div class="cb-layout">
      <aside class="cb-sidebar">
        <div class="cb-sidebar-inner">
          <div class="cb-header">
            <h1>mix &amp; <em>match.</em></h1>
            <p class="cb-sub">tick tags to build a query. results update live.</p>
          </div>
          ${sectionsHtml}
          <div class="cb-recipes">
            <h4 class="cb-recipes-h">SAVED RECIPES</h4>
            ${recipesHtml}
            <button class="cb-recipe-add" id="cb-open-save">+ save current recipe</button>
          </div>
        </div>
      </aside>
      <div class="cb-main">
        ${sharedBanner}
        <div class="cb-recipe-bar">
          <div class="cb-pills" id="cb-pills">${renderPills(state)}</div>
          <button class="cb-share-btn" id="cb-share-btn"${!hasAnyFilter ? ' disabled' : ''}>⤴ share</button>
          <button class="cb-save-btn" id="cb-save-btn"${!hasAnyFilter ? ' disabled' : ''}>★ save recipe</button>
        </div>
        <div class="cb-result-head">
          <h3><em id="cb-count">${hasFilters ? total : ''}</em>${hasFilters ? ` photo${total !== 1 ? 's' : ''} match.` : ''}</h3>
          <div class="cb-sort-row">
            <label>SORT <select id="cb-sort">
              <option value="newest"${state.sort === 'newest' ? ' selected' : ''}>newest first</option>
              <option value="oldest"${state.sort === 'oldest' ? ' selected' : ''}>oldest first</option>
            </select></label>
            <label>VIEW <select id="cb-view">
              <option value="grid4"${state.view === 'grid4'   ? ' selected' : ''}>grid \xb7 4</option>
              <option value="grid6"${state.view === 'grid6'   ? ' selected' : ''}>grid \xb7 6</option>
              <option value="list"${state.view === 'list'     ? ' selected' : ''}>list</option>
              <option value="mosaic"${state.view === 'mosaic' ? ' selected' : ''}>mosaic</option>
            </select></label>
          </div>
        </div>
        ${renderGrid(photos, state.view, hasFilters)}
      </div>
    </div>

    <div class="cb-dialog-backdrop" id="cb-dialog">
      <div class="cb-dialog">
        <h3>save recipe</h3>
        <input id="cb-recipe-name" type="text" placeholder="name this recipe…" maxlength="100" autocomplete="off">
        <div class="cb-dialog-btns">
          <button class="btn btn-secondary btn-sm" id="cb-dialog-cancel">cancel</button>
          <button class="btn btn-sm" id="cb-dialog-save">save</button>
        </div>
      </div>
    </div>

    <script>(function(){
      var SECTIONS=${JSON.stringify(SECTIONS)};
      var DEF_LOGIC=${JSON.stringify(DEFAULT_LOGIC)};
      var state=${JSON.stringify({sections:state.sections,sort:state.sort,view:state.view})};

      function qs(st){
        var p=[];
        SECTIONS.forEach(function(sec){
          var s=st.sections[sec];
          if(s.on.length) p.push(sec+'='+s.on.map(encodeURIComponent).join(','));
          if(s.not.length) p.push(sec+'.not='+s.not.map(encodeURIComponent).join(','));
          if((s.on.length||s.not.length)&&s.logic!==DEF_LOGIC[sec]) p.push('logic.'+sec+'='+s.logic);
        });
        p.push('sort='+st.sort,'view='+st.view);
        return p.join('&');
      }
      function e(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

      var timer=null;
      function schedule(){clearTimeout(timer);timer=setTimeout(go,150);}

      function go(){
        var q=qs(state);
        history.replaceState(null,'','/tags?'+q);
        updateBar();
        updateSaveBtn();
        var grid=document.getElementById('cb-grid');
        if(grid) grid.classList.add('cb-loading');
        Promise.all([
          fetch('/api/photos/combinator?'+q).then(function(r){return r.json();}),
          fetch('/api/tags/counts?'+q).then(function(r){return r.json();})
        ]).then(function(res){
          paintGrid(res[0]);
          paintCounts(res[1]);
        }).catch(function(){
          if(grid) grid.classList.remove('cb-loading');
        });
      }

      function paintGrid(data){
        var hasF=SECTIONS.some(function(s){return state.sections[s].on.length>0||state.sections[s].not.length>0;});
        var h3=document.querySelector('.cb-result-head h3');
        if(h3) h3.innerHTML='<em id="cb-count">'+(hasF?data.total:'')+'</em>'+(hasF?' photo'+(data.total!==1?'s':'')+' match.':'');
        var old=document.getElementById('cb-grid');
        var newG=document.createElement('div');
        newG.id='cb-grid';
        if(!hasF){
          newG.className='';
          newG.innerHTML='<div class="cb-no-filter">no filters yet — tick a tag on the left to begin.</div>';
        } else if(!data.photos.length){
          newG.className='';
          newG.innerHTML='<div class="cb-no-results">nothing matches this recipe yet. loosen a filter?</div>';
        } else {
          newG.className='cb-grid view-'+state.view;
          data.photos.forEach(function(p){
            var t=document.createElement('div');
            t.className='cb-tile'; t.dataset.id=p.id;
            if(state.view==='list'){
              t.innerHTML='<a href="/photos/'+p.id+'"><img src="/uploads/'+e(p.filename)+'" alt="'+e(p.title)+'" loading="lazy"></a>'+
                '<div class="cb-list-meta"><strong>'+e(p.title)+'</strong><small>by '+e(p.uploader)+'</small></div>';
            } else {
              t.innerHTML='<a href="/photos/'+p.id+'"><img src="/uploads/'+e(p.filename)+'" alt="'+e(p.title)+'" loading="lazy">'+
                '<div class="cb-tile-overlay">'+e(p.title)+'</div></a>';
            }
            newG.appendChild(t);
          });
        }
        if(old) old.parentNode.replaceChild(newG,old);
        else document.querySelector('.cb-main').appendChild(newG);
      }

      function paintCounts(counts){
        document.querySelectorAll('.cb-count[data-tag]').forEach(function(el){
          var c=counts[el.dataset.section];
          if(c&&c[el.dataset.tag]!==undefined) el.textContent=c[el.dataset.tag];
        });
      }

      function updateBar(){
        var el=document.getElementById('cb-pills'); if(!el) return;
        var pills=[]; var i=0;
        SECTIONS.forEach(function(sec){
          var s=state.sections[sec];
          s.on.forEach(function(tag){
            var op=i>0?'<span class="cb-pill-op">AND</span> ':'';
            pills.push(op+'<span class="cb-pill" data-tag="'+e(tag)+'" data-section="'+sec+'" data-state="on">'+e(tag)+'<button class="cb-pill-x">\xd7</button></span>');
            i++;
          });
          s.not.forEach(function(tag){
            var op=i>0?'<span class="cb-pill-op">AND NOT</span> ':'';
            pills.push(op+'<span class="cb-pill not" data-tag="'+e(tag)+'" data-section="'+sec+'" data-state="not">'+e(tag)+'<button class="cb-pill-x">\xd7</button></span>');
            i++;
          });
        });
        el.innerHTML=i?pills.join(' '):'<span class="cb-empty-hint">no filters yet — tick a tag on the left to begin.</span>';
      }

      function updateSaveBtn(){
        var hasF=!SECTIONS.some(function(s){return state.sections[s].on.length>0||state.sections[s].not.length>0;});
        var btn=document.getElementById('cb-save-btn'); if(btn) btn.disabled=hasF;
        var shr=document.getElementById('cb-share-btn'); if(shr) shr.disabled=hasF;
      }

      function toggleTag(el,forceNot){
        var tag=el.dataset.tag,sec=el.dataset.section,cur=el.dataset.state||'off',next;
        next=forceNot?(cur==='not'?'off':'not'):(cur==='on'?'off':'on');
        el.dataset.state=next;
        var s=state.sections[sec];
        s.on=s.on.filter(function(t){return t!==tag;});
        s.not=s.not.filter(function(t){return t!==tag;});
        if(next==='on') s.on.push(tag);
        if(next==='not') s.not.push(tag);
        var sec_el=document.querySelector('.cb-section[data-section="'+sec+'"]');
        if(sec_el){var cl=sec_el.querySelector('.cb-clear');if(cl)cl.classList.toggle('visible',s.on.length>0||s.not.length>0);}
        schedule();
      }

      document.addEventListener('click',function(e){
        var el=e.target.closest&&e.target.closest('[data-tag][data-section]');
        if(el&&(el.classList.contains('cb-tag-item')||el.classList.contains('cb-chip'))){
          e.preventDefault(); toggleTag(el,e.shiftKey); return;
        }
        if(e.target.classList.contains('cb-pill-x')){
          var pill=e.target.closest('.cb-pill'); if(!pill) return;
          var tag=pill.dataset.tag,sec=pill.dataset.section,s=state.sections[sec];
          s.on=s.on.filter(function(t){return t!==tag;});
          s.not=s.not.filter(function(t){return t!==tag;});
          var te=document.querySelector('[data-tag="'+CSS.escape(tag)+'"][data-section="'+sec+'"]');
          if(te) te.dataset.state='off';
          var se=document.querySelector('.cb-section[data-section="'+sec+'"]');
          if(se){var cl=se.querySelector('.cb-clear');if(cl)cl.classList.toggle('visible',s.on.length>0||s.not.length>0);}
          schedule(); return;
        }
        if(e.target.classList.contains('cb-clear')){
          e.preventDefault();
          var sec=e.target.dataset.section,s=state.sections[sec];
          s.on=[];s.not=[];
          document.querySelectorAll('[data-section="'+sec+'"][data-state]').forEach(function(t){t.dataset.state='off';});
          e.target.classList.remove('visible');
          schedule(); return;
        }
      });

      document.querySelectorAll('.cb-logic').forEach(function(lg){
        var sec=lg.dataset.section;
        lg.querySelectorAll('.cb-logic-btn').forEach(function(btn){
          btn.addEventListener('click',function(){
            state.sections[sec].logic=btn.dataset.logic;
            lg.querySelectorAll('.cb-logic-btn').forEach(function(b){b.classList.toggle('active',b===btn);});
            schedule();
          });
        });
      });

      document.getElementById('cb-sort').addEventListener('change',function(){state.sort=this.value;schedule();});
      document.getElementById('cb-view').addEventListener('change',function(){state.view=this.value;schedule();});

      document.querySelectorAll('.cb-search').forEach(function(inp){
        inp.addEventListener('input',function(){
          var q=this.value.toLowerCase(),list=document.querySelector('[data-list="'+this.dataset.section+'"]');
          if(!list) return;
          list.querySelectorAll('[data-tag]').forEach(function(el){el.hidden=q.length>0&&el.dataset.tag.toLowerCase().indexOf(q)===-1;});
        });
      });

      /* save dialog */
      function openDlg(){document.getElementById('cb-dialog').classList.add('open');document.getElementById('cb-recipe-name').value='';document.getElementById('cb-recipe-name').focus();}
      function closeDlg(){document.getElementById('cb-dialog').classList.remove('open');}
      document.getElementById('cb-open-save').addEventListener('click',openDlg);
      document.getElementById('cb-save-btn').addEventListener('click',function(){if(!this.disabled)openDlg();});
      document.getElementById('cb-dialog-cancel').addEventListener('click',closeDlg);
      document.getElementById('cb-dialog').addEventListener('click',function(e){if(e.target===this)closeDlg();});
      document.getElementById('cb-dialog-save').addEventListener('click',function(){
        var name=document.getElementById('cb-recipe-name').value.trim();
        if(!name) return;
        closeDlg();
        fetch('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,query:state})})
          .then(function(r){return r.json();}).then(function(d){
            if(!d.id) return;
            var row=document.createElement('div');
            row.className='cb-recipe-row';row.dataset.id=d.id;row.dataset.query=JSON.stringify(state);
            row.innerHTML='★ <span class="cb-recipe-n">'+e(name)+'</span><button class="cb-recipe-del">\xd7</button>';
            bindRow(row);
            document.getElementById('cb-open-save').insertAdjacentElement('beforebegin',row);
          });
      });
      document.addEventListener('keydown',function(e){
        if(e.key==='Escape') closeDlg();
        if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();var f=document.querySelector('.cb-search');if(f)f.focus();}
      });

      function bindRow(row){
        row.addEventListener('click',function(e2){
          if(e2.target.classList.contains('cb-recipe-del')){
            fetch('/api/recipes/'+row.dataset.id,{method:'DELETE'}).then(function(r){if(r.status===204)row.remove();});
            return;
          }
          var q=JSON.parse(row.dataset.query);
          if(q.sections) SECTIONS.forEach(function(s){if(q.sections[s])state.sections[s]=q.sections[s];});
          if(q.sort) state.sort=q.sort;
          if(q.view) state.view=q.view;
          SECTIONS.forEach(function(s){
            var ss=state.sections[s],onS=new Set(ss.on),notS=new Set(ss.not);
            document.querySelectorAll('[data-section="'+s+'"][data-tag]').forEach(function(el){
              el.dataset.state=onS.has(el.dataset.tag)?'on':notS.has(el.dataset.tag)?'not':'off';
            });
            document.querySelectorAll('.cb-logic[data-section="'+s+'"] .cb-logic-btn').forEach(function(b){
              b.classList.toggle('active',b.dataset.logic===ss.logic);
            });
            var cl=document.querySelector('.cb-section[data-section="'+s+'"] .cb-clear');
            if(cl)cl.classList.toggle('visible',ss.on.length>0||ss.not.length>0);
          });
          var so=document.getElementById('cb-sort'),vi=document.getElementById('cb-view');
          if(so)so.value=state.sort; if(vi)vi.value=state.view;
          go();
        });
      }
      document.querySelectorAll('.cb-recipe-row').forEach(bindRow);

      /* mobile: collapsible sections — inactive ones start collapsed */
      if (window.innerWidth <= 900) {
        document.querySelectorAll('.cb-section').forEach(function(secEl) {
          var sec = secEl.dataset.section;
          var hasActive = state.sections[sec].on.length > 0 || state.sections[sec].not.length > 0;
          if (!hasActive) secEl.classList.add('cb-collapsed');
          secEl.querySelector('.cb-section-head').addEventListener('click', function(ev) {
            if (ev.target.closest('.cb-clear')) return;
            secEl.classList.toggle('cb-collapsed');
          });
        });
      }

      /* share current filter (recipe bar) */
      function showToast(msg){
        var t=document.getElementById('cb-toast');
        if(!t){t=document.createElement('div');t.id='cb-toast';t.className='tm-toast';document.body.appendChild(t);}
        t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2200);
      }
      var shrBtn=document.getElementById('cb-share-btn');
      if(shrBtn) shrBtn.addEventListener('click',function(){
        if(this.disabled) return;
        var link=location.href.replace(/[?&]_shared=[^&]*/,'');
        if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){showToast('link copied ✓');});}
        else{prompt('share link:',link);}
      });

      /* share button on sidebar recipe rows */
      document.addEventListener('click',function(ev){
        var btn=ev.target.closest('.cb-recipe-share');
        if(!btn) return;
        ev.stopPropagation();
        var id=btn.dataset.shareId;
        fetch('/api/recipes/'+id+'/share',{method:'POST'})
          .then(function(r){return r.json();})
          .then(function(d){
            if(!d.token) return;
            var link=location.origin+'/tags/recipes/fork/'+d.token;
            if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){showToast('link copied ✓');});}
            else{prompt('share link:',link);}
          });
      });

      /* fork banner: add shared recipe to my collection */
      var forkBtn=document.querySelector('.cb-banner-fork');
      if(forkBtn) forkBtn.addEventListener('click',function(){
        this.disabled=true;
        var token=this.dataset.token;
        fetch('/api/recipes/fork/'+token,{method:'POST'})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.id){showToast('added to my recipes ✓');setTimeout(function(){location.href='/tags/recipes';},900);}
          });
      });
    })();</script>`;

  res.send(page('Tags', body, req.session));
});

// ── GET /tags/manage — tag admin table ───────────────────────────────────────

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

// ── GET /tags/recipes/fork/:token — redirect to tag view with shared recipe ───

router.get('/recipes/fork/:token', async (req, res) => {
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
});

// ── GET /tags/recipes — saved recipes management ──────────────────────────────

router.get('/recipes', requireEditor, async (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const view   = req.query.view === 'list' ? 'list' : 'cards';

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
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
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

    function e(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  })();</script>`;

  res.send(page('My Recipes', body, req.session));
});

// ── TG-2: Tag autocomplete ────────────────────────────────────────────────────

router.get('/autocomplete', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  const { rows } = await db.query(
    'SELECT name FROM tags WHERE name LIKE $1 ORDER BY name LIMIT 10',
    [q + '%']
  );
  res.json(rows.map(r => r.name));
});

// ── V3: Photos by single tag ──────────────────────────────────────────────────

router.get('/:name', async (req, res) => {
  const tagName  = req.params.name;
  const isViewer = req.session.role === 'viewer';

  const { rows: photos } = isViewer
    ? await db.query(`
        SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader
        FROM photos p
        JOIN users u ON u.id = p.user_id
        JOIN photo_tags pt ON pt.photo_id = p.id
        JOIN tags t ON t.id = pt.tag_id
        JOIN album_access aa ON aa.album_id = p.album_id
        WHERE t.name = $1 AND aa.viewer_id = $2
        ORDER BY p.id DESC
      `, [tagName, req.session.userId])
    : await db.query(`
        SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader
        FROM photos p
        JOIN users u ON u.id = p.user_id
        JOIN photo_tags pt ON pt.photo_id = p.id
        JOIN tags t ON t.id = pt.tag_id
        WHERE t.name = $1
        ORDER BY p.id DESC
      `, [tagName]);

  const grid = photos.length === 0
    ? '<p style="color:#888">No photos found for this tag.</p>'
    : `<div class="photo-grid">${photos.map(p => `
        <div class="photo-card">
          <a href="/photos/${p.id}">
            <img src="/uploads/${esc(p.filename)}" alt="${esc(p.title)}">
            <div class="photo-meta">
              <strong>${esc(p.title)}</strong>
              <span class="uploader">by ${esc(p.uploader)}</span>
            </div>
          </a>
        </div>`).join('')}
      </div>`;

  res.send(page(`Tag: ${tagName}`, `
    <div class="top-bar">
      <h1>Tag: <em>${esc(tagName)}</em></h1>
      <a class="btn btn-secondary" href="/tags">← All tags</a>
    </div>
    ${grid}
  `, req.session));
});

module.exports = router;
