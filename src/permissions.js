const db = require('./db');

function canModify(session, entity) {
  return session.role === 'admin' || entity.user_id === session.userId;
}

async function filterOwnedPhotoIds(session, ids) {
  const { rows } = session.role === 'admin'
    ? await db.query('SELECT id FROM photos WHERE id = ANY($1::int[])', [ids])
    : await db.query('SELECT id FROM photos WHERE id = ANY($1::int[]) AND user_id = $2', [ids, session.userId]);
  return rows.map(r => r.id);
}

async function filterAlbumPhotoIds(session, albumId, ids) {
  const { rows } = session.role === 'admin'
    ? await db.query(
        'SELECT p.id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 AND p.id = ANY($2::int[])',
        [albumId, ids]
      )
    : await db.query(
        'SELECT p.id FROM photos p JOIN album_photos ap ON ap.photo_id = p.id WHERE ap.album_id = $1 AND p.id = ANY($2::int[]) AND p.user_id = $3',
        [albumId, ids, session.userId]
      );
  return rows.map(r => r.id);
}

module.exports = { canModify, filterOwnedPhotoIds, filterAlbumPhotoIds };
