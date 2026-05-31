const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
jest.mock('../../db', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));
jest.mock('../../queue/producer', () => ({ addIdentificationJob: jest.fn().mockResolvedValue() }));
jest.mock('../../imageOptimizer', () => ({ optimizeBuffer: jest.fn() }));
jest.mock('../../extractMetadata', () => ({ extractMetadata: jest.fn().mockResolvedValue({}) }));
jest.mock('../../components', () => ({
  selectionBar: jest.fn(() => '<div class="sel-bar-mock" id="sel-bar"></div>'),
  selectionScript: jest.fn(() => '<script>/* sel-script-mock */</script>'),
  lbOverlay: jest.fn(() => '<div id="lb" class="lb-overlay-mock"></div>'),
  lbScript: jest.fn(() => '<script>/* lb-script-mock */</script>'),
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

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const fs = require('fs');
const { upload, processAndUpload } = require('../../uploadHelpers');
const storage = require('../../storage');
const { addIdentificationJob } = require('../../queue/producer');
const { extractMetadata } = require('../../extractMetadata');
const { selectionBar, selectionScript, lbOverlay, lbScript } = require('../../components');

const SINGLE_FILE = { buffer: Buffer.from('test'), originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 5000 };
const MULTI_FILES = [
  { buffer: Buffer.from('test'), originalname: 'beach.jpg', mimetype: 'image/jpeg', size: 5000 },
  { buffer: Buffer.from('test'), originalname: 'sunset.png', mimetype: 'image/png', size: 3000 },
];

beforeEach(() => {
  jest.resetAllMocks();
  upload.single.mockReturnValue((req, res, cb) => { req.file = SINGLE_FILE; cb(); });
  upload.array.mockReturnValue((req, res, cb) => { req.files = MULTI_FILES; cb(); });
  processAndUpload.mockResolvedValue({ filename: 'test-uuid.jpg', size: 4000 });
  storage.deletePhoto.mockRejectedValue(new Error('S3 not configured'));
  addIdentificationJob.mockResolvedValue();
  extractMetadata.mockResolvedValue({});
  fs.promises.unlink.mockResolvedValue();
  selectionBar.mockReturnValue('<div class="sel-bar-mock" id="sel-bar"></div>');
  selectionScript.mockReturnValue('<script>/* sel-script-mock */</script>');
  lbOverlay.mockReturnValue('<div id="lb" class="lb-overlay-mock"></div>');
  lbScript.mockReturnValue('<script>/* lb-script-mock */</script>');
  // Reset pool client mock
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  db.pool.connect.mockResolvedValue(mockClient);
});

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
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  app.use('/albums', require('../../routes/albums'));
  return app;
}

// ── Album list ───────────────────────────────────────────────────────────────

describe('GET /albums — album list', () => {
  it('returns 200 and renders all albums for editor', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
    expect(res.text).toContain('+ New album');
  });

  it('returns 200 and renders only accessible albums for viewer', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
    expect(res.text).not.toContain('+ New album');
  });

  it('shows viewer-specific empty message when viewer has no albums', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums');
    expect(res.status).toBe(200);
    expect(res.text).toContain("haven't been granted access");
  });

  it('shows + From folder button to editor', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.text).toContain('/albums/new/folder');
  });

  it('hides create buttons from viewer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums');
    expect(res.text).not.toContain('/albums/new/folder');
  });

  it('shows Edit/Delete buttons to album owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums');
    expect(res.text).toContain('/albums/1/edit');
  });

  it('hides Edit/Delete buttons for viewer even on accessible album', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums');
    expect(res.text).not.toContain('/albums/1/edit');
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
    await request(makeApp(EDITOR_SESSION)).post('/albums').send('title=Untitled');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Untitled', null]
    );
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
    expect(res.text).toContain('multiple');
    expect(res.text).toContain('webkitdirectory');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/new/folder');
    expect(res.status).toBe(403);
  });
});

