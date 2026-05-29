jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../notifications', () => ({ notifyUser: jest.fn(), initSocketIO: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { notifyUser } = require('../../notifications');

const VALID_SECRET = 'test-secret-abc123';

beforeEach(() => {
  jest.resetAllMocks();
  process.env.WORKER_API_SECRET = VALID_SECRET;
});

afterAll(() => {
  delete process.env.WORKER_API_SECRET;
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/internal', require('../../routes/internal'));
  return app;
}

// ── requireWorkerSecret guard ────────────────────────────────────────────────

describe('requireWorkerSecret', () => {
  it('returns 403 when x-worker-secret header is absent', async () => {
    const res = await request(makeApp())
      .post('/internal/identification-result')
      .send({ photoId: '1', userId: '2', tags: '' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when x-worker-secret header is wrong', async () => {
    const res = await request(makeApp())
      .post('/internal/identification-result')
      .set('x-worker-secret', 'wrong-secret')
      .send({ photoId: '1', userId: '2', tags: '' });
    expect(res.status).toBe(403);
  });
});

// ── POST /internal/identification-result ────────────────────────────────────

describe('POST /internal/identification-result', () => {
  it('returns 400 when photoId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/identification-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '2', tags: 'Alice' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photoId/);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/identification-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '1', tags: 'Alice' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('inserts tags and notifies user on happy path', async () => {
    // 1st query: INSERT INTO tags RETURNING id
    // 2nd query: INSERT INTO photo_tags
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }, { id: 11 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/internal/identification-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '42', userId: '7', tags: 'Alice, Bob' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO tags'), [['alice', 'bob']]);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO photo_tags'), ['42', [10, 11]]);
    expect(notifyUser).toHaveBeenCalledWith('7', { photoId: '42', tags: ['alice', 'bob'] });
  });

  it('skips DB inserts and still notifies when tags are empty', async () => {
    const res = await request(makeApp())
      .post('/internal/identification-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '42', userId: '7', tags: '' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith('7', { photoId: '42', tags: [] });
  });

  it('normalises tags: trims whitespace, lowercases, splits on newlines', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp())
      .post('/internal/identification-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '1', userId: '1', tags: '  Alice\nBOB  ' });

    expect(db.query).toHaveBeenNthCalledWith(1, expect.anything(), [['alice', 'bob']]);
  });
});

// ── POST /internal/describe-person-result ────────────────────────────────────

describe('POST /internal/describe-person-result', () => {
  it('returns 403 without valid x-worker-secret', async () => {
    const res = await request(makeApp())
      .post('/internal/describe-person-result')
      .send({ tagId: 7, userId: '2', description: 'red hair' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when tagId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/describe-person-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '2', description: 'red hair' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tagId/);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/describe-person-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ tagId: 7, description: 'red hair' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('updates tag description and notifies user on happy path', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/internal/describe-person-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ tagId: 7, userId: '2', description: 'young woman with red hair' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tags SET description'),
      ['young woman with red hair', 7],
    );
    expect(notifyUser).toHaveBeenCalledWith(
      '2',
      { tagId: 7, description: 'young woman with red hair' },
      'describe-person-complete',
    );
  });

  it('skips DB update and forwards error to client when worker job failed', async () => {
    const res = await request(makeApp())
      .post('/internal/describe-person-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ tagId: 7, userId: '2', error: 'could not download any photos' });

    expect(res.status).toBe(200);
    expect(db.query).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith(
      '2',
      { tagId: 7, error: 'could not download any photos' },
      'describe-person-complete',
    );
  });
});

// ── POST /internal/nextcloud-photo ───────────────────────────────────────────

describe('POST /internal/nextcloud-photo', () => {
  it('returns 403 without valid x-worker-secret', async () => {
    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .send({ userId: 1, s3Key: 'abc.jpg' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({ s3Key: 'abc.jpg' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when s3Key is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: 1 });
    expect(res.status).toBe(400);
  });

  it('inserts photo, album membership, and tags — returns photoId', async () => {
    // 1. INSERT photos RETURNING id
    // 2. INSERT album_photos
    // 3. INSERT tags RETURNING id
    // 4. INSERT photo_tags
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })     // INSERT photos
      .mockResolvedValueOnce({ rows: [] })                // INSERT album_photos
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })     // INSERT tags
      .mockResolvedValueOnce({ rows: [] });               // INSERT photo_tags

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({
        userId: 5, s3Key: 'uuid-abc.jpg', mimeType: 'image/jpeg',
        shareUrl: 'https://cloud.example.com/s/token', place: 'Paris',
        albumId: 7, tags: ['paris', 'vacation'], importId: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(42);
    expect(db.query).toHaveBeenCalledTimes(4);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [5, 'uuid-abc.jpg', 'image/jpeg', 'https://cloud.example.com/s/token', 'Paris'],
    );
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO album_photos'),
      [7, 42],
    );
  });

  it('skips album_photos when albumId is not provided', async () => {
    // 1. INSERT photos RETURNING id
    // 2. INSERT tags RETURNING id
    // 3. INSERT photo_tags
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 55 }] })   // INSERT photos
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })    // INSERT tags
      .mockResolvedValueOnce({ rows: [] });             // INSERT photo_tags

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: 5, s3Key: 'uuid-def.jpg', tags: ['travel'] });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(55);
    // Only 3 queries — no album_photos insert
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('skips tags when tags array is empty', async () => {
    // 1. INSERT photos RETURNING id only
    db.query.mockResolvedValueOnce({ rows: [{ id: 99 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: 5, s3Key: 'uuid-ghi.jpg', tags: [] });

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

// ── POST /internal/nextcloud-import-progress ─────────────────────────────────

describe('POST /internal/nextcloud-import-progress', () => {
  it('returns 403 without valid x-worker-secret', async () => {
    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .send({ userId: 1, importId: 7, succeeded: true });
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .set('x-worker-secret', VALID_SECRET)
      .send({ importId: 7, succeeded: true });
    expect(res.status).toBe(400);
  });

  it('returns 400 when importId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: 1, succeeded: true });
    expect(res.status).toBe(400);
  });

  it('increments done and emits socket event on success', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ done: 3, total: 10, failed: 0 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '7', importId: 42, succeeded: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, done: 3, total: 10, failed: 0 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SET done = done + 1'),
      [42],
    );
    expect(notifyUser).toHaveBeenCalledWith(
      '7',
      { importId: 42, done: 3, total: 10, failed: 0 },
      'nextcloud-import-progress',
    );
  });

  it('increments failed and emits socket event on failure', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ done: 2, total: 10, failed: 1 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '7', importId: 42, succeeded: false });

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SET failed = failed + 1'),
      [42],
    );
    expect(notifyUser).toHaveBeenCalledWith(
      '7',
      { importId: 42, done: 2, total: 10, failed: 1 },
      'nextcloud-import-progress',
    );
  });

  it('returns 404 when importId does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '7', importId: 999, succeeded: true });

    expect(res.status).toBe(404);
  });
});
