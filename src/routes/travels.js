'use strict';

const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const fsp    = fs.promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db   = require('../db');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const { indexView, createFormView, editFormView, detailMapView, detailJournalView } = require('./travelsViews');
const { parseGpx } = require('../gpxParse');

// GPX files stored outside the static-served uploads/ dir so they require auth to download
const GPX_DIR = process.env.GPX_DIR || path.join(process.cwd(), 'gpx');
fs.mkdirSync(GPX_DIR, { recursive: true });

// ── Multer for GPX uploads ────────────────────────────────────────────────

const gpxUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GPX_DIR),
    filename:    (req, file, cb) => cb(null, uuidv4() + '.gpx'),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime = ['text/xml', 'application/gpx+xml', 'application/xml', 'application/octet-stream'].includes(file.mimetype);
    const okExt  = /\.gpx$/i.test(file.originalname);
    cb(null, okMime || okExt);
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function safeUnlink(p) {
  try { await fsp.unlink(p); } catch (_) {}
}

function makeSlug(title) {
  return (title || 'travel')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80) || 'travel';
}

async function uniqueSlug(base, excludeId = null) {
  let attempt = base || 'travel';
  let i = 2;
  for (;;) {
    const { rows } = await db.query(
      'SELECT id FROM travels WHERE slug = $1' + (excludeId ? ' AND id != $2' : ''),
      excludeId ? [attempt, excludeId] : [attempt]
    );
    if (!rows.length) return attempt;
    attempt = base + '-' + i++;
  }
}

function canView(session, travel) {
  if (session.role === 'admin' || session.role === 'editor') return true;
  return travel.has_access === true;
}

// ── DB queries ────────────────────────────────────────────────────────────

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

// ── Routes ────────────────────────────────────────────────────────────────

