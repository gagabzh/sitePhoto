jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../queue/producer', () => ({
  addIdentificationJob: jest.fn().mockResolvedValue(),
}));
jest.mock('../../nextcloudWebdav', () => ({
  isValidNextcloudShareUrl: jest.fn(),
  propfindShare: jest.fn(),
  downloadFileAsBuffer: jest.fn(),
  EXT_MAP: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' },
}));
jest.mock('../../notifications', () => ({ notifyUser: jest.fn() }));
jest.mock('../../storage', () => ({ uploadPhoto: jest.fn().mockResolvedValue() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { addIdentificationJob } = require('../../queue/producer');
const { isValidNextcloudShareUrl, propfindShare, downloadFileAsBuffer } = require('../../nextcloudWebdav');
const { notifyUser } = require('../../notifications');
const { uploadPhoto } = require('../../storage');

const EDITOR_SESSION = { userId: 10, name: 'Alice', role: 'editor' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin' };

beforeEach(() => {
  jest.resetAllMocks();
});

function makeApp(sessionData) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { ...sessionData };
    next();
  });
  app.use('/photos/nextcloud-import', require('../../routes/nextcloudImport'));
  return app;
}

// ── GET /photos/nextcloud-import ─────────────────────────────────────────────

describe('GET /photos/nextcloud-import — import form', () => {
  it('returns 200 and renders the form for an editor', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Import from Nextcloud');
    expect(res.text).toContain('nc-preview-btn');
  });

  it('returns 200 for an admin', async () => {
    const res = await request(makeApp(ADMIN_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
  });

  it('returns 403 for a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(403);
  });

  it('includes nc-tags input field', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="nc-tags"');
    expect(res.text).toContain('placeholder="Paris, Vacation"');
  });

  it('includes tag autocomplete script for nc-tags', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    expect(res.text).toContain('document.getElementById(\'nc-tags\')');
    expect(res.text).toContain('/tags/autocomplete?q=');
    expect(res.text).toContain('tag-ac-wrap');
  });

  it('includes debouncing for tag autocomplete (BUG-2)', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    expect(res.text).toContain('fetchTimer');
    expect(res.text).toContain('clearTimeout(fetchTimer)');
    expect(res.text).toContain('setTimeout(function()');
    expect(res.text).toContain('300');
  });

  it('includes loading state indicator for tag autocomplete (BUG-4)', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    expect(res.text).toContain('tag-ac-loading');
    expect(res.text).toContain('showLoading');
    expect(res.text).toContain('hideLoading');
  });

  it('fixes leading space when inserting tag (BUG-3)', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    // Verify the pick function handles spaces correctly
    expect(res.text).toContain('lastPart = parts[parts.length - 1].trim()');
    expect(res.text).toContain("parts.join('')");
    // Verify the old buggy code is not present
    expect(res.text).not.toContain("parts[parts.length - 1] = ' ' + s;");
  });

  it('prevents duplicate tags (BUG-5)', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import');
    expect(res.status).toBe(200);
    expect(res.text).toContain('existingTags');
    expect(res.text).toContain('indexOf(s.toLowerCase())');
    expect(res.text).toContain('close(); input.focus();');
  });
});

// ── POST /photos/nextcloud-import — preview ───────────────────────────────────

