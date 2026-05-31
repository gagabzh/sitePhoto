jest.mock('../../db', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../repositories/albums', () => ({
  fetchAlbumsForPhoto: jest.fn(),
  fetchAlbumsForPhotoEdit: jest.fn(),
}));
jest.mock('../../repositories/personFaces', () => ({
  fetchPersonFacesForPhoto: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../queue/producer', () => ({ addIdentificationJob: jest.fn().mockResolvedValue() }));
jest.mock('../../imageOptimizer', () => ({ optimizeBuffer: jest.fn() }));
jest.mock('../../extractMetadata', () => ({ extractMetadata: jest.fn().mockResolvedValue({}) }));
jest.mock('../../components', () => ({
  selectionBar: jest.fn(() => '<div id="sel-bar" class="sel-bar-mock"><input type="text" name="tag"><button type="submit" formaction="/photos/bulk-tag">apply</button><button type="submit" formaction="/photos/bulk-delete">delete</button></div>'),
  selectionScript: jest.fn(() => '<script>/* sel-script-mock */</script>'),
}));
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  promises: { unlink: jest.fn().mockResolvedValue() },
}));
jest.mock('../../storage', () => ({
  uploadPhoto: jest.fn().mockResolvedValue(),
  deletePhoto: jest.fn().mockRejectedValue(new Error('S3 not configured')),
  readPhotoBuffer: jest.fn(),
  downloadPhoto: jest.fn(),
  streamPhoto: jest.fn(),
}));
jest.mock('../../uploadHelpers', () => {
  const actual = jest.requireActual('../../uploadHelpers');
  return { ...actual, upload: { single: jest.fn(), array: jest.fn() }, processAndUpload: jest.fn() };
});
jest.mock('sharp', () => {
  const chain = {
    metadata: jest.fn().mockResolvedValue({ width: 1000, height: 800 }),
    extract:  jest.fn(),
    jpeg:     jest.fn(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('crop')),
  };
  chain.extract.mockReturnValue(chain);
  chain.jpeg.mockReturnValue(chain);
  const sharpFn = jest.fn(() => chain);
  sharpFn._chain = chain;
  return sharpFn;
});

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const fs = require('fs');
const sharp = require('sharp');
const { upload, processAndUpload } = require('../../uploadHelpers');
const storage = require('../../storage');
const { addIdentificationJob } = require('../../queue/producer');
const { extractMetadata } = require('../../extractMetadata');
const { selectionBar, selectionScript } = require('../../components');
const { fetchAlbumsForPhoto, fetchAlbumsForPhotoEdit } = require('../../repositories/albums');
const { fetchPersonFacesForPhoto } = require('../../repositories/personFaces');

let mockClient;

