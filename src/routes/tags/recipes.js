const router = require('express').Router();
const { page } = require('../../layout');
const { wrapAsync } = require('../../middleware');
const { fetchRecipeByToken, fetchAllRecipes, fetchMyRecipes } = require('./queries');
const { renderAdminPage, renderMyRecipesPage } = require('./recipesViews');

// ── GET /recipes/fork/:token — redirect to tag view with shared recipe ────────

router.get('/recipes/fork/:token', wrapAsync(async (req, res) => {
  const { token } = req.params;
  const row = await fetchRecipeByToken(token);
  if (!row) return res.status(404).send(page('Recipe not found',
    '<p style="padding:40px;font-family:\'Kalam\',cursive;font-size:18px;color:var(--ink-soft)">This share link is invalid or has been removed.</p>',
    req.session));
  const q = row.query_json;
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
    const allRecipes = await fetchAllRecipes();
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
    return res.send(page('All Recipes', renderAdminPage({ filtered, search }), req.session));
  }

  const { recipes, sharedWithMe } = await fetchMyRecipes(req.session.userId);
  const filtered = search
    ? recipes.filter(r => {
        if (r.name.toLowerCase().includes(search)) return true;
        const secs = (r.query_json || {}).sections || {};
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
  const isAdmin  = req.session.role === 'admin';

  res.send(page('My Recipes',
    renderMyRecipesPage({ recipes, sharedWithMe, filtered, pinned, unpinned, search, view, isAdmin }),
    req.session));
}));

module.exports = router;
