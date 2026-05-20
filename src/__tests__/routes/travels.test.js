'use strict';

jest.mock('../../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../gpxParse', () => ({ parseGpx: jest.fn() }));
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  promises: { readFile: jest.fn(), unlink: jest.fn(), access: jest.fn() },
}));

// gpxState.file controls what req.file multer injects; set per-test
const gpxState = { file: null };
jest.mock('multer', () => {
  const m = jest.fn().mockReturnValue({
    single: jest.fn().mockReturnValue((req, res, cb) => {
      req.file = gpxState.file;
      cb();
    }),
  });
  m.diskStorage = jest.fn().mockReturnValue({});
  return m;
});

const request = require('supertest');
const express = require('express');
const db      = require('../../db');
const fs      = require('fs');
const { parseGpx } = require('../../gpxParse');
const { errorHandler } = require('../../middleware');

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

const FAKE_TRAVEL = {
  id: 1,
  user_id: 10,
  title:   'Patagonia 2024',
  slug:    'patagonia-2024',
  description: 'Beautiful mountains',
  gpx_filename: null,
  gpx_geojson:  null,
  gpx_distance_km: null,
  gpx_duration_min: null,
  gpx_trackpoints:  null,
  album_count:  2,
  photo_count:  5,
  viewer_count: 1,
  has_access:   true,
  creator_name: 'Alice',
  created_at:   '2024-01-01T00:00:00Z',
};

const FAKE_TRAVEL_GPX = {
  ...FAKE_TRAVEL,
  gpx_filename:     'abc.gpx',
  gpx_distance_km:  42.5,
  gpx_duration_min: 300,
  gpx_trackpoints:  500,
};

const mockClient = { query: jest.fn(), release: jest.fn() };

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, res, next) => { req.session = { ...sessionData }; next(); });
  app.use('/travels', require('../../routes/travels'));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.resetAllMocks();
  gpxState.file = null;
  db.connect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [] });
  fs.promises.readFile.mockResolvedValue('<gpx/>');
  fs.promises.unlink.mockResolvedValue();
  fs.promises.access.mockResolvedValue();
  parseGpx.mockReturnValue({ geojson: null, distanceKm: null, durationMin: null, trackpoints: 0 });
});

// ── GET /travels ─────────────────────────────────────────────────────────────

describe('GET /travels', () => {
  it('returns 200 and lists travels for editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Patagonia 2024');
  });

  it('shows "+ new travel" button to editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels');
    expect(res.text).toContain('/travels/new');
  });

  it('returns 200 for viewer but hides create button', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Patagonia 2024');
    expect(res.text).not.toContain('/travels/new');
  });

  it('shows empty-state message when viewer has no travels', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels');
    expect(res.status).toBe(200);
    expect(res.text).toContain('no travels yet');
  });
});

// ── GET /travels/new ─────────────────────────────────────────────────────────

describe('GET /travels/new', () => {
  it('returns 200 with create form for editor', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/travels"');
    expect(res.text).toContain('create travel');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels/new');
    expect(res.status).toBe(403);
  });
});

// ── POST /travels ─────────────────────────────────────────────────────────────

