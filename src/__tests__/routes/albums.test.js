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
    array: jest.fn().mockReturnValue((req, res, cb) => {
      req.files = [
        { filename: 'uuid-1.jpg', originalname: 'beach.jpg', mimetype: 'image/jpeg', size: 5000 },
        { filename: 'uuid-2.jpg', originalname: 'sunset.png', mimetype: 'image/png', size: 3000 },
      ];
      cb();
    }),
  });
  m.diskStorage = jest.fn().mockReturnValue({});
  return m;
});

const request = require('supertest');
const express = require('express');
const db = require('../../db');

beforeEach(() => jest.clearAllMocks());

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

const FAKE_ALBUM = {
  id: 1,
  user_id: 10,
  title: 'Summer 2024',
  description: 'Beach photos',
  creator: 'Alice',
  photo_count: 2,
  cover_filename: 'cover.jpg',
};

const FAKE_PHOTO = {
  id: 5,
  filename: 'test.jpg',
  title: 'Sunset',
  user_id: 10,
};

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  app.use('/albums', require('../../routes/albums'));
  return app;
}

// ── Album list ───────────────────────────────────────────────────────────────

describe('GET /albums — album list', () => {
  it('returns 200 and renders albums for editor', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
    expect(res.text).toContain('2 photos');
  });

  it('shows empty state for admin with no albums', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No albums yet');
  });

  it('shows "+ From folder" button', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.text).toContain('/albums/new/folder');
  });

  it('shows Edit/Delete buttons to album owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.text).toContain('/albums/1/edit');
    expect(res.text).toContain('Delete');
  });

  it('shows Edit/Delete buttons to admin on any album', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/albums');
    expect(res.text).toContain('/albums/1/edit');
  });

  it('hides Edit/Delete buttons for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.text).not.toContain('/albums/1/edit');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums');
    expect(res.status).toBe(403);
  });
});

// ── US-A1: Create album ──────────────────────────────────────────────────────

describe('US-A1: GET /albums/new — create form', () => {
  it('returns 200 with form for editor', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('New album');
    expect(res.text).toContain('action="/albums"');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/new');
    expect(res.status).toBe(403);
  });
});

describe('US-A1: POST /albums — create album', () => {
  it('inserts album and redirects to detail page', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 7 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums')
      .send('title=Summer+2024&description=Beach+photos');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Summer 2024', 'Beach photos']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/7');
  });

  it('inserts album with null description when omitted', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 8 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums')
      .send('title=Untitled');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Untitled', null]
    );
    expect(res.status).toBe(302);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums').send('title=X');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── Create album from folder ─────────────────────────────────────────────────

describe('GET /albums/new/folder — folder upload form', () => {
  it('returns 200 with multi-file input for editor', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/new/folder');
    expect(res.status).toBe(200);
    expect(res.text).toContain('New album from folder');
    expect(res.text).toContain('action="/albums/new/folder"');
    expect(res.text).toContain('multiple');
    expect(res.text).toContain('webkitdirectory');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/new/folder');
    expect(res.status).toBe(403);
  });
});

describe('POST /albums/new/folder — create album from folder', () => {
  it('creates album, inserts optimized photos, and redirects to album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })   // INSERT album
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })  // INSERT photo 1
      .mockResolvedValueOnce({ rows: [] })             // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })  // INSERT photo 2
      .mockResolvedValueOnce({ rows: [] });            // INSERT album_photos 2

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/new/folder')
      .send('title=Beach+Trip&description=Summer');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Beach Trip', 'Summer']
    );
    // first photo title derived from filename
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'uuid-1.jpg', 'beach.jpg', 'beach', 'image/jpeg', 4000]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      [3, 11]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/3');
  });

  it('creates album with no photos if no files uploaded', async () => {
    const multer = require('multer');
    multer.mockReturnValue({
      single: jest.fn(),
      array: jest.fn().mockReturnValue((req, res, cb) => {
        req.files = [];
        cb();
      }),
    });

    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/new/folder')
      .send('title=Empty+Album');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/5');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/new/folder')
      .send('title=X');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── Album detail ─────────────────────────────────────────────────────────────

describe('GET /albums/:id — album detail', () => {
  it('returns 200 with album title and photos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
    expect(res.text).toContain('Sunset');
  });

  it('shows Upload/Add/Edit/Delete controls to album owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).toContain('/albums/1/photos/upload');
    expect(res.text).toContain('/albums/1/photos/add');
    expect(res.text).toContain('/albums/1/edit');
  });

  it('hides controls for non-owner editor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).not.toContain('/albums/1/photos/upload');
    expect(res.text).not.toContain('/albums/1/photos/add');
    expect(res.text).not.toContain('/albums/1/edit');
  });

  it('shows controls to admin on any album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION)).get('/albums/1');
    expect(res.text).toContain('/albums/1/photos/upload');
    expect(res.text).toContain('/albums/1/photos/add');
  });

  it('returns 404 for unknown album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999');
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    expect(res.status).toBe(403);
  });
});