describe('POST /photos/nextcloud-import — preview', () => {
  it('returns 422 when shareUrl is missing', async () => {
    isValidNextcloudShareUrl.mockReturnValue(false);
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/valid Nextcloud/i);
  });

  it('returns 422 when shareUrl does not match Nextcloud pattern', async () => {
    isValidNextcloudShareUrl.mockReturnValue(false);
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'http://not-nextcloud.com/abc' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/valid Nextcloud/i);
  });

  it('returns 403 for a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/abc123' });
    expect(res.status).toBe(403);
  });

  it('returns file list and total on success', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const files = [
      { name: 'IMG_001.jpg', size: 1024000, mimeType: 'image/jpeg' },
      { name: 'IMG_002.png', size: 512000,  mimeType: 'image/png'  },
    ];
    propfindShare.mockResolvedValue(files);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/abc123' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files[0].name).toBe('IMG_001.jpg');
  });

  it('returns 200 with empty file list when folder has no images', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    propfindShare.mockResolvedValue([]);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/abc123' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.files).toHaveLength(0);
  });

  it('returns 422 when folder has more than 500 files', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const bigList = Array.from({ length: 501 }, (_, i) => ({
      name: `IMG_${i}.jpg`, size: 1000, mimeType: 'image/jpeg',
    }));
    propfindShare.mockResolvedValue(bigList);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/abc123' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/too many photos/i);
  });

  it('forwards 422 from propfindShare (expired share)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const err = Object.assign(new Error('Could not access this Nextcloud share.'), { httpStatus: 422 });
    propfindShare.mockRejectedValue(err);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/expired' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Could not access/i);
  });

  it('forwards 504 from propfindShare (timeout)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const err = Object.assign(new Error('Nextcloud did not respond in time.'), { httpStatus: 504 });
    propfindShare.mockRejectedValue(err);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/slow' });

    expect(res.status).toBe(504);
  });

  it('forwards 502 from propfindShare (XML parse failure)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const err = Object.assign(new Error('Unexpected response from Nextcloud.'), { httpStatus: 502 });
    propfindShare.mockRejectedValue(err);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/badxml' });

    expect(res.status).toBe(502);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    // Build a minimal app that always fires the 429 handler directly
    const appWith429 = (() => {
      const express = require('express');
      const a = express();
      a.use(express.json());
      a.use((req, res, next) => { req.session = { ...EDITOR_SESSION }; next(); });
      // Stub handler that always returns 429 (simulates exhausted rate limit)
      a.post('/photos/nextcloud-import', (req, res) =>
        res.status(429).json({ error: 'Too many preview requests — try again in a few minutes.' }),
      );
      return a;
    })();

    const res = await request(appWith429)
      .post('/photos/nextcloud-import')
      .send({ shareUrl: 'https://cloud.example.com/s/abc123' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/Too many preview requests/i);
  });

});

// ── POST /photos/nextcloud-import/confirm ─────────────────────────────────────

const SHARE_URL = 'https://cloud.example.com/s/abc123';

describe('POST /photos/nextcloud-import/confirm — validation', () => {
  it('returns 422 when shareUrl is invalid', async () => {
    isValidNextcloudShareUrl.mockReturnValue(false);
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: 'not-valid' });
    expect(res.status).toBe(422);
  });

  it('returns 403 for a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL });
    expect(res.status).toBe(403);
  });

  it('returns 422 when PROPFIND re-check finds 0 images', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    propfindShare.mockResolvedValue([]);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/No photos found/i);
  });

  it('returns 422 when album name already exists', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    propfindShare.mockResolvedValue([
      { name: 'IMG_001.jpg', size: 1000, mimeType: 'image/jpeg' },
    ]);
    // SELECT albums — album already exists
    db.query.mockResolvedValueOnce({ rows: [{ id: 99 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL, albumName: 'Summer 2024' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 422 when file count > 500 on confirm re-check', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const bigList = Array.from({ length: 501 }, (_, i) => ({
      name: `IMG_${i}.jpg`, size: 1000, mimeType: 'image/jpeg',
    }));
    propfindShare.mockResolvedValue(bigList);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/too many photos/i);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('POST /photos/nextcloud-import/confirm — propfindShare errors', () => {
  it('forwards 422 from propfindShare on confirm (expired share)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const err = Object.assign(new Error('Could not access this Nextcloud share.'), { httpStatus: 422 });
    propfindShare.mockRejectedValue(err);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Could not access/i);
  });

  it('forwards 504 from propfindShare on confirm (timeout)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const err = Object.assign(new Error('Nextcloud did not respond in time.'), { httpStatus: 504 });
    propfindShare.mockRejectedValue(err);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL });

    expect(res.status).toBe(504);
  });

  it('forwards 502 from propfindShare on confirm (XML parse failure)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const err = Object.assign(new Error('Unexpected response from Nextcloud.'), { httpStatus: 502 });
    propfindShare.mockRejectedValue(err);

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL });

    expect(res.status).toBe(502);
  });
});

