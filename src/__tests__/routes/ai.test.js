jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../ollama', () => ({ generate: jest.fn() }));
jest.mock('fs', () => ({ readFileSync: jest.fn() }));
jest.mock('../../uploadHelpers', () => ({ UPLOAD_DIR: '/uploads' }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { generate } = require('../../ollama');
const fs = require('fs');

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

// Stub for a people tag row as returned by the updated query
const ALICE_TAG    = { id: 7, name: 'alice', description: null,           reference_photo_id: null, ref_filename: null };
const ALICE_W_REF  = { id: 7, name: 'alice', description: 'red hair',     reference_photo_id: 1,    ref_filename: 'ref.jpg' };
const BOB_TAG      = { id: 8, name: 'bob',   description: 'tall, glasses', reference_photo_id: null, ref_filename: null };

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

  it('returns suggestions matching Ollama response against known people tags', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })
      .mockResolvedValueOnce({ rows: [ALICE_TAG, BOB_TAG] });
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image'));
    generate.mockResolvedValue({ response: 'I can see alice in the photo.' });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([{ tagId: 7, name: 'alice', hasReference: false }]);
    expect(res.body.rawResponse).toContain('alice');
  });

  it('includes description in the prompt when tag has one', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })
      .mockResolvedValueOnce({ rows: [BOB_TAG] }); // bob has description 'tall, glasses'
    fs.readFileSync.mockReturnValue(Buffer.from('img'));
    generate.mockResolvedValue({ response: 'none' });

    await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    const [{ prompt }] = generate.mock.calls[0];
    expect(prompt).toContain('tall, glasses');
  });

  it('sends reference photo as first image when tag has a reference', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })
      .mockResolvedValueOnce({ rows: [ALICE_W_REF] });
    // query photo is read first, then reference photos in the loop
    fs.readFileSync
      .mockReturnValueOnce(Buffer.from('query-image'))  // photo.jpg (query)
      .mockReturnValueOnce(Buffer.from('ref-image'));    // ref.jpg (alice's reference)
    generate.mockResolvedValue({ response: 'alice' });

    await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    const [{ images, prompt }] = generate.mock.calls[0];
    expect(images).toHaveLength(2); // ref + query
    expect(images[0]).toBe(Buffer.from('ref-image').toString('base64'));
    expect(prompt).toContain('reference photo of alice');
  });

  it('marks hasReference true when tag already has a reference photo', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })
      .mockResolvedValueOnce({ rows: [ALICE_W_REF] });
    fs.readFileSync.mockReturnValue(Buffer.from('img'));
    generate.mockResolvedValue({ response: 'alice' });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    expect(res.body.suggestions[0].hasReference).toBe(true);
  });

  it('returns 503 with error message when Ollama is unreachable', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ filename: 'photo.jpg' }] })
      .mockResolvedValueOnce({ rows: [ALICE_TAG] });
    fs.readFileSync.mockReturnValue(Buffer.from('img'));
    generate.mockRejectedValue(new Error('Ollama unreachable: ECONNREFUSED'));

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/identify-people').send({ photoId: 1 });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Ollama unreachable');
    expect(res.body.suggestions).toEqual([]);
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
  it('returns a description from Ollama', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'alice' }] })  // people tag
      .mockResolvedValueOnce({ rows: [{ filename: 'a.jpg' }] });     // photos
    fs.readFileSync.mockReturnValue(Buffer.from('img'));
    generate.mockResolvedValue({ response: '"young woman with red hair, glasses"' });

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [1] });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('young woman with red hair, glasses');
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

  it('returns 503 when Ollama is unreachable', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'alice' }] })
      .mockResolvedValueOnce({ rows: [{ filename: 'a.jpg' }] });
    fs.readFileSync.mockReturnValue(Buffer.from('img'));
    generate.mockRejectedValue(new Error('Ollama unreachable: ECONNREFUSED'));

    const res = await request(makeApp(EDITOR_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [1] });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Ollama unreachable');
  });

  it('returns 403 when called by a viewer', async () => {
    const res = await request(makeApp(VIEWER_SESSION))
      .post('/api/ai/describe-person').send({ tagId: 7, photoIds: [1] });
    expect(res.status).toBe(403);
  });
});
