jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../imageOptimizer', () => ({ optimizePhoto: jest.fn().mockResolvedValue(4000) }));
jest.mock('../../extractMetadata', () => ({ extractMetadata: jest.fn().mockResolvedValue({}) }));
jest.mock('../../components', () => ({
  photoThumb: jest.fn((p, { owns } = {}) =>
    `<div class="photo-thumb-mock" data-id="${p.id}">${owns ? '<input type="checkbox" name="photo_ids" value="' + p.id + '">' : ''}</div>`),
  bulkBar: jest.fn(() => '<div id="bulk-bar" class="bulk-bar-mock"><input type="text" name="tag"><button type="submit">Apply tag</button><button type="submit" formaction="/photos/bulk-delete">Delete selected</button></div>'),
  bulkScript: jest.fn(() => '<script>/* bulk-script-mock */</script>'),
}));
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
      [10, 'test-uuid.jpg', 'photo.jpg', 'Sunset', 'Nice', 'image/jpeg', 4000, null, null, null, null, null, null]
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
      ['Updated Title', 'New desc', null, null, null, null, '1']
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
      .mockResolvedValueOnce({ rows: [{ user_id: 10, filename: 'test-uuid.jpg' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [{ filename: 'test-uuid.jpg' }] })              // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                                           // deletePhotos: DELETE

    const res = await request(makeApp(EDITOR_SESSION)).post('/photos/1/delete');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM photos WHERE id = ANY'),
      [[1]]
    );
    expect(fs.promises.unlink).toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });

  it('allows admin to delete any photo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 99, filename: 'other.jpg' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [{ filename: 'other.jpg' }] })               // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                                        // deletePhotos: DELETE

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

  it('shows Delete selected button in bulk bar', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10, tags: [] }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.text).toContain('formaction="/photos/bulk-delete"');
    expect(res.text).toContain('Delete selected');
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

// ── Bulk delete ───────────────────────────────────────────────────────────────

describe('POST /photos/bulk-delete — delete multiple photos', () => {
  it('deletes owned photos and their files, redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })                             // SELECT id (ownership filter)
      .mockResolvedValueOnce({ rows: [{ filename: 'a.jpg' }, { filename: 'b.jpg' }] })      // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                                                  // deletePhotos: DELETE

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-delete')
      .send('photo_ids=1&photo_ids=2');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM photos WHERE id = ANY'),
      [[1, 2], 10]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM photos WHERE id = ANY'),
      [[1, 2]]
    );
    expect(fs.promises.unlink).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });

  it('admin can delete photos from any owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })               // SELECT id (no ownership filter)
      .mockResolvedValueOnce({ rows: [{ filename: 'c.jpg' }] })    // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                         // deletePhotos: DELETE

    await request(makeApp(ADMIN_SESSION))
      .post('/photos/bulk-delete')
      .send('photo_ids=3');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM photos WHERE id = ANY'),
      [[3]]
    );
  });

  it('redirects without DB calls when no ids provided', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-delete')
      .send('');

    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('redirects without deleting when no allowed photos found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-delete')
      .send('photo_ids=99');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(fs.promises.unlink).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/photos/bulk-delete')
      .send('photo_ids=1');

    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── US-NC1: Link Nextcloud at upload ─────────────────────────────────────────

describe('US-NC1: POST /photos/upload — store nextcloud_url', () => {
  it('stores a valid https nextcloud_url', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Beach&nextcloud_url=https%3A%2F%2Fcloud.example%2Fs%2Fabc123');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'photo.jpg', 'Beach', null, 'image/jpeg', 4000, null, null, null, null, null, 'https://cloud.example/s/abc123']
    );
    expect(res.status).toBe(302);
  });

  it('stores null when nextcloud_url is not https', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 8 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Beach&nextcloud_url=http%3A%2F%2Finsecure.example%2Fs%2Fxyz');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      expect.arrayContaining([null])
    );
    const callArgs = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(callArgs[1][8]).toBeNull();
  });

  it('upload form contains nextcloud_url field', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/upload');
    expect(res.text).toContain('nextcloud_url');
    expect(res.text).toContain('Nextcloud link');
  });
});

