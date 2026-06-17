'use strict';

const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const fsp    = fs.promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireEditor, canModify, wrapAsync } = require('../middleware');
const errors = require('../utils/errors');
const { indexView, createFormView, editFormView, detailMapView, detailJournalView } = require('./travelsViews');
const { parseGpx } = require('../gpxParse');
const {
  fetchTravelList, fetchTravel, fetchLinkedAlbums, fetchLinkedPhotos,
  fetchTravelViewers, fetchAllViewers, fetchDateRange,
  insertTravel, updateTravelGpx, clearTravelGpx, deleteTravel,
  fetchLinkableAlbums, fetchLinkablePhotos,
  fetchOwnedAlbums, fetchOwnedPhotos, fetchValidViewers, checkSlugConflict,
} = require('../repositories/travels');

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
  try { await fsp.unlink(p); } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`safeUnlink: failed to remove ${p}: ${err.code || err.message}`);
  }
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
    const rows = await checkSlugConflict(attempt, excludeId);
    if (!rows.length) return attempt;
    attempt = base + '-' + i++;
  }
}

function canView(session, travel) {
  if (session.role === 'admin' || session.role === 'editor') return true;
  return travel.has_access === true;
}

// ── Routes ────────────────────────────────────────────────────────────────

router.get('/', wrapAsync(async (req, res) => {
  const rows = await fetchTravelList(req.session);
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
      const row = await insertTravel(req.session.userId, title.trim(), slug, description || null,
        gpxFilename, gpxGeojson, gpxDistanceKm, gpxDurationMin, gpxTrackpoints);
      return res.redirect(`/travels/${row.slug}/edit`);
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
  if (!travel) return errors.notFound(res, 'Travel', false);
  if (!canView(req.session, travel)) return errors.accessDenied(res, false);

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
  if (!travel) return errors.notFound(res, 'Travel', false);
  if (!canModify(req.session, travel)) return errors.accessDenied(res, false);

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
  if (!travel) return errors.notFound(res, 'Travel', false);
  if (!canModify(req.session, travel)) return errors.accessDenied(res, false);

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
  // Note: the UPDATE query is kept inline because params is built dynamically with variable gpxCols

  res.redirect(`/travels/${newSlug}/edit`);
}));

// GPX upload (AJAX JSON response)
router.post('/:slug/gpx', requireEditor, gpxUpload.single('gpx'), wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return errors.notFound(res, 'Travel');
  if (!canModify(req.session, travel)) return errors.accessDenied(res);
  if (!req.file) return errors.badRequest(res, 'No file uploaded');

  await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));

  let geojson = null, distanceKm = null, durationMin = null, trackpoints = null;
  try {
    const xml = await fsp.readFile(req.file.path, 'utf8');
    const parsed = parseGpx(xml);
    geojson = parsed.geojson ? JSON.stringify(parsed.geojson) : null;
    distanceKm = parsed.distanceKm; durationMin = parsed.durationMin; trackpoints = parsed.trackpoints;
  } catch (_) { /* invalid GPX */ }

  await updateTravelGpx(travel.id, req.file.filename, geojson, distanceKm, durationMin, trackpoints);

  res.json({ ok: true });
}));

// Authenticated GPX file download (fix #7 — not served via static)
router.get('/:slug/gpx/file', wrapAsync(async (req, res) => {
  const isViewer = req.session.role === 'viewer';
  const travel = await fetchTravel(req.params.slug, isViewer ? req.session.userId : null);
  if (!travel || !canView(req.session, travel)) return errors.accessDenied(res, false);
  if (!travel.gpx_filename) return errors.notFound(res, 'GPX file', false);
  res.download(path.join(GPX_DIR, travel.gpx_filename), travel.slug + '.gpx');
}));

router.post('/:slug/gpx/remove', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return errors.notFound(res, 'Travel', false);
  if (!canModify(req.session, travel)) return errors.accessDenied(res, false);

  await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));
  await clearTravelGpx(travel.id);

  res.redirect(`/travels/${travel.slug}/edit`);
}));

router.post('/:slug/delete', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return errors.notFound(res, 'Travel', false);
  if (!canModify(req.session, travel)) return errors.accessDenied(res, false);

  await safeUnlink(path.join(GPX_DIR, travel.gpx_filename || ''));
  await deleteTravel(travel.id);
  res.redirect('/travels');
}));

// ── JSON APIs ─────────────────────────────────────────────────────────────

router.get('/:slug/api/linkable', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return errors.notFound(res, 'Travel');
  if (!canModify(req.session, travel)) return errors.accessDenied(res);

  // fetchLinkableAlbums and fetchLinkablePhotos run in parallel
  const [albums, photos] = await Promise.all([
    fetchLinkableAlbums(),
    fetchLinkablePhotos(),
  ]);

  res.json({ albums, photos });
}));

// Full replace of linked albums + photos
// Only albums/photos owned by the current user (or admin) can be linked
router.post('/:slug/api/links', requireEditor, wrapAsync(async (req, res) => {
  const travel = await fetchTravel(req.params.slug);
  if (!travel) return errors.notFound(res, 'Travel');
  if (!canModify(req.session, travel)) return errors.accessDenied(res);

  const { albumIds = [], photoIds = [] } = req.body;
  const tId = travel.id;

  // Validate ownership — editors can only link their own content; admins bypass
  const isAdmin = req.session.role === 'admin';
  const ownerId = req.session.userId;
  const [albumRows, photoRows] = await Promise.all([
    albumIds.length
      ? fetchOwnedAlbums(albumIds, isAdmin, ownerId)
      : [],
    photoIds.length
      ? fetchOwnedPhotos(photoIds, isAdmin, ownerId)
      : [],
  ]);
  const safeAlbumIds = albumRows.map(r => r.id);
  const safePhotoIds = photoRows.map(r => r.id);

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
  if (!travel) return errors.notFound(res, 'Travel');
  if (!canModify(req.session, travel)) return errors.accessDenied(res);

  const rawIds = (req.body.viewerIds || []).map(Number).filter(Number.isFinite);

  // Only allow IDs that belong to viewer-role accounts
  const validViewers = await fetchValidViewers(rawIds);
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
