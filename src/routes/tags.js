const router = require('express').Router();
const db = require('../db');
const { page, esc } = require('../layout');
const { parseState, buildWhere, SECTIONS, DEFAULT_LOGIC, LOGIC_OPTS, ORDER_SQL } = require('../combinator');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchTagVocabulary(isViewer, userId) {
  const { rows } = isViewer
    ? await db.query(`
        SELECT t.name, t.category, COUNT(DISTINCT p.id)::int AS count
        FROM tags t
        JOIN photo_tags pt ON pt.tag_id = t.id
        JOIN photos p ON p.id = pt.photo_id
        JOIN album_access aa ON aa.album_id = p.album_id
        WHERE aa.viewer_id = $1
        GROUP BY t.name, t.category ORDER BY t.name
      `, [userId])
    : await db.query(`
        SELECT t.name, t.category, COUNT(DISTINCT p.id)::int AS count
        FROM tags t
        JOIN photo_tags pt ON pt.tag_id = t.id
        JOIN photos p ON p.id = pt.photo_id
        GROUP BY t.name, t.category ORDER BY t.name
      `);
  const grouped = {};
  for (const s of SECTIONS) grouped[s] = [];
  for (const r of rows) {
    const key = (r.category && SECTIONS.includes(r.category)) ? r.category : 'other';
    grouped[key].push({ name: r.name, count: r.count });
  }
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
  if (!hasFilters) return `<div class="cb-no-filter">no filters yet — tick a tag on the left to begin.</div>`;
  if (!photos.length) return `<div class="cb-no-results">nothing matches this recipe yet. loosen a filter?</div>`;
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
  const isViewer = req.session.role === 'viewer';
  const state    = parseState(req.query);

  const [vocabulary, initial, recipeRows] = await Promise.all([
    fetchTagVocabulary(isViewer, req.session.userId),
    fetchInitialResults(state, isViewer, req.session.userId),
    db.query('SELECT id, name, query_json FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId])
      .then(r => r.rows),
  ]);

  const { total, photos, hasFilters } = initial;
  const hasAnyFilter = SECTIONS.some(s => state.sections[s].on.length > 0 || state.sections[s].not.length > 0);

  const sectionsHtml = SECTIONS.map(sec => renderSection(sec, vocabulary[sec], state.sections[sec])).join('');

  const recipesHtml = recipeRows.map(r =>
    `<div class="cb-recipe-row" data-id="${r.id}" data-query="${esc(JSON.stringify(r.query_json))}">` +
    `<span>★</span><span class="cb-recipe-n">${esc(r.name)}</span>` +
    `<button class="cb-recipe-del" aria-label="Delete">\xd7</button></div>`
  ).join('');

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
        <div class="cb-recipe-bar">
          <div class="cb-pills" id="cb-pills">${renderPills(state)}</div>
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
        var btn=document.getElementById('cb-save-btn'); if(!btn) return;
        btn.disabled=!SECTIONS.some(function(s){return state.sections[s].on.length>0||state.sections[s].not.length>0;});
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
    })();</script>`;

  res.send(page('Tags', body, req.session));
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