// ── US-NC2: Download original button ─────────────────────────────────────────

describe('US-NC2: GET /photos/:id — download original button', () => {
  it('shows Download original button when nextcloud_url is set', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, nextcloud_url: 'https://cloud.example/s/abc' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Download original');
    expect(res.text).toContain('https://cloud.example/s/abc');
  });

  it('hides Download original button when nextcloud_url is not set', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, nextcloud_url: null }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).not.toContain('Download original');
  });
});

// ── US-NC3: Manage Nextcloud link ─────────────────────────────────────────────

describe('US-NC3: manage nextcloud_url via edit', () => {
  it('edit form pre-fills existing nextcloud_url', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10, nextcloud_url: 'https://cloud.example/s/abc' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('nextcloud_url');
    expect(res.text).toContain('https://cloud.example/s/abc');
  });

  it('updates nextcloud_url to a new valid url', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&nextcloud_url=https%3A%2F%2Fcloud.example%2Fs%2Fnew');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE photos'),
      ['T', null, null, 'https://cloud.example/s/new', null, null, '1']
    );
  });

  it('clears nextcloud_url when empty string is submitted', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&nextcloud_url=');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE photos'),
      ['T', null, null, null, null, null, '1']
    );
  });
});

// ── EXIF metadata extraction ──────────────────────────────────────────────────

