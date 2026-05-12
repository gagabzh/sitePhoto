jest.mock('../../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');

// resetAllMocks clears both call history and the mockResolvedValueOnce queues,
// preventing stale mocks from a timed-out test bleeding into the next one.
beforeEach(() => jest.resetAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  app.use('/tags', require('../../routes/tags'));
  app.use('/api',  require('../../routes/api'));
  return app;
}

// ── Combinator page ───────────────────────────────────────────────────────────

describe('GET /tags — Combinator page', () => {
  it('returns 200 with sidebar sections', async () => {
    // fetchTagVocabulary makes 2 parallel calls: tags then years-from-taken_at
    db.query
      .mockResolvedValueOnce({ rows: [
        { name: 'alice', category: 'people', count: 3 },
        { name: 'paris', category: 'places', count: 2 },
      ]})                                          // tags vocab
      .mockResolvedValueOnce({ rows: [{ name: '2023', count: 5 }] }) // years vocab
      .mockResolvedValueOnce({ rows: [] });         // recipes
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags');
    expect(res.status).toBe(200);
    expect(res.text).toContain('PEOPLE');
    expect(res.text).toContain('PLACES');
    expect(res.text).toContain('YEARS');
    expect(res.text).toContain('THEMES');
  });

  it('renders uncategorised tags under OTHER section', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'sunset', category: null, count: 1 }] }) // tags
      .mockResolvedValueOnce({ rows: [] })          // years
      .mockResolvedValueOnce({ rows: [] });          // recipes
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags');
    expect(res.text).toContain('OTHER');
    expect(res.text).toContain('sunset');
  });

  it('marks a tag as checked when its section param is set', async () => {
    // Promise.all order: tags-vocab[0], years-vocab[1], count[2], recipes[3], photos[4]
    // fetchTagVocabulary fires both its queries before fetchInitialResults hits its first await.
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'alice', category: 'people', count: 3 }] }) // tags vocab
      .mockResolvedValueOnce({ rows: [] })           // years vocab
      .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // count
      .mockResolvedValueOnce({ rows: [] })           // recipes
      .mockResolvedValueOnce({ rows: [] });           // photos
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags?people=alice');
    expect(res.text).toContain('data-state="on"');
  });

  it('shows recipe bar pill for checked tag', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'alice', category: 'people', count: 3 }] }) // tags vocab
      .mockResolvedValueOnce({ rows: [] })           // years vocab
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }) // count
      .mockResolvedValueOnce({ rows: [] })           // recipes
      .mockResolvedValueOnce({ rows: [] });           // photos
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags?people=alice');
    expect(res.text).toContain('cb-pill');
    expect(res.text).toContain('alice');
  });

  it('viewer vocabulary query uses album_access join', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // tags vocab
      .mockResolvedValueOnce({ rows: [] }) // years vocab
      .mockResolvedValueOnce({ rows: [] }); // recipes
    await request(makeApp(VIEWER_SESSION)).get('/tags');
    // Both vocab queries filter by album_access; check the tags query (call[0])
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('album_access');
  });

  it('shows no-filter hint when no tags exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // tags vocab
      .mockResolvedValueOnce({ rows: [] }) // years vocab
      .mockResolvedValueOnce({ rows: [] }); // recipes
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags');
    expect(res.text).toContain('no filters yet');
  });
});

// ── TG-2: Tag autocomplete ────────────────────────────────────────────────────

