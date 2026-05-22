const router = require('express').Router();
const db = require('../db');
const { parseState, buildWhere, buildConditions, SECTIONS, ORDER_SQL } = require('../combinator');
const { requireEditor, wrapAsync } = require('../middleware');

// ── GET /api/tags/index ───────────────────────────────────────────────────────
// Returns the full tag vocabulary grouped by category with global photo counts.

router.get('/tags/index', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const uid = req.session.userId;

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
          JOIN album_photos ap ON ap.photo_id = p.id
          JOIN album_access aa ON aa.album_id = ap.album_id
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
}));

// ── GET /api/photos/combinator ────────────────────────────────────────────────
// Returns paginated photo results matching the combinator query.

router.get('/photos/combinator', wrapAsync(async (req, res) => {
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
}));

// ── GET /api/tags/counts ──────────────────────────────────────────────────────
// For each unchecked tag in each section, returns how many photos in the
// current filtered set also carry that tag.

router.get('/tags/counts', wrapAsync(async (req, res) => {
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
}));

// ── GET /api/geocode ─────────────────────────────────────────────────────────
// Nominatim proxy — keeps Nominatim calls server-side (avoids CSP issues, central
// place to add caching or rate-limit handling later).

router.get('/geocode', wrapAsync(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  try {
    const url = 'https://nominatim.openstreetmap.org/search?q='
      + encodeURIComponent(q) + '&format=json&limit=5&addressdetails=0';
    const r = await fetch(url, {
      headers: { 'User-Agent': 'sitephoto/1.0 (personal photo app; contact via github)' },
    });
    const data = await r.json();
    res.json(data.map(d => ({ name: d.display_name, lat: parseFloat(d.lat), lon: parseFloat(d.lon) })));
  } catch {
    res.json([]);
  }
}));

// ── GET /api/recipes ──────────────────────────────────────────────────────────

router.get('/recipes', wrapAsync(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, query_json FROM tag_recipes WHERE user_id = $1 ORDER BY created_at DESC',
    [req.session.userId]
  );
  res.json(rows);
}));

// ── POST /api/recipes ─────────────────────────────────────────────────────────

router.post('/recipes', wrapAsync(async (req, res) => {
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
}));

// ── DELETE /api/recipes/:id ───────────────────────────────────────────────────

router.delete('/recipes/:id', wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const { rows } = await db.query('SELECT user_id FROM tag_recipes WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  if (rows[0].user_id !== req.session.userId && req.session.role !== 'admin')
    return res.status(403).json({ error: 'forbidden' });

  await db.query('DELETE FROM tag_recipes WHERE id = $1', [id]);
  res.status(204).end();
}));

// ── GET /api/tags/:id/detail — fetch one tag for the drawer ──────────────────

router.get('/tags/:id/detail', requireEditor, wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await db.query(
    'SELECT id, name, category, aliases, description FROM tags WHERE id = $1', [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

// ── GET /api/tags/:id/photos — photos tagged with this tag (for AI picker) ────

router.get('/tags/:id/photos', requireEditor, wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await db.query(`
    SELECT p.id, p.filename, p.title
    FROM photos p
    JOIN photo_tags pt ON pt.photo_id = p.id
    WHERE pt.tag_id = $1
    ORDER BY p.taken_at DESC NULLS LAST, p.created_at DESC
    LIMIT 30
  `, [id]);
  res.json(rows);
}));

// ── POST /api/tags — create tag ───────────────────────────────────────────────

router.post('/tags', requireEditor, wrapAsync(async (req, res) => {
  const name     = String(req.body.name || '').trim().toLowerCase().slice(0, 100);
  const category = ['people','places','years','themes'].includes(req.body.category) ? req.body.category : null;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { rows } = await db.query(
    'INSERT INTO tags (name, category) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id',
    [name, category]
  );
  if (!rows.length) return res.status(409).json({ error: 'tag already exists' });
  res.status(201).json({ id: rows[0].id });
}));

// ── POST /api/tags/merge — merge tags ─────────────────────────────────────────

router.post('/tags/merge', requireEditor, wrapAsync(async (req, res) => {
  const targetId  = parseInt(req.body.targetId, 10);
  const sourceIds = (req.body.sourceIds || []).map(Number).filter(n => !isNaN(n) && n !== targetId);
  if (isNaN(targetId) || !sourceIds.length) return res.status(400).json({ error: 'invalid params' });
  // Re-point photo_tags from sources to target
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) SELECT photo_id, $1 FROM photo_tags WHERE tag_id = ANY($2::int[]) ON CONFLICT DO NOTHING',
    [targetId, sourceIds]
  );
  await db.query('DELETE FROM tags WHERE id = ANY($1::int[])', [sourceIds]);
  res.json({ ok: true });
}));