describe('EXIF metadata: POST /photos/upload', () => {
  const { extractMetadata } = require('../../extractMetadata');

  it('stores exposure_time and focal_length extracted from EXIF', async () => {
    extractMetadata.mockResolvedValueOnce({
      takenAt:      new Date('2024-06-15T10:30:00Z'),
      exposureTime: '1/250',
      focalLength:  50,
    });
    db.query.mockResolvedValueOnce({ rows: [{ id: 9 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Alps');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'photo.jpg', 'Alps', null, 'image/jpeg', 4000, '2024-06-15', '1/250', 50, null, null, null]
    );
  });

  it('uses user-provided taken_at over EXIF date', async () => {
    extractMetadata.mockResolvedValueOnce({
      takenAt: new Date('2024-01-01T00:00:00Z'),
    });
    db.query.mockResolvedValueOnce({ rows: [{ id: 10 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Alps&taken_at=2023-07-20');

    const callArgs = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(callArgs[1][7]).toBe('2023-07-20');
  });

  it('falls back to EXIF date when taken_at form field is empty', async () => {
    extractMetadata.mockResolvedValueOnce({
      takenAt: new Date('2024-06-15T10:30:00Z'),
    });
    db.query.mockResolvedValueOnce({ rows: [{ id: 11 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Alps&taken_at=');

    const callArgs = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(callArgs[1][7]).toBe('2024-06-15');
  });

  it('stores nulls when EXIF is absent', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 12 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Alps');

    const callArgs = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(callArgs[1][7]).toBeNull();
    expect(callArgs[1][8]).toBeNull();
    expect(callArgs[1][9]).toBeNull();
  });
});

describe('EXIF metadata: GET /photos/:id — display', () => {
  it('shows EXIF block when metadata is present', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, taken_at: '2024-06-15', exposure_time: '1/250', focal_length: '50.00' }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).toContain('Exposition');
    expect(res.text).toContain('1/250');
    expect(res.text).toContain('Focale');
    expect(res.text).toContain('50.00');
  });

  it('hides EXIF block when no metadata', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, taken_at: null, exposure_time: null, focal_length: null }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).not.toContain('Exposition');
    expect(res.text).not.toContain('Focale');
  });
});

// ── GPS1: coordinates in upload & edit ───────────────────────────────────────

describe('GPS1: POST /photos/upload — store GPS coordinates', () => {
  const { extractMetadata } = require('../../extractMetadata');

  it('uses place-search hidden lat/lon when EXIF has no GPS', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 20 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Paris&latitude=48.8566&longitude=2.3522');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][10]).toBeCloseTo(48.8566);
    expect(call[1][11]).toBeCloseTo(2.3522);
  });

  it('EXIF GPS takes priority over place-search GPS when both present', async () => {
    extractMetadata.mockResolvedValueOnce({ latitude: 51.5074, longitude: -0.1278 });
    db.query.mockResolvedValueOnce({ rows: [{ id: 21 }] });

    // Simulates user selecting "Paris" from place search, but photo EXIF says London
    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=T&latitude=48.8566&longitude=2.3522');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][10]).toBeCloseTo(51.5074); // EXIF wins
    expect(call[1][11]).toBeCloseTo(-0.1278);
  });

  it('falls back to place-search GPS when EXIF has no GPS', async () => {
    extractMetadata.mockResolvedValueOnce({ latitude: 51.5074, longitude: -0.1278 });
    db.query.mockResolvedValueOnce({ rows: [{ id: 22 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=London');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][10]).toBeCloseTo(51.5074);
    expect(call[1][11]).toBeCloseTo(-0.1278);
  });

  it('rejects out-of-range coordinates', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 23 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=X&latitude=999&longitude=999');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][10]).toBeNull();
    expect(call[1][11]).toBeNull();
  });

  it('accepts DMS coordinates and converts to decimal', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 24 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send("title=Cusco&latitude=14°02'01.7\"S&longitude=71°14'50.7\"W");

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][10]).toBeCloseTo(-14.0338, 3);
    expect(call[1][11]).toBeCloseTo(-71.2474, 3);
  });

  it('upload form shows place search input and hidden lat/lon fields', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/upload');
    expect(res.text).toContain('loc-search-input');
    expect(res.text).toContain('Search a place');
    expect(res.text).toContain('name="latitude"');
    expect(res.text).toContain('name="longitude"');
  });
});

describe('GPS1: POST /photos/:id — save GPS coordinates', () => {
  it('updates lat/lon and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&latitude=48.8566&longitude=2.3522');

    const call = db.query.mock.calls.find(c => c[0].includes('UPDATE photos'));
    expect(call[1][4]).toBeCloseTo(48.8566);
    expect(call[1][5]).toBeCloseTo(2.3522);
  });

  it('clears coordinates when fields are empty (user clicked × clear)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&latitude=&longitude=');

    const call = db.query.mock.calls.find(c => c[0].includes('UPDATE photos'));
    expect(call[1][4]).toBeNull();
    expect(call[1][5]).toBeNull();
  });

  it('edit form shows place search with current lat/lon as placeholder', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      ...FAKE_PHOTO, latitude: 48.8566, longitude: 2.3522,
    }]});
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');
    expect(res.text).toContain('loc-search-input');
    expect(res.text).toContain('48.85660');
    expect(res.text).toContain('2.35220');
    // Hidden fields pre-filled so user doing nothing preserves existing coords
    expect(res.text).toContain('value="48.8566"');
    expect(res.text).toContain('value="2.3522"');
  });

  it('edit form shows empty place search when photo has no GPS', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      ...FAKE_PHOTO, latitude: null, longitude: null,
    }]});
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');
    expect(res.text).toContain('loc-search-input');
    expect(res.text).toContain('Search a place');
    expect(res.text).not.toContain('48.8566');
  });
});

// ── GPS2: mini-map on photo detail ───────────────────────────────────────────

describe('GPS2: GET /photos/:id — mini-map display', () => {
  it('shows leaflet map when GPS coordinates are set', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, latitude: 48.8566, longitude: 2.3522 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).toContain('photo-map');
    expect(res.text).toContain('48.8566');
    expect(res.text).toContain('2.3522');
    expect(res.text).toContain('leaflet');
  });

  it('hides map when GPS coordinates are null', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, latitude: null, longitude: null }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.text).not.toContain('photo-map');
  });
});