beforeEach(() => {
  jest.resetAllMocks();
  upload.single.mockReturnValue((req, res, cb) => {
    req.file = { buffer: Buffer.from('test'), originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 5000 };
    cb();
  });
  processAndUpload.mockResolvedValue({ filename: 'test-uuid.jpg', size: 4000 });
  storage.deletePhoto.mockRejectedValue(new Error('S3 not configured'));
  storage.uploadPhoto.mockResolvedValue();
  storage.downloadPhoto.mockResolvedValue(Buffer.from('fakeimagebytes'));
  addIdentificationJob.mockResolvedValue();
  extractMetadata.mockResolvedValue({});
  fs.promises.unlink.mockResolvedValue();
  selectionBar.mockReturnValue('<div id="sel-bar" class="sel-bar-mock"><input type="text" name="tag"><button type="submit" formaction="/photos/bulk-tag">apply</button><button type="submit" formaction="/photos/bulk-delete">delete</button></div>');
  selectionScript.mockReturnValue('<script>/* sel-script-mock */</script>');
  fetchAlbumsForPhoto.mockResolvedValue([]);
  fetchAlbumsForPhotoEdit.mockResolvedValue([]);
  fetchPersonFacesForPhoto.mockResolvedValue([]);
  mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  db.pool.connect = jest.fn().mockResolvedValue(mockClient);
  // Re-configure sharp chain after resetAllMocks clears implementations
  const sc = sharp._chain;
  sharp.mockImplementation(() => sc);
  sc.metadata.mockResolvedValue({ width: 1000, height: 800 });
  sc.extract.mockReturnValue(sc);
  sc.jpeg.mockReturnValue(sc);
  sc.toBuffer.mockResolvedValue(Buffer.from('crop'));
});

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
  app.use(express.json());
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
  // GET /photos calls 6 db.query in this order (for editor/admin):
  //   1. SELECT nextcloud_imports (active import check — NC-5)
  //   2. fetchPhotoPage (photo rows)          } Promise.all
  //   3. fetchPhotoStats: uploader counts     }
  //   4. fetchPhotoStats: tag counts          }
  //   5. fetchPhotoStats: total COUNT         }
  //   6. fetchLatestAlbum                     }

  it('returns 200 and renders photos for editor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })                // 1. nextcloud_imports (no active import)
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })      // 2. fetchPhotoPage
      .mockResolvedValueOnce({ rows: [{ name: 'Alice', cnt: 1 }] }) // 3. uploaders
      .mockResolvedValueOnce({ rows: [] })                // 4. topTags
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })        // 5. total
      .mockResolvedValueOnce({ rows: [] });               // 6. fetchLatestAlbum
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sunset');
    expect(res.text).toContain('+ Upload');
  });

  it('renders the import banner when an active import exists', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3, total: 20, done: 5, failed: 1 }] }) // 1. active import
      .mockResolvedValueOnce({ rows: [] })               // 2. fetchPhotoPage (empty)
      .mockResolvedValueOnce({ rows: [] })               // 3. uploaders
      .mockResolvedValueOnce({ rows: [] })               // 4. topTags
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })       // 5. total
      .mockResolvedValueOnce({ rows: [] });              // 6. fetchLatestAlbum
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('nc-import-banner');
    expect(res.text).toContain('5 of 20');
  });

  it('returns 200 and renders photos for admin', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })               // 1. nextcloud_imports (no active import)
      .mockResolvedValueOnce({ rows: [] })               // 2. fetchPhotoPage (empty)
      .mockResolvedValueOnce({ rows: [] })               // 3. uploaders
      .mockResolvedValueOnce({ rows: [] })               // 4. topTags
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })       // 5. total
      .mockResolvedValueOnce({ rows: [] });              // 6. fetchLatestAlbum
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload the first one');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/photos');
    expect(res.status).toBe(403);
  });

  it('renders photo-sentinel for editor when nextCursor is set', () => {
    const { renderPhotoListPage } = require('../../routes/photosViews');
    const html = renderPhotoListPage({
      rows: [{ ...FAKE_PHOTO, canEdit: true }],
      uploaders: [], topTags: [], total: 50, nextCursor: 24, latestAlbum: null,
      session: EDITOR_SESSION,
    });
    expect(html).toContain('id="photo-sentinel"');
    expect(html).toContain('data-cursor="24"');
  });

  it('suppresses photo-sentinel for viewer even when nextCursor is set', () => {
    const { renderPhotoListPage } = require('../../routes/photosViews');
    const html = renderPhotoListPage({
      rows: [{ ...FAKE_PHOTO, canEdit: false }],
      uploaders: [], topTags: [], total: 50, nextCursor: 24, latestAlbum: null,
      session: VIEWER_SESSION,
    });
    expect(html).not.toContain('photo-sentinel');
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
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'photo.jpg', 'Sunset', 'Nice', 'image/jpeg', 4000, null, null, null, null, null, null]
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
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. SELECT user_id (getPhotoOwner)
    // fetchAlbumsForPhotoEdit returns [] (default mock)
    // client.query handles BEGIN, UPDATE photos, DELETE photo_tags, INSERT tags, INSERT photo_tags, COMMIT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })    // BEGIN
      .mockResolvedValueOnce({ rows: [] })    // UPDATE photos
      .mockResolvedValueOnce({ rows: [] })    // DELETE photo_tags
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })  // INSERT tags RETURNING id
      .mockResolvedValueOnce({ rows: [] })    // INSERT photo_tags
      .mockResolvedValueOnce({ rows: [] });   // COMMIT

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=Updated+Title&description=New+desc&tags=London');

    expect(mockClient.query).toHaveBeenCalledWith(
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

describe('GET /photos — photo list selection mode', () => {
  function mockPhotoList(photo) {
    db.query
      .mockResolvedValueOnce({ rows: [] })                // 1. nextcloud_imports (no active import)
      .mockResolvedValueOnce({ rows: [photo] })           // 2. fetchPhotoPage
      .mockResolvedValueOnce({ rows: [] })                // 3. uploaders
      .mockResolvedValueOnce({ rows: [] })                // 4. topTags
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })        // 5. total
      .mockResolvedValueOnce({ rows: [] });               // 6. fetchLatestAlbum
  }

  it('shows sel-tile and sel-select-btn for editor-owned photos', async () => {
    mockPhotoList({ ...FAKE_PHOTO, user_id: 10, tags: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.text).toContain('sel-tile');
    expect(res.text).toContain('id="sel-select-btn"');
    expect(res.text).toContain('action="/photos/bulk-tag"');
    expect(res.text).toContain('formaction="/photos/bulk-delete"');
  });

  it('does not show sel-tile on photos owned by others', async () => {
    mockPhotoList({ ...FAKE_PHOTO, user_id: 99, tags: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos');
    expect(res.text).not.toContain('data-photo-id');
  });

  it('admin sees sel-tile on all photos', async () => {
    mockPhotoList({ ...FAKE_PHOTO, user_id: 99, tags: [] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos');
    expect(res.text).toContain('sel-tile');
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

// ── Bulk untag ────────────────────────────────────────────────────────────────

describe('POST /photos/bulk-untag — remove tag from multiple photos', () => {
  it('removes the tag from owned photos and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })  // ownership check
      .mockResolvedValueOnce({ rows: [] });                        // DELETE

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-untag')
      .send('tag=paris&photo_ids=1&photo_ids=2');

    expect(res.status).toBe(302);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM photo_tags'),
      expect.arrayContaining([[1, 2], 'paris'])
    );
  });

  it('redirects without DB write when no tag provided', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-untag')
      .send('photo_ids=1');

    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('redirects without DB write when no photo_ids provided', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/bulk-untag')
      .send('tag=paris');

    expect(res.status).toBe(302);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/photos/bulk-untag')
      .send('tag=paris&photo_ids=1');

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
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'photo.jpg', 'Beach', null, 'image/jpeg', 4000, null, null, null, null, null, 'https://cloud.example/s/abc123']
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
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    // fetchAlbumsForPhotoEdit returns [] (default mock)
    // client.query handles BEGIN, UPDATE photos, DELETE photo_tags (no tags → no INSERT), COMMIT

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&nextcloud_url=https%3A%2F%2Fcloud.example%2Fs%2Fnew');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE photos'),
      ['T', null, null, 'https://cloud.example/s/new', null, null, '1']
    );
  });

  it('clears nextcloud_url when empty string is submitted', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    // fetchAlbumsForPhotoEdit returns [] (default mock)
    // client.query handles BEGIN, UPDATE photos, DELETE photo_tags (no tags → no INSERT), COMMIT

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&nextcloud_url=');

    expect(mockClient.query).toHaveBeenCalledWith(
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
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'photo.jpg', 'Alps', null, 'image/jpeg', 4000, '2024-06-15', '1/250', 50, null, null, null]
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
    expect(callArgs[1][8]).toBe('2023-07-20');
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
    expect(callArgs[1][8]).toBe('2024-06-15');
  });

  it('stores nulls when EXIF is absent', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 12 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=Alps');

    const callArgs = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(callArgs[1][8]).toBeNull();
    expect(callArgs[1][9]).toBeNull();
    expect(callArgs[1][10]).toBeNull();
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
    expect(call[1][11]).toBeCloseTo(48.8566);
    expect(call[1][12]).toBeCloseTo(2.3522);
  });

  it('EXIF GPS takes priority over place-search GPS when both present', async () => {
    extractMetadata.mockResolvedValueOnce({ latitude: 51.5074, longitude: -0.1278 });
    db.query.mockResolvedValueOnce({ rows: [{ id: 21 }] });

    // Simulates user selecting "Paris" from place search, but photo EXIF says London
    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=T&latitude=48.8566&longitude=2.3522');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][11]).toBeCloseTo(51.5074); // EXIF wins
    expect(call[1][12]).toBeCloseTo(-0.1278);
  });

  it('falls back to place-search GPS when EXIF has no GPS', async () => {
    extractMetadata.mockResolvedValueOnce({ latitude: 51.5074, longitude: -0.1278 });
    db.query.mockResolvedValueOnce({ rows: [{ id: 22 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=London');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][11]).toBeCloseTo(51.5074);
    expect(call[1][12]).toBeCloseTo(-0.1278);
  });

  it('rejects out-of-range coordinates', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 23 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send('title=X&latitude=999&longitude=999');

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][11]).toBeNull();
    expect(call[1][12]).toBeNull();
  });

  it('accepts DMS coordinates and converts to decimal', async () => {
    extractMetadata.mockResolvedValueOnce({});
    db.query.mockResolvedValueOnce({ rows: [{ id: 24 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/upload')
      .send("title=Cusco&latitude=14°02'01.7\"S&longitude=71°14'50.7\"W");

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    expect(call[1][11]).toBeCloseTo(-14.0338, 3);
    expect(call[1][12]).toBeCloseTo(-71.2474, 3);
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
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    // fetchAlbumsForPhotoEdit returns [] (default mock)
    // client.query handles BEGIN, UPDATE photos, DELETE photo_tags (no tags → no INSERT), COMMIT

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&latitude=48.8566&longitude=2.3522');

    const call = mockClient.query.mock.calls.find(c => c[0].includes('UPDATE photos'));
    expect(call[1][4]).toBeCloseTo(48.8566);
    expect(call[1][5]).toBeCloseTo(2.3522);
  });

  it('clears coordinates when fields are empty (user clicked × clear)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    // fetchAlbumsForPhotoEdit returns [] (default mock)
    // client.query handles BEGIN, UPDATE photos, DELETE photo_tags (no tags → no INSERT), COMMIT

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&latitude=&longitude=');

    const call = mockClient.query.mock.calls.find(c => c[0].includes('UPDATE photos'));
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

// ── TQ-8: Pagination API ─────────────────────────────────────────────────────

describe('GET /photos/api/page — cursor-based pagination', () => {
  it('returns first page with no cursor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_PHOTO, tags: [] }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/api/page');
    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(1);
    expect(res.body.photos[0].id).toBe(1);
    expect(res.body.photos[0].filename).toBe('test-uuid.jpg');
    expect(res.body.nextCursor).toBeNull();
  });

  it('sets nextCursor when a full page is returned', async () => {
    // fetchPhotoPage requests limit+1 = 25; returning 25 rows signals hasMore
    const manyPhotos = Array.from({ length: 25 }, (_, i) => ({ ...FAKE_PHOTO, id: 100 - i, tags: [] }));
    db.query.mockResolvedValueOnce({ rows: manyPhotos });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/api/page?limit=24');
    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(24);
    expect(res.body.nextCursor).toBe(manyPhotos[23].id);
  });

  it('passes cursor to the WHERE clause', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/api/page?cursor=50');
    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE p.id < $2'),
      expect.arrayContaining([50])
    );
  });

  it('includes canEdit based on ownership', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_PHOTO, user_id: 10, tags: [] }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/api/page');
    expect(res.body.photos[0].canEdit).toBe(true);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/photos/api/page');
    expect(res.status).toBe(403);
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

// ── MA-2: GET /photos/:id — album memberships ────────────────────────────────

describe('MA-2: GET /photos/:id — album memberships', () => {
  it('renders album links when photo belongs to albums', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    fetchAlbumsForPhoto.mockResolvedValue([{ id: 1, title: 'Summer' }]);

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');

    expect(res.status).toBe(200);
    expect(res.text).toContain('/albums/1');
    expect(res.text).toContain('Summer');
  });

  it('renders "Not in any album" when photoAlbums is empty', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    fetchAlbumsForPhoto.mockResolvedValue([]);

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Not in any album');
  });

  it('page still renders when fetchAlbumsForPhoto rejects', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    fetchAlbumsForPhoto.mockRejectedValue(new Error('DB down'));

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');

    expect(res.status).toBe(200);
    expect(res.text).toContain(FAKE_PHOTO.title);
  });

  it('calls fetchAlbumsForPhoto with viewer session', async () => {
    const viewerSession = { userId: 9, role: 'viewer', username: 'viewer' };
    fetchAlbumsForPhoto.mockResolvedValue([{ id: 3, title: 'Shared' }]);
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(viewerSession)).get('/photos/1');

    expect(res.status).toBe(200);
    expect(fetchAlbumsForPhoto).toHaveBeenCalledWith('1', expect.objectContaining({ role: 'viewer' }));
    expect(res.text).toContain('Shared');
    expect(res.text).toContain('/albums/3');
  });
});

// ── MA-3: GET /photos/:id/edit — album checklist ─────────────────────────────

describe('MA-3: GET /photos/:id/edit — album checklist', () => {
  it('renders album checkboxes with pre-checked current memberships', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    fetchAlbumsForPhotoEdit.mockResolvedValue([
      { id: 1, title: 'A', checked: true },
      { id: 2, title: 'B', checked: false },
    ]);

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');

    expect(res.status).toBe(200);
    expect(res.text).toContain('checked');
    expect(res.text).toContain('A');
    expect(res.text).toContain('B');
  });

  it('renders no fieldset when albumChoices is empty', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    fetchAlbumsForPhotoEdit.mockResolvedValue([]);

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<fieldset');
  });
});

// ── MA-3: POST /photos/:id — album membership reconciliation ─────────────────

describe('MA-3: POST /photos/:id — album membership reconciliation', () => {
  it('runs BEGIN/COMMIT and adds newly checked album', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    fetchAlbumsForPhotoEdit.mockResolvedValue([{ id: 1, title: 'Summer', checked: false }]);

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&album_ids=1');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      [1, '1']
    );
  });

  it('runs BEGIN/COMMIT and removes unchecked album', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    fetchAlbumsForPhotoEdit.mockResolvedValue([{ id: 1, title: 'Summer', checked: true }]);

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM album_photos'),
      [1, '1']
    );
  });

  it('calls ROLLBACK on db error and rethrows (returns 500)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    fetchAlbumsForPhotoEdit.mockResolvedValue([]);
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // UPDATE photos
      .mockRejectedValueOnce(new Error('DB error'));  // COMMIT fails

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(res.status).toBe(500);
  });

  it('ignores album_ids not in available set', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });  // 1. getPhotoOwner
    fetchAlbumsForPhotoEdit.mockResolvedValue([{ id: 1, title: 'Summer', checked: false }]);

    await request(makeApp(EDITOR_SESSION))
      .post('/photos/1')
      .send('title=T&album_ids=99');

    // album_id 99 is not in available set, so no INSERT should use id 99
    const insertCalls = mockClient.query.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO album_photos')
    );
    expect(insertCalls.every(c => c[1][0] !== 99)).toBe(true);
  });
});