describe('POST /travels', () => {
  it('inserts travel and redirects to edit page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                            // uniqueSlug: no conflict
      .mockResolvedValueOnce({ rows: [{ slug: 'patagonia-2024' }] }); // INSERT

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels')
      .send('title=Patagonia+2024&description=Stunning');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO travels'),
      expect.arrayContaining(['Patagonia 2024', 'Stunning', 'patagonia-2024'])
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/travels/patagonia-2024/edit');
  });

  it('redirects back when title is empty', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels')
      .send('title=');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/travels/new');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('retries with suffixed slug on 23505 collision', async () => {
    const collision = Object.assign(new Error('duplicate'), { code: '23505' });
    db.query
      .mockResolvedValueOnce({ rows: [] })        // uniqueSlug: no existing
      .mockRejectedValueOnce(collision)           // INSERT fails (race condition)
      .mockResolvedValueOnce({ rows: [{ slug: 'patagonia-2024-2' }] }); // retry ok

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels')
      .send('title=Patagonia+2024');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/travels/patagonia-2024-2/edit');
  });

  it('parses and stores GPX data when file is uploaded', async () => {
    gpxState.file = { filename: 'abc.gpx', path: '/tmp/abc.gpx', originalname: 'track.gpx' };
    parseGpx.mockReturnValue({ geojson: { type: 'FeatureCollection', features: [] }, distanceKm: 42.5, durationMin: 300, trackpoints: 500 });
    db.query
      .mockResolvedValueOnce({ rows: [] })                         // uniqueSlug
      .mockResolvedValueOnce({ rows: [{ slug: 'test-gpx' }] });   // INSERT

    await request(makeApp(EDITOR_SESSION)).post('/travels').send('title=Test+GPX');

    const insertCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO travels'));
    expect(insertCall[1]).toContain(42.5);   // gpx_distance_km
    expect(insertCall[1]).toContain(300);    // gpx_duration_min
    expect(insertCall[1]).toContain(500);    // gpx_trackpoints
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/travels').send('title=X');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── GET /travels/:slug ────────────────────────────────────────────────────────

describe('GET /travels/:slug', () => {
  function mockDetailQueries(travel = FAKE_TRAVEL, extraRows = {}) {
    db.query
      .mockResolvedValueOnce({ rows: [travel] })       // fetchTravel
      // Promise.all order: linkedAlbums, linkedPhotos, travelViewers, dateRange
      .mockResolvedValueOnce({ rows: extraRows.albums   || [] })
      .mockResolvedValueOnce({ rows: extraRows.photos   || [] })
      .mockResolvedValueOnce({ rows: extraRows.viewers  || [] })
      .mockResolvedValueOnce({ rows: extraRows.dates    || [{}] });
  }

  it('returns 200 with map view for editor', async () => {
    mockDetailQueries();
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Patagonia 2024');
    expect(res.text).toContain('map');
  });

  it('returns journal view when ?view=journal', async () => {
    mockDetailQueries();
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024?view=journal');
    expect(res.status).toBe(200);
    expect(res.text).toContain('journal');
  });

  it('shows edit button to owner', async () => {
    mockDetailQueries();
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024');
    expect(res.text).toContain('/travels/patagonia-2024/edit');
  });

  it('returns 200 for viewer with access', async () => {
    mockDetailQueries({ ...FAKE_TRAVEL, has_access: true });
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels/patagonia-2024');
    expect(res.status).toBe(200);
  });

  it('returns 403 for viewer without access', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, has_access: false }] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels/patagonia-2024');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown slug', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/no-such-travel');
    expect(res.status).toBe(404);
  });

  it('renders linked album cards', async () => {
    const album = { id: 3, title: 'Beach Trip', description: null, creator: 'Alice', photo_count: 4, cover_filename: 'cover.jpg' };
    mockDetailQueries(FAKE_TRAVEL, { albums: [album] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024');
    expect(res.text).toContain('Beach Trip');
  });

  it('renders photo mosaic', async () => {
    const photo = { id: 7, title: 'Sunset', filename: 'sun.jpg', taken_at: null, latitude: null, longitude: null };
    mockDetailQueries(FAKE_TRAVEL, { photos: [photo] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024');
    expect(res.text).toContain('sun.jpg');
  });

  it('renders journal timeline grouped by date', async () => {
    const photo = { id: 8, title: 'Day 1', filename: 'd1.jpg', taken_at: '2024-06-01T10:00:00Z', latitude: null, longitude: null };
    mockDetailQueries(FAKE_TRAVEL, { photos: [photo] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024?view=journal');
    expect(res.text).toContain('d1.jpg');
    expect(res.text).toContain('1 JUN');
  });
});

// ── GET /travels/:slug/edit ───────────────────────────────────────────────────

describe('GET /travels/:slug/edit', () => {
  function mockEditQueries(travel = FAKE_TRAVEL) {
    db.query
      .mockResolvedValueOnce({ rows: [travel] })  // fetchTravel
      // Promise.all: linkedAlbums, linkedPhotos, allViewers, travelViewers
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 20, name: 'Bob', email: 'bob@test.com' }] })
      .mockResolvedValueOnce({ rows: [] });
  }

  it('returns 200 with edit form for owner', async () => {
    mockEditQueries();
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Patagonia 2024');
    expect(res.text).toContain('action="/travels/patagonia-2024/edit"');
  });

  it('shows viewer names in share panel', async () => {
    mockEditQueries({ ...FAKE_TRAVEL, viewer_count: 1 });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024/edit');
    expect(res.text).toContain('Bob');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024/edit');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels/patagonia-2024/edit');
    expect(res.status).toBe(403);
  });

  it('returns 404 when travel not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/no-such/edit');
    expect(res.status).toBe(404);
  });
});