describe('POST /albums/new/folder — create album from folder', () => {
  it('creates album, inserts optimized photos with EXIF metadata, and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })   // INSERT album
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })  // INSERT photo 1
      .mockResolvedValueOnce({ rows: [] })             // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })  // INSERT photo 2
      .mockResolvedValueOnce({ rows: [] });            // INSERT album_photos 2

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/new/folder')
      .send('title=Beach+Trip');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Beach Trip', null]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'beach.jpg', 'beach', 'image/jpeg', 4000, null, null, null]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/3');
  });

  it('applies shared tags to all photos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })              // INSERT album
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })             // INSERT photo 1
      .mockResolvedValueOnce({ rows: [] })                        // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [] })                        // DELETE photo_tags (11)
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })  // INSERT tags unnest (11)
      .mockResolvedValueOnce({ rows: [] })                        // INSERT photo_tags unnest (11)
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })             // INSERT photo 2
      .mockResolvedValueOnce({ rows: [] })                        // INSERT album_photos 2
      .mockResolvedValueOnce({ rows: [] })                        // DELETE photo_tags (12)
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })  // INSERT tags unnest (12)
      .mockResolvedValueOnce({ rows: [] });                       // INSERT photo_tags unnest (12)

    await request(makeApp(EDITOR_SESSION))
      .post('/albums/new/folder')
      .send('title=Beach+Trip&tags=summer%2C+2024');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tags'),
      [['summer', '2024']]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photo_tags'),
      [11, [1, 2]]
    );
  });

  it('applies shared GPS to photos without EXIF GPS', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })   // INSERT album
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })  // INSERT photo 1
      .mockResolvedValueOnce({ rows: [] })             // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })  // INSERT photo 2
      .mockResolvedValueOnce({ rows: [] });            // INSERT album_photos 2

    await request(makeApp(EDITOR_SESSION))
      .post('/albums/new/folder')
      .send('title=Beach+Trip&latitude=48.8566&longitude=2.3522');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'beach.jpg', 'beach', 'image/jpeg', 4000, null, 48.8566, 2.3522]
    );
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/new/folder').send('title=X');
    expect(res.status).toBe(403);
  });
});

// ── Album detail ─────────────────────────────────────────────────────────────

describe('GET /albums/:id — album detail', () => {
  it('returns 200 for editor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
    expect(res.text).toContain('Sunset');
  });

  it('ALB-1: editor thumbnail links to edit page, not lightbox', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).toContain('href="/photos/5/edit?from=/albums/1"');
    expect(res.text).toContain('class="ad-lb-btn"');
    expect(res.text).not.toMatch(/href="\/photos\/5"[^>]*data-lb-index/);
  });

  it('ALB-1: viewer thumbnail is a lightbox link (unchanged)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    expect(res.text).toContain('data-lb-index="0"');
    expect(res.text).not.toContain('href="/photos/5/edit"');
    expect(res.text).not.toContain('class="ad-lb-btn"');
  });

  it('editor thumbnail links to /photos/:id/edit?from=/albums/:id', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).toContain('href="/photos/5/edit?from=/albums/1"');
    // The anchor itself must NOT carry data-lb-index (lightbox is on the separate button)
    expect(res.text).not.toMatch(/href="\/photos\/5\/edit[^"]*"\s[^>]*data-lb-index/);
  });

  it('editor thumbnail has lb-btn with data-lb-index', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).toContain('class="ad-lb-btn"');
    expect(res.text).toContain('data-lb-index="0"');
  });

  it('viewer thumbnail has data-lb-index on anchor', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    // data-lb-index must appear on the <a> tag itself
    expect(res.text).toMatch(/data-lb-index="0"/);
    // no ad-lb-btn for viewer
    expect(res.text).not.toContain('class="ad-lb-btn"');
  });

  it('returns 200 for viewer with access', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] }); // album_access check

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
  });

  it('returns 403 for viewer without access', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [] }); // no access

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    expect(res.status).toBe(403);
  });

  it('hides edit controls from viewer', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    expect(res.text).not.toContain('/albums/1/photos/upload');
    expect(res.text).not.toContain('/albums/1/edit');
    expect(res.text).not.toContain('/albums/1/access');
  });

  it('shows Access button to album owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).toContain('/albums/1/access');
  });

  it('returns 404 for unknown album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999');
    expect(res.status).toBe(404);
  });

  it('restGrid: photos 10+ render in overflow photo-grid below mosaic', async () => {
    const photos = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, filename: `p${i + 1}.jpg`, title: `Photo ${i + 1}`, user_id: 10,
    }));
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: photos });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="photo-grid"');
    // first 9 in mosaic, rest in overflow grid
    expect(res.text).toContain('p10.jpg');
    expect(res.text).toContain('p12.jpg');
  });

  it('album detail page includes LB_PHOTOS script tag with photo data', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('LB_PHOTOS');
    // src value contains the filename
    expect(res.text).toContain('/uploads/test.jpg');
  });

  it('LB_PHOTOS photo titles are JSON-encoded (XSS prevention)', async () => {
    const xssPhoto = { id: 6, filename: 'xss.jpg', title: '</script><script>alert(1)', user_id: 10 };
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [xssPhoto] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.status).toBe(200);
    // </script> is escaped to <\/script> so a raw closing tag cannot break out of the script block
    expect(res.text).not.toContain('</script><script>alert(1)');
    // The escaped form is present instead
    expect(res.text).toContain('<\\/script>');
  });
});