// ── ALB-2: Context-aware back button ─────────────────────────────────────────

describe('ALB-2: GET /photos/:id — context-aware back button', () => {
  it('detail page back button shows "← back to album" when from=/albums/5', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Falbums%2F5');
    expect(res.status).toBe(200);
    expect(res.text).toContain('← back to album');
    expect(res.text).toContain('href="/albums/5"');
  });

  it('detail page back button shows "← back to photos" when from is absent', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('← back to photos');
  });

  it('detail page back button shows "← back to photos" when from=/photos', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Fphotos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('← back to photos');
    expect(res.text).toContain('href="/photos"');
  });
});

describe('ALB-2: GET /photos/:id/edit — context-aware back button + Cancel link', () => {
  it('edit page back button shows "← back to album" when from=/albums/5', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit?from=%2Falbums%2F5');
    expect(res.status).toBe(200);
    expect(res.text).toContain('← back to album');
  });

  it('edit page Cancel link includes from param', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit?from=%2Falbums%2F5');
    expect(res.status).toBe(200);
    // Cancel button must link to /photos/1?from=%2Falbums%2F5 (or equivalent encoded form)
    expect(res.text).toContain('href="/photos/1?from=%2Falbums%2F5"');
  });

  it('edit page Cancel links to photo detail when no from param', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_PHOTO, user_id: 10 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/photos/1"');
  });
});

