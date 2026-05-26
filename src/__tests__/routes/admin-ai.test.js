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
  it('returns 200 with scan button', async () => {
    const res = await request(makeApp()).get('/admin/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Scan for duplicates');
  });

  it('shows no duplicates message when groups is empty array', async () => {
    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: [] })).get('/admin/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No duplicates found');
  });

  it('renders duplicate groups when session has results', async () => {
    const groups = [[
      { id: 1, filename: 'a.jpg', title: 'Photo A' },
      { id: 2, filename: 'b.jpg', title: 'Photo B' },
    ]];
    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: groups })).get('/admin/ai');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Photo A');
    expect(res.text).toContain('Photo B');
  });

  it('returns 403 for non-admin', async () => {
    const editorSession = { userId: 2, name: 'Editor', role: 'editor' };
    const res = await request(makeApp(editorSession)).get('/admin/ai');
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/ai/scan', () => {
  it('runs findDuplicates and stores groups in session', async () => {
    const fakePhotos = [{ id: 1, filename: 'a.jpg', title: 'A' }];
    db.query.mockResolvedValue({ rows: fakePhotos });
    findDuplicates.mockResolvedValue([]);

    const res = await request(makeApp()).post('/admin/ai/scan');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/ai');
    expect(findDuplicates).toHaveBeenCalledWith(fakePhotos, expect.any(Function));
  });
});

describe('POST /admin/ai/delete', () => {
  it('deletes the photo and removes it from the group', async () => {
    deletePhotos.mockResolvedValue();
    const groups = [[
      { id: 1, filename: 'a.jpg', title: 'A' },
      { id: 2, filename: 'b.jpg', title: 'B' },
    ]];
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

  it('drops the group entirely when only one photo remains after deletion', async () => {
    deletePhotos.mockResolvedValue();
    const groups = [[
      { id: 1, filename: 'a.jpg', title: 'A' },
      { id: 2, filename: 'b.jpg', title: 'B' },
    ]];
    const app = makeApp(ADMIN_SESSION, { duplicateGroups: groups });
    await request(app).post('/admin/ai/delete').send('groupIndex=0&photoId=1');
    // After deletion of photo 1, only photo 2 remains → group removed
    expect(groups).toHaveLength(0);
  });
});

describe('POST /admin/ai/dismiss', () => {
  it('removes the group from session and redirects', async () => {
    const groups = [
      [{ id: 1, filename: 'a.jpg', title: 'A' }, { id: 2, filename: 'b.jpg', title: 'B' }],
      [{ id: 3, filename: 'c.jpg', title: 'C' }, { id: 4, filename: 'd.jpg', title: 'D' }],
    ];
    const res = await request(makeApp(ADMIN_SESSION, { duplicateGroups: groups }))
      .post('/admin/ai/dismiss')
      .send('groupIndex=0');

    expect(res.status).toBe(302);
    expect(groups).toHaveLength(1);
    expect(groups[0][0].id).toBe(3);
  });

  it('returns 400 for invalid groupIndex', async () => {
    const res = await request(makeApp()).post('/admin/ai/dismiss').send('groupIndex=nope');
    expect(res.status).toBe(400);
  });
});