// ── POST /travels/:slug/edit ──────────────────────────────────────────────────

describe('POST /travels/:slug/edit', () => {
  it('updates travel and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL] })   // fetchTravel
      .mockResolvedValueOnce({ rows: [] })              // uniqueSlug: no conflict
      .mockResolvedValueOnce({ rows: [] });             // UPDATE

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/edit')
      .send('title=Updated+Title&description=New+desc');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE travels'),
      expect.arrayContaining(['Updated Title', 'New desc'])
    );
    expect(res.status).toBe(302);
  });

  it('redirects back if title is empty', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/edit')
      .send('title=');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/edit');
  });

  it('replaces GPX file and updates stats when new file uploaded', async () => {
    gpxState.file = { filename: 'new.gpx', path: '/tmp/new.gpx', originalname: 'new.gpx' };
    parseGpx.mockReturnValue({ geojson: { type: 'FeatureCollection', features: [] }, distanceKm: 99.9, durationMin: 600, trackpoints: 1234 });
    db.query
      .mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL_GPX }] })  // fetchTravel
      .mockResolvedValueOnce({ rows: [] })                         // uniqueSlug
      .mockResolvedValueOnce({ rows: [] });                        // UPDATE

    await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/edit').send('title=Patagonia+2024');

    const updateCall = db.query.mock.calls.find(c => c[0].includes('UPDATE travels'));
    expect(updateCall[1]).toContain('new.gpx');
    expect(updateCall[1]).toContain(99.9);
    expect(fs.promises.unlink).toHaveBeenCalled();
  });

  it('returns 403 for non-owner', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/edit')
      .send('title=X');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/travels/patagonia-2024/edit')
      .send('title=X');
    expect(res.status).toBe(403);
  });
});

// ── POST /travels/:slug/gpx (AJAX upload) ────────────────────────────────────

describe('POST /travels/:slug/gpx', () => {
  it('returns 400 when no file is provided', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/gpx');
    expect(res.status).toBe(400);
    expect(JSON.parse(res.text)).toMatchObject({ error: expect.any(String) });
  });

  it('parses GPX and returns { ok: true }', async () => {
    gpxState.file = { filename: 'up.gpx', path: '/tmp/up.gpx' };
    parseGpx.mockReturnValue({ geojson: null, distanceKm: 10.0, durationMin: 90, trackpoints: 200 });
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL] })  // fetchTravel
      .mockResolvedValueOnce({ rows: [] });             // UPDATE

    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/gpx');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ ok: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE travels SET gpx_filename'),
      expect.arrayContaining(['up.gpx'])
    );
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/gpx');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown travel', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/no-such/gpx');
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/travels/patagonia-2024/gpx');
    expect(res.status).toBe(403);
  });
});

// ── GET /travels/:slug/gpx/file ───────────────────────────────────────────────

describe('GET /travels/:slug/gpx/file', () => {
  it('returns 404 when travel has no GPX file', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] }); // gpx_filename = null
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024/gpx/file');
    expect(res.status).toBe(404);
  });

  it('returns 403 when travel not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/no-such/gpx/file');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer without access', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL_GPX, has_access: false }] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels/patagonia-2024/gpx/file');
    expect(res.status).toBe(403);
  });
});

// ── POST /travels/:slug/gpx/remove ───────────────────────────────────────────

