jest.mock('../../db', () => ({ query: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');

beforeEach(() => jest.clearAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData };
    next();
  });
  app.use('/timeline', require('../../routes/timeline'));
  return app;
}

// fetchPhotos → 1 query; fetchFilterOptions → 2 queries (albums + tags via Promise.all)
// Outer Promise.all order: fetchPhotos (call 1), then albums (call 2), tags (call 3)
function mockTimeline({ photos = [], albums = [], tags = [] } = {}) {
  db.query
    .mockResolvedValueOnce({ rows: photos })   // fetchPhotos
    .mockResolvedValueOnce({ rows: albums })   // fetchFilterOptions albums
    .mockResolvedValueOnce({ rows: tags });    // fetchFilterOptions tags
}

// ── TL1: Timeline view ────────────────────────────────────────────────────────

describe('TL1: GET /timeline — timeline view', () => {
  it('returns 200 and renders page heading', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Timeline</h1>');
  });

  it('shows empty state when no photos exist', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.text).toContain('No photos found');
  });

  it('groups photos under month headings', async () => {
    mockTimeline({
      photos: [
        { id: 1, filename: 'a.jpg', title: 'Beach', uploader: 'Alice', display_date: '2024-03-15' },
        { id: 2, filename: 'b.jpg', title: 'Hills', uploader: 'Alice', display_date: '2024-03-20' },
        { id: 3, filename: 'c.jpg', title: 'Snow',  uploader: 'Alice', display_date: '2024-01-10' },
      ],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.text).toContain('March 2024');
    expect(res.text).toContain('January 2024');
    // Photo titles appear
    expect(res.text).toContain('Beach');
    expect(res.text).toContain('Snow');
  });

  it('renders most-recent month first', async () => {
    mockTimeline({
      photos: [
        { id: 1, filename: 'a.jpg', title: 'March photo', uploader: 'Alice', display_date: '2024-03-01' },
        { id: 2, filename: 'b.jpg', title: 'Jan photo',   uploader: 'Alice', display_date: '2024-01-01' },
      ],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    const marchIdx = res.text.indexOf('March 2024');
    const janIdx   = res.text.indexOf('January 2024');
    expect(marchIdx).toBeLessThan(janIdx);
  });

  it('groups multiple photos from the same month under one heading', async () => {
    mockTimeline({
      photos: [
        { id: 1, filename: 'a.jpg', title: 'Photo A', uploader: 'Alice', display_date: '2024-06-10' },
        { id: 2, filename: 'b.jpg', title: 'Photo B', uploader: 'Alice', display_date: '2024-06-25' },
      ],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    const matches = (res.text.match(/June 2024/g) || []).length;
    expect(matches).toBe(1);
  });

  it('works for admin session', async () => {
    mockTimeline({ photos: [{ id: 1, filename: 'a.jpg', title: 'Shot', uploader: 'Admin', display_date: '2024-05-01' }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/timeline');
    expect(res.status).toBe(200);
    expect(res.text).toContain('May 2024');
  });

  it('always filters to photos with taken_at set (metadata only)', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline');
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('taken_at IS NOT NULL');
    expect(sql).not.toContain('COALESCE');
  });
});

// ── TL2: Viewer access ────────────────────────────────────────────────────────

describe('TL2: viewer sees only accessible photos', () => {
  it('includes album_access join in the photo query for a viewer', async () => {
    mockTimeline();
    await request(makeApp(VIEWER_SESSION)).get('/timeline');
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('album_access');
    expect(db.query.mock.calls[0][1]).toContain(VIEWER_SESSION.userId);
  });

  it('uses viewer-scoped album query for filter options', async () => {
    mockTimeline();
    await request(makeApp(VIEWER_SESSION)).get('/timeline');
    const albumSql = db.query.mock.calls[1][0];
    expect(albumSql).toContain('album_access');
    expect(db.query.mock.calls[1][1]).toContain(VIEWER_SESSION.userId);
  });

  it('uses viewer-scoped tag query for filter options', async () => {
    mockTimeline();
    await request(makeApp(VIEWER_SESSION)).get('/timeline');
    const tagSql = db.query.mock.calls[2][0];
    expect(tagSql).toContain('album_access');
    expect(db.query.mock.calls[2][1]).toContain(VIEWER_SESSION.userId);
  });

  it('does NOT include album_access join for editor', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline');
    const sql = db.query.mock.calls[0][0];
    expect(sql).not.toContain('album_access');
  });

  it('renders viewer photos normally', async () => {
    mockTimeline({
      photos: [{ id: 5, filename: 'x.jpg', title: 'Shared', uploader: 'Alice', display_date: '2024-08-01' }],
    });
    const res = await request(makeApp(VIEWER_SESSION)).get('/timeline');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Shared');
    expect(res.text).toContain('August 2024');
  });
});

// ── Filter bar ────────────────────────────────────────────────────────────────

describe('Filter bar', () => {
  it('renders album options from DB', async () => {
    mockTimeline({
      albums: [{ id: 3, title: 'Holidays' }, { id: 7, title: 'Work' }],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.text).toContain('Holidays');
    expect(res.text).toContain('Work');
    expect(res.text).toContain('name="album"');
  });

  it('renders tag options from DB', async () => {
    mockTimeline({ tags: [{ name: 'paris' }, { name: 'sunset' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.text).toContain('paris');
    expect(res.text).toContain('sunset');
    expect(res.text).toContain('name="tag"');
  });

  it('shows Clear link when a filter is active', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?tag=paris');
    expect(res.text).toContain('Clear');
    expect(res.text).toContain('href="/timeline"');
  });

  it('does not show Clear link when no filter is active', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.text).not.toContain('Clear');
  });

  it('marks the active album as selected', async () => {
    mockTimeline({ albums: [{ id: 3, title: 'Holidays' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?album=3');
    expect(res.text).toContain('value="3" selected');
  });

  it('marks the active tag as selected', async () => {
    mockTimeline({ tags: [{ name: 'paris' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?tag=paris');
    expect(res.text).toContain('value="paris" selected');
  });
});

// ── Album filter (TL1) ────────────────────────────────────────────────────────

describe('GET /timeline?album=N — album filter', () => {
  it('passes album id to the photo query', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline?album=5');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('album_id');
    expect(params).toContain('5');
  });

  it('filters photos and renders only matching ones', async () => {
    mockTimeline({
      photos: [{ id: 1, filename: 'a.jpg', title: 'Album photo', uploader: 'Alice', display_date: '2024-04-01' }],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?album=5');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Album photo');
  });
});

// ── Tag filter (TL1) ─────────────────────────────────────────────────────────

describe('GET /timeline?tag=X — tag filter', () => {
  it('passes tag name to the photo query', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline?tag=paris');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('photo_tags');
    expect(params).toContain('paris');
  });

  it('filters photos and renders only matching ones', async () => {
    mockTimeline({
      photos: [{ id: 2, filename: 'b.jpg', title: 'Eiffel', uploader: 'Alice', display_date: '2024-07-14' }],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?tag=paris');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Eiffel');
    expect(res.text).toContain('July 2024');
  });
});

// ── TL-4: Date range filter ───────────────────────────────────────────────────

describe('TL-4: date range filter', () => {
  it('renders date inputs in the filter bar', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline');
    expect(res.text).toContain('name="from"');
    expect(res.text).toContain('name="to"');
    expect(res.text).toContain('type="date"');
  });

  it('applies from filter in SQL', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline?from=2024-01-01');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('taken_at::date >=');
    expect(params).toContain('2024-01-01');
  });

  it('applies to filter in SQL', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline?to=2024-12-31');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('taken_at::date <=');
    expect(params).toContain('2024-12-31');
  });

  it('applies both from and to together', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline?from=2024-03-01&to=2024-03-31');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('taken_at::date >=');
    expect(sql).toContain('taken_at::date <=');
    expect(params).toContain('2024-03-01');
    expect(params).toContain('2024-03-31');
  });

  it('ignores invalid date format', async () => {
    mockTimeline();
    await request(makeApp(EDITOR_SESSION)).get('/timeline?from=not-a-date&to=2024-99-99');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('taken_at::date >=');
    expect(sql).not.toContain('taken_at::date <=');
    expect(params || []).not.toContain('not-a-date');
  });

  it('shows Clear link when from filter is active', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?from=2024-01-01');
    expect(res.text).toContain('Clear');
    expect(res.text).toContain('href="/timeline"');
  });

  it('shows Clear link when to filter is active', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?to=2024-12-31');
    expect(res.text).toContain('Clear');
  });

  it('prefills date inputs with active filter values', async () => {
    mockTimeline();
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?from=2024-03-01&to=2024-03-31');
    expect(res.text).toContain('value="2024-03-01"');
    expect(res.text).toContain('value="2024-03-31"');
  });

  it('renders photos within the date range', async () => {
    mockTimeline({
      photos: [{ id: 1, filename: 'a.jpg', title: 'March Shot', uploader: 'Alice', display_date: '2024-03-15' }],
    });
    const res = await request(makeApp(EDITOR_SESSION)).get('/timeline?from=2024-03-01&to=2024-03-31');
    expect(res.status).toBe(200);
    expect(res.text).toContain('March Shot');
  });
});
