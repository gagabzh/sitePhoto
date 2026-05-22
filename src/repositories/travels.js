'use strict';

const db = require('../db');

async function fetchTravelList(session) {
  const isViewer = session.role === 'viewer';
  const { rows } = isViewer
    ? await db.query(`
        SELECT t.*, u.name AS creator_name,
          COUNT(DISTINCT ta.album_id)::int AS album_count,
          COUNT(DISTINCT tp.photo_id)::int AS photo_count
        FROM travels t
        JOIN users u ON u.id = t.user_id
        JOIN travel_access tac ON tac.travel_id = t.id AND tac.viewer_id = $1
        LEFT JOIN travel_albums ta ON ta.travel_id = t.id
        LEFT JOIN travel_photos tp ON tp.travel_id = t.id
        GROUP BY t.id, u.name
        ORDER BY t.created_at DESC
      `, [session.userId])
    : await db.query(`
        SELECT t.*, u.name AS creator_name,
          COUNT(DISTINCT ta.album_id)::int AS album_count,
          COUNT(DISTINCT tp.photo_id)::int AS photo_count
        FROM travels t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN travel_albums ta ON ta.travel_id = t.id
        LEFT JOIN travel_photos tp ON tp.travel_id = t.id
        GROUP BY t.id, u.name
        ORDER BY t.created_at DESC
      `);
  return rows;
}

async function fetchTravel(slug, viewerId = null) {
  const { rows } = await db.query(`
    SELECT t.*, u.name AS creator_name,
      COUNT(DISTINCT ta.album_id)::int  AS album_count,
      COUNT(DISTINCT tp.photo_id)::int  AS photo_count,
      COUNT(DISTINCT tac.viewer_id)::int AS viewer_count
      ${viewerId ? ', EXISTS(SELECT 1 FROM travel_access WHERE travel_id=t.id AND viewer_id=$2) AS has_access' : ', TRUE AS has_access'}
    FROM travels t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN travel_albums   ta  ON ta.travel_id  = t.id
    LEFT JOIN travel_photos   tp  ON tp.travel_id  = t.id
    LEFT JOIN travel_access   tac ON tac.travel_id = t.id
    WHERE t.slug = $1
    GROUP BY t.id, u.name
  `, viewerId ? [slug, viewerId] : [slug]);
  return rows[0] || null;
}

async function fetchLinkedAlbums(travelId) {
  const { rows } = await db.query(`
    SELECT a.id, a.title, a.description, u.name AS creator,
      COUNT(DISTINCT ap.photo_id)::int AS photo_count,
      (SELECT p2.filename FROM photos p2
       JOIN album_photos ap2 ON ap2.photo_id = p2.id
       WHERE ap2.album_id = a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
    FROM albums a
    JOIN travel_albums ta ON ta.album_id = a.id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN album_photos ap ON ap.album_id = a.id
    WHERE ta.travel_id = $1
    GROUP BY a.id, u.name
    ORDER BY a.created_at DESC
  `, [travelId]);
  return rows;
}

async function fetchLinkedPhotos(travelId) {
  const { rows } = await db.query(`
    SELECT p.id, p.title, p.filename, p.taken_at,
      p.latitude::float AS latitude, p.longitude::float AS longitude
    FROM photos p
    JOIN travel_photos tp ON tp.photo_id = p.id
    WHERE tp.travel_id = $1
    ORDER BY p.taken_at ASC NULLS LAST, p.id ASC
  `, [travelId]);
  return rows;
}

async function fetchTravelViewers(travelId) {
  const { rows } = await db.query(`
    SELECT u.id, u.name, u.email
    FROM users u
    JOIN travel_access ta ON ta.viewer_id = u.id
    WHERE ta.travel_id = $1
    ORDER BY u.name
  `, [travelId]);
  return rows;
}

async function fetchAllViewers() {
  const { rows } = await db.query(
    `SELECT id, name, email FROM users WHERE role = 'viewer' ORDER BY name`
  );
  return rows;
}

async function fetchDateRange(travelId) {
  const { rows } = await db.query(`
    SELECT MIN(p.taken_at) AS date_start, MAX(p.taken_at) AS date_end
    FROM photos p
    JOIN travel_photos tp ON tp.photo_id = p.id
    WHERE tp.travel_id = $1 AND p.taken_at IS NOT NULL
  `, [travelId]);
  return rows[0] || {};
}