// ── US-A3: Edit / Delete ─────────────────────────────────────────────────────

describe('US-A3: GET /albums/:id/edit — edit form', () => {
  it('returns 200 for owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Summer 2024');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/edit');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1/edit');
    expect(res.status).toBe(403);
  });
});

describe('US-A3: POST /albums/:id — save edits', () => {
  it('updates and redirects for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1')
      .send('title=New+Title&description=Updated');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE albums'),
      ['New Title', 'Updated', '1']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1').send('title=X');
    expect(res.status).toBe(403);
  });
});

describe('US-A3: POST /albums/:id/delete — delete album', () => {
  it('deletes and redirects for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/1/delete');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/1/delete');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1/delete');
    expect(res.status).toBe(403);
  });
});

// ── AC1-AC2: Access management ───────────────────────────────────────────────

describe('AC1-AC2: GET /albums/:id/access — access management page', () => {
  it('returns 200 with viewer lists for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })             // SELECT album
      .mockResolvedValueOnce({ rows: [{ id: 20, name: 'Bob', email: 'bob@test.com' }] }) // with access
      .mockResolvedValueOnce({ rows: [{ id: 30, name: 'Eve', email: 'eve@test.com' }] }); // without access

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/access');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bob');
    expect(res.text).toContain('Eve');
    expect(res.text).toContain('Grant access');
  });

  it('shows "all viewers have access" when no viewers left to add', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [{ id: 20, name: 'Bob', email: 'b@test.com' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/access');
    expect(res.text).toContain('All viewers already have access');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/access');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1/access');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999/access');
    expect(res.status).toBe(404);
  });
});

describe('AC1: POST /albums/:id/access/add — grant access', () => {
  it('inserts album_access and redirects to access page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/access/add')
      .send('viewer_id=20');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_access'),
      ['1', 20]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1/access');
  });

  it('returns 400 for non-integer viewer_id', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/access/add')
      .send('viewer_id=abc');
    expect(res.status).toBe(400);
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/access/add')
      .send('viewer_id=20');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/access/add')
      .send('viewer_id=20');
    expect(res.status).toBe(403);
  });
});

describe('AC2: POST /albums/:id/access/remove — revoke access', () => {
  it('deletes album_access and redirects to access page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/access/remove')
      .send('viewer_id=20');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM album_access'),
      ['1', 20]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1/access');
  });

  it('returns 400 for non-integer viewer_id', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/access/remove')
      .send('viewer_id=abc');
    expect(res.status).toBe(400);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/access/remove')
      .send('viewer_id=20');
    expect(res.status).toBe(403);
  });
});

// ── US-A2: Add / Remove photos ───────────────────────────────────────────────