describe('ALB-2: POST /photos/:id/delete — from-aware redirect', () => {
  it('delete form includes from hidden input when from is in query', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Falbums%2F5');
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="from"');
    expect(res.text).toContain('value="/albums/5"');
  });

  it('redirects to album after delete when from=/albums/5 is submitted', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10, filename: 'test-uuid.jpg' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [{ filename: 'test-uuid.jpg' }] })              // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                                           // deletePhotos: DELETE

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/delete')
      .send('from=%2Falbums%2F5');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/5');
  });

  it('redirects to /photos after delete when from is absent', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10, filename: 'test-uuid.jpg' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [{ filename: 'test-uuid.jpg' }] })              // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                                           // deletePhotos: DELETE

    const res = await request(makeApp(EDITOR_SESSION)).post('/photos/1/delete').send('');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });

  it('ignores an invalid from value and redirects to /photos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10, filename: 'test-uuid.jpg' }] })
      .mockResolvedValueOnce({ rows: [{ filename: 'test-uuid.jpg' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/delete')
      .send('from=http%3A%2F%2Fevil.com%2Fphish');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/photos');
  });
});

// ── ALB-2: parseFrom regex coverage ─────────────────────────────────────────

describe('ALB-2: parseFrom regex — valid and invalid paths', () => {
  it('accepts /photos', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Fphotos');
    expect(res.text).toContain('href="/photos"');
  });

  it('accepts /albums/123', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Falbums%2F123');
    expect(res.text).toContain('href="/albums/123"');
  });

  it('accepts /travels/some-slug-2024', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Ftravels%2Fsome-slug-2024');
    expect(res.text).toContain('href="/travels/some-slug-2024"');
  });

  it('rejects /admin (open-redirect guard)', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_PHOTO] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/1?from=%2Fadmin');
    // Falls back to /photos
    expect(res.text).toContain('href="/photos"');
  });
});