async function insertTravel(userId, title, slug, description, gpxFilename, gpxGeojson, gpxDistanceKm, gpxDurationMin, gpxTrackpoints) {
  const { rows } = await db.query(`
    INSERT INTO travels (user_id, title, description, slug, gpx_filename, gpx_geojson, gpx_distance_km, gpx_duration_min, gpx_trackpoints)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING slug
  `, [userId, title, description, slug, gpxFilename, gpxGeojson, gpxDistanceKm, gpxDurationMin, gpxTrackpoints]);
  return rows[0];
}

async function updateTravel(id, title, description, newSlug, gpxCols, params) {
  await db.query(
    `UPDATE travels SET title=$1, description=$2, slug=$3, updated_at=NOW()${gpxCols} WHERE id=$4`,
    params
  );
}

async function updateTravelGpx(id, gpxFilename, gpxGeojson, gpxDistanceKm, gpxDurationMin, gpxTrackpoints) {
  await db.query(
    `UPDATE travels SET gpx_filename=$1, gpx_geojson=$2, gpx_distance_km=$3, gpx_duration_min=$4, gpx_trackpoints=$5, updated_at=NOW() WHERE id=$6`,
    [gpxFilename, gpxGeojson, gpxDistanceKm, gpxDurationMin, gpxTrackpoints, id]
  );
}

async function clearTravelGpx(id) {
  await db.query(
    `UPDATE travels SET gpx_filename=NULL, gpx_geojson=NULL, gpx_distance_km=NULL, gpx_duration_min=NULL, gpx_trackpoints=NULL, updated_at=NOW() WHERE id=$1`,
    [id]
  );
}

async function deleteTravel(id) {
  await db.query('DELETE FROM travels WHERE id=$1', [id]);
}

async function fetchLinkableAlbums() {
  const { rows } = await db.query(`
    SELECT a.id, a.title,
      COUNT(DISTINCT ap.photo_id)::int AS photo_count,
      (SELECT p2.filename FROM photos p2 JOIN album_photos ap2 ON ap2.photo_id=p2.id WHERE ap2.album_id=a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
    FROM albums a LEFT JOIN album_photos ap ON ap.album_id = a.id
    GROUP BY a.id ORDER BY a.created_at DESC
  `);
  return rows;
}

async function fetchLinkablePhotos() {
  const { rows } = await db.query(`
    SELECT p.id, p.title, p.filename, p.taken_at
    FROM photos p ORDER BY p.taken_at DESC NULLS LAST, p.id DESC LIMIT 300
  `);
  return rows;
}

async function fetchOwnedAlbums(albumIds, isAdmin, ownerId) {
  const { rows } = await db.query(
    `SELECT id FROM albums WHERE id = ANY($1::int[])${isAdmin ? '' : ' AND user_id=$2'}`,
    isAdmin ? [albumIds] : [albumIds, ownerId]
  );
  return rows;
}

async function fetchOwnedPhotos(photoIds, isAdmin, ownerId) {
  const { rows } = await db.query(
    `SELECT id FROM photos WHERE id = ANY($1::int[])${isAdmin ? '' : ' AND user_id=$2'}`,
    isAdmin ? [photoIds] : [photoIds, ownerId]
  );
  return rows;
}

async function fetchValidViewers(viewerIds) {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE role = 'viewer' AND id = ANY($1::int[])`,
    [viewerIds]
  );
  return rows;
}

async function checkSlugConflict(slug, excludeId) {
  const { rows } = await db.query(
    'SELECT id FROM travels WHERE slug = $1' + (excludeId ? ' AND id != $2' : ''),
    excludeId ? [slug, excludeId] : [slug]
  );
  return rows;
}

module.exports = {
  fetchTravelList,
  fetchTravel,
  fetchLinkedAlbums,
  fetchLinkedPhotos,
  fetchTravelViewers,
  fetchAllViewers,
  fetchDateRange,
  insertTravel,
  updateTravel,
  updateTravelGpx,
  clearTravelGpx,
  deleteTravel,
  fetchLinkableAlbums,
  fetchLinkablePhotos,
  fetchOwnedAlbums,
  fetchOwnedPhotos,
  fetchValidViewers,
  checkSlugConflict,
};
