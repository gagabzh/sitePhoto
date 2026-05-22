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