router.get('/', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';
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
      `, [req.session.userId])
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

  res.send(indexView(rows, req.session));
}));

router.get('/new', requireEditor, (req, res) => {
  res.send(createFormView(req.session));
});

router.post('/', requireEditor, gpxUpload.single('gpx'), wrapAsync(async (req, res) => {
  const { title, description } = req.body;
  if (!title || !title.trim()) return res.redirect('/travels/new');

  const baseSlug = makeSlug(title.trim());
  let gpxFilename = null;
  let gpxGeojson = null, gpxDistanceKm = null, gpxDurationMin = null, gpxTrackpoints = null;

  if (req.file) {
    gpxFilename = req.file.filename;
    try {
      const xml = await fsp.readFile(req.file.path, 'utf8');
      const parsed = parseGpx(xml);
      gpxGeojson = parsed.geojson ? JSON.stringify(parsed.geojson) : null;
      gpxDistanceKm = parsed.distanceKm;
      gpxDurationMin = parsed.durationMin;
      gpxTrackpoints = parsed.trackpoints;
    } catch (_) { /* invalid GPX — keep file, skip stats */ }
  }

  // Slug collision handled by catching the unique constraint (fix #6)
  let slug = await uniqueSlug(baseSlug);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await db.query(`
        INSERT INTO travels (user_id, title, description, slug, gpx_filename, gpx_geojson, gpx_distance_km, gpx_duration_min, gpx_trackpoints)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING slug
      `, [req.session.userId, title.trim(), description || null, slug,
          gpxFilename, gpxGeojson, gpxDistanceKm, gpxDurationMin, gpxTrackpoints]);
      return res.redirect(`/travels/${rows[0].slug}/edit`);
    } catch (err) {
      if (err.code === '23505') { slug = baseSlug + '-' + (attempt + 2); }
      else throw err;
    }
  }
  throw new Error('Could not generate a unique slug after 5 attempts');
}));

router.get('/:slug', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const travel = await fetchTravel(req.params.slug, isViewer ? req.session.userId : null);
  if (!travel) return res.status(404).send('Travel not found');
  if (!canView(req.session, travel)) return res.status(403).send('Access denied');

  const [linkedAlbums, linkedPhotos, travelViewers, dateRange] = await Promise.all([
    fetchLinkedAlbums(travel.id),
    fetchLinkedPhotos(travel.id),
    fetchTravelViewers(travel.id),
    fetchDateRange(travel.id),
  ]);

  if (req.query.view === 'journal') {
    return res.send(detailJournalView(travel, linkedAlbums, linkedPhotos, travelViewers, req.session, dateRange));
  }
  res.send(detailMapView(travel, linkedAlbums, linkedPhotos, travelViewers, req.session, dateRange));
}));

router.get('/:slug/edit', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).send('Not found');
  if (!canModify(req.session, travel)) return res.status(403).send('Access denied');

  const [linkedAlbums, linkedPhotos, allViewers, travelViewers] = await Promise.all([
    fetchLinkedAlbums(travel.id),
    fetchLinkedPhotos(travel.id),
    fetchAllViewers(),
    fetchTravelViewers(travel.id),
  ]);

  res.send(editFormView(travel, linkedAlbums, linkedPhotos, allViewers, travelViewers, req.session));
}));

router.post('/:slug/edit', requireEditor, gpxUpload.single('gpx'), wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).send('Not found');
  if (!canModify(req.session, travel)) return res.status(403).send('Access denied');

  const { title, description } = req.body;
  if (!title || !title.trim()) return res.redirect(`/travels/${req.params.slug}/edit`);

  const newSlug = await uniqueSlug(makeSlug(title.trim()), travel.id);
  const params = [title.trim(), description || null, newSlug, travel.id];
  let gpxCols = '';

  if (req.file) {
    await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));
    try {
      const xml = await fsp.readFile(req.file.path, 'utf8');
      const parsed = parseGpx(xml);
      gpxCols = ', gpx_filename=$5, gpx_geojson=$6, gpx_distance_km=$7, gpx_duration_min=$8, gpx_trackpoints=$9';
      params.push(req.file.filename,
        parsed.geojson ? JSON.stringify(parsed.geojson) : null,
        parsed.distanceKm, parsed.durationMin, parsed.trackpoints);
    } catch (_) {
      gpxCols = ', gpx_filename=$5';
      params.push(req.file.filename);
    }
  }

  await db.query(
    `UPDATE travels SET title=$1, description=$2, slug=$3, updated_at=NOW()${gpxCols} WHERE id=$4`,
    params
  );

  res.redirect(`/travels/${newSlug}/edit`);
}));

// GPX upload (AJAX JSON response)
router.post('/:slug/gpx', requireEditor, gpxUpload.single('gpx'), wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).json({ error: 'Not found' });
  if (!canModify(req.session, travel)) return res.status(403).json({ error: 'Access denied' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));

  let geojson = null, distanceKm = null, durationMin = null, trackpoints = null;
  try {
    const xml = await fsp.readFile(req.file.path, 'utf8');
    const parsed = parseGpx(xml);
    geojson = parsed.geojson ? JSON.stringify(parsed.geojson) : null;
    distanceKm = parsed.distanceKm; durationMin = parsed.durationMin; trackpoints = parsed.trackpoints;
  } catch (_) { /* invalid GPX */ }

  await db.query(
    `UPDATE travels SET gpx_filename=$1, gpx_geojson=$2, gpx_distance_km=$3, gpx_duration_min=$4, gpx_trackpoints=$5, updated_at=NOW() WHERE id=$6`,
    [req.file.filename, geojson, distanceKm, durationMin, trackpoints, travel.id]
  );

  res.json({ ok: true });
}));

// Authenticated GPX file download (fix #7 — not served via static)
router.get('/:slug/gpx/file', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const travel = await fetchTravel(req.params.slug, isViewer ? req.session.userId : null);
  if (!travel || !canView(req.session, travel)) return res.status(403).send('Access denied');
  if (!travel.gpx_filename) return res.status(404).send('No GPX file');
  res.download(path.join(GPX_DIR, travel.gpx_filename), travel.slug + '.gpx');
}));

router.post('/:slug/gpx/remove', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).send('Not found');
  if (!canModify(req.session, travel)) return res.status(403).send('Access denied');

  await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));
  await db.query(
    `UPDATE travels SET gpx_filename=NULL, gpx_geojson=NULL, gpx_distance_km=NULL, gpx_duration_min=NULL, gpx_trackpoints=NULL, updated_at=NOW() WHERE id=$1`,
    [travel.id]
  );

  res.redirect(`/travels/${travel.slug}/edit`);
}));

router.post('/:slug/delete', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).send('Not found');
  if (!canModify(req.session, travel)) return res.status(403).send('Access denied');

  await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));
  await db.query('DELETE FROM travels WHERE id=$1', [travel.id]);
  res.redirect('/travels');
}));

// ── JSON APIs ─────────────────────────────────────────────────────────────

router.get('/:slug/api/linkable', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).json({ error: 'Not found' });
  if (!canModify(req.session, travel)) return res.status(403).json({ error: 'Access denied' });

  // fetchLinkedAlbums and fetchLinkedPhotos run in parallel
  const [albums, photos] = await Promise.all([
    db.query(`
      SELECT a.id, a.title,
        COUNT(DISTINCT ap.photo_id)::int AS photo_count,
        (SELECT p2.filename FROM photos p2 JOIN album_photos ap2 ON ap2.photo_id=p2.id WHERE ap2.album_id=a.id ORDER BY p2.created_at ASC LIMIT 1) AS cover_filename
      FROM albums a LEFT JOIN album_photos ap ON ap.album_id = a.id
      GROUP BY a.id ORDER BY a.created_at DESC
    `),
    db.query(`
      SELECT p.id, p.title, p.filename, p.taken_at
      FROM photos p ORDER BY p.taken_at DESC NULLS LAST, p.id DESC LIMIT 300
    `),
  ]);

  res.json({ albums: albums.rows, photos: photos.rows });
}));

// Full replace of linked albums + photos
// Only albums/photos owned by the current user (or admin) can be linked
router.post('/:slug/api/links', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).json({ error: 'Not found' });
  if (!canModify(req.session, travel)) return res.status(403).json({ error: 'Access denied' });

  const { albumIds = [], photoIds = [] } = req.body;
  const tId = travel.id;

  // Validate ownership — editors can only link their own content; admins bypass
  const isAdmin = req.session.role === 'admin';
  const ownerId = req.session.userId;
  const [albumRes, photoRes] = await Promise.all([
    albumIds.length
      ? db.query(
          `SELECT id FROM albums WHERE id = ANY($1::int[])${isAdmin ? '' : ' AND user_id=$2'}`,
          isAdmin ? [albumIds] : [albumIds, ownerId]
        )
      : { rows: [] },
    photoIds.length
      ? db.query(
          `SELECT id FROM photos WHERE id = ANY($1::int[])${isAdmin ? '' : ' AND user_id=$2'}`,
          isAdmin ? [photoIds] : [photoIds, ownerId]
        )
      : { rows: [] },
  ]);
  const safeAlbumIds = albumRes.rows.map(r => r.id);
  const safePhotoIds = photoRes.rows.map(r => r.id);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM travel_albums WHERE travel_id=$1', [tId]);
    await client.query('DELETE FROM travel_photos WHERE travel_id=$1', [tId]);
    if (safeAlbumIds.length) {
      await client.query(
        'INSERT INTO travel_albums (travel_id, album_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
        [tId, safeAlbumIds]
      );
    }
    if (safePhotoIds.length) {
      await client.query(
        'INSERT INTO travel_photos (travel_id, photo_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
        [tId, safePhotoIds]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ ok: true });
}));

// Replace viewer access — validates IDs are actual viewer-role users (fix #4)
// Uses dedicated client for transaction (fix #1)
router.post('/:slug/api/share', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return res.status(404).json({ error: 'Not found' });
  if (!canModify(req.session, travel)) return res.status(403).json({ error: 'Access denied' });

  const rawIds = (req.body.viewerIds || []).map(Number).filter(Number.isFinite);

  // Only allow IDs that belong to viewer-role accounts
  const { rows: validViewers } = await db.query(
    `SELECT id FROM users WHERE role = 'viewer' AND id = ANY($1::int[])`,
    [rawIds]
  );
  const safeIds = validViewers.map(r => r.id);
  const tId = travel.id;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM travel_access WHERE travel_id=$1', [tId]);
    if (safeIds.length) {
      await client.query(
        'INSERT INTO travel_access (travel_id, viewer_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING',
        [tId, safeIds]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ ok: true });
}));

module.exports = router;
