jest.mock('../../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');

beforeEach(() => jest.resetAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

function makeApp(sessionData, sessionID = 'current-sid') {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    req.sessionID = sessionID;
    next();
  });
  // Guard: only authenticated users (matching requireAuth logic)
  app.use((req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    next();
  });
  app.use(require('../../routes/apiMe'));
  return app;
}

// App without session (to test 401 behavior)
function makeUnauthApp() {
  const app = express();
  app.use((req, res, next) => {
    req.session = { destroy: (cb) => cb() };
    req.sessionID = 'no-session';
    next();
  });
  app.use((req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    next();
  });
  app.use(require('../../routes/apiMe'));
  return app;
}

// ── GET /stats ────────────────────────────────────────────────────────────────

describe('GET /stats', () => {
  it('returns 200 with uploads/albums/recipes for an editor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 42 }] })  // photos count
      .mockResolvedValueOnce({ rows: [{ n: 5 }] })   // albums count
      .mockResolvedValueOnce({ rows: [{ n: 3 }] });  // recipes count

    const res = await request(makeApp(EDITOR_SESSION)).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uploads: 42, albums: 5, recipes: 3 });
  });

  it('returns 200 with correct counts for admin', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 100 }] }) // photos count
      .mockResolvedValueOnce({ rows: [{ n: 10 }] })  // albums count
      .mockResolvedValueOnce({ rows: [{ n: 7 }] });  // recipes count

    const res = await request(makeApp(ADMIN_SESSION)).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uploads: 100, albums: 10, recipes: 7 });
  });

  it('returns 200 with viewer-scoped counts for viewer', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 8 }] })   // photos accessible via album_access
      .mockResolvedValueOnce({ rows: [{ n: 2 }] })   // albums shared with viewer
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });  // recipes owned

    const res = await request(makeApp(VIEWER_SESSION)).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uploads: 8, albums: 2, recipes: 1 });
  });

  it('returns zeros when user has no data', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uploads: 0, albums: 0, recipes: 0 });
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(makeUnauthApp()).get('/stats');
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('viewer query uses album_access join (not photos.user_id)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 5 }] })
      .mockResolvedValueOnce({ rows: [{ n: 2 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });

    await request(makeApp(VIEWER_SESSION)).get('/stats');
    // First call (uploads) should reference album_access, not user_id direct filter
    const firstCall = db.query.mock.calls[0][0];
    expect(firstCall).toMatch(/album_access/);
    expect(firstCall).not.toMatch(/user_id/);
  });
});

// ── GET /sessions ─────────────────────────────────────────────────────────────

describe('GET /sessions', () => {
  it('returns sessions with isCurrent flag for current session', async () => {
    const expire1 = new Date('2026-06-01T12:00:00Z');
    const expire2 = new Date('2026-06-01T11:00:00Z');
    db.query.mockResolvedValueOnce({
      rows: [
        { sid: 'current-sid', expire: expire1 },
        { sid: 'other-sid',   expire: expire2 },
      ],
    });

    const res = await request(makeApp(EDITOR_SESSION, 'current-sid')).get('/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].isCurrent).toBe(true);
    expect(res.body[1].isCurrent).toBe(false);
    expect(res.body[0].sid).toBe('current-sid');
  });

  it('returns empty array when no sessions found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('queries session table filtering by userId', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION)).get('/sessions');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/session/);
    expect(sql).toMatch(/userId/);
    expect(params).toContain(EDITOR_SESSION.userId);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(makeUnauthApp()).get('/sessions');
    expect(res.status).toBe(401);
  });
});

// ── GET /uploads ──────────────────────────────────────────────────────────────

describe('GET /uploads', () => {
  it('returns last 10 uploads for editor', async () => {
    const photos = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1, title: `Photo ${i + 1}`, s3_key: `key${i}.jpg`,
      taken_at: null, created_at: new Date().toISOString(),
    }));
    db.query.mockResolvedValueOnce({ rows: photos });

    const res = await request(makeApp(EDITOR_SESSION)).get('/uploads');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].title).toBe('Photo 1');
  });

  it('returns empty array for viewer without hitting DB', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/uploads');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(makeUnauthApp()).get('/uploads');
    expect(res.status).toBe(401);
  });
});

// ── GET /albums ───────────────────────────────────────────────────────────────

describe('GET /albums', () => {
  it('returns own albums for editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Summer 2025' }] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Summer 2025');
    // Query should filter by user_id
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/user_id/);
  });

  it('returns shared albums for viewer', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5, title: 'Shared Album' }] });

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe('Shared Album');
    // Query should use album_access join
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/album_access/);
  });

  it('returns empty array when user has no albums', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(makeUnauthApp()).get('/albums');
    expect(res.status).toBe(401);
  });
});
