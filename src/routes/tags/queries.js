const db = require('../../db');
const { buildWhere, SECTIONS, ORDER_SQL } = require('../../combinator');

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

module.exports = { fetchTagVocabulary, fetchInitialResults };
