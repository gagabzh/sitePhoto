jest.mock('../../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { errorHandler } = require('../../middleware');

// resetAllMocks clears both call history and the mockResolvedValueOnce queues,
// preventing stale mocks from a timed-out test bleeding into the next one.
beforeEach(() => jest.resetAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };
const ADMIN_SESSION  = { userId: 30, name: 'Carol', role: 'admin' };

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
  app.use(errorHandler);
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

// ── RA-1: Create album from recipe ────────────────────────────────────────────

describe('RA-1: POST /api/recipes/:id/album', () => {
  it('creates an album with all matching photos and returns 201', async () => {
    const recipeState = { sections: { people: { on: ['alice'], not: [], logic: 'any' }, places: { on: [], not: [], logic: 'any' }, years: { on: [], not: [], logic: 'include' }, themes: { on: [], not: [], logic: 'any' }, other: { on: [], not: [], logic: 'any' } }, sort: 'newest', view: 'grid4' };
    db.query
      .mockResolvedValueOnce({ rows: [{ query_json: recipeState }] })  // recipe lookup
      .mockResolvedValueOnce({ rows: [{ id: 7 }, { id: 8 }] })        // matching photos
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })                   // INSERT album
      .mockResolvedValueOnce({ rows: [] });                            // INSERT album_photos

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/album')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'Alice photos' }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 42, count: 2 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Alice photos']
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      [42, 7, 8]
    );
  });

  it('creates an empty album when recipe filters match no photos', async () => {
    const filteredQuery = { sections: { people: { on: ['nobody'], not: [], logic: 'any' }, places: { on: [], not: [], logic: 'any' }, years: { on: [], not: [], logic: 'include' }, themes: { on: [], not: [], logic: 'any' }, other: { on: [], not: [], logic: 'any' } }, sort: 'newest', view: 'grid4' };
    db.query
      .mockResolvedValueOnce({ rows: [{ query_json: filteredQuery }] })  // recipe
      .mockResolvedValueOnce({ rows: [] })                               // no matching photos
      .mockResolvedValueOnce({ rows: [{ id: 43 }] });                    // INSERT album

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/album')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'Empty' }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 43, count: 0 });
  });

  it('returns 422 when recipe has no filters (guards full-table scan)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ query_json: {} }] });  // empty recipe

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/album')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'All photos' }));

    expect(res.status).toBe(422);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/album')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 when recipe not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/999/album')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'X' }));
    expect(res.status).toBe(404);
  });
});

// ── GET /api/geocode — Nominatim proxy ────────────────────────────────────────

describe('GET /api/geocode', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns places from Nominatim as [{name, lat, lon}]', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: () => Promise.resolve([
        { display_name: 'Paris, Île-de-France, France', lat: '48.8566101', lon: '2.3514992' },
        { display_name: 'Paris, Texas, USA',            lat: '33.6609',    lon: '-95.5555'  },
      ]),
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/geocode?q=Paris');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ name: 'Paris, Île-de-France, France', lat: 48.8566101, lon: 2.3514992 });
  });

  it('returns empty array for queries shorter than 2 characters', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/geocode?q=P');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty array when Nominatim fetch fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network error'));
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/geocode?q=Paris');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('sends a User-Agent header to Nominatim', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: () => Promise.resolve([]),
    });
    await request(makeApp(EDITOR_SESSION)).get('/api/geocode?q=Lyon');
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers['User-Agent']).toMatch(/sitephoto/);
  });
});

// ── GET /tags/manage ──────────────────────────────────────────────────────────

describe('GET /tags/manage', () => {
  const STATS = { total: 3, people: 1, places: 1, years: 0, themes: 0 };

  function mockManage(tags = []) {
    // Promise.all order: mainSql, countSql, statsSql, unusedSql, dupesSql
    db.query
      .mockResolvedValueOnce({ rows: tags })
      .mockResolvedValueOnce({ rows: [{ cnt: tags.length }] })
      .mockResolvedValueOnce({ rows: [STATS] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
  }

  it('returns 200 and renders the manage page for editor', async () => {
    mockManage();
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/manage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('manage');
    expect(res.text).toContain('TOTAL TAGS');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/tags/manage');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('renders a tag row when tags exist', async () => {
    mockManage([{
      id: 1, name: 'paris', category: 'places', aliases: ['france'], description: null,
      photo_count: 5, last_used: new Date().toISOString(),
      contributor_count: 1, contributors: ['Alice'], cover_filename: 'cover.jpg',
    }]);
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/manage');
    expect(res.text).toContain('paris');
    expect(res.text).toContain('cover.jpg');
  });

  it('exports CSV when export=csv is requested', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 1, name: 'paris', category: 'places', aliases: ['france'], description: 'City', photo_count: 3 },
    ]});
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/manage?export=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('paris');
    expect(res.text).toContain('places');
    expect(res.text).toContain('france');
  });

  it('passes kind filter to query when kind param is set', async () => {
    mockManage();
    await request(makeApp(EDITOR_SESSION)).get('/tags/manage?kind=people');
    expect(db.query.mock.calls[0][1]).toContain('people');
  });

  it('loads the edit tag via 6th query when edit param is set', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [STATS] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'rome', category: 'places', aliases: [], description: '' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/manage?edit=7');
    expect(res.status).toBe(200);
    expect(res.text).toContain('rome');
  });
});

