jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../imageOptimizer', () => ({ optimizePhoto: jest.fn().mockResolvedValue(4000) }));
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  promises: { unlink: jest.fn().mockResolvedValue() },
}));
jest.mock('multer', () => {
  const m = jest.fn().mockReturnValue({
    single: jest.fn().mockReturnValue((req, res, cb) => {
      req.file = { filename: 'test-uuid.jpg', originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 5000 };
      cb();
    }),
  });
  m.diskStorage = jest.fn().mockReturnValue({});
  return m;
});

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const fs = require('fs');

beforeEach(() => jest.clearAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

const FAKE_PHOTO = {
  id: 1,
  user_id: 10,
  filename: 'test-uuid.jpg',
  original_filename: 'photo.jpg',
  title: 'Sunset',
  description: 'A nice sunset',
  mime_type: 'image/jpeg',
  size: 5000,
  uploader: 'Alice',
  tags: ['paris', 'sunset'],
};

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  const { requireEditor } = require('../../middleware');
  app.use('/photos', require('../../routes/photos'));
  return app;
}

// ── US-P1: List ──────────────────────────────────────────────────────────────

describe('US-P1: GET /photos — photo list', () => {
  it('returns 200 and renders photos for editor', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sunset');
    expect(res.text).toContain('+ Upload');
  });

  it('returns 200 and renders photos for admin', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload the first one');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/photos');
    expect(res.status).toBe(403);
  });
});

// ── US-P1: Upload form ───────────────────────────────────────────────────────

describe('US-P1: GET /photos/upload — upload form', () => {
  it('returns 200 with upload form for editor', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/upload');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload a photo');
    expect(res.text).toContain('multipart/form-data');
  });

  it('shows error message for invalid file type', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/upload?error=type');
    expect(res.text).toContain('JPEG, PNG, GIF and WebP');
  });

  it('shows error message for oversized file', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/upload?error=size');
    expect(res.text).toContain('too large');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/photos/upload');
    expect(res.status).toBe(403);
  });
});

// ── US-P1/P2: Handle upload ──────────────────────────────────────────────────

describe('US-P1/P2: POST /photos/upload — upload handling', () => {
  it('inserts photo and redirects to photo page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })  // INSERT photo
      .mockResolvedValueOnce({ rows: [] })             // DELETE photo_tags (setTags)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })   // INSERT tag
      .mockResolvedValueOnce({ rows: [] });            // INSERT photo_tag

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Sunset&description=Nice&tags=Paris');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'photo.jpg', 'Sunset', 'Nice', 'image/jpeg', 4000]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos/42');
  });

  it('inserts photo without tags when tags field is empty', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Mountain');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos/5');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/photos/upload').send('title=X');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── View single photo ────────────────────────────────────────────────────────

describe('GET /photos/:id — view photo', () => {
  it('returns 200 with photo details', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sunset');
    expect(res.text).toContain('A nice sunset');
    expect(res.text).toContain('paris');
  });

  it('shows edit/delete buttons to owner', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).toContain('Edit');
    expect(res.text).toContain('Delete');
  });

  it('shows edit/delete buttons to admin', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos/1');
    expect(res.text).toContain('Edit');
  });

  it('hides edit/delete buttons for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).not.toContain('/photos/1/edit');
  });

  it('returns 404 for unknown photo', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/999');
    expect(res.status).toBe(404);
  });
});

// ── US-P3: Edit ──────────────────────────────────────────────────────────────

describe('US-P3: GET /photos/:id/edit — edit form', () => {
  it('returns 200 for photo owner', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sunset');
    expect(res.text).toContain('paris, sunset');
  });

  it('returns 200 for admin on any photo', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 99 }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos/1/edit');
    expect(res.status).toBe(200);
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/photos/1/edit');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown photo', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/999/edit');
    expect(res.status).toBe(404);
  });
});

describe('US-P3: POST /photos/:id — save edits', () => {
  it('updates title, description, tags and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })  // SELECT user_id
      .mockResolvedValueOnce({ rows: [] })                  // UPDATE photos
      .mockResolvedValueOnce({ rows: [] })                  // DELETE photo_tags
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })        // INSERT tag
      .mockResolvedValueOnce({ rows: [] });                 // INSERT photo_tag

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=Updated+Title&description=New+desc&tags=London');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE photos'),
      ['Updated Title', 'New desc', '1']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos/1');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=X');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/photos/1').send('title=X');
    expect(res.status).toBe(403);
  });
});

// ── US-P4: Delete ────────────────────────────────────────────────────────────

describe('US-P4: POST /photos/:id/delete — delete photo', () => {
  it('deletes photo and file, redirects to list for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10, filename: 'test-uuid.jpg' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).post('/photos/1/delete');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM photos'),
      ['1']
    );
    expect(fs.promises.unlink).toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });

  it('allows admin to delete any photo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 99, filename: 'other.jpg' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION)).post('/photos/1/delete');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99, filename: 'other.jpg' }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/photos/1/delete');
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1); // only SELECT, no DELETE
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/photos/1/delete');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown photo', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/photos/999/delete');
    expect(res.status).toBe(404);
  });
});

// ── Bulk tag ─────────────────────────────────────────────────────────────────

describe('POST /photos/bulk-tag — apply tag to multiple photos', () => {
  it('adds tag to all selected photos owned by the editor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })  // SELECT allowed photos
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })              // INSERT tag
      .mockResolvedValueOnce({ rows: [] });                       // INSERT photo_tags bulk

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-tag')
      .send('tag=Paris&photo_ids=1&photo_ids=2');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM photos WHERE id = ANY'),
      [[1, 2], 10]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tags'),
      ['paris']
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photo_tags'),
      [[1, 2], 5]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });

  it('admin can tag photos from any owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })  // SELECT without user_id filter
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(ADMIN_SESSION))
      .post('/photos/bulk-tag')
      .send('tag=sunset&photo_ids=3');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM photos WHERE id = ANY'),
      [[3]]
    );
  });

  it('works with a single photo_id (not array)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-tag')
      .send('tag=beach&photo_ids=1');

    expect(res.status).toBe(302);
  });

  it('redirects without DB calls when no tag provided', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-tag')
      .send('photo_ids=1');

    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('redirects without DB calls when no photos selected', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-tag')
      .send('tag=Paris');

    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('redirects without inserting when no allowed photos found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-tag')
      .send('tag=Paris&photo_ids=99');

    expect(res.status).toBe(302);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/photos/bulk-tag')
      .send('tag=Paris&photo_ids=1');

    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('GET /photos — photo list shows checkboxes', () => {
  it('shows checkboxes on photos the editor owns', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10, tags: [] }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.text).toContain('<input type="checkbox"');
    expect(res.text).toContain('action="/photos/bulk-tag"');
  });

  it('does not show checkbox on photos owned by others', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 99, tags: [] }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.text).not.toContain('<input type="checkbox"');
  });

  it('admin sees checkboxes on all photos', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 99, tags: [] }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos');
    expect(res.text).toContain('<input type="checkbox"');
  });
});
