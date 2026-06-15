jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../notifications', () => ({ notifyUser: jest.fn(), initSocketIO: jest.fn() }));
jest.mock('../../storage', () => ({
  downloadPhoto: jest.fn(),
  uploadPhoto: jest.fn(),
}));
jest.mock('sharp', () => {
  const mockMetadata = { width: 1000, height: 800 };
  const createInstance = () => ({
    metadata: jest.fn().mockResolvedValue(mockMetadata),
    extract: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-crop-buffer')),
  });
  return jest.fn(() => createInstance());
});

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { notifyUser } = require('../../notifications');
const storage = require('../../storage');

const VALID_SECRET = 'test-secret-abc123';

beforeEach(() => {
  jest.resetAllMocks();
  process.env.WORKER_API_SECRET = VALID_SECRET;
  storage.downloadPhoto.mockResolvedValue(Buffer.from('fakecropbytes'));
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

// ── POST /internal/identify-people-result ────────────────────────────────────

describe('POST /internal/identify-people-result', () => {
  it('returns 400 when photoId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/identify-people-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '2', suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photoId/);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/identify-people-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '1', suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('notifies user with error when error is provided', async () => {
    const res = await request(makeApp())
      .post('/internal/identify-people-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '1', userId: '2', error: 'Ollama timeout' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(notifyUser).toHaveBeenCalledWith('2', { photoId: '1', error: 'Ollama timeout' }, 'identify-people-complete');
  });

  it('enriches suggestions with tag IDs and notifies user', async () => {
    const suggestions = [
      { name: 'Alice', hasReference: true, bbox: { x: 0.25, y: 0.3, width: 0.2, height: 0.25 } },
      { name: 'Bob', hasReference: false, bbox: { x: 0.6, y: 0.4, width: 0.2, height: 0.2 } },
    ];
    
    // 1. INSERT Alice tag RETURNING id
    // 2. INSERT Bob tag RETURNING id
    // 3. INSERT ai_identification_proposals for Alice (US-AI5 backward compatibility)
    // 4. INSERT ai_identification_proposals for Bob (US-AI5 backward compatibility)
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })  // Alice tag
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })  // Bob tag
      .mockResolvedValueOnce({ rows: [] })            // Alice proposal
      .mockResolvedValueOnce({ rows: [] });            // Bob proposal

    const res = await request(makeApp())
      .post('/internal/identify-people-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '42', userId: '7', suggestions });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    
    // Verify tags were upserted with category 'people'
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO tags'),
      ['alice']
    );
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO tags'),
      ['bob']
    );
    
    // Verify notification was sent with enriched suggestions
    // Note: name preserves original case from suggestions
    expect(notifyUser).toHaveBeenCalledWith('7', {
      photoId: '42',
      suggestions: [
        { tagId: 10, name: 'Alice', hasReference: true, bbox: suggestions[0].bbox },
        { tagId: 11, name: 'Bob', hasReference: false, bbox: suggestions[1].bbox },
      ]
    }, 'identify-people-complete');
    
    // Verify US-AI5 proposals notification was also sent
    expect(notifyUser).toHaveBeenCalledWith(7, {
      photoId: 42,
      count: 2,
      suggestions: [
        { name: 'Alice', bbox: suggestions[0].bbox },
        { name: 'Bob', bbox: suggestions[1].bbox }
      ]
    }, 'identification-proposals-ready');
  });

  it('notifies with empty array when suggestions is empty', async () => {
    const res = await request(makeApp())
      .post('/internal/identify-people-result')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: '42', userId: '7', suggestions: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(db.query).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith('7', { photoId: '42', suggestions: [] }, 'identify-people-complete');
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
        shareUrl: 'https://cloud.example.com/s/token', latitude: 48.8566, longitude: 2.3522,
        albumId: 7, tags: ['paris', 'vacation'], importId: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(42);
    expect(db.query).toHaveBeenCalledTimes(4);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [5, 'uuid-abc.jpg', 'uuid-abc.jpg', 'uuid-abc.jpg', 'uuid-abc.jpg', 'image/jpeg', 'https://cloud.example.com/s/token', undefined, undefined, undefined, 48.8566, 2.3522],
    );
  });

  it('stores s3Key as filename and original fileName as original_filename', async () => {
    // Regression test: filename column must be the UUID s3Key (used by /uploads/:filename
    // to stream from S3), not the original Nextcloud filename.
    // 1. INSERT photos RETURNING id
    db.query.mockResolvedValueOnce({ rows: [{ id: 77 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({
        userId: 5,
        s3Key: 'a1b2c3d4-0000-0000-0000-000000000000.jpg',
        fileName: '25_m-FPIX-4-0127788I-DIGITAL_HIGHRES-8514_006062-54441729.JPG',
        mimeType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(77);
    // params order: [userId, s3Key (filename), displayName (original_filename), s3Key, displayName (title), mimeType, ncUrl, takenAt, exposureTime, focalLength, lat, lon]
    // filename column ($2) must be the UUID s3Key, original_filename column ($3) must be the original filename
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [
        5,                                                                      // $1 → userId
        'a1b2c3d4-0000-0000-0000-000000000000.jpg',                    // $2 → filename (s3Key)
        '25_m-FPIX-4-0127788I-DIGITAL_HIGHRES-8514_006062-54441729.JPG', // $3 → original_filename (displayName)
        'a1b2c3d4-0000-0000-0000-000000000000.jpg',                    // $4 → s3_key (s3Key)
        '25_m-FPIX-4-0127788I-DIGITAL_HIGHRES-8514_006062-54441729.JPG', // $5 → title (displayName)
        'image/jpeg',                                                   // $6 → mimeType
        null,                                                           // $7 → ncUrl
        undefined,                                                     // $8 → takenAt
        undefined,                                                     // $9 → exposureTime
        undefined,                                                     // $10 → focalLength
        null,                                                           // $11 → lat
        null,                                                           // $12 → lon
      ],
    );
  });

  it('inserts photo, album membership, and tags — returns photoId (continued)', async () => {
    // Continuation of the full-path test to assert album/tag queries
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
        shareUrl: 'https://cloud.example.com/s/token', latitude: 48.8566, longitude: 2.3522,
        albumId: 7, tags: ['paris', 'vacation'], importId: 3,
      });

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO album_photos'),
      [7, 42],
    );
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('INSERT INTO tags'),
      [['paris', 'vacation']],
    );
    expect(db.query).toHaveBeenNthCalledWith(4,
      expect.stringContaining('INSERT INTO photo_tags'),
      [42, [10]],
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

  // BUG-8: EXIF metadata tests
  it('stores complete EXIF metadata (takenAt, exposureTime, focalLength, GPS)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({
        userId: 5,
        s3Key: 'exif-complete.jpg',
        mimeType: 'image/jpeg',
        takenAt: '2024-06-15',
        exposureTime: '1/250',
        focalLength: '50.00',
        latitude: 48.8566,
        longitude: 2.3522,
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(100);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [5, 'exif-complete.jpg', 'exif-complete.jpg', 'exif-complete.jpg', 'exif-complete.jpg', 'image/jpeg', null, '2024-06-15', '1/250', '50.00', 48.8566, 2.3522],
    );
  });

  it('stores partial EXIF metadata (only takenAt)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 101 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({
        userId: 5,
        s3Key: 'exif-partial.jpg',
        mimeType: 'image/jpeg',
        takenAt: '2024-06-16',
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(101);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [5, 'exif-partial.jpg', 'exif-partial.jpg', 'exif-partial.jpg', 'exif-partial.jpg', 'image/jpeg', null, '2024-06-16', undefined, undefined, null, null],
    );
  });

  it('handles no EXIF metadata (all metadata fields NULL)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 102 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({
        userId: 5,
        s3Key: 'exif-none.jpg',
        mimeType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(102);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [5, 'exif-none.jpg', 'exif-none.jpg', 'exif-none.jpg', 'exif-none.jpg', 'image/jpeg', null, undefined, undefined, undefined, null, null],
    );
  });

  it('prioritizes EXIF GPS over user-provided coordinates', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 103 }] });

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({
        userId: 5,
        s3Key: 'exif-gps-priority.jpg',
        mimeType: 'image/jpeg',
        latitude: 48.8566,
        longitude: 2.3522,
      });

    expect(res.status).toBe(200);
    expect(res.body.photoId).toBe(103);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO photos'),
      [5, 'exif-gps-priority.jpg', 'exif-gps-priority.jpg', 'exif-gps-priority.jpg', 'exif-gps-priority.jpg', 'image/jpeg', null, undefined, undefined, undefined, 48.8566, 2.3522],
    );
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