// ── GET /tags/recipes ─────────────────────────────────────────────────────────

describe('GET /tags/recipes', () => {
  it('returns 200 with my-recipes page for editor', async () => {
    // Promise.all: recipes query, sharedWithMe query
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes');
    expect(res.status).toBe(200);
    expect(res.text).toContain('my saved');
  });

  it('renders recipe cards when recipes exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, name: 'Summer memories', query_json: { sections: {} },
        pinned: false, use_count: 3, last_used_at: null, created_at: new Date().toISOString(),
      }]})
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes');
    expect(res.text).toContain('Summer memories');
  });

  it('renders pinned section when pinned recipes exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        id: 1, name: 'Pinned recipe', query_json: { sections: {} },
        pinned: true, use_count: 1, last_used_at: null, created_at: new Date().toISOString(),
      }]})
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes');
    expect(res.text).toContain('pinned');
    expect(res.text).toContain('Pinned recipe');
  });

  it('shows admin all-recipes view when scope=all and role=admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/tags/recipes?scope=all');
    expect(res.status).toBe(200);
    expect(res.text).toContain('all');
  });

  it('non-admin falls through to my-recipes view even with scope=all', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes?scope=all');
    expect(res.status).toBe(200);
    expect(res.text).toContain('my saved');
  });
});

// ── GET /tags/recipes/fork/:token ─────────────────────────────────────────────

describe('GET /tags/recipes/fork/:token', () => {
  it('redirects to /tags with the shared recipe params', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      query_json: { sections: { people: { on: ['alice'], not: [] } } },
    }]});
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes/fork/mytoken');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/tags?');
    expect(res.headers.location).toContain('_shared=mytoken');
    expect(res.headers.location).toContain('people=alice');
  });

  it('redirects with _shared param even when recipe has empty sections', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ query_json: { sections: {} } }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes/fork/tok');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('_shared=tok');
  });

  it('returns 404 for invalid token', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/tags/recipes/fork/bad-token');
    expect(res.status).toBe(404);
  });
});

// ── GET /api/tags/:id/detail ──────────────────────────────────────────────────

describe('GET /api/tags/:id/detail', () => {
  it('returns tag detail for editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 1, name: 'paris', category: 'places', aliases: ['france'], description: 'City of lights' },
    ]});
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/tags/1/detail');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('paris');
    expect(res.body.aliases).toEqual(['france']);
  });

  it('returns 404 when tag not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/tags/999/detail');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/tags/abc/detail');
    expect(res.status).toBe(400);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/api/tags/1/detail');
    expect(res.status).toBe(403);
  });
});

// ── POST /api/tags ────────────────────────────────────────────────────────────

describe('POST /api/tags', () => {
  it('creates tag and returns 201 with id', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/tags').send({ name: 'Berlin', category: 'places' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });

  it('lowercases and trims the name before inserting', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 6 }] });
    await request(makeApp(EDITOR_SESSION)).post('/api/tags').send({ name: '  Paris  ' });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['paris', null]);
  });

  it('returns 409 when name already exists (ON CONFLICT DO NOTHING)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/tags').send({ name: 'paris' });
    expect(res.status).toBe(409);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/tags').send({});
    expect(res.status).toBe(400);
  });

  it('sets category to null for invalid category values', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    await request(makeApp(EDITOR_SESSION)).post('/api/tags').send({ name: 'test', category: 'invalid' });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['test', null]);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/api/tags').send({ name: 'test' });
    expect(res.status).toBe(403);
  });
});

// ── POST /api/tags/merge ──────────────────────────────────────────────────────

