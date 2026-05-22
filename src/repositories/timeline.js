const db = require('../db');

async function fetchPhotos(session, albumFilter, tagFilter, fromFilter, toFilter) {
  const isViewer = session.role === 'viewer';
  const params = [];
  const joins = [];
  const conditions = [];

  if (isViewer) {
    params.push(session.userId);
    conditions.push(`EXISTS (SELECT 1 FROM album_photos ap JOIN album_access aa ON aa.album_id = ap.album_id WHERE ap.photo_id = p.id AND aa.viewer_id = $${params.length})`);
  }

  if (albumFilter) {
    params.push(albumFilter);
    conditions.push(`EXISTS (SELECT 1 FROM album_photos WHERE photo_id = p.id AND album_id = $${params.length})`);
  }

  if (tagFilter) {
    joins.push('JOIN photo_tags pt ON pt.photo_id = p.id');
    joins.push('JOIN tags t ON t.id = pt.tag_id');
    params.push(tagFilter);
    conditions.push(`t.name = $${params.length}`);
  }

  conditions.push('p.taken_at IS NOT NULL');

  if (fromFilter) {
    params.push(fromFilter);
    conditions.push(`p.taken_at::date >= $${params.length}::date`);
  }

  if (toFilter) {
    params.push(toFilter);
    conditions.push(`p.taken_at::date <= $${params.length}::date`);
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await db.query(`
    SELECT DISTINCT p.id, p.filename, p.title, u.name AS uploader,
      p.taken_at AS display_date
    FROM photos p
    JOIN users u ON u.id = p.user_id
    ${joins.join('\n    ')}
    ${where}
    ORDER BY display_date DESC, p.id DESC
  `, params.length ? params : []);
  return rows;
}

async function fetchFilterOptions(session) {
  const isViewer = session.role === 'viewer';

  const [albumsRes, tagsRes] = await Promise.all([
    isViewer
      ? db.query(
          `SELECT a.id, a.title FROM albums a
           JOIN album_access aa ON aa.album_id = a.id
           WHERE aa.viewer_id = $1 ORDER BY a.title`,
          [session.userId]
        )
      : db.query('SELECT id, title FROM albums ORDER BY title'),
    isViewer
      ? db.query(
          `SELECT DISTINCT t.name FROM tags t
           JOIN photo_tags pt ON pt.tag_id = t.id
           JOIN photos p ON p.id = pt.photo_id
           JOIN album_photos ap ON ap.photo_id = p.id
           JOIN album_access aa ON aa.album_id = ap.album_id
           WHERE aa.viewer_id = $1 ORDER BY t.name`,
          [session.userId]
        )
      : db.query('SELECT name FROM tags ORDER BY name'),
  ]);

  return { albums: albumsRes.rows, tags: tagsRes.rows };
}

module.exports = { fetchPhotos, fetchFilterOptions };