// ── DB error paths ───────────────────────────────────────────────────────────

describe('POST /internal/nextcloud-photo — DB error', () => {
  it('returns 500 when first db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(makeApp())
      .post('/internal/nextcloud-photo')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: 5, s3Key: 'uuid-abc.jpg' });

    expect(res.status).toBe(500);
  });
});

describe('POST /internal/nextcloud-import-progress — DB error', () => {
  it('returns 500 when db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(makeApp())
      .post('/internal/nextcloud-import-progress')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: '7', importId: 42, succeeded: true });

    expect(res.status).toBe(500);
  });
});

// ── GET /internal/known-faces/:userId ────────────────────────────────────────

describe('GET /internal/known-faces/:userId', () => {
  it('returns array of {personName, cropBase64, mimeType} for known faces', async () => {
    const fakeBuffer = Buffer.from('fakepng');
    // 1. SELECT DISTINCT ON (person_name) ... FROM person_faces
    db.query.mockResolvedValueOnce({
      rows: [
        { person_name: 'Alice', crop_s3_key: 'faces/alice.jpg' },
        { person_name: 'Bob',   crop_s3_key: 'faces/bob.jpg' },
      ],
    });
    storage.downloadPhoto
      .mockResolvedValueOnce(fakeBuffer)   // Alice crop
      .mockResolvedValueOnce(fakeBuffer);  // Bob crop

    const res = await request(makeApp())
      .get('/internal/known-faces/7')
      .set('x-worker-secret', VALID_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      personName: 'Alice',
      cropBase64: fakeBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(res.body[1]).toMatchObject({
      personName: 'Bob',
      cropBase64: fakeBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT DISTINCT ON (person_name)'),
      [7]
    );
  });

  it('returns empty array when user has no faces', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .get('/internal/known-faces/42')
      .set('x-worker-secret', VALID_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(storage.downloadPhoto).not.toHaveBeenCalled();
  });

  it('skips faces whose S3 crop is missing (null filtered out)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { person_name: 'Alice', crop_s3_key: 'faces/alice.jpg' },
        { person_name: 'Bob',   crop_s3_key: 'faces/bob.jpg' },
      ],
    });
    storage.downloadPhoto
      .mockResolvedValueOnce(Buffer.from('alicecrop'))    // Alice succeeds
      .mockRejectedValueOnce(new Error('S3 not found'));  // Bob fails

    const res = await request(makeApp())
      .get('/internal/known-faces/7')
      .set('x-worker-secret', VALID_SECRET);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].personName).toBe('Alice');
  });

  it('returns 403 without worker secret', async () => {
    const res = await request(makeApp())
      .get('/internal/known-faces/7');

    expect(res.status).toBe(403);
  });

  it('returns 400 for non-integer userId', async () => {
    const res = await request(makeApp())
      .get('/internal/known-faces/abc')
      .set('x-worker-secret', VALID_SECRET);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });
});