describe('US-A2: GET /albums/:id/photos/add', () => {
  it('returns 200 with photos for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/add');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sunset');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1/photos/add');
    expect(res.status).toBe(403);
  });
});

describe('US-A2: POST /albums/:id/photos/add', () => {
  it('inserts into album_photos and redirects back to add page', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/add')
      .send('photo_id=5');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      ['1', 5]
    );
    expect(res.status).toBe(302);
  });

  it('returns 400 for non-integer photo_id', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/add')
      .send('photo_id=abc');
    expect(res.status).toBe(400);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1/photos/add').send('photo_id=5');
    expect(res.status).toBe(403);
  });
});

describe('US-A2: POST /albums/:id/photos/remove', () => {
  it('removes from album_photos and redirects for owner', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/remove')
      .send('photo_id=5');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM album_photos'),
      ['1', 5]
    );
    expect(res.status).toBe(302);
  });

  it('returns 400 for non-integer photo_id', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/remove')
      .send('photo_id=abc');
    expect(res.status).toBe(400);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1/photos/remove').send('photo_id=5');
    expect(res.status).toBe(403);
  });
});

// ── Upload photo to album ────────────────────────────────────────────────────

describe('GET /albums/:id/photos/upload', () => {
  it('returns 200 for owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/upload');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload photo to');
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1/photos/upload');
    expect(res.status).toBe(403);
  });
});

describe('POST /albums/:id/photos/upload', () => {
  it('inserts photo and links via album_photos then redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 20 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/upload')
      .send('title=Beach+Sunset');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'photo.jpg', 'Beach Sunset', null, 'image/jpeg', 4000, null, null, null, null, null, null]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('EXIF GPS takes priority over place-search GPS', async () => {
    const { extractMetadata } = require('../../extractMetadata');
    extractMetadata.mockResolvedValueOnce({ latitude: 51.5074, longitude: -0.1278 });
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 21 }] });

    await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/upload')
      .send('title=T&latitude=48.8566&longitude=2.3522'); // form says Paris

    const call = db.query.mock.calls.find(c => c[0].includes('INSERT INTO photos'));
    // latitude=[11], longitude=[12] (s3_key added at index 2)
    expect(call[1][11]).toBeCloseTo(51.5074); // EXIF (London) wins
    expect(call[1][12]).toBeCloseTo(-0.1278);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1/photos/upload').send('title=X');
    expect(res.status).toBe(403);
  });
});

// ── Album detail: selection UX ────────────────────────────────────────────────

describe('GET /albums/:id — photo grid selection UX', () => {
  it('shows selection bar and sel-tile for editor who owns the album', async () => {
    const { selectionBar } = require('../../components');
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1');
    expect(res.text).toContain('sel-bar-mock');
    expect(res.text).toContain('data-photo-id');
    expect(res.text).toContain('id="sel-select-btn"');
    expect(selectionBar).toHaveBeenCalledWith(expect.objectContaining({
      removeAction: '/albums/1/photos/bulk-remove',
      deleteAction:  '/albums/1/photos/bulk-delete',
    }));
  });

  it('hides selection bar for viewer', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_ALBUM] })
      .mockResolvedValueOnce({ rows: [FAKE_PHOTO] })
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] });

    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1');
    expect(res.text).not.toContain('sel-bar-mock');
    expect(res.text).not.toContain('data-photo-id');
  });
});

// ── Bulk remove from album ────────────────────────────────────────────────────

describe('POST /albums/:id/photos/bulk-remove', () => {
  it('removes selected photos from album_photos and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/bulk-remove')
      .send('photo_ids=5&photo_ids=6');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM album_photos'),
      ['1', [5, 6]]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('redirects without DB delete when no ids provided', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 10 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/bulk-remove')
      .send('');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/bulk-remove')
      .send('photo_ids=5');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/photos/bulk-remove')
      .send('photo_ids=5');
    expect(res.status).toBe(403);
  });
});

// ── Bulk delete photos from album ─────────────────────────────────────────────