// ── PATCH /api/tags/:id — update tag ─────────────────────────────────────────

router.patch('/tags/:id', requireEditor, wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows: exist } = await db.query('SELECT id FROM tags WHERE id = $1', [id]);
  if (!exist.length) return res.status(404).json({ error: 'not found' });

  const updates = [];
  const vals    = [];
  if (req.body.name !== undefined) {
    vals.push(String(req.body.name).trim().toLowerCase().slice(0, 100));
    updates.push(`name = $${vals.length}`);
  }
  if (req.body.category !== undefined) {
    const cat = ['people','places','years','themes'].includes(req.body.category) ? req.body.category : null;
    vals.push(cat);
    updates.push(`category = $${vals.length}`);
  }
  if (req.body.aliases !== undefined) {
    const aliases = Array.isArray(req.body.aliases)
      ? req.body.aliases.map(a => String(a).trim().toLowerCase()).filter(Boolean)
      : [];
    vals.push(aliases);
    updates.push(`aliases = $${vals.length}`);
  }
  if (req.body.description !== undefined) {
    vals.push(String(req.body.description).slice(0, 500) || null);
    updates.push(`description = $${vals.length}`);
  }
  if (!updates.length) return res.json({ ok: true });
  vals.push(id);
  await db.query(`UPDATE tags SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals);
  res.json({ ok: true });
}));

// ── DELETE /api/tags/:id — delete tag ────────────────────────────────────────

router.delete('/tags/:id', requireEditor, wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  await db.query('DELETE FROM tags WHERE id = $1', [id]);
  res.status(204).end();
}));

// ── PATCH /api/recipes/:id — update recipe ───────────────────────────────────

router.patch('/recipes/:id', wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await db.query('SELECT user_id FROM tag_recipes WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  if (rows[0].user_id !== req.session.userId && req.session.role !== 'admin')
    return res.status(403).json({ error: 'forbidden' });

  const updates = [];
  const vals    = [];
  if (req.body.name !== undefined) {
    vals.push(String(req.body.name).trim().slice(0, 100));
    updates.push(`name = $${vals.length}`);
  }
  if (req.body.pinned !== undefined) {
    vals.push(!!req.body.pinned);
    updates.push(`pinned = $${vals.length}`);
  }
  if (req.body.query !== undefined && typeof req.body.query === 'object') {
    vals.push(JSON.stringify(req.body.query));
    updates.push(`query_json = $${vals.length}`);
  }
  if (!updates.length) return res.json({ ok: true });
  vals.push(id);
  await db.query(`UPDATE tag_recipes SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals);
  res.json({ ok: true });
}));

// ── POST /api/recipes/:id/album — snapshot album from recipe ─────────────────