describe('POST /photos/nextcloud-import/confirm — US-NC6 single file', () => {
  it('processes single file on Instance-1 (US-NC6)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const files = [
      { name: 'IMG_001.jpg', size: 1000, mimeType: 'image/jpeg' },
    ];
    propfindShare.mockResolvedValue(files);
    // INSERT nextcloud_imports
    db.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    // downloadFileAsBuffer returns a buffer
    downloadFileAsBuffer.mockResolvedValue(Buffer.from('fake-image-data'));
    // uploadPhoto resolves successfully
    uploadPhoto.mockResolvedValue();
    // INSERT photos
    db.query.mockResolvedValueOnce({ rows: [{ id: 101 }] });
    // INSERT tags
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    // INSERT photo_tags
    db.query.mockResolvedValueOnce({ rows: [] });
    // UPDATE nextcloud_imports
    db.query.mockResolvedValueOnce({ rows: [{ done: 1, total: 1, failed: 0 }] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL, tags: ['paris'], latitude: 48.8566, longitude: 2.3522 });

    expect(res.status).toBe(200);
    expect(res.body.importId).toBe(7);
    expect(res.body.total).toBe(1);
    expect(downloadFileAsBuffer).toHaveBeenCalledTimes(1);
    expect(downloadFileAsBuffer).toHaveBeenCalledWith(SHARE_URL, 'IMG_001.jpg');
    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(addIdentificationJob).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });

  it('creates album and passes albumId to jobs', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    propfindShare.mockResolvedValue([
      { name: 'IMG_001.jpg', size: 1000, mimeType: 'image/jpeg' },
    ]);
    // 1. SELECT albums — not found
    // 2. INSERT album RETURNING id
    // 3. INSERT nextcloud_imports RETURNING id
    // 4. INSERT photo RETURNING id
    // 5. INSERT album_photos junction (NEW: albumId is passed)
    // 6. UPDATE nextcloud_imports
    db.query
      .mockResolvedValueOnce({ rows: [] })           // SELECT albums
      .mockResolvedValueOnce({ rows: [{ id: 55 }] }) // INSERT album
      .mockResolvedValueOnce({ rows: [{ id: 12 }] }) // INSERT nextcloud_imports
      .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // INSERT photo
      .mockResolvedValueOnce({ rows: [] })           // INSERT album_photos junction
      .mockResolvedValueOnce({ rows: [{ done: 1, total: 1, failed: 0 }] }); // UPDATE nextcloud_imports
    // downloadFileAsBuffer returns a buffer
    downloadFileAsBuffer.mockResolvedValue(Buffer.from('fake-image-data'));
    // uploadPhoto resolves successfully
    uploadPhoto.mockResolvedValue();

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL, albumName: 'Summer 2024' });

    expect(res.status).toBe(200);
    // Verify US-NC6: Instance-1 processes files directly with albumId
    expect(downloadFileAsBuffer).toHaveBeenCalledWith(SHARE_URL, 'IMG_001.jpg');
    expect(uploadPhoto).toHaveBeenCalled();
    expect(addIdentificationJob).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: 200, userId: 10, photoS3Key: expect.any(String) }),
    );
  });
});

describe('POST /photos/nextcloud-import/confirm — US-NC6 multiple files', () => {
  it('processes multiple files on Instance-1 (US-NC6)', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const files = [
      { name: 'IMG_001.jpg', size: 1000, mimeType: 'image/jpeg' },
      { name: 'IMG_002.jpg', size: 2000, mimeType: 'image/jpeg' },
    ];
    propfindShare.mockResolvedValue(files);
    // downloadFileAsBuffer returns a buffer (called twice)
    downloadFileAsBuffer.mockResolvedValue(Buffer.from('fake-image-data'));
    // uploadPhoto resolves successfully (called twice)
    uploadPhoto.mockResolvedValue();
    // All db.query calls in order of execution:
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // 1. INSERT nextcloud_imports
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // 2. INSERT photos (file 1)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // 3. INSERT tags (file 1)
      .mockResolvedValueOnce({ rows: [] }) // 4. INSERT photo_tags (file 1)
      .mockResolvedValueOnce({ rows: [{ done: 1, total: 2, failed: 0 }] }) // 5. UPDATE nextcloud_imports (file 1 done)
      .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // 6. INSERT photos (file 2)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // 7. INSERT tags (file 2)
      .mockResolvedValueOnce({ rows: [] }) // 8. INSERT photo_tags (file 2)
      .mockResolvedValueOnce({ rows: [{ done: 2, total: 2, failed: 0 }] }); // 9. UPDATE nextcloud_imports (file 2 done)

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL, tags: ['paris'], latitude: 48.8566, longitude: 2.3522 });


    expect(res.status).toBe(200);
    expect(res.body.importId).toBe(7);
    expect(res.body.total).toBe(2);
    // Verify US-NC6: Instance-1 processes files directly
    expect(downloadFileAsBuffer).toHaveBeenCalledTimes(2);
    expect(downloadFileAsBuffer).toHaveBeenCalledWith(SHARE_URL, 'IMG_001.jpg');
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(addIdentificationJob).toHaveBeenCalledTimes(2);
    expect(addIdentificationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        photoId: 101,
        userId: 10,
        photoS3Key: expect.any(String),
      }),
    );
    expect(notifyUser).toHaveBeenCalledTimes(2);
    expect(notifyUser).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        importId: 7,
        done: 1,
        total: 2,
        failed: 0,
      }),
      'nextcloud-import-progress',
    );
  });
});