describe('POST /albums/:id/photos/bulk-delete', () => {
  const fs = require('fs');

  it('permanently deletes owned photos and files, redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })          // SELECT user_id FROM albums
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })                 // SELECT p.id FROM photos
      .mockResolvedValueOnce({ rows: [{ filename: 'a.jpg' }] })     // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                         // deletePhotos: DELETE FROM photos

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/bulk-delete')
      .send('photo_ids=5');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM photos WHERE id = ANY'),
      [[5]]
    );
    expect(fs.promises.unlink).toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('admin can delete any photo in album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })          // SELECT user_id FROM albums
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })                 // SELECT p.id FROM photos
      .mockResolvedValueOnce({ rows: [{ filename: 'a.jpg' }] })     // deletePhotos: SELECT filename
      .mockResolvedValueOnce({ rows: [] });                         // deletePhotos: DELETE FROM photos

    await request(makeApp(ADMIN_SESSION))
      .post('/albums/1/photos/bulk-delete')
      .send('photo_ids=5');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT p.id FROM photos'),
      ['1', [5]]
    );
  });

  it('redirects without deleting when no allowed photos found', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/bulk-delete')
      .send('photo_ids=99');

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(fs.promises.unlink).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/bulk-delete')
      .send('photo_ids=5');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/1/photos/bulk-delete')
      .send('photo_ids=5');
    expect(res.status).toBe(403);
  });
});

// ── IMP-2: Batch upload ───────────────────────────────────────────────────────

describe('GET /albums/:id/photos/batch — batch upload form', () => {
  it('returns 200 with multi-file form for owner', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_ALBUM] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/batch');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Batch upload');
    expect(res.text).toContain('multiple');
    expect(res.text).toContain('action="/albums/1/photos/batch"');
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValue({ rows: [{ ...FAKE_ALBUM, user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/1/photos/batch');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/albums/1/photos/batch');
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown album', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION)).get('/albums/999/photos/batch');
    expect(res.status).toBe(404);
  });
});

describe('POST /albums/:id/photos/batch — batch upload', () => {
  it('inserts all uploaded photos and links via album_photos then redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })  // auth check
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })        // INSERT photo 1
      .mockResolvedValueOnce({ rows: [] })                  // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })        // INSERT photo 2
      .mockResolvedValueOnce({ rows: [] });                 // INSERT album_photos 2

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/batch')
      .send('');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'beach.jpg', 'beach', 'image/jpeg', 4000, null, null, null]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/albums/1');
  });

  it('applies shared tags to all photos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })  // auth
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })        // INSERT photo 1
      .mockResolvedValueOnce({ rows: [] })                  // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [] })                  // DELETE photo_tags (11)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })         // INSERT tags unnest (11)
      .mockResolvedValueOnce({ rows: [] })                  // INSERT photo_tags unnest (11)
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })        // INSERT photo 2
      .mockResolvedValueOnce({ rows: [] })                  // INSERT album_photos 2
      .mockResolvedValueOnce({ rows: [] })                  // DELETE photo_tags (12)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })         // INSERT tags unnest (12)
      .mockResolvedValueOnce({ rows: [] });                 // INSERT photo_tags unnest (12)

    await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/batch')
      .send('tags=paris');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tags'),
      [['paris']]
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photo_tags'),
      [11, [1]]
    );
  });

  it('applies shared GPS to photos without EXIF GPS', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })
      .mockResolvedValueOnce({ rows: [] })                  // INSERT album_photos 1
      .mockResolvedValueOnce({ rows: [{ id: 12 }] })
      .mockResolvedValueOnce({ rows: [] });                 // INSERT album_photos 2

    await request(makeApp(EDITOR_SESSION))
      .post('/albums/1/photos/batch')
      .send('latitude=48.8566&longitude=2.3522');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photos'),
      [10, 'test-uuid.jpg', 'test-uuid.jpg', 'beach.jpg', 'beach', 'image/jpeg', 4000, null, 48.8566, 2.3522]
    );
  });

  it('returns 403 for non-owner editor', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 99 }] });
    const res = await request(makeApp(EDITOR_SESSION)).post('/albums/1/photos/batch').send('');
    expect(res.status).toBe(403);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).post('/albums/1/photos/batch').send('');
    expect(res.status).toBe(403);
  });
});