// ── POST /internal/store-people-faces ─────────────────────────────────────────

describe('POST /internal/store-people-faces', () => {
  const mockBuffer = Buffer.from('mock-photo-data');
  const defaultSharp = () => ({
    metadata: jest.fn().mockResolvedValue({ width: 1000, height: 800 }),
    extract: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-crop-buffer')),
  });
  
  beforeEach(() => {
    jest.resetAllMocks();
    storage.downloadPhoto.mockResolvedValue(mockBuffer);
    storage.uploadPhoto.mockResolvedValue(null);
    const sharp = require('sharp');
    sharp.mockImplementation(() => defaultSharp());
  });

  it('returns 403 without valid x-worker-secret', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions: [] });
    expect(res.status).toBe(403);
  });

  it('returns 400 when photoId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ userId: 1, photoS3Key: 'test.jpg', suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photoId/);
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, photoS3Key: 'test.jpg', suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/);
  });

  it('returns 400 when photoS3Key is missing', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/photoS3Key/);
  });

  it('returns 400 for non-integer photoId', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 'abc', userId: 1, photoS3Key: 'test.jpg', suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it('returns 400 for non-integer userId', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 'abc', photoS3Key: 'test.jpg', suggestions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it('returns stored: 0 when suggestions is empty', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions: [] });
    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(0);
  });

  it('returns stored: 0 when suggestions have no valid bboxes', async () => {
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ 
        photoId: 1, 
        userId: 1, 
        photoS3Key: 'test.jpg', 
        suggestions: [{ name: 'Alice' }] // no bbox
      });
    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(0);
  });

  it('returns 404 when photo is not found in S3', async () => {
    storage.downloadPhoto.mockRejectedValue(new Error('Not found'));
    const suggestions = [{ name: 'Alice', bbox: { x: 0.25, y: 0.3, width: 0.2, height: 0.25 } }];
    
    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions });
    
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Photo not found/);
  });

  it('stores face crop and applies tag on happy path', async () => {
    const suggestions = [
      { name: 'Alice', bbox: { x: 0.25, y: 0.3, width: 0.2, height: 0.25 } }
    ];
    
    // 1. INSERT INTO tags RETURNING id (Alice with category='people')
    // 2. INSERT INTO photo_tags
    // 3. INSERT INTO person_faces
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })  // tag upsert
      .mockResolvedValueOnce({ rows: [] })            // photo_tags insert
      .mockResolvedValueOnce({ rows: [] });            // person_faces insert

    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions });

    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(1);
    expect(res.body.tags).toEqual(['Alice']);
    
    // Verify tag was upserted with category='people' (category is hardcoded in SQL)
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO tags'),
      ['alice']
    );
    
    // Verify photo_tags was linked
    expect(db.query).toHaveBeenNthCalledWith(2,
      expect.stringContaining('INSERT INTO photo_tags'),
      [1, 10]
    );
    
    // Verify person_faces was inserted
    expect(db.query).toHaveBeenNthCalledWith(3,
      expect.stringContaining('INSERT INTO person_faces'),
      [1, 'alice', 1, JSON.stringify(suggestions[0].bbox), expect.any(String)]
    );
    
    // Verify uploadPhoto was called for the crop
    expect(storage.uploadPhoto).toHaveBeenCalledWith(
      expect.stringMatching(/^faces\/.*\.jpg$/),
      expect.any(Buffer),
      'image/jpeg'
    );
  });

  it('skips suggestions with invalid bbox coordinates', async () => {
    const suggestions = [
      { name: 'Alice', bbox: { x: 0.25, y: 0.3, width: 0.2, height: 0.25 } }, // valid
      { name: 'Bob', bbox: { x: 1.5, y: 0.3, width: 0.2, height: 0.25 } },   // invalid: x > 1
      { name: 'Charlie', bbox: { x: 0.8, y: 0.3, width: 0.5, height: 0.25 } } // invalid: x + width > 1
    ];
    
    // Only Alice should be processed
    // 1. Alice tag upsert
    // 2. Alice photo_tags insert
    // 3. Alice person_faces insert
    // 4. Alice ai_identification_proposals insert (US-AI5 backward compatibility)
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })  // Alice tag upsert
      .mockResolvedValueOnce({ rows: [] })            // Alice photo_tags insert
      .mockResolvedValueOnce({ rows: [] })            // Alice person_faces insert
      .mockResolvedValueOnce({ rows: [] });            // Alice ai_identification_proposals insert

    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions });

    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(1);
    expect(res.body.tags).toEqual(['Alice']);
    
    // 4 queries for Alice (Bob and Charlie skipped due to invalid bbox)
    // Includes US-AI5 proposal creation for backward compatibility
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it('skips suggestions with bounding box too small', async () => {
    // Override sharp mock for this test to use a small image (100x100)
    // so a bbox of 0.05x0.05 becomes 5x5 pixels (< 20 minimum)
    const sharp = require('sharp');
    sharp.mockImplementation(() => ({
      metadata: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
      extract: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('crop-buffer')),
    }));

    const suggestions = [
      { name: 'Alice', bbox: { x: 0.05, y: 0.05, width: 0.05, height: 0.05 } } // 5x5 pixels
    ];

    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions });

    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(0);
    expect(storage.uploadPhoto).not.toHaveBeenCalled();
    
    // Restore default sharp mock for subsequent tests
    sharp.mockImplementation(() => defaultSharp());
  });

  it('notifies user when face crops are stored', async () => {
    const suggestions = [
      { name: 'Alice', bbox: { x: 0.25, y: 0.3, width: 0.2, height: 0.25 } }
    ];
    
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: '7', photoS3Key: 'test.jpg', suggestions });

    expect(res.status).toBe(200);
    expect(res.body.stored).toBe(1);
    
    // Verify notification was sent
    expect(notifyUser).toHaveBeenCalledWith('7', { 
      photoId: 1, 
      tags: ['Alice'] 
    });
  });

  it('handles storage.uploadPhoto failure gracefully', async () => {
    storage.uploadPhoto.mockRejectedValue(new Error('S3 upload failed'));

    const suggestions = [
      { name: 'Alice', bbox: { x: 0.25, y: 0.3, width: 0.2, height: 0.25 } }
    ];

    const res = await request(makeApp())
      .post('/internal/store-people-faces')
      .set('x-worker-secret', VALID_SECRET)
      .send({ photoId: 1, userId: 1, photoS3Key: 'test.jpg', suggestions });

    expect(res.status).toBe(200);
    // The request should still succeed but with 0 stored due to the error
    // (error is caught per-suggestion in the loop)
    expect(res.body.stored).toBe(0);
  });
});