describe('POST /api/tags/merge', () => {
  it('merges source tags into target and returns ok', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/tags/merge').send({ targetId: 1, sourceIds: [2, 3] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when sourceIds is empty', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/tags/merge').send({ targetId: 1, sourceIds: [] });
    expect(res.status).toBe(400);
  });

  it('filters targetId out of sourceIds before merging', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/tags/merge').send({ targetId: 1, sourceIds: [1, 2] });
    expect(res.status).toBe(200);
    const [, params] = db.query.mock.calls[0];
    expect(params[1]).not.toContain(1);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/api/tags/merge').send({ targetId: 1, sourceIds: [2] });
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/tags/:id ───────────────────────────────────────────────────────

describe('PATCH /api/tags/:id', () => {
  it('updates tag name and returns ok', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .patch('/api/tags/1').send({ name: 'London' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('updates category, aliases, and description in a single query', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .patch('/api/tags/1').send({ category: 'places', aliases: ['gb', 'uk'], description: 'Capital' });
    expect(res.status).toBe(200);
    const updateSql = db.query.mock.calls[1][0];
    expect(updateSql).toContain('category');
    expect(updateSql).toContain('aliases');
    expect(updateSql).toContain('description');
  });

  it('returns ok immediately and makes only one query when body has no known fields', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(makeApp(EDITOR_SESSION)).patch('/api/tags/1').send({});
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when tag does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).patch('/api/tags/999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).patch('/api/tags/abc').send({ name: 'x' });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/tags/:id ──────────────────────────────────────────────────────

describe('DELETE /api/tags/:id', () => {
  it('deletes tag and returns 204 for editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).delete('/api/tags/1');
    expect(res.status).toBe(204);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).delete('/api/tags/1');
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/recipes/:id ────────────────────────────────────────────────────

describe('PATCH /api/recipes/:id', () => {
  it('pins own recipe and returns ok', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .patch('/api/recipes/1').send({ pinned: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query.mock.calls[1][0]).toContain('pinned');
  });

  it('updates recipe name', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .patch('/api/recipes/1').send({ name: 'New name' });
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toContain('name');
  });

  it('returns 403 when updating another user recipe', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .patch('/api/recipes/1').send({ name: 'hijack' });
    expect(res.status).toBe(403);
  });

  it('admin can patch any recipe', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION))
      .patch('/api/recipes/1').send({ pinned: false });
    expect(res.status).toBe(200);
  });

  it('returns ok with one query when body has no updates', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });
    const res = await request(makeApp(EDITOR_SESSION)).patch('/api/recipes/1').send({});
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when recipe not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).patch('/api/recipes/999').send({ pinned: true });
    expect(res.status).toBe(404);
  });
});

// ── POST /api/recipes/:id/duplicate ──────────────────────────────────────────

describe('POST /api/recipes/:id/duplicate', () => {
  it('clones own recipe and returns 201 with new id', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'My Recipe', query_json: { sections: {} } }] })
      .mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/1/duplicate');
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
    expect(db.query.mock.calls[1][1][1]).toContain('(copy)');
  });

  it('returns 404 when recipe not found or not owned', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/999/duplicate');
    expect(res.status).toBe(404);
  });
});

// ── GET /api/users/search ─────────────────────────────────────────────────────

describe('GET /api/users/search', () => {
  it('returns matching users excluding current user', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'Bob' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/users/search?q=bo');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 5, name: 'Bob' }]);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['%bo%', 10]);
  });

  it('returns empty array for empty query without hitting db', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/api/users/search?q=');
    expect(res.body).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── POST /api/recipes/:id/share ───────────────────────────────────────────────

describe('POST /api/recipes/:id/share', () => {
  it('returns existing share token without generating a new one', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ share_token: 'existing-token' }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/1/share');
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('existing-token');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('generates and returns a new token when none exists', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ share_token: null }] })
      .mockResolvedValueOnce({ rows: [{ share_token: 'new-uuid' }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/1/share');
    expect(res.body.token).toBe('new-uuid');
  });

  it('returns 404 when recipe not found or not owned', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/999/share');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/recipes/fork/:token ─────────────────────────────────────────────

describe('POST /api/recipes/fork/:token', () => {
  it('copies shared recipe into own collection and returns 201', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Their Recipe', query_json: {}, user_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/fork/share-token');
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(99);
  });

  it('returns 404 for invalid token', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/api/recipes/fork/bad-token');
    expect(res.status).toBe(404);
  });
});

// ── POST /api/recipes/:id/share-to ────────────────────────────────────────────

describe('POST /api/recipes/:id/share-to', () => {
  it('shares recipe to a specific user', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'My Recipe', query_json: {} }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/share-to').send({ userId: 5 });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when sharing with yourself', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ name: 'Recipe', query_json: {} }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/share-to').send({ userId: 10 }); // EDITOR_SESSION.userId
    expect(res.status).toBe(400);
  });

  it('returns 404 when target user not found', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'Recipe', query_json: {} }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/share-to').send({ userId: 999 });
    expect(res.status).toBe(404);
  });

  it('admin can broadcast to all users', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ name: 'Admin Recipe', query_json: {} }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }, { id: 6 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION))
      .post('/api/recipes/1/share-to').send({ everyone: true });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
  });

  it('returns 403 when non-admin tries everyone broadcast', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ name: 'Recipe', query_json: {} }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/share-to').send({ everyone: true });
    expect(res.status).toBe(403);
  });

  it('returns 404 when recipe not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/recipes/1/share-to').send({ userId: 5 });
    expect(res.status).toBe(404);
  });
});
