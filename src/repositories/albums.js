const db = require('../db');

async function fetchAlbumList(session) {
  const isViewer = session.role === 'viewer';
  const { rows } = isViewer
    ? await db.query(`
        SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
          COUNT(DISTINCT ap.photo_id)::int AS photo_count,
          (SELECT p2.filename FROM photos p2
           JOIN album_photos ap2 ON ap2.photo_id = p2.id
           WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
        FROM albums a
        JOIN users u ON u.id = a.user_id
        JOIN album_access aa ON aa.album_id = a.id
        LEFT JOIN album_photos ap ON ap.album_id = a.id
        WHERE aa.viewer_id = $1
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `, [session.userId])
    : await db.query(`
        SELECT a.id, a.title, a.description, a.user_id, u.name AS creator,
          COUNT(DISTINCT ap.photo_id)::int AS photo_count,
          (SELECT p2.filename FROM photos p2
           JOIN album_photos ap2 ON ap2.photo_id = p2.id
           WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
        FROM albums a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN album_photos ap ON ap.album_id = a.id
        GROUP BY a.id, u.name
        ORDER BY a.created_at DESC
      `);
  return rows;
}

async function createAlbum(userId, title, description) {
  const { rows: [{ id }] } = await db.query(
    'INSERT INTO albums (user_id, title, description) VALUES ($1, $2, $3) RETURNING id',
    [userId, title, description || null]
  );
  return id;
}

async function getAlbum(id) {
  const { rows } = await db.query('SELECT * FROM albums WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getAlbumOwner(id) {
  const { rows } = await db.query('SELECT user_id FROM albums WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getAlbumWithCreator(id) {
  const { rows } = await db.query(
    'SELECT a.*, u.name AS creator FROM albums a JOIN users u ON u.id = a.user_id WHERE a.id = $1',
    [id]
  );
  return rows[0] || null;
}

async function fetchAlbumPhotos(albumId) {
  const { rows } = await db.query(
    'SELECT p.id, p.filename, p.title, p.user_id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 ORDER BY p.created_at ASC',
    [albumId]
  );
  return rows;
}

async function checkViewerAccess(albumId, viewerId) {
  const { rows } = await db.query(
    'SELECT 1 FROM album_access WHERE album_id = $1 AND viewer_id = $2',
    [albumId, viewerId]
  );
  return rows.length > 0;
}

async function bulkRemovePhotosFromAlbum(albumId, photoIds) {
  await db.query(
    'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = ANY($2::int[])',
    [albumId, photoIds]
  );
}

async function fetchViewerAccessLists(albumId) {
  // Promise.all order: withAccess first, withoutAccess second
  const [withAccess, withoutAccess] = await Promise.all([
    db.query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN album_access aa ON aa.viewer_id = u.id
       WHERE aa.album_id = $1 ORDER BY u.name`,
      [albumId]
    ),
    db.query(
      `SELECT u.id, u.name, u.email FROM users u
       WHERE u.role = 'viewer'
       AND u.id NOT IN (SELECT viewer_id FROM album_access WHERE album_id = $1)
       ORDER BY u.name`,
      [albumId]
    ),
  ]);
  return { withAccess: withAccess.rows, withoutAccess: withoutAccess.rows };
}

async function addViewerAccess(albumId, viewerId) {
  await db.query(
    'INSERT INTO album_access (album_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [albumId, viewerId]
  );
}

async function removeViewerAccess(albumId, viewerId) {
  await db.query(
    'DELETE FROM album_access WHERE album_id = $1 AND viewer_id = $2',
    [albumId, viewerId]
  );
}

async function updateAlbum(id, title, description) {
  await db.query(
    'UPDATE albums SET title = $1, description = $2, updated_at = NOW() WHERE id = $3',
    [title, description || null, id]
  );
}

async function deleteAlbum(id) {
  await db.query('DELETE FROM albums WHERE id = $1', [id]);
}

async function fetchPhotosNotInAlbum(albumId) {
  const { rows } = await db.query(
    `SELECT p.id, p.filename, p.title, u.name AS uploader
     FROM photos p
     JOIN users u ON u.id = p.user_id
     WHERE NOT EXISTS (SELECT 1 FROM album_photos WHERE photo_id = p.id AND album_id = $1)
     ORDER BY p.created_at DESC`,
    [albumId]
  );
  return rows;
}

async function linkPhotoToAlbum(albumId, photoId) {
  await db.query(
    'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [albumId, photoId]
  );
}

async function removePhotoFromAlbum(albumId, photoId) {
  await db.query(
    'DELETE FROM album_photos WHERE album_id = $1 AND photo_id = $2',
    [albumId, photoId]
  );
}

async function insertNewAlbumPhoto(albumId, photoId) {
  await db.query(
    'INSERT INTO album_photos (album_id, photo_id) VALUES ($1, $2)',
    [albumId, photoId]
  );
}

module.exports = {
  fetchAlbumList,
  createAlbum,
  getAlbum,
  getAlbumOwner,
  getAlbumWithCreator,
  fetchAlbumPhotos,
  checkViewerAccess,
  bulkRemovePhotosFromAlbum,
  fetchViewerAccessLists,
  addViewerAccess,
  removeViewerAccess,
  updateAlbum,
  deleteAlbum,
  fetchPhotosNotInAlbum,
  linkPhotoToAlbum,
  removePhotoFromAlbum,
  insertNewAlbumPhoto,
};