// ── AI-3: POST /photos/:id/tag-person ────────────────────────────────────────

describe('POST /photos/:id/tag-person', () => {
  const VALID_BBOX = { x: 0.1, y: 0.1, width: 0.3, height: 0.4 };

  it('returns 201 with id, personName, cropKey on success', async () => {
    // 1. SELECT photo (includes user_id for canModify)
    // 2. INSERT tags RETURNING id
    // 3. INSERT person_faces RETURNING id
    // 4. INSERT photo_tags (no return needed)
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1, filename: 'test-uuid.jpg', s3_key: 'test-uuid.jpg', user_id: 10 }] }) // 1. SELECT photo
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })  // 2. INSERT tags
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })  // 3. INSERT person_faces
      .mockResolvedValueOnce({ rows: [] });            // 4. INSERT photo_tags

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/tag-person')
      .send({ personName: 'Alice', bbox: VALID_BBOX });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(7);
    expect(res.body.personName).toBe('Alice');
    expect(res.body.cropKey).toMatch(/^faces\//);
    expect(storage.downloadPhoto).toHaveBeenCalledWith('test-uuid.jpg');
    expect(storage.uploadPhoto).toHaveBeenCalledWith(
      expect.stringMatching(/^faces\//),
      expect.any(Buffer),
      'image/jpeg'
    );
  });

  it('returns 404 when photo not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // SELECT photo → empty

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/999/tag-person')
      .send({ personName: 'Bob', bbox: VALID_BBOX });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 422 when personName is empty', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/tag-person')
      .send({ personName: '   ', bbox: VALID_BBOX });

    expect(res.status).toBe(422);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 422 when bbox is out of range', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/tag-person')
      .send({ personName: 'Alice', bbox: { x: 1.5, y: 0.1, width: 0.3, height: 0.4 } });

    expect(res.status).toBe(422);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 422 when computed crop is smaller than 20x20', async () => {
    // Image is 1000x800; bbox of 0.01 x 0.01 → 10x8 px crop → rejected
    sharp._chain.metadata.mockResolvedValue({ width: 1000, height: 800 });

    db.query.mockResolvedValueOnce({ rows: [{ id: 1, filename: 'test-uuid.jpg', s3_key: 'test-uuid.jpg', user_id: 10 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/tag-person')
      .send({ personName: 'Alice', bbox: { x: 0.0, y: 0.0, width: 0.01, height: 0.01 } });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/too small/i);
    expect(storage.uploadPhoto).not.toHaveBeenCalled();
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/photos/1/tag-person')
      .send({ personName: 'Alice', bbox: VALID_BBOX });

    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 403 when editor tags faces on another user\'s photo', async () => {
    // Photo owned by userId 99, session is userId 10 (editor)
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, filename: 'x.jpg', s3_key: 'x.jpg', user_id: 99 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/1/tag-person')
      .send({ personName: 'Alice', bbox: VALID_BBOX });

    expect(res.status).toBe(403);
    expect(storage.downloadPhoto).not.toHaveBeenCalled();
  });
});

