const router = require('express').Router();
const db = require('../../db');
const { page, esc } = require('../../layout');
const { parseState, buildWhere, SECTIONS, DEFAULT_LOGIC } = require('../../combinator');
const { fetchTagVocabulary, fetchInitialResults } = require('../../repositories/tags');
const { wrapAsync } = require('../../middleware');
const { renderSection, renderPills, renderGrid } = require('./combinatorViews');
const { renderCombinatorScript } = require('./combinatorScript');

// ── GET / — Tag Combinator ────────────────────────────────────────────────────

router.get('/', wrapAsync(async (req, res) => {
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
    `<button class="cb-recipe-album" data-recipe-id="${r.id}" title="Create album" aria-label="Create album">📁</button>` +
    `<button class="cb-recipe-share" data-share-id="${r.id}" title="Share" aria-label="Share">⤴</button>` +
    `<button class="cb-recipe-del" aria-label="Delete">\xd7</button></div>`
  ).join('');

  // ── Shared recipe banner ──────────────────────────────────────────────────
  let sharedBanner = '';
  if (sharedInfo) {
    let accessWarning = '';
    if (isViewer) {
      const { where: whereAll, vals: valsAll } = buildWhere(state, false, null);
      const { where: whereMe,  vals: valsMe  } = buildWhere(state, true, req.session.userId);
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

    <div class="cb-dialog-backdrop" id="cb-album-dialog">
      <div class="cb-dialog">
        <h3>create album from recipe</h3>
        <input id="cb-album-name" type="text" placeholder="album name…" maxlength="100" autocomplete="off">
        <div class="cb-dialog-btns">
          <button class="btn btn-secondary btn-sm" id="cb-album-dialog-cancel">cancel</button>
          <button class="btn btn-sm" id="cb-album-dialog-create">create</button>
        </div>
      </div>
    </div>

    ${renderCombinatorScript(SECTIONS, DEFAULT_LOGIC, state)}`;

  res.send(page('Tags', body, req.session));
}));

module.exports = router;
