jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../storage', () => ({
  uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
  readPhotoBuffer: jest.fn(),
  downloadPhoto: jest.fn(),
  streamPhoto: jest.fn(),
}));
jest.mock('../../queue/producer', () => ({ addIdentificationJob: jest.fn().mockResolvedValue() }));

const { Readable } = require('stream');
const request = require('supertest');
const app = require('../../app');
const { streamPhoto } = require('../../storage');

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.S3_ENDPOINT;
});

describe('GET /uploads/:filename', () => {
  describe('path traversal guard', () => {
    it('returns 400 for filename containing ..', async () => {
      const res = await request(app).get('/uploads/..secret.jpg');
      expect(res.status).toBe(400);
    });

    it('returns 400 for filename containing %2F (encoded slash)', async () => {
      // Express decodes %2F in params — make sure the guard catches it
      const res = await request(app).get('/uploads/foo%2Fbar.jpg');
      expect(res.status).toBe(400);
    });
  });

  describe('S3 path (S3_ENDPOINT set)', () => {
    beforeEach(() => {
      process.env.S3_ENDPOINT = 'http://minio:9000';
    });

    it('streams the photo with correct Content-Type and cache headers', async () => {
      const buf = Buffer.from('fake-image');
      streamPhoto.mockResolvedValue({ stream: Readable.from(buf), contentType: 'image/jpeg' });

      const res = await request(app).get('/uploads/photo.jpg');

      expect(streamPhoto).toHaveBeenCalledWith('photo.jpg');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('falls back to disk (404) when S3 throws', async () => {
      streamPhoto.mockRejectedValue(new Error('NoSuchKey'));

      const res = await request(app).get('/uploads/missing.jpg');

      // File doesn't exist on disk in the test environment → sendFile → 404
      expect(streamPhoto).toHaveBeenCalledWith('missing.jpg');
      expect(res.status).toBe(404);
    });
  });

  describe('disk path (S3_ENDPOINT not set)', () => {
    it('skips S3 entirely and returns 404 when file is absent from disk', async () => {
      const res = await request(app).get('/uploads/absent.jpg');

      expect(streamPhoto).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });
  });
});
