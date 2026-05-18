jest.mock('../../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');

beforeEach(() => jest.resetAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

const FAKE_PHOTO = { id: 1, title: 'Eiffel Tower', filename: 'eiffel.jpg', latitude: 48.8584, longitude: 2.2945 };

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { req.session = sessionData; next(); });
  app.use('/map', require('../../routes/map'));
  return app;
}

function mockFilterOptions() {
  db.query
    .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })               // photos query
    .mockResolvedValueOnce({ rows: [{ id: 1, title: 'Trip' }] }) // albums
    .mockResolvedValueOnce({ rows: [{ name: 'paris' }] });       // tags
}

// ── GPS3: full map view ───────────────────────────────────────────────────────

describe('GPS3: GET /map — full map view', () => {
  it('returns 200 and renders map with pins for editor', async () => {
    mockFilterOptions();
    const res = await request(makeApp(EDITOR_SESSION)).get('/map');
    expect(res.status).toBe(200);
    expect(res.text).toContain('leaflet');
    expect(res.text).toContain('markercluster');
    expect(res.text).toContain('48.8584');
    expect(res.text).toContain('Eiffel Tower');
  });

  it('shows empty message when no GPS photos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No photos with GPS');
    expect(res.text).not.toContain('leaflet');
  });

  it('returns 200 for viewer (scoped to accessible albums)', async () => {
    mockFilterOptions();
    const res = await request(makeApp(VIEWER_SESSION)).get('/map');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Map');
  });

  it('viewer query joins album_access', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(VIEWER_SESSION)).get('/map');
    const photoQuery = db.query.mock.calls[0][0];
    expect(photoQuery).toContain('album_access');
    expect(db.query.mock.calls[0][1]).toContain(20);
  });

  it('editor query does not filter by album_access', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION)).get('/map');
    const photoQuery = db.query.mock.calls[0][0];
    expect(photoQuery).not.toContain('album_access');
  });
});

// ── GPS4: filter by album and tag ─────────────────────────────────────────────

describe('GPS4: GET /map?album&tag — filtered map', () => {
  it('filters by album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map?album=3');
    expect(res.status).toBe(200);
    const photoQuery = db.query.mock.calls[0][0];
    expect(photoQuery).toContain('album_id');
    expect(db.query.mock.calls[0][1]).toContain(3);
  });

  it('filters by tag', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map?tag=paris');
    expect(res.status).toBe(200);
    const photoQuery = db.query.mock.calls[0][0];
    expect(photoQuery).toContain('t.name');
    expect(db.query.mock.calls[0][1]).toContain('paris');
  });

  it('shows filter dropdowns with album and tag options', async () => {
    mockFilterOptions();
    const res = await request(makeApp(EDITOR_SESSION)).get('/map');
    expect(res.text).toContain('Trip');
    expect(res.text).toContain('paris');
    expect(res.text).toContain('All albums');
    expect(res.text).toContain('All tags');
  });

  it('shows Clear button when filter is active', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map?tag=paris');
    expect(res.text).toContain('Clear');
  });

  it('does not show Clear button with no filter', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map');
    expect(res.text).not.toContain('Clear');
  });
});

// ── GPS5: zone search (Haversine filter) ─────────────────────────────────────

describe('GPS5: GET /map?lat&lon&radius — zone filter', () => {
  it('adds Haversine condition when lat+lon provided', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION)).get('/map?lat=48.8566&lon=2.3522&radius=10');
    const photoQuery = db.query.mock.calls[0][0];
    expect(photoQuery).toContain('asin');
    expect(photoQuery).toContain('radians');
  });

  it('passes lat, lon, radius as params to photo query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION)).get('/map?lat=48.8566&lon=2.3522&radius=10');
    const params = db.query.mock.calls[0][1];
    expect(params).toContain(48.8566);
    expect(params).toContain(2.3522);
    expect(params).toContain(10);
  });

  it('defaults radius to 25 when omitted', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION)).get('/map?lat=48.8566&lon=2.3522');
    const params = db.query.mock.calls[0][1];
    expect(params).toContain(25);
  });

  it('ignores location filter when lat or lon is missing', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION)).get('/map?lat=48.8566');
    const photoQuery = db.query.mock.calls[0][0];
    expect(photoQuery).not.toContain('asin');
  });

  it('shows Clear button when location filter is active', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map?lat=48.8566&lon=2.3522');
    expect(res.text).toContain('Clear');
  });

  it('renders zone search UI with radius input', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map');
    expect(res.text).toContain('loc-search-input');
    expect(res.text).toContain('name="radius"');
    expect(res.text).toContain('Zone search');
  });

  it('pre-fills coords as placeholder when location filter active', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/map?lat=48.8566&lon=2.3522');
    expect(res.text).toContain('48.85660');
    expect(res.text).toContain('2.35220');
  });
});