// ── RA-1: POST /albums/from-recipe — snapshot album from recipe ───────────────

const FAKE_RECIPE = {
  id: 5,
  name: 'Paris 2024',
  user_id: 10,
  query_json: {
    sections: {
      people:  { on: [],          not: [], logic: 'any' },
      places:  { on: ['paris'],   not: [], logic: 'any' },
      years:   { on: [],          not: [], logic: 'include' },
      themes:  { on: [],          not: [], logic: 'any' },
      other:   { on: [],          not: [], logic: 'any' },
    },
  },
};

const RECIPE_NO_FILTERS = {
  id: 6,
  name: 'Empty',
  user_id: 10,
  query_json: {
    sections: {
      people: { on: [], not: [], logic: 'any' },
      places: { on: [], not: [], logic: 'any' },
      years:  { on: [], not: [], logic: 'include' },
      themes: { on: [], not: [], logic: 'any' },
      other:  { on: [], not: [], logic: 'any' },
    },
  },
};

describe('POST /albums/from-recipe', () => {
  it('creates album and returns 201 with albumId and photoCount', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_RECIPE] })       // 1. SELECT recipe
      .mockResolvedValueOnce({ rows: [{ id: 3 }, { id: 7 }] }); // 2. SELECT photos matching filters

    mockClient.query
      .mockResolvedValueOnce({})                             // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })        // INSERT album RETURNING id
      .mockResolvedValueOnce({})                             // INSERT album_photos
      .mockResolvedValueOnce({});                            // COMMIT

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: 'Paris Trip' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ albumId: 42, photoCount: 2 });
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO albums'),
      [10, 'Paris Trip']
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO album_photos'),
      expect.arrayContaining([42, 3, 7])
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 404 when recipe not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // recipe not found

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 999, albumName: 'My Album' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recipe not found' });
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('returns 404 when recipe belongs to another user', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...FAKE_RECIPE, user_id: 99 }] }); // other user

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: 'My Album' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recipe not found' });
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('returns 422 when albumName is empty', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: '   ' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Album name is required' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 422 when albumName exceeds 255 chars', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: 'A'.repeat(256) });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Album name must be 255 characters or fewer' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 422 when recipe has no filters', async () => {
    db.query.mockResolvedValueOnce({ rows: [RECIPE_NO_FILTERS] }); // recipe with no filters

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 6, albumName: 'Empty Album' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Recipe has no filters' });
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('creates empty album when recipe matches 0 photos', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [FAKE_RECIPE] })  // 1. SELECT recipe
      .mockResolvedValueOnce({ rows: [] });             // 2. SELECT photos — none match

    mockClient.query
      .mockResolvedValueOnce({})                        // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 55 }] })   // INSERT album RETURNING id
      .mockResolvedValueOnce({});                       // COMMIT

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: 'Empty Paris' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ albumId: 55, photoCount: 0 });
    // album_photos INSERT should NOT have been called
    const albumPhotosCall = mockClient.query.mock.calls
      .find(c => typeof c[0] === 'string' && c[0].includes('album_photos'));
    expect(albumPhotosCall).toBeUndefined();
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('admin can create album from any recipe', async () => {
    const adminOwnedByOther = { ...FAKE_RECIPE, user_id: 99 }; // owned by someone else
    db.query
      .mockResolvedValueOnce({ rows: [adminOwnedByOther] }) // 1. SELECT recipe
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });        // 2. SELECT photos

    mockClient.query
      .mockResolvedValueOnce({})                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 77 }] })       // INSERT album RETURNING id
      .mockResolvedValueOnce({})                            // INSERT album_photos
      .mockResolvedValueOnce({});                           // COMMIT

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: 'Admin Album' });

    expect(res.status).toBe(201);
    expect(res.body.albumId).toBe(77);
  });

  it('returns 403 for viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/albums/from-recipe')
      .set('Content-Type', 'application/json')
      .send({ recipeId: 5, albumName: 'My Album' });

    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});
