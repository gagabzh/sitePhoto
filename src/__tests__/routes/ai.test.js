jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../ollama', () => ({ generate: jest.fn() }));
jest.mock('../../storage', () => ({ readPhotoBuffer: jest.fn() }));
jest.mock('../../queue/producer', () => ({
  addDescribePersonJob: jest.fn().mockResolvedValue({}),
  addIdentificationJob: jest.fn().mockResolvedValue({}),
}));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { addDescribePersonJob, addIdentificationJob } = require('../../queue/producer');

beforeEach(() => jest.resetAllMocks());

const EDITOR_SESSION = { userId: 2, name: 'Editor', role: 'editor' };
const VIEWER_SESSION = { userId: 3, name: 'Viewer', role: 'viewer' };

function makeApp(session) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = session; next(); });
  app.use('/api/ai', require('../../routes/ai'));
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
});

describe('POST /api/ai/set-reference', () => {
  it('sets reference_photo_id on the tag and returns ok', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })   // tag exists and is people
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })   // photo exists
      .mockResolvedValueOnce({ rows: [] });             // UPDATE

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/set-reference').send({ tagId: 7, photoId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tags SET reference_photo_id'), [1, 7]
    );
  });

  it('returns 400 for invalid params', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/set-reference').send({ tagId: 'abc', photoId: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when tag is not a people tag', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })             // tag not found or not people
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/set-reference').send({ tagId: 99, photoId: 1 });
    expect(res.status).toBe(404);
  });

  it('returns 403 when called by a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/api/ai/set-reference').send({ tagId: 7, photoId: 1 });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/ai/describe-person', () => {
  it('enqueues a describe-person job and returns queued:true', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'alice' }] })  // people tag
      .mockResolvedValueOnce({ rows: [{ filename: 'a.jpg' }] });     // photos

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [1] });

    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(true);
    expect(addDescribePersonJob).toHaveBeenCalledWith({
      tagId: 7,
      tagName: 'alice',
      photoFilenames: ['a.jpg'],
      userId: EDITOR_SESSION.userId,
    });
  });

  it('returns 400 for missing photoIds', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid tagId', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 'x', photoIds: [1] });
    expect(res.status).toBe(400);
  });

  it('returns 404 when tag is not a people tag', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 99, photoIds: [1] });
    expect(res.status).toBe(404);
  });

  it('returns 404 when no photos found', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'alice' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [99] });
    expect(res.status).toBe(404);
  });

  it('returns 403 when called by a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [1] });
    expect(res.status).toBe(403);
  });
});
