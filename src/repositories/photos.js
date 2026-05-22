const db = require('../db');

async function fetchPhotoPage(cursor, limit = 24) {
  const params = [limit + 1];
  const cursorClause = cursor != null ? 'WHERE p.id < $2' : '';
  if (cursor != null) params.push(cursor);
  const { rows } = await db.query(`
    SELECT p.id, p.filename, p.title, p.user_id, u.name AS uploader,
      COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM photos p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    ${cursorClause}
    GROUP BY p.id, u.name
    ORDER BY p.id DESC
    LIMIT $1
  `, params);
  const hasMore = rows.length > limit;
  const photos = hasMore ? rows.slice(0, limit) : rows;
  return { photos, nextCursor: hasMore ? photos[photos.length - 1].id : null };
}

async function fetchPhotoStats() {
  const [uploaderRes, tagRes, countRes] = await Promise.all([
    db.query(`SELECT u.name, COUNT(*)::int AS cnt FROM photos p JOIN users u ON u.id = p.user_id GROUP BY u.name ORDER BY cnt DESC LIMIT 5`),
    db.query(`SELECT t.name, COUNT(*)::int AS cnt FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id GROUP BY t.name ORDER BY cnt DESC LIMIT 10`),
    db.query(`SELECT COUNT(*)::int AS n FROM photos`),
  ]);
  return {
    uploaders: uploaderRes.rows.map(r => [r.name, r.cnt]),
    topTags:   tagRes.rows.map(r => [r.name, r.cnt]),
    total:     countRes.rows[0]?.n ?? 0,
  };
}

async function fetchLatestAlbum() {
  const { rows } = await db.query(`
    SELECT a.id, a.title,
      (SELECT p2.filename FROM photos p2 JOIN album_photos ap2 ON ap2.photo_id = p2.id
       WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
    FROM albums a
    ORDER BY a.created_at DESC
    LIMIT 1
  `);
  return rows[0] || null;
}

async function bulkApplyTag(tagName, photoIds) {
  const { rows: [tagRow] } = await db.query(
    'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [tagName]
  );
  await db.query(
    'INSERT INTO photo_tags (photo_id, tag_id) SELECT unnest($1::int[]), $2 ON CONFLICT DO NOTHING',
    [photoIds, tagRow.id]
  );
}

async function bulkRemoveTag(tagName, photoIds) {
  await db.query(
    `DELETE FROM photo_tags
     WHERE photo_id = ANY($1::int[])
       AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
    [photoIds, tagName]
  );
}

async function insertPhoto({ userId, filename, s3Key, originalFilename, title, description, mimeType, size, takenAt, exposureTime, focalLength, lat, lon, ncUrl }) {
  const { rows: [{ id }] } = await db.query(
    'INSERT INTO photos (user_id, filename, s3_key, original_filename, title, description, mime_type, size, taken_at, exposure_time, focal_length, latitude, longitude, nextcloud_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id',
    [userId, filename, s3Key ?? null, originalFilename, title, description, mimeType, size, takenAt, exposureTime, focalLength, lat, lon, ncUrl]
  );
  return id;
}

async function fetchPhotoWithTags(id) {
  const { rows } = await db.query(`
    SELECT p.*, u.name AS uploader,
      COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM photos p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    WHERE p.id = $1
    GROUP BY p.id, u.name
  `, [id]);
  return rows[0] || null;
}

async function fetchPhotoForEdit(id) {
  const { rows } = await db.query(`
    SELECT p.*,
      COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
    FROM photos p
    LEFT JOIN photo_tags pt ON pt.photo_id = p.id
    LEFT JOIN tags t ON t.id = pt.tag_id
    WHERE p.id = $1
    GROUP BY p.id
  `, [id]);
  return rows[0] || null;
}

async function getPhotoOwner(id) {
  const { rows } = await db.query('SELECT user_id FROM photos WHERE id = $1', [id]);
  return rows[0] || null;
}

async function updatePhoto(id, title, description, takenAt, ncUrl, lat, lon) {
  await db.query(
    'UPDATE photos SET title = $1, description = $2, taken_at = $3, nextcloud_url = $4, latitude = $5, longitude = $6, updated_at = NOW() WHERE id = $7',
    [title, description, takenAt, ncUrl, lat, lon, id]
  );
}

module.exports = {
  fetchPhotoPage,
  fetchPhotoStats,
  fetchLatestAlbum,
  bulkApplyTag,
  bulkRemoveTag,
  insertPhoto,
  fetchPhotoWithTags,
  fetchPhotoForEdit,
  getPhotoOwner,
  updatePhoto,
};
