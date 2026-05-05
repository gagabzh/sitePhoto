jest.mock('../../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');

beforeEach(() => jest.clearAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  app.use('/tags', require('../../routes/tags'));
  return app;
}

// ── V3: Tag list ─────────────────────────────────────────────────────────────

describe('V3: GET /tags — tag list', () => {
  it('returns 200 with all tags for editor', async () => {
    db.query.mockResolvedValue({ rows: [
      { name: 'paris', photo_count: 3 },
      { name: 'sunset', photo_count: 1 },
    ]});

    const res = await request(makeApp(EDITOR_SESSION)).get('/tags');
    expect(res.status).toBe(200);
    expect(res.text).toContain('paris');
    expect(res.text).toContain('sunset');
    expect(res.text).toContain('/tags/paris');
  });

  it('queries all tags for editor (no viewer filter)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(makeApp(EDITOR_SESSION)).get('/tags');
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('album_access');
  });

  it('returns 200 with viewer-filtered tags', async () => {
    db.query.mockResolvedValue({ rows: [{ name: 'beach', photo_count: 2 }] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/tags');
    expect(res.status).toBe(200);
    expect(res.text).toContain('beach');
  });

  it('queries only accessible album tags for viewer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(makeApp(VIEWER_SESSION)).get('/tags');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('album_access'),
      [20]
    );
  });

  it('shows empty message when no tags exist', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags');
    expect(res.text).toContain('No tags yet');
  });
});

// ── V3: Photos by tag ────────────────────────────────────────────────────────

describe('V3: GET /tags/:name — photos by tag', () => {
  it('returns 200 with photos for editor', async () => {
    db.query.mockResolvedValue({ rows: [
      { id: 1, filename: 'a.jpg', title: 'Eiffel', uploader: 'Alice' },
    ]});

    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/paris');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Eiffel');
    expect(res.text).toContain('Tag: paris');
  });

  it('queries all photos for editor (no viewer filter)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(makeApp(EDITOR_SESSION)).get('/tags/paris');
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('album_access');
  });

  it('returns 200 with viewer-filtered photos', async () => {
    db.query.mockResolvedValue({ rows: [
      { id: 2, filename: 'b.jpg', title: 'Beach', uploader: 'Alice' },
    ]});

    const res = await request(makeApp(VIEWER_SESSION)).get('/tags/paris');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Beach');
  });

  it('queries only accessible album photos for viewer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(makeApp(VIEWER_SESSION)).get('/tags/paris');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('album_access'),
      ['paris', 20]
    );
  });

  it('shows empty message when no photos found', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/unknown');
    expect(res.text).toContain('No photos found for this tag');
  });

  it('shows back link to tag list', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/paris');
    expect(res.text).toContain('href="/tags"');
  });
});
