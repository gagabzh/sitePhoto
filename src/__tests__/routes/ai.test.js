const crypto = require('crypto');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../ollama', () => ({ generate: jest.fn() }));
jest.mock('../../storage', () => ({ 
  readPhotoBuffer: jest.fn(),
  downloadPhoto: jest.fn(),
  uploadPhoto: jest.fn(),
}));
jest.mock('../../queue/producer', () => ({
  addIdentificationJob: jest.fn().mockResolvedValue({}),
}));
// Mock sharp - create a mock implementation that returns proper chainable methods
jest.mock('sharp', () => {
  const mockMetadata = { width: 1000, height: 800 };
  const mockCropBuffer = Buffer.from('mock-crop-buffer');
  
  // Create a mock instance that can be chained
  const createMockInstance = () => ({
    metadata: async () => mockMetadata,
    extract: (options) => createMockInstance(),
    jpeg: (options) => createMockInstance(),
    toBuffer: async () => mockCropBuffer,
  });
  
  return () => createMockInstance();
});

beforeEach(() => {
  jest.resetAllMocks();
  // Set up crypto.randomUUID mock for face crop S3 key generation
  crypto.randomUUID = jest.fn(() => 'mock-uuid-1234');
  // Also reset storage mocks to ensure they're clean
  downloadPhoto.mockResolvedValue(Buffer.from('mock-photo-buffer'));
  uploadPhoto.mockResolvedValue(null);
});

afterAll(() => {
  jest.restoreAllMocks();
});

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { addIdentificationJob } = require('../../queue/producer');
const { downloadPhoto, uploadPhoto } = require('../../storage');
const { errorHandler } = require('../../middleware');

const EDITOR_SESSION = { userId: 2, name: 'Editor', role: 'editor' };
const VIEWER_SESSION = { userId: 3, name: 'Viewer', role: 'viewer' };

function makeApp(session) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = session; next(); });
  app.use('/api/ai', require('../../routes/ai'));
  app.use(errorHandler);
  return app;
}

