jest.mock('../../db', () => ({ query: jest.fn() }));

const db = require('../../db');
const {
  buildManageQuery,
  fetchTagsCsv,
  fetchManageData,
  fetchRecipeByToken,
  fetchAllRecipes,
  fetchMyRecipes,
} = require('../../repositories/tags');

// resetAllMocks clears call history and mockResolvedValueOnce queues between tests.
beforeEach(() => jest.resetAllMocks());

// ── buildManageQuery (pure — no DB) ──────────────────────────────────────────

describe('buildManageQuery', () => {
  const BASE = { search: '', kind: 'all', sort: 'popularity', unused: false, dupes: false, offset: 0, PAGE_SIZE: 25 };

  it('returns empty vals and no WHERE clause by default', () => {
    const { vals, countSql } = buildManageQuery(BASE);
    expect(vals).toEqual([]);
    expect(countSql).not.toContain('WHERE');
  });

  it('adds a LIKE condition and param for search', () => {
    const { vals, countSql } = buildManageQuery({ ...BASE, search: 'ali' });
    expect(vals).toEqual(['%ali%']);
    expect(countSql).toContain('WHERE');
    expect(countSql).toContain('lower(t.name) LIKE');
  });

  it('adds category condition for a specific kind', () => {
    const { vals, countSql } = buildManageQuery({ ...BASE, kind: 'people' });
    expect(vals).toEqual(['people']);
    expect(countSql).toContain('t.category =');
  });

  it('adds NOT EXISTS condition when unused is true', () => {
    const { vals, mainSql } = buildManageQuery({ ...BASE, unused: true });
    expect(vals).toEqual([]);
    expect(mainSql).toContain('NOT EXISTS');
  });

  it('adds EXISTS duplicate-detection condition when dupes is true', () => {
    const { mainSql } = buildManageQuery({ ...BASE, dupes: true });
    expect(mainSql).toContain('left(lower(t.name),4)');
  });

  it('uses alpha ORDER BY when sort is alpha', () => {
    const { mainSql } = buildManageQuery({ ...BASE, sort: 'alpha' });
    expect(mainSql).toContain('ORDER BY t.name');
  });

  it('embeds PAGE_SIZE and offset in mainSql', () => {
    const { mainSql } = buildManageQuery({ ...BASE, PAGE_SIZE: 10, offset: 20 });
    expect(mainSql).toContain('LIMIT 10 OFFSET 20');
  });

  it('returns all five SQL strings', () => {
    const result = buildManageQuery(BASE);
    expect(result).toHaveProperty('mainSql');
    expect(result).toHaveProperty('countSql');
    expect(result).toHaveProperty('statsSql');
    expect(result).toHaveProperty('unusedSql');
    expect(result).toHaveProperty('dupesSql');
  });

  it('combines search and kind conditions with AND', () => {
    const { countSql, vals } = buildManageQuery({ ...BASE, search: 'foo', kind: 'places' });
    expect(vals).toEqual(['%foo%', 'places']);
    expect(countSql).toContain('AND');
  });
});

// ── fetchTagsCsv ─────────────────────────────────────────────────────────────

describe('fetchTagsCsv', () => {
  it('returns rows from the CSV query', async () => {
    const mockRows = [{ id: 1, name: 'paris', category: 'places', aliases: [], description: null, photo_count: 3 }];
    db.query.mockResolvedValueOnce({ rows: mockRows });
    const rows = await fetchTagsCsv();
    expect(rows).toEqual(mockRows);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('photo_count');
  });
});

// ── fetchManageData ───────────────────────────────────────────────────────────

