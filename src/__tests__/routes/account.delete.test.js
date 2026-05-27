jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../uploadHelpers', () => ({ deletePhotos: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { deletePhotos } = require('../../uploadHelpers');

beforeEach(() => jest.resetAllMocks());

const USER_SESSION  = { userId: 10, name: 'Saev',  role: 'editor' };
const ADMIN_SESSION = { userId: 1,  name: 'Admin', role: 'admin' };

function makeApp(sessionData, sessionID = 'test-sid') {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    req.sessionID = sessionID;
    next();
  });
  app.use(require('../../routes/account'));
  app.use((err, req, res, _next) => res.status(500).send(err.message));
  return app;
}

describe('ACC-5: GET /account/delete', () => {
  it('returns 200 with confirmation form', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/account/delete');
    expect(res.status).toBe(200);
    expect(res.text).toContain('danger zone');
    expect(res.text).toContain('permanently delete my account');
    expect(res.text).toContain(USER_SESSION.name);
  });

  it('shows error message when ?error=1', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/account/delete?error=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Username did not match');
  });
});

describe('ACC-5: POST /account/delete', () => {
  it('with correct name deletes account and redirects to /login', async () => {
    // [0] SELECT id FROM photos WHERE user_id = $1
    db.query.mockResolvedValueOnce({ rows: [{ id: 5 }, { id: 6 }] });
    // [1] DELETE FROM users WHERE id = $1
    db.query.mockResolvedValueOnce({ rows: [] });
    deletePhotos.mockResolvedValue(undefined);

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    // First db call: SELECT photos
    expect(db.query.mock.calls[0][0]).toMatch(/SELECT.*photos.*user_id/);
    expect(db.query.mock.calls[0][1]).toEqual([USER_SESSION.userId]);

    // deletePhotos called with photo IDs
    expect(deletePhotos).toHaveBeenCalledWith([5, 6]);

    // Second db call: DELETE user
    expect(db.query.mock.calls[1][0]).toMatch(/DELETE FROM users/);
    expect(db.query.mock.calls[1][1]).toEqual([USER_SESSION.userId]);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('with wrong name redirects with error and makes no DB calls', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=WrongName');

    expect(db.query).not.toHaveBeenCalled();
    expect(deletePhotos).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/delete?error=1');
  });

  it('is case-sensitive — lowercase name is rejected', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=saev');

    expect(db.query).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/delete?error=1');
  });

  it('works when user has no photos', async () => {
    // [0] SELECT id FROM photos WHERE user_id = $1 — no photos
    db.query.mockResolvedValueOnce({ rows: [] });
    // [1] DELETE FROM users WHERE id = $1
    db.query.mockResolvedValueOnce({ rows: [] });
    deletePhotos.mockResolvedValue(undefined);

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    expect(deletePhotos).toHaveBeenCalledWith([]);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('returns 500 when db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('db error'));

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    expect(res.status).toBe(500);
  });
});