// ── AI-3: DELETE /photos/:id/tag-person/:faceId ──────────────────────────────

describe('DELETE /photos/:id/tag-person/:faceId', () => {
  it('returns 204 and deletes face record', async () => {
    // 1. SELECT person_faces WHERE id AND photo_id
    // 2. DELETE person_faces WHERE id
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, user_id: 10, crop_s3_key: 'faces/crop.jpg' }] }) // 1. SELECT face
      .mockResolvedValueOnce({ rows: [] }); // 2. DELETE

    storage.deletePhoto.mockResolvedValue(); // S3 delete succeeds

    const res = await request(makeApp(EDITOR_SESSION))
      .delete('/photos/1/tag-person/7');

    expect(res.status).toBe(204);
    expect(storage.deletePhoto).toHaveBeenCalledWith('faces/crop.jpg');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM person_faces'),
      [7]
    );
  });

  it('returns 404 when face not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // SELECT → empty

    const res = await request(makeApp(EDITOR_SESSION))
      .delete('/photos/1/tag-person/999');

    expect(res.status).toBe(404);
  });

  it('returns 403 when non-owner editor tries to delete', async () => {
    // Face belongs to userId 99, session is userId 10 (editor, not admin)
    db.query.mockResolvedValueOnce({ rows: [{ id: 7, user_id: 99, crop_s3_key: 'faces/crop.jpg' }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .delete('/photos/1/tag-person/7');

    expect(res.status).toBe(403);
    // No DELETE query should have been called
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
