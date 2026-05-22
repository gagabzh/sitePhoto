const db = require('../db');
const { buildWhere, SECTIONS, ORDER_SQL } = require('../combinator');

async function fetchTagVocabulary(isViewer, userId) {
  const [{ rows: tagRows }, { rows: yearRows }] = await Promise.all([
    isViewer
      ? db.query(`
          SELECT t.name, t.category, COUNT(DISTINCT p.id)::int AS count
          FROM tags t
          JOIN photo_tags pt ON pt.tag_id = t.id
          JOIN photos p ON p.id = pt.photo_id
          JOIN album_photos ap ON ap.photo_id = p.id
          JOIN album_access aa ON aa.album_id = ap.album_id
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
          JOIN album_photos ap ON ap.photo_id = p.id
          JOIN album_access aa ON aa.album_id = ap.album_id
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

// ── Tag admin query builder ───────────────────────────────────────────────────

function buildManageQuery({ search, kind, sort, unused, dupes, offset, PAGE_SIZE }) {
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

  return { mainSql, countSql, statsSql, unusedSql, dupesSql, vals };
}

async function fetchTagsCsv() {
  const { rows } = await db.query(`
    SELECT t.id, t.name, t.category, t.aliases, t.description,
      COUNT(DISTINCT pt.photo_id)::int AS photo_count
    FROM tags t
    LEFT JOIN photo_tags pt ON pt.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.name
  `);
  return rows;
}

async function fetchManageData({ mainSql, countSql, statsSql, unusedSql, dupesSql, vals }, editId) {
  // Promise.all order: main[0], count[1], stats[2], unused[3], dupes[4], edit[5]
  const [tagsResult, countResult, statsResult, unusedResult, dupesResult, editResult] = await Promise.all([
    db.query(mainSql, vals),
    db.query(countSql, vals),
    db.query(statsSql),
    db.query(unusedSql),
    db.query(dupesSql),
    editId
      ? db.query('SELECT id, name, category, aliases, description FROM tags WHERE id = $1', [editId])
      : Promise.resolve({ rows: [] }),
  ]);

  return {
    tags:      tagsResult.rows,
    totalTags: countResult.rows[0].cnt,
    stats:     statsResult.rows[0],
    unusedCnt: unusedResult.rows[0].cnt,
    dupesCnt:  dupesResult.rows[0].cnt,
    editTag:   editResult.rows[0] || null,
  };
}

// ── Recipe queries ────────────────────────────────────────────────────────────

async function fetchRecipeByToken(token) {
  const { rows } = await db.query(
    'SELECT query_json FROM tag_recipes WHERE share_token = $1',
    [token]
  );
  return rows[0] || null;
}

async function fetchAllRecipes() {
  const { rows } = await db.query(
    `SELECT tr.id, tr.name, tr.query_json, tr.pinned, tr.use_count, tr.last_used_at,
            tr.created_at, tr.user_id AS owner_id, u.name AS owner_name
     FROM tag_recipes tr JOIN users u ON u.id = tr.user_id
     WHERE tr.shared_by IS NULL
     ORDER BY tr.name ASC, u.name ASC`
  );
  return rows;
}

async function fetchMyRecipes(userId) {
  // Promise.all order: own recipes[0], shared-with-me[1]
  const [{ rows: recipes }, { rows: sharedWithMe }] = await Promise.all([
    db.query(
      `SELECT id, name, query_json, pinned, use_count, last_used_at, created_at
       FROM tag_recipes WHERE user_id = $1 AND shared_by IS NULL ORDER BY pinned DESC, created_at DESC`,
      [userId]
    ),
    db.query(
      `SELECT tr.id, tr.name, tr.query_json, tr.pinned, tr.use_count, tr.last_used_at, tr.created_at,
              u.name AS shared_by_name
       FROM tag_recipes tr JOIN users u ON u.id = tr.shared_by
       WHERE tr.user_id = $1 AND tr.shared_by IS NOT NULL ORDER BY tr.created_at DESC`,
      [userId]
    ),
  ]);
  return { recipes, sharedWithMe };
}

module.exports = {
  fetchTagVocabulary,
  fetchInitialResults,
  buildManageQuery,
  fetchTagsCsv,
  fetchManageData,
  fetchRecipeByToken,
  fetchAllRecipes,
  fetchMyRecipes,
};