describe('POST /api/ai/identify-people', () => {
  it('returns 400 for missing or non-integer photoId', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when photo does not exist', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 99 });
    expect(res.status).toBe(404);
  });

  it('enqueues an identification job and returns queued: true', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ s3_key: 'photo.jpg' }] });
    addIdentificationJob.mockResolvedValue({});

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(true);
    expect(addIdentificationJob).toHaveBeenCalledWith({
      photoId: 1,
      userId: 2,
      photoS3Key: 'photo.jpg',
      source: 'manual'
    });
  });

  it('passes photoS3Key to the job', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ s3_key: 'my-photo-key' }] });
    addIdentificationJob.mockResolvedValue({});

    await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    expect(addIdentificationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        photoS3Key: 'my-photo-key'
      })
    );
  });

  it('returns 403 when not editor', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });
    
    expect(res.status).toBe(403);
  });

  it('handles database errors gracefully', async () => {
    db.query.mockRejectedValue(new Error('DB error'));
    
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });
    
    expect(res.status).toBe(500);
  });

  it('returns 500 when job enqueue fails', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ s3_key: 'photo.jpg' }] });
    addIdentificationJob.mockRejectedValue(new Error('Queue error'));

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    expect(res.status).toBe(500);
    expect(res.text).toContain('Queue error');
  });

  it('returns 403 when called by a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/ai/confirm-tag', () => {
  it('inserts the tag-photo link and returns ok', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag').send({ photoId: 1, tagId: 7 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photo_tags'), [1, 7]
    );
  });

  it('returns 400 for invalid params', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag').send({ photoId: 'x', tagId: 7 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when photo does not exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag').send({ photoId: 99, tagId: 7 });
    expect(res.status).toBe(404);
  });

  it('returns 404 when tag does not exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag').send({ photoId: 1, tagId: 99 });
    expect(res.status).toBe(404);
  });

  describe('with bounding box for people tags', () => {
    const validBbox = { x: 0.25, y: 0.3, width: 0.2, height: 0.25 };
    const photoRow = { id: 1, s3_key: 'photo.jpg', user_id: 2 };
    const peopleTagRow = { id: 7, name: 'Alice', category: 'people' };

    it('stores face crop in person_faces when confirming people tag with bbox', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [photoRow] })  // photo lookup
        .mockResolvedValueOnce({ rows: [peopleTagRow] })  // tag lookup
        .mockResolvedValueOnce({ rows: [] })  // insert photo_tags
        .mockResolvedValueOnce({ rows: [] });  // insert person_faces

      const res = await request(makeApp(EDITOR_SESSION))
        .post('/api/ai/confirm-tag')
        .send({ photoId: 1, tagId: 7, personName: 'Alice', bbox: validBbox });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      
      // Verify person_faces insert was called (4th call)
      expect(db.query).toHaveBeenNthCalledWith(4,
        expect.stringContaining('INSERT INTO person_faces'),
        [2, 'alice', 1, JSON.stringify(validBbox), 'faces/mock-uuid-1234.jpg']
      );
    });

    it('does not store face crop for non-people tags even with bbox', async () => {
      const nonPeopleTagRow = { id: 8, name: 'beach', category: 'places' };
      
      db.query
        .mockResolvedValueOnce({ rows: [photoRow] })  // photo lookup
        .mockResolvedValueOnce({ rows: [nonPeopleTagRow] })  // tag lookup (not people)
        .mockResolvedValueOnce({ rows: [] });  // insert photo_tags

      const res = await request(makeApp(EDITOR_SESSION))
        .post('/api/ai/confirm-tag')
        .send({ photoId: 1, tagId: 8, personName: 'beach', bbox: validBbox });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      
      // Verify person_faces insert was NOT called (only 3 queries: photo, tag, photo_tags)
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('does not store face crop when bbox is missing', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [photoRow] })
        .mockResolvedValueOnce({ rows: [peopleTagRow] })
        .mockResolvedValueOnce({ rows: [] });  // insert photo_tags

      const res = await request(makeApp(EDITOR_SESSION))
        .post('/api/ai/confirm-tag')
        .send({ photoId: 1, tagId: 7, personName: 'Alice' });  // no bbox

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      
      // Verify person_faces insert was NOT called (only 3 queries)
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('does not store face crop when personName is missing', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [photoRow] })
        .mockResolvedValueOnce({ rows: [peopleTagRow] })
        .mockResolvedValueOnce({ rows: [] });  // insert photo_tags

      const res = await request(makeApp(EDITOR_SESSION))
        .post('/api/ai/confirm-tag')
        .send({ photoId: 1, tagId: 7, bbox: validBbox });  // no personName

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      
      // Verify person_faces insert was NOT called (only 3 queries)
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('validates bbox coordinates are in range [0, 1]', async () => {
      const invalidBbox = { x: 1.5, y: 0.3, width: 0.2, height: 0.25 };  // x > 1
      
      db.query
        .mockResolvedValueOnce({ rows: [photoRow] })
        .mockResolvedValueOnce({ rows: [peopleTagRow] })
        .mockResolvedValueOnce({ rows: [] });  // insert photo_tags

      const res = await request(makeApp(EDITOR_SESSION))
        .post('/api/ai/confirm-tag')
        .send({ photoId: 1, tagId: 7, personName: 'Alice', bbox: invalidBbox });

      expect(res.status).toBe(200);  // Should succeed but not store face crop
      expect(res.body.ok).toBe(true);
      
      // Verify person_faces insert was NOT called (only 3 queries)
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('validates bbox does not extend beyond image boundaries', async () => {
      const invalidBbox = { x: 0.8, y: 0.3, width: 0.5, height: 0.25 };  // x + width > 1
      
      db.query
        .mockResolvedValueOnce({ rows: [photoRow] })
        .mockResolvedValueOnce({ rows: [peopleTagRow] })
        .mockResolvedValueOnce({ rows: [] });  // insert photo_tags

      const res = await request(makeApp(EDITOR_SESSION))
        .post('/api/ai/confirm-tag')
        .send({ photoId: 1, tagId: 7, personName: 'Alice', bbox: invalidBbox });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      
      // Verify person_faces insert was NOT called (only 3 queries)
      expect(db.query).toHaveBeenCalledTimes(3);
    });
  });
});
