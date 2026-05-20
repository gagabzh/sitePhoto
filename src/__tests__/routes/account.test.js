jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const bcrypt = require('bcryptjs');

beforeEach(() => jest.resetAllMocks());

const USER_SESSION = { userId: 10, name: 'Saev', role: 'editor' };

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  app.use(require('../../routes/account'));
  return app;
}

describe('GET / — home page', () => {
  it('shows the logged-in user name', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hello Saev');
  });

  it('shows admin link when role is admin', async () => {
    const res = await request(makeApp({ ...USER_SESSION, role: 'admin' })).get('/');
    expect(res.text).toContain('Manage users');
  });

  it('does not show admin link for non-admin', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/');
    expect(res.text).not.toContain('Manage users');
  });
});

describe('US-6: Change own password', () => {
  it('GET /account/password returns 200 with form', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/account/password');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Change my password');
  });

  it('shows error when ?error=1', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/account/password?error=1');
    expect(res.text).toContain('Current password is incorrect');
  });

  it('shows success when ?done=1', async () => {
    const res = await request(makeApp(USER_SESSION)).get('/account/password?done=1');
    expect(res.text).toContain('Password updated successfully');
  });

  it('POST /account/password updates password when current is correct', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ password_hash: '$oldhash' }] });
    db.query.mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('$newhash');

    const res = await request(makeApp(USER_SESSION))
      .post('/account/password')
      .send('current=oldpass&password=newpassword');

    expect(bcrypt.compare).toHaveBeenCalledWith('oldpass', '$oldhash');
    expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE users SET password_hash'),
      ['$newhash', 10]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/password?done=1');
  });

  it('POST /account/password redirects with error when current password is wrong', async () => {
    db.query.mockResolvedValue({ rows: [{ password_hash: '$oldhash' }] });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(makeApp(USER_SESSION))
      .post('/account/password')
      .send('current=wrongpass&password=newpassword');

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/password?error=1');
  });
});
