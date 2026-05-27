jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../photoHash', () => ({ findDuplicates: jest.fn() }));
jest.mock('../../uploadHelpers', () => ({
  UPLOAD_DIR: '/uploads',
  deletePhotos: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { findDuplicates } = require('../../photoHash');
const { deletePhotos } = require('../../uploadHelpers');
const { requireAdmin } = require('../../middleware');

beforeEach(() => jest.resetAllMocks());

const ADMIN_SESSION = { userId: 1, name: 'Admin', role: 'admin' };

function makeApp(session = ADMIN_SESSION, sessionExtras = {}) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...session, ...sessionExtras, save: (cb) => cb && cb() };
    next();
  });
  app.use('/admin/ai', requireAdmin, require('../../routes/admin-ai'));
  return app;
}

describe('GET /admin/ai', () => {
  it('returns 200 with scan button when no session groups', async () => {
    const res = await request(makeApp()).get('/admin/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scan for duplicates');
  });

  it('shows no duplicates message when groups is empty array', async () => {
    // storedGroups = [] → DB query skipped (no IDs to fetch) → groups = []
    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: [] })).get('/admin/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No duplicates found');
  });

  it('renders duplicate groups when session has ID arrays', async () => {
    // Session stores arrays of IDs (post-Fix 4 shape)
    const storedGroups = [[1, 2]];
    // DB re-hydrates those IDs into full photo objects
    db.query.mockResolvedValueOnce({
      rows: [
        { id: 1, filename: 'a.jpg', title: 'Photo A' },
        { id: 2, filename: 'b.jpg', title: 'Photo B' },
      ],
    }); // SELECT id, filename, title FROM photos WHERE id = ANY($1)

    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: storedGroups })).get('/admin/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Photo A');
    expect(res.text).toContain('Photo B');
  });

  it('filters out photos deleted since the scan', async () => {
    // Photo 2 was deleted — DB returns only photo 1 → group has < 2 → not rendered
    const storedGroups = [[1, 2]];
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, filename: 'a.jpg', title: 'Photo A' }],
    }); // only one photo found → group filtered out

    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: storedGroups })).get('/admin/ai');
    expect(res.status).toBe(200);
    // Group had only one surviving photo — rendered as "no duplicates found"
    expect(res.text).toContain('No duplicates found');
  });

  it('returns 403 for non-admin', async () => {
    const editorSession = { userId: 2, name: 'Editor', role: 'editor' };
    const res = await request(makeApp(editorSession)).get('/admin/ai');
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/ai/scan', () => {
  it('runs findDuplicates and stores ID-only groups in session', async () => {
    const fakePhotos = [
      { id: 1, filename: 'a.jpg', title: 'A' },
      { id: 2, filename: 'b.jpg', title: 'B' },
    ];
    db.query.mockResolvedValue({ rows: fakePhotos });
    // findDuplicates returns full photo objects — scan should store only IDs
    findDuplicates.mockResolvedValue([[fakePhotos[0], fakePhotos[1]]]);

    let savedSession;
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
      req.session = {
        ...ADMIN_SESSION,
        save: (cb) => cb && cb(),
        set duplicateGroups(v) { savedSession = v; },
        get duplicateGroups() { return savedSession; },
      };
      next();
    });
    app.use('/admin/ai', requireAdmin, require('../../routes/admin-ai'));

    const res = await request(app).post('/admin/ai/scan');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/ai');
    expect(findDuplicates).toHaveBeenCalledWith(fakePhotos, expect.any(Function));
    // Groups stored as ID arrays, not full objects
    expect(savedSession).toEqual([[1, 2]]);
  });
});

describe('POST /admin/ai/delete', () => {
  it('deletes the photo and removes its ID from the group', async () => {
    deletePhotos.mockResolvedValue();
    // Groups now contain arrays of IDs
    const groups = [[1, 2]];
    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: groups }))
      .post('/admin/ai/delete')
      .send('groupIndex=0&photoId=1');

    expect(deletePhotos).toHaveBeenCalledWith([1]);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/ai');
  });

  it('returns 400 for invalid params', async () => {
    const res = await request(makeApp()).post('/admin/ai/delete').send('groupIndex=abc&photoId=1');
    expect(res.status).toBe(400);
  });

  it('drops the group entirely when only one ID remains after deletion', async () => {
    deletePhotos.mockResolvedValue();
    const groups = [[1, 2]];
    const app = makeApp(ADMIN_SESSION, { duplicateGroups: groups });
    await request(app).post('/admin/ai/delete').send('groupIndex=0&photoId=1');
    // After deletion of photo 1, only ID 2 remains → group removed
    expect(groups).toHaveLength(0);
  });
});

describe('POST /admin/ai/dismiss', () => {
  it('removes the group from session and redirects', async () => {
    // Groups are arrays of IDs
    const groups = [[1, 2], [3, 4]];
    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: groups }))
      .post('/admin/ai/dismiss')
      .send('groupIndex=0');

    expect(res.status).toBe(302);
    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe(3);
  });

  it('returns 400 for invalid groupIndex', async () => {
    const res = await request(makeApp()).post('/admin/ai/dismiss').send('groupIndex=nope');
    expect(res.status).toBe(400);
  });
});