// ── US-A3: Edit album ────────────────────────────────────────────────────────

describe('US-A3: GET /albums/:id/edit — edit form', () => {
  it('returns 200 with pre-filled form for owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
    expect(res.text).toContain('Beach photos');
  });

  it('returns 200 for admin on any album', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/albums/1/edit');
    expect(res.status).toBe(200);
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/edit');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999/edit');
    expect(res.status).toBe(404);
  });
});

describe('US-A3: POST /albums/:id — save edits', () => {
  it('updates title and description, redirects to detail', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1')
      .send('title=New+Title&description=Updated+desc');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE albums'),
      ['New Title', 'Updated desc', '1']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1')
      .send('title=X');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/999').send('title=X');
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1').send('title=X');
    expect(res.status).toBe(403);
  });
});

// ── US-A3: Delete album ──────────────────────────────────────────────────────

describe('US-A3: POST /albums/:id/delete — delete album', () => {
  it('deletes album and redirects to list for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/1/delete');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM albums'),
      ['1']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums');
  });

  it('allows admin to delete any album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION)).post('/albums/1/delete');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/1/delete');
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/999/delete');
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1/delete');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── US-A2: Add photos ────────────────────────────────────────────────────────

describe('US-A2: GET /albums/:id/photos/add — add photos page', () => {
  it('returns 200 with available photos for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/add');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sunset');
    expect(res.text).toContain('+ Add');
  });

  it('shows "Upload new photo" button on add page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/add');
    expect(res.text).toContain('/albums/1/photos/upload');
  });

  it('shows empty state when all photos already in album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/add');
    expect(res.status).toBe(200);
    expect(res.text).toContain('All photos are already in this album');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/add');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999/photos/add');
    expect(res.status).toBe(404);
  });
});

describe('US-A2: POST /albums/:id/photos/add — add photo to album', () => {
  it('inserts into album_photos and redirects back to add page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/add')
      .send('photo_id=5');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      ['1', '5']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1/photos/add');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/add')
      .send('photo_id=5');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/photos/add')
      .send('photo_id=5');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── US-A2: Remove photo ──────────────────────────────────────────────────────

describe('US-A2: POST /albums/:id/photos/remove — remove photo from album', () => {
  it('deletes from album_photos and redirects to album for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/remove')
      .send('photo_id=5');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM album_photos'),
      ['1', '5']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('allows admin to remove photos from any album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 99 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/albums/1/photos/remove')
      .send('photo_id=5');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/remove')
      .send('photo_id=5');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/photos/remove')
      .send('photo_id=5');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/999/photos/remove')
      .send('photo_id=5');
    expect(res.status).toBe(404);
  });
});

// ── Upload photo directly into album ────────────────────────────────────────

describe('GET /albums/:id/photos/upload — upload form', () => {
  it('returns 200 with upload form for album owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/upload');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload photo to');
    expect(res.text).toContain('Summer 2024');
    expect(res.text).toContain('action="/albums/1/photos/upload"');
    expect(res.text).toContain('enctype="multipart/form-data"');
  });

  it('shows size error message', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/upload?error=size');
    expect(res.text).toContain('too large');
  });

  it('shows type error message', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/upload?error=type');
    expect(res.text).toContain('JPEG, PNG, GIF and WebP');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/upload');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999/photos/upload');
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1/photos/upload');
    expect(res.status).toBe(403);
  });
});

describe('POST /albums/:id/photos/upload — upload photo to album', () => {
  it('inserts photo and album link, redirects to album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })  // SELECT album
      .mockResolvedValueOnce({ rows: [{ id: 20 }] })       // INSERT photo
      .mockResolvedValueOnce({ rows: [] });                 // INSERT album_photos

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/upload')
      .send('title=Beach+Sunset&description=Nice+view');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'photo.jpg', 'Beach Sunset', 'Nice view', 'image/jpeg', 4000]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      ['1', 20]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('saves tags when provided', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })   // SELECT album
      .mockResolvedValueOnce({ rows: [{ id: 21 }] })        // INSERT photo
      .mockResolvedValueOnce({ rows: [] })                   // DELETE photo_tags
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })         // INSERT tag 'paris'
      .mockResolvedValueOnce({ rows: [] })                   // INSERT photo_tag paris
      .mockResolvedValueOnce({ rows: [{ id: 6 }] })         // INSERT tag 'sunset'
      .mockResolvedValueOnce({ rows: [] })                   // INSERT photo_tag sunset
      .mockResolvedValueOnce({ rows: [] });                  // INSERT album_photos

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/upload')
      .send('title=Beach&tags=Paris%2CSunset');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tags'),
      expect.any(Array)
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('returns 403 for non-owner editor before running upload', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/upload')
      .send('title=X');
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/999/photos/upload')
      .send('title=X');
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/photos/upload')
      .send('title=X');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});