describe('GET /tags/autocomplete', () => {
  it('returns matching tag names as JSON', async () => {
    db.query.mockResolvedValue({ rows: [{ name: 'paris' }, { name: 'park' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/autocomplete?q=par');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['paris', 'park']);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['par%']);
  });

  it('returns empty array for empty query', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/autocomplete?q=');
    expect(res.body).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns empty array when no tags match', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/autocomplete?q=xyz');
    expect(res.body).toEqual([]);
  });

  it('works for viewer too', async () => {
    db.query.mockResolvedValue({ rows: [{ name: 'beach' }] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/tags/autocomplete?q=be');
    expect(res.body).toEqual(['beach']);
  });
});

// ── V3: Photos by single tag ──────────────────────────────────────────────────

describe('GET /tags/:name — photos by single tag', () => {
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

// ── TG-3: GET /api/tags/index ─────────────────────────────────────────────────

describe('GET /api/tags/index — TG-3', () => {
  it('returns tags grouped by category', async () => {
    // Two parallel queries: tags (excl. years category) then years from taken_at
    db.query
      .mockResolvedValueOnce({ rows: [
        { name: 'alice', category: 'people', count: 3 },
        { name: 'paris', category: 'places', count: 2 },
        { name: 'sunset',category: null,     count: 1 },
      ]})
      .mockResolvedValueOnce({ rows: [{ name: '2023', count: 5 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/tags/index');
    expect(res.status).toBe(200);
    expect(res.body.people).toEqual([{ name: 'alice', count: 3 }]);
    expect(res.body.places).toEqual([{ name: 'paris', count: 2 }]);
    expect(res.body.years).toEqual([{ name: '2023',  count: 5 }]);
    expect(res.body.other).toEqual([{ name: 'sunset',count: 1 }]);
  });

  it('uses album_access filter for viewer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await request(makeApp(VIEWER_SESSION)).get('/api/tags/index');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('album_access');
    expect(params).toContain(20);
  });
});

// ── TG-4 / TG-5 / TG-6: GET /api/photos/combinator ──────────────────────────

describe('GET /api/photos/combinator — TG-4, TG-5, TG-6', () => {
  it('returns photos and total with no filters', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, filename: 'a.jpg', title: 'A', taken_at: null, uploader: 'Alice' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/photos/combinator');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.photos[0].id).toBe(1);
  });

  it('TG-4 ANY logic: IN subquery, no HAVING', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION))
      .get('/api/photos/combinator?people=alice&logic.people=any');
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('IN (SELECT pt.photo_id');
    expect(sql).not.toContain('HAVING');
  });

  it('TG-6 ALL logic: HAVING COUNT subquery', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION))
      .get('/api/photos/combinator?people=alice,bob&logic.people=all');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('HAVING COUNT');
    expect(params).toContain(2);
  });

  it('TG-6 NONE logic: NOT IN subquery', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION))
      .get('/api/photos/combinator?people=alice&logic.people=none');
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('NOT IN (SELECT pt.photo_id');
  });

  it('TG-5 years.not: EXTRACT year exclude filter', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION))
      .get('/api/photos/combinator?years.not=2023');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('EXTRACT(YEAR FROM');
    expect(sql).toContain('!= ALL(');
    expect(params[0]).toContain(2023);
  });

  it('TG-4 cross-section: two IN subqueries present', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION))
      .get('/api/photos/combinator?people=alice&places=paris');
    const [sql] = db.query.mock.calls[0];
    const count = (sql.match(/IN \(SELECT pt\.photo_id/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('applies viewer album_access filter', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(VIEWER_SESSION))
      .get('/api/photos/combinator?people=alice');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('album_access');
    expect(params).toContain(20);
  });

  it('sort=oldest uses ASC ordering in photo query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION)).get('/api/photos/combinator?sort=oldest');
    const [sql] = db.query.mock.calls[1];
    expect(sql).toContain('ASC');
  });
});

// ── TG-8: GET /api/tags/counts ────────────────────────────────────────────────

describe('GET /api/tags/counts — TG-8', () => {
  it('returns per-section count objects', async () => {
    for (let i = 0; i < 5; i++) {
      db.query.mockResolvedValueOnce({ rows: [{ name: 'alice', count: 4 }] });
    }
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/tags/counts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('people');
    expect(res.body).toHaveProperty('years');
    expect(res.body.people).toEqual({ alice: 4 });
  });

  it('passes checked tag names to exclude from counts', async () => {
    for (let i = 0; i < 5; i++) db.query.mockResolvedValueOnce({ rows: [] });
    await request(makeApp(EDITOR_SESSION)).get('/api/tags/counts?people=alice');
    const peopleCall = db.query.mock.calls[0];
    // Params include the excluded tags array, e.g. ['people', ['alice']]
    expect(JSON.stringify(peopleCall[1])).toContain('alice');
  });
});

// ── TG-7: Saved recipes API ───────────────────────────────────────────────────

describe('Saved recipes API — TG-7', () => {
  it('GET /api/recipes returns current user recipes', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, name: 'test', query_json: {} }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/recipes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(10);
  });

  it('POST /api/recipes saves recipe and returns id', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 42 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes')
      .send({ name: 'my recipe', query: { sections: {}, sort: 'newest', view: 'grid4' } });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
  });

  it('POST /api/recipes rejects missing name', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes')
      .send({ query: {} });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/recipes/:id removes own recipe', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).delete('/api/recipes/1');
    expect(res.status).toBe(204);
  });

  it('DELETE /api/recipes/:id returns 403 for another user recipe', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).delete('/api/recipes/1');
    expect(res.status).toBe(403);
  });

  it('DELETE /api/recipes/:id returns 404 when not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).delete('/api/recipes/999');
    expect(res.status).toBe(404);
  });
});
