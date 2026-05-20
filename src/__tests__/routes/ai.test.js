jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../ollama', () => ({ generate: jest.fn() }));
jest.mock('fs', () => ({ readFileSync: jest.fn() }));
jest.mock('../../uploadHelpers', () => ({ UPLOAD_DIR: '/uploads' }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { generate } = require('../../ollama');
const fs = require('fs');
const { requireEditor } = require('../../middleware');

beforeEach(() => jest.resetAllMocks());

const EDITOR_SESSION = { userId: 2, name: 'Editor', role: 'editor' };

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
      .post('/api/ai/identify-people')
      .send({ photoId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when photo does not exist', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people')
      .send({ photoId: 99 });
    expect(res.status).toBe(404);
  });

  it('returns suggestions matching Ollama response against known people tags', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })        // SELECT filename
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'alice' }, { id: 8, name: 'bob' }] }); // people tags
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image'));
    generate.mockResolvedValue({ response: 'I can see alice in the photo.' });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people')
      .send({ photoId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([{ tagId: 7, name: 'alice' }]);
    expect(res.body.rawResponse).toContain('alice');
  });

  it('returns 503 with error message when Ollama is unreachable', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'alice' }] });
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image'));
    generate.mockRejectedValue(new Error('Ollama unreachable: ECONNREFUSED'));

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people')
      .send({ photoId: 1 });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Ollama unreachable');
    expect(res.body.suggestions).toEqual([]);
  });

  it('returns 403 when called by a viewer', async () => {
    const viewerSession = { userId: 3, name: 'Viewer', role: 'viewer' };
    const res = await request(makeApp(viewerSession))
      .post('/api/ai/identify-people')
      .send({ photoId: 1 });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/ai/confirm-tag', () => {
  it('inserts the tag-photo link and returns ok', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })  // photo exists
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })  // tag exists
      .mockResolvedValueOnce({ rows: [] });            // INSERT

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag')
      .send({ photoId: 1, tagId: 7 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO photo_tags'),
      [1, 7]
    );
  });

  it('returns 400 for invalid params', async () => {
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag')
      .send({ photoId: 'x', tagId: 7 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when photo does not exist', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })   // photo
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }); // tag
    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/confirm-tag')
      .send({ photoId: 99, tagId: 7 });
    expect(res.status).toBe(404);
  });
});
