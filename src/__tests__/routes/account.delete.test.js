jest.mock('../../db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));
jest.mock('../../storage', () => ({ deletePhoto: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { deletePhoto } = require('../../storage');

const USER_SESSION  = { userId: 10, name: 'Saev',  role: 'editor' };
const ADMIN_SESSION = { userId: 1,  name: 'Admin', role: 'admin' };

let mockClient;

beforeEach(() => {
  jest.resetAllMocks();
  mockClient = { query: jest.fn(), release: jest.fn() };
  db.connect.mockResolvedValue(mockClient);
});

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

  it('shows username mismatch error when ?error=1', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/account/delete?error=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Username did not match');
  });

  it('shows last-admin error when ?error=last_admin', async () => {
    const res = await request(makeApp(ADMIN_SESSION)).get('/account/delete?error=last_admin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('only admin');
  });
});

describe('ACC-5: POST /account/delete', () => {
  it('with correct name deletes account and redirects to /login', async () => {
    // mockClient.query execution order:
    // [0] BEGIN
    // [1] SELECT s3_key FROM photos WHERE user_id
    // [2] DELETE FROM photos WHERE user_id
    // [3] DELETE FROM users WHERE id
    // [4] COMMIT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                                                        // BEGIN
      .mockResolvedValueOnce({ rows: [{ s3_key: 'photo1.jpg' }, { s3_key: 'photo2.jpg' }] })    // SELECT s3_key
      .mockResolvedValueOnce({ rows: [] })                                                        // DELETE photos
      .mockResolvedValueOnce({ rows: [] })                                                        // DELETE users
      .mockResolvedValueOnce({ rows: [] });                                                       // COMMIT
    deletePhoto.mockResolvedValue(undefined);

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    expect(db.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query.mock.calls[0][0]).toMatch(/BEGIN/);
    expect(mockClient.query.mock.calls[1][0]).toMatch(/SELECT.*s3_key.*FROM photos.*user_id/is);
    expect(mockClient.query.mock.calls[3][0]).toMatch(/DELETE FROM users/);
    expect(mockClient.query.mock.calls[4][0]).toMatch(/COMMIT/);
    expect(mockClient.release).toHaveBeenCalled();
    expect(deletePhoto).toHaveBeenCalledTimes(2);
    expect(deletePhoto).toHaveBeenCalledWith('photo1.jpg');
    expect(deletePhoto).toHaveBeenCalledWith('photo2.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('with wrong name redirects with error and makes no DB calls', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=WrongName');

    expect(db.connect).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/delete?error=1');
  });

  it('is case-sensitive — lowercase name is rejected', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=saev');

    expect(db.connect).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/delete?error=1');
  });

  it('works when user has no photos', async () => {
    // mockClient.query execution order:
    // [0] BEGIN
    // [1] SELECT s3_key → { rows: [] }  (no photos)
    // [2] DELETE FROM photos
    // [3] DELETE FROM users
    // [4] COMMIT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // SELECT s3_key (no photos)
      .mockResolvedValueOnce({ rows: [] })  // DELETE photos
      .mockResolvedValueOnce({ rows: [] })  // DELETE users
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    deletePhoto.mockResolvedValue(undefined);

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    expect(deletePhoto).not.toHaveBeenCalled();
    expect(mockClient.query.mock.calls[3][0]).toMatch(/DELETE FROM users/);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('returns 500 and rolls back when transaction fails', async () => {
    // mockClient.query execution order:
    // [0] BEGIN
    // [1] SELECT s3_key
    // [2] DELETE FROM photos
    // [3] DELETE FROM users — FAILS
    // [4] ROLLBACK
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ s3_key: 'x.jpg' }] })     // SELECT s3_key
      .mockResolvedValueOnce({ rows: [] })                          // DELETE photos
      .mockRejectedValueOnce(new Error('db error'))                 // DELETE users FAILS
      .mockResolvedValueOnce({ rows: [] });                         // ROLLBACK

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    const lastCall = mockClient.query.mock.calls[mockClient.query.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/ROLLBACK/);
    expect(mockClient.release).toHaveBeenCalled();
    expect(deletePhoto).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it('with deletePhoto failing still completes (fire-and-forget)', async () => {
    // mockClient.query execution order:
    // [0] BEGIN
    // [1] SELECT s3_key
    // [2] DELETE FROM photos
    // [3] DELETE FROM users
    // [4] COMMIT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                                                        // BEGIN
      .mockResolvedValueOnce({ rows: [{ s3_key: 'photo1.jpg' }, { s3_key: 'photo2.jpg' }] })    // SELECT s3_key
      .mockResolvedValueOnce({ rows: [] })                                                        // DELETE photos
      .mockResolvedValueOnce({ rows: [] })                                                        // DELETE users
      .mockResolvedValueOnce({ rows: [] });                                                       // COMMIT
    deletePhoto.mockRejectedValue(new Error('s3 error'));

    const res = await request(makeApp(USER_SESSION))
      .post('/account/delete')
      .send('confirm_name=Saev');

    // S3 failure must not break the redirect
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('blocks last admin from self-deleting', async () => {
    // db.query (pool) execution order for admin role:
    // [0] SELECT COUNT admin check → { rows: [{ n: 1 }] }  (only 1 admin)
    db.query.mockResolvedValueOnce({ rows: [{ n: 1 }] });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/account/delete')
      .send('confirm_name=Admin');

    expect(db.connect).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/delete?error=last_admin');
  });

  it('allows non-last admin to self-delete', async () => {
    // db.query (pool) execution order:
    // [0] SELECT COUNT admin check → { rows: [{ n: 2 }] }  (2 admins)
    db.query.mockResolvedValueOnce({ rows: [{ n: 2 }] });
    // then transaction via mockClient:
    // [0] BEGIN
    // [1] SELECT s3_key (none)
    // [2] DELETE FROM photos
    // [3] DELETE FROM users
    // [4] COMMIT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // SELECT s3_key (no photos)
      .mockResolvedValueOnce({ rows: [] })  // DELETE photos
      .mockResolvedValueOnce({ rows: [] })  // DELETE users
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    deletePhoto.mockResolvedValue(undefined);

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/account/delete')
      .send('confirm_name=Admin');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});