describe('fetchManageData', () => {
  const SPEC = { mainSql: 'SELECT 1', countSql: 'SELECT 2', statsSql: 'SELECT 3', unusedSql: 'SELECT 4', dupesSql: 'SELECT 5', vals: [] };

  function mockManageQueries(overrides = {}) {
    // Promise.all order: main[0], count[1], stats[2], unused[3], dupes[4], edit[5]
    db.query
      .mockResolvedValueOnce({ rows: overrides.tags   ?? [{ id: 1, name: 'foo' }] })
      .mockResolvedValueOnce({ rows: [{ cnt: overrides.total  ?? 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 10, people: 2, places: 3, years: 1, themes: 4 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: overrides.unused ?? 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: overrides.dupes  ?? 0 }] });
  }

  it('returns structured data from 5 parallel queries (no editId)', async () => {
    mockManageQueries({ tags: [{ id: 1, name: 'foo' }], total: 1, unused: 2, dupes: 3 });
    const data = await fetchManageData(SPEC, null);
    expect(data.tags).toEqual([{ id: 1, name: 'foo' }]);
    expect(data.totalTags).toBe(1);
    expect(data.unusedCnt).toBe(2);
    expect(data.dupesCnt).toBe(3);
    expect(data.editTag).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(5);
  });

  it('fires a 6th query and returns editTag when editId is provided', async () => {
    mockManageQueries();
    const editRow = { id: 7, name: 'sunset', category: 'themes', aliases: [], description: '' };
    db.query.mockResolvedValueOnce({ rows: [editRow] }); // edit query[5]
    const data = await fetchManageData(SPEC, 7);
    expect(data.editTag).toEqual(editRow);
    expect(db.query).toHaveBeenCalledTimes(6);
  });

  it('returns null editTag when editId row not found', async () => {
    mockManageQueries();
    db.query.mockResolvedValueOnce({ rows: [] }); // edit query returns nothing
    const data = await fetchManageData(SPEC, 99);
    expect(data.editTag).toBeNull();
  });

  it('passes vals to main and count queries', async () => {
    const spec = { ...SPEC, vals: ['%foo%'] };
    mockManageQueries();
    await fetchManageData(spec, null);
    expect(db.query).toHaveBeenNthCalledWith(1, SPEC.mainSql, ['%foo%']);
    expect(db.query).toHaveBeenNthCalledWith(2, SPEC.countSql, ['%foo%']);
  });
});

// ── fetchRecipeByToken ────────────────────────────────────────────────────────

describe('fetchRecipeByToken', () => {
  it('returns the row when token matches', async () => {
    const row = { query_json: { sections: {} } };
    db.query.mockResolvedValueOnce({ rows: [row] });
    const result = await fetchRecipeByToken('abc123');
    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('share_token'), ['abc123']);
  });

  it('returns null when token is not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await fetchRecipeByToken('bad-token');
    expect(result).toBeNull();
  });
});

// ── fetchAllRecipes ───────────────────────────────────────────────────────────

describe('fetchAllRecipes', () => {
  it('returns all rows from the all-recipes query', async () => {
    const rows = [
      { id: 1, name: 'A', owner_name: 'Alice', query_json: {}, pinned: false, use_count: 0, last_used_at: null, created_at: new Date(), owner_id: 10 },
      { id: 2, name: 'B', owner_name: 'Bob',   query_json: {}, pinned: false, use_count: 5, last_used_at: null, created_at: new Date(), owner_id: 20 },
    ];
    db.query.mockResolvedValueOnce({ rows });
    const result = await fetchAllRecipes();
    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('shared_by IS NULL');
  });

  it('returns empty array when no recipes exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const result = await fetchAllRecipes();
    expect(result).toEqual([]);
  });
});

// ── fetchMyRecipes ────────────────────────────────────────────────────────────

describe('fetchMyRecipes', () => {
  it('returns own recipes and shared-with-me as separate arrays', async () => {
    const myRecipes  = [{ id: 1, name: 'Mine', pinned: true }];
    const sharedWith = [{ id: 2, name: 'Theirs', shared_by_name: 'Bob' }];
    // Promise.all order: own recipes[0], shared-with-me[1]
    db.query
      .mockResolvedValueOnce({ rows: myRecipes })
      .mockResolvedValueOnce({ rows: sharedWith });
    const result = await fetchMyRecipes(10);
    expect(result.recipes).toEqual(myRecipes);
    expect(result.sharedWithMe).toEqual(sharedWith);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('passes userId to both queries', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await fetchMyRecipes(42);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.any(String), [42]);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.any(String), [42]);
  });

  it('returns empty arrays when user has no recipes', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await fetchMyRecipes(99);
    expect(result.recipes).toEqual([]);
    expect(result.sharedWithMe).toEqual([]);
  });
});