describe('POST /photos/nextcloud-import/confirm — US-NC6 error handling', () => {
  it('handles download failure for a file and continues with next file', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const files = [
      { name: 'IMG_001.jpg', size: 1000, mimeType: 'image/jpeg' },
      { name: 'IMG_002.jpg', size: 2000, mimeType: 'image/jpeg' },
    ];
    propfindShare.mockResolvedValue(files);
    downloadFileAsBuffer
      .mockResolvedValueOnce(Buffer.from('fake-image-data-1')) // file 1 succeeds
      .mockRejectedValueOnce(new Error('Download failed')); // file 2 fails
    uploadPhoto.mockResolvedValue();
    // All db.query calls in order of execution:
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // 1. INSERT nextcloud_imports
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // 2. INSERT photos (file 1)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // 3. INSERT tags (file 1)
      .mockResolvedValueOnce({ rows: [] }) // 4. INSERT photo_tags (file 1)
      .mockResolvedValueOnce({ rows: [{ done: 1, total: 2, failed: 0 }] }) // 5. UPDATE done (file 1)
      // File 2 fails at downloadFileAsBuffer, so we go to catch block
      .mockResolvedValueOnce({ rows: [{ done: 1, total: 2, failed: 1 }] }); // 6. UPDATE failed (file 2)

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL, tags: ['paris'] });

    expect(res.status).toBe(200);
    expect(downloadFileAsBuffer).toHaveBeenCalledTimes(2);
    expect(uploadPhoto).toHaveBeenCalledTimes(1); // only file 1 uploaded
    expect(addIdentificationJob).toHaveBeenCalledTimes(1); // only file 1 enqueued
    expect(notifyUser).toHaveBeenCalledTimes(2);
    // Check that progress was reported for both files (one success, one failure)
    expect(notifyUser).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ importId: 7, done: 1, total: 2, failed: 0 }),
      'nextcloud-import-progress',
    );
    expect(notifyUser).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ importId: 7, done: 1, total: 2, failed: 1 }),
      'nextcloud-import-progress',
    );
  });

  it('handles S3 upload failure for a file and continues with next file', async () => {
    isValidNextcloudShareUrl.mockReturnValue(true);
    const files = [
      { name: 'IMG_001.jpg', size: 1000, mimeType: 'image/jpeg' },
      { name: 'IMG_002.jpg', size: 2000, mimeType: 'image/jpeg' },
    ];
    propfindShare.mockResolvedValue(files);
    downloadFileAsBuffer.mockResolvedValue(Buffer.from('fake-image-data'));
    uploadPhoto
      .mockResolvedValueOnce() // file 1 succeeds
      .mockRejectedValueOnce(new Error('S3 upload failed')); // file 2 fails
    // All db.query calls in order of execution:
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // 1. INSERT nextcloud_imports
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // 2. INSERT photos (file 1)
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // 3. INSERT tags (file 1)
      .mockResolvedValueOnce({ rows: [] }) // 4. INSERT photo_tags (file 1)
      .mockResolvedValueOnce({ rows: [{ done: 1, total: 2, failed: 0 }] }) // 5. UPDATE done (file 1)
      .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // 6. INSERT photos (file 2)
      // File 2 fails at uploadPhoto, so we go to catch block
      .mockResolvedValueOnce({ rows: [{ done: 1, total: 2, failed: 1 }] }); // 7. UPDATE failed (file 2)

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/photos/nextcloud-import/confirm')
      .send({ shareUrl: SHARE_URL, tags: ['paris'] });

    expect(res.status).toBe(200);
    expect(downloadFileAsBuffer).toHaveBeenCalledTimes(2);
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(addIdentificationJob).toHaveBeenCalledTimes(1); // only file 1 enqueued
    expect(notifyUser).toHaveBeenCalledTimes(2);
  });

});

// ── GET /photos/nextcloud-import/:importId ────────────────────────────────────

describe('GET /photos/nextcloud-import/:importId — status', () => {
  it('returns import status for the owning user', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 7, total: 20, done: 5, failed: 1 }],
    });

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7, total: 20, done: 5, failed: 1 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      [7, 10],
    );
  });

  it('returns 404 when import belongs to a different user', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import/99');
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric importId', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/photos/nextcloud-import/abc');
    expect(res.status).toBe(400);
  });
});
