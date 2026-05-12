// Shared query-state parser and SQL builder for the Tag Combinator.
const SECTIONS = ['people', 'places', 'years', 'themes', 'other'];
const DEFAULT_LOGIC = { people: 'any', places: 'any', years: 'include', themes: 'any', other: 'any' };
const LOGIC_OPTS     = { people: ['any','all','none'], places: ['any','all','none'], years: ['include','exclude'], themes: ['any','all','none'], other: ['any','all','none'] };

function parseState(params) {
  const sections = {};
  for (const sec of SECTIONS) {
    const on   = params[sec]           ? String(params[sec]).split(',').map(t => t.trim()).filter(Boolean) : [];
    const not  = params[`${sec}.not`]  ? String(params[`${sec}.not`]).split(',').map(t => t.trim()).filter(Boolean) : [];
    const raw  = (params[`logic.${sec}`] || DEFAULT_LOGIC[sec]).toLowerCase();
    const opts = LOGIC_OPTS[sec];
    sections[sec] = { on, not, logic: opts.includes(raw) ? raw : DEFAULT_LOGIC[sec] };
  }
  const sort = ['newest','oldest'].includes(params.sort) ? params.sort : 'newest';
  const view = ['grid4','grid6','list','mosaic'].includes(params.view) ? params.view : 'grid4';
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  return { sections, sort, view, page };
}

// Build the WHERE conditions and param values for a combinator query.
// Pass excludeSection to skip that section (used for conditional counts).
function buildConditions(state, isViewer, userId, excludeSection) {
  const vals = [];
  const conds = [];
  function p(v) { vals.push(v); return `$${vals.length}`; }

  for (const sec of SECTIONS) {
    if (sec === excludeSection) continue;
    const { on, not, logic } = state.sections[sec];

    if (on.length > 0) {
      if (logic === 'any' || logic === 'include') {
        conds.push(`p.id IN (SELECT pt.photo_id FROM photo_tags pt JOIN tags t ON t.id=pt.tag_id WHERE t.name=ANY(${p(on)}))`);
      } else if (logic === 'all') {
        const pArr = p(on);
        const pN   = p(on.length);
        conds.push(`p.id IN (SELECT pt.photo_id FROM photo_tags pt JOIN tags t ON t.id=pt.tag_id WHERE t.name=ANY(${pArr}) GROUP BY pt.photo_id HAVING COUNT(DISTINCT t.name)=${pN})`);
      } else if (logic === 'none' || logic === 'exclude') {
        conds.push(`p.id NOT IN (SELECT pt.photo_id FROM photo_tags pt JOIN tags t ON t.id=pt.tag_id WHERE t.name=ANY(${p(on)}))`);
      }
    }
    if (not.length > 0) {
      conds.push(`p.id NOT IN (SELECT pt.photo_id FROM photo_tags pt JOIN tags t ON t.id=pt.tag_id WHERE t.name=ANY(${p(not)}))`);
    }
  }

  if (isViewer) {
    conds.push(`p.album_id IN (SELECT album_id FROM album_access WHERE viewer_id=${p(userId)})`);
  }

  return { conds, vals };
}

function buildWhere(state, isViewer, userId, excludeSection) {
  const { conds, vals } = buildConditions(state, isViewer, userId, excludeSection);
  return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', vals };
}

const ORDER_SQL = {
  newest: 'ORDER BY COALESCE(p.taken_at, p.created_at::date) DESC NULLS LAST, p.id DESC',
  oldest: 'ORDER BY COALESCE(p.taken_at, p.created_at::date) ASC  NULLS LAST, p.id ASC',
};

module.exports = { SECTIONS, DEFAULT_LOGIC, LOGIC_OPTS, parseState, buildConditions, buildWhere, ORDER_SQL };