router.post('/recipes/:id/album', requireEditor, wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'name required' });

  const { rows } = await db.query(
    'SELECT query_json FROM tag_recipes WHERE id = $1 AND user_id = $2',
    [id, req.session.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });

  const state = rows[0].query_json;
  const hasFilters = SECTIONS.some(s => {
    const sec = state.sections?.[s];
    return sec && (sec.on?.length > 0 || sec.not?.length > 0);
  });
  if (!hasFilters) return res.status(422).json({ error: 'recipe has no filters' });

  const { where, vals } = buildWhere(state, false, req.session.userId);

  const { rows: photoRows } = await db.query(
    `SELECT DISTINCT p.id FROM photos p ${where} ORDER BY p.id`,
    vals
  );

  const { rows: [album] } = await db.query(
    'INSERT INTO albums (user_id, title) VALUES ($1, $2) RETURNING id',
    [req.session.userId, name]
  );

  if (photoRows.length) {
    const placeholders = photoRows.map((_, i) => `($1, $${i + 2})`).join(',');
    await db.query(
      `INSERT INTO album_photos (album_id, photo_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      [album.id, ...photoRows.map(r => r.id)]
    );
  }

  res.status(201).json({ id: album.id, count: photoRows.length });
}));

// ── POST /api/recipes/:id/duplicate — clone recipe ───────────────────────────

router.post('/recipes/:id/duplicate', wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await db.query(
    'SELECT name, query_json FROM tag_recipes WHERE id = $1 AND user_id = $2',
    [id, req.session.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  const { rows: newRows } = await db.query(
    'INSERT INTO tag_recipes (user_id, name, query_json) VALUES ($1, $2, $3) RETURNING id',
    [req.session.userId, rows[0].name + ' (copy)', JSON.stringify(rows[0].query_json)]
  );
  res.status(201).json({ id: newRows[0].id });
}));

// ── GET /api/users/search — typeahead for share-to-user ──────────────────────

router.get('/users/search', wrapAsync(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const { rows } = await db.query(
    `SELECT id, name FROM users WHERE name ILIKE $1 AND id != $2 ORDER BY name LIMIT 10`,
    [`%${q}%`, req.session.userId]
  );
  res.json(rows);
}));

// ── POST /api/recipes/:id/share — generate share token ───────────────────────

router.post('/recipes/:id/share', wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await db.query(
    'SELECT share_token FROM tag_recipes WHERE id = $1 AND user_id = $2',
    [id, req.session.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  let token = rows[0].share_token;
  if (!token) {
    const { rows: updated } = await db.query(
      'UPDATE tag_recipes SET share_token = gen_random_uuid() WHERE id = $1 RETURNING share_token',
      [id]
    );
    token = updated[0].share_token;
  }
  res.json({ token });
}));

// ── POST /api/recipes/fork/:token — copy shared recipe into own collection ────

router.post('/recipes/fork/:token', wrapAsync(async (req, res) => {
  const { token } = req.params;
  const { rows } = await db.query(
    `SELECT tr.id, tr.name, tr.query_json, tr.user_id
     FROM tag_recipes tr WHERE tr.share_token = $1`,
    [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  const { rows: newRows } = await db.query(
    'INSERT INTO tag_recipes (user_id, name, query_json, shared_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.session.userId, rows[0].name, JSON.stringify(rows[0].query_json), rows[0].user_id]
  );
  res.status(201).json({ id: newRows[0].id });
}));

// ── POST /api/recipes/:id/share-to — push recipe directly to another user ────

router.post('/recipes/:id/share-to', wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  const { rows } = await db.query(
    'SELECT name, query_json FROM tag_recipes WHERE id = $1 AND user_id = $2',
    [id, req.session.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });

  if (req.body.everyone) {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const { rows: allUsers } = await db.query(
      'SELECT id FROM users WHERE id != $1', [req.session.userId]
    );
    if (allUsers.length) {
      const placeholders = allUsers.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(',');
      const params = allUsers.flatMap(u => [u.id, rows[0].name, JSON.stringify(rows[0].query_json), req.session.userId]);
      await db.query(`INSERT INTO tag_recipes (user_id,name,query_json,shared_by) VALUES ${placeholders}`, params);
    }
    return res.status(201).json({ ok: true, count: allUsers.length });
  }

  const toUserId = parseInt(req.body.userId, 10);
  if (isNaN(toUserId)) return res.status(400).json({ error: 'invalid id' });
  if (toUserId === req.session.userId) return res.status(400).json({ error: 'cannot share with yourself' });
  const { rows: targetUser } = await db.query('SELECT id FROM users WHERE id = $1', [toUserId]);
  if (!targetUser.length) return res.status(404).json({ error: 'user not found' });
  await db.query(
    'INSERT INTO tag_recipes (user_id,name,query_json,shared_by) VALUES ($1,$2,$3,$4)',
    [toUserId, rows[0].name, JSON.stringify(rows[0].query_json), req.session.userId]
  );
  res.status(201).json({ ok: true });
}));


module.exports = router;
