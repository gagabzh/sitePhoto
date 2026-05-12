const router = require('express').Router();
const db = require('../db');
const { parseState, buildWhere, buildConditions, SECTIONS, ORDER_SQL } = require('../combinator');

// ── GET /api/tags/index ───────────────────────────────────────────────────────
// Returns the full tag vocabulary grouped by category with global photo counts.

router.get('/tags/index', async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const uid = req.session.userId;

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
        `, [uid])
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
        `, [uid])
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
    const bucket = r.category || 'other';
    const key    = (SECTIONS.includes(bucket) && bucket !== 'years') ? bucket : 'other';
    grouped[key].push({ name: r.name, count: r.count });
  }
  grouped.years = yearRows.map(r => ({ name: String(r.name), count: r.count }));
  res.json(grouped);
});

// ── GET /api/photos/combinator ────────────────────────────────────────────────
// Returns paginated photo results matching the combinator query.

router.get('/photos/combinator', async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const state    = parseState(req.query);
  const { where, vals } = buildWhere(state, isViewer, req.session.userId);

  const countSql = `SELECT COUNT(DISTINCT p.id)::int AS total FROM photos p ${where}`;
  const { rows: countRows } = await db.query(countSql, vals);
  const total = countRows[0].total;

  const offset   = (state.page - 1) * 24;
  const photoSql = `
    SELECT p.id, p.filename, p.title, p.taken_at, u.name AS uploader
    FROM photos p
    JOIN users u ON u.id = p.user_id
    ${where}
    ${ORDER_SQL[state.sort] || ORDER_SQL.newest}
    LIMIT 24 OFFSET $${vals.length + 1}
  `;
  const { rows: photos } = await db.query(photoSql, [...vals, offset]);

  res.json({ total, page: state.page, photos: photos.map(p => ({
    id:       p.id,
    filename: p.filename,
    title:    p.title,
    taken_at: p.taken_at,
    uploader: p.uploader,
  }))});
});

// ── GET /api/tags/counts ──────────────────────────────────────────────────────
// For each unchecked tag in each section, returns how many photos in the
// current filtered set also carry that tag.

router.get('/tags/counts', async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const state    = parseState(req.query);
  const result   = {};

  for (const sec of SECTIONS) {
    const checked = new Set([...state.sections[sec].on, ...state.sections[sec].not]);
    const { conds, vals } = buildConditions(state, isViewer, req.session.userId, sec);
    const checkedArr = [...checked];
    const baseConds = conds.length ? conds.join(' AND ') + ' AND ' : '';

    let sql, rows;

    if (sec === 'years') {
      const yr = `EXTRACT(YEAR FROM COALESCE(p.taken_at, p.created_at::date))::int`;
      const excludeCond = checkedArr.length > 0
        ? `AND ${yr} != ALL($${vals.length + 1})`
        : '';
      if (checkedArr.length > 0) vals.push(checkedArr.map(Number));
      sql = `
        SELECT ${yr}::text AS name, COUNT(DISTINCT p.id)::int AS count
        FROM photos p
        WHERE ${baseConds}p.taken_at IS NOT NULL ${excludeCond}
        GROUP BY 1
      `;
      ({ rows } = await db.query(sql, vals));
    } else {
      const secCategoryCheck = sec === 'other'
        ? `(t.category IS NULL OR t.category NOT IN ('people','places','years','themes'))`
        : `t.category = $${vals.length + 1}`;
      if (sec !== 'other') vals.push(sec);

      const excludeCond = checkedArr.length > 0
        ? `AND t.name != ALL($${vals.length + 1})`
        : '';
      if (checkedArr.length > 0) vals.push(checkedArr);

      sql = `
        SELECT t.name, COUNT(DISTINCT p.id)::int AS count
        FROM photos p
        JOIN photo_tags pt ON pt.photo_id = p.id
        JOIN tags t ON t.id = pt.tag_id
        WHERE ${baseConds}${secCategoryCheck} ${excludeCond}
        GROUP BY t.name
      `;
      ({ rows } = await db.query(sql, vals));
    }

    result[sec] = {};
    for (const r of rows) result[sec][r.name] = r.count;
  }

  res.json(result);
});

// ── GET /api/recipes ──────────────────────────────────────────────────────────

router.get('/recipes', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, query_json FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC',
    [req.session.userId]
  );
  res.json(rows);
});

// ── POST /api/recipes ─────────────────────────────────────────────────────────

router.post('/recipes', async (req, res) => {
  const name  = String(req.body.name  || '').trim().slice(0, 100);
  const query = req.body.query;
  if (!name || !query || typeof query !== 'object') {
    return res.status(400).json({ error: 'name and query are required' });
  }
  const { rows } = await db.query(
    'INSERT INTO tag_recipes (user_id, name, query_json) VALUES ($1, $2, $3) RETURNING id',
    [req.session.userId, name, JSON.stringify(query)]
  );
  res.status(201).json({ id: rows[0].id });
});

// ── DELETE /api/recipes/:id ───────────────────────────────────────────────────

router.delete('/recipes/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const { rows } = await db.query('SELECT user_id FROM tag_recipes WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  if (rows[0].user_id !== req.session.userId) return res.status(403).json({ error: 'forbidden' });

  await db.query('DELETE FROM tag_recipes WHERE id = $1', [id]);
  res.status(204).end();
});

module.exports = router;