describe('POST /travels/:slug/gpx/remove', () => {
  it('clears GPX columns and redirects for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL_GPX] })  // fetchTravel
      .mockResolvedValueOnce({ rows: [] });                 // UPDATE

    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/gpx/remove');
    expect(res.status).toBe(302);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('gpx_filename=NULL'),
      [FAKE_TRAVEL_GPX.id]
    );
    expect(fs.promises.unlink).toHaveBeenCalled();
  });

  it('returns 403 for non-owner', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL_GPX, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/gpx/remove');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/travels/patagonia-2024/gpx/remove');
    expect(res.status).toBe(403);
  });
});

// ── POST /travels/:slug/delete ────────────────────────────────────────────────

describe('POST /travels/:slug/delete', () => {
  it('deletes travel and redirects for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL] })  // fetchTravel
      .mockResolvedValueOnce({ rows: [] });             // DELETE

    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/delete');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/travels');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM travels'),
      [FAKE_TRAVEL.id]
    );
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/patagonia-2024/delete');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/travels/patagonia-2024/delete');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown travel', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/travels/no-such/delete');
    expect(res.status).toBe(404);
  });
});

// ── GET /travels/:slug/api/linkable ──────────────────────────────────────────

describe('GET /travels/:slug/api/linkable', () => {
  it('returns albums and photos JSON for owner', async () => {
    const album = { id: 3, title: 'Beach', photo_count: 2, cover_filename: 'c.jpg' };
    const photo = { id: 7, title: 'Sunset', filename: 's.jpg', taken_at: null };
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL] })  // fetchTravel
      // Promise.all order: albums query, photos query
      .mockResolvedValueOnce({ rows: [album] })
      .mockResolvedValueOnce({ rows: [photo] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024/api/linkable');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(body.albums).toHaveLength(1);
    expect(body.albums[0].title).toBe('Beach');
    expect(body.photos).toHaveLength(1);
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/travels/patagonia-2024/api/linkable');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/travels/patagonia-2024/api/linkable');
    expect(res.status).toBe(403);
  });
});

// ── POST /travels/:slug/api/links ─────────────────────────────────────────────

describe('POST /travels/:slug/api/links', () => {
  it('replaces links in a transaction and returns { ok: true }', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] });  // fetchTravel

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/api/links')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ albumIds: [3, 4], photoIds: [7] }));

    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ ok: true });

    // Transaction sequence
    expect(db.connect).toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM travel_albums'),
      [FAKE_TRAVEL.id]
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM travel_photos'),
      [FAKE_TRAVEL.id]
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO travel_albums'),
      [FAKE_TRAVEL.id, 3]
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back and throws on client.query error', async () => {
    db.query.mockResolvedValueOnce({ rows: [FAKE_TRAVEL] });
    mockClient.query
      .mockResolvedValueOnce({})  // BEGIN
      .mockRejectedValueOnce(new Error('db error'));

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/api/links')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ albumIds: [], photoIds: [] }));

    expect(res.status).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/api/links')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/travels/patagonia-2024/api/links')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(403);
  });
});

// ── POST /travels/:slug/api/share ─────────────────────────────────────────────

describe('POST /travels/:slug/api/share', () => {
  it('validates viewerIds and only stores viewer-role users', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL] })        // fetchTravel
      .mockResolvedValueOnce({ rows: [{ id: 20 }] });         // validate: only viewer 20 is valid

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/api/share')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ viewerIds: [20, 99] })); // 99 is not a viewer-role user

    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ ok: true });

    // Validate query must filter by role='viewer'
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("role = 'viewer'"),
      expect.any(Array)
    );
    // Only viewer 20 inserted, not 99
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO travel_access'),
      [FAKE_TRAVEL.id, 20]
    );
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.any(String),
      [FAKE_TRAVEL.id, 99]
    );
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('skips all inserts when no valid viewer IDs remain after validation', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_TRAVEL] })
      .mockResolvedValueOnce({ rows: [] });  // no valid viewers

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/api/share')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ viewerIds: [99, 100] }));

    expect(res.status).toBe(200);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO travel_access'),
      expect.any(Array)
    );
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_TRAVEL, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/travels/patagonia-2024/api/share')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/travels/patagonia-2024/api/share')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(403);
  });
});
