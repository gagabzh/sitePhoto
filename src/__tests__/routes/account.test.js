jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const bcrypt = require('bcryptjs');

beforeEach(() => jest.resetAllMocks());

const USER_SESSION   = { userId: 10, name: 'Saev',  role: 'editor' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer' };

function makeApp(sessionData, sessionID = 'test-sid') {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session   = { ...sessionData, destroy: (cb) => cb() };
    req.sessionID = sessionID;
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

  it('POST /account/password returns 400 for password shorter than 8 chars', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/password')
      .send('current=oldpass&password=short');

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
});

// ── GET /account — dashboard page ────────────────────────────────────────────

describe('GET /account', () => {
  function mockAccountQueries({ uploads = 5, albums = 2, recipes = 1, sessions = [], recentUploads = [], userAlbums = [] } = {}) {
    db.query
      // stats: upload count
      .mockResolvedValueOnce({ rows: [{ n: uploads }] })
      // stats: album count
      .mockResolvedValueOnce({ rows: [{ n: albums }] })
      // stats: recipes count
      .mockResolvedValueOnce({ rows: [{ n: recipes }] })
      // sessions
      .mockResolvedValueOnce({ rows: sessions })
      // recent uploads
      .mockResolvedValueOnce({ rows: recentUploads })
      // albums
      .mockResolvedValueOnce({ rows: userAlbums });
  }

  it('returns 200 and shows the user name', async () => {
    mockAccountQueries();
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saev');
  });

  it('shows sessions section when user has multiple active sessions', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid',  expire: new Date('2026-06-01') },
        { sid: 'other-sid', expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Active sessions');
  });

  it('does not show sessions section when only one session exists', async () => {
    mockAccountQueries({
      sessions: [{ sid: 'test-sid', expire: new Date('2026-06-01') }],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Active sessions');
  });

  it('admin sees admin quick links', async () => {
    mockAccountQueries();
    const res = await request(makeApp(ADMIN_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Manage users');
    expect(res.text).toContain('AI tools');
  });

  it('viewer does not see upload links', async () => {
    // viewer queries are different — mock with same number of calls
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // uploads via album_access
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // albums via album_access
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // recipes
      .mockResolvedValueOnce({ rows: [] })           // sessions
      .mockResolvedValueOnce({ rows: [] })           // recent uploads (empty for viewer)
      .mockResolvedValueOnce({ rows: [] });          // albums

    const res = await request(makeApp(VIEWER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('My uploads');
    expect(res.text).not.toContain('Manage users');
  });

  it('shows stats counts on the page', async () => {
    mockAccountQueries({ uploads: 12, albums: 3, recipes: 7 });
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('12');
    expect(res.text).toContain('3');
    expect(res.text).toContain('7');
  });
});

// ── POST /account/sessions/:sid/revoke ────────────────────────────────────────

describe('POST /account/sessions/:sid/revoke', () => {
  it('deletes the specified session and redirects to /account', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .post('/account/sessions/other-sid/revoke');

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM session/);
    expect(params[0]).toBe('other-sid');
    expect(params[1]).toBe(USER_SESSION.userId);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account');
  });

  it('uses parameterized query (no SQL injection risk)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(makeApp(USER_SESSION))
      .post('/account/sessions/some-sid/revoke');
    const sql = db.query.mock.calls[0][0];
    // Must use parameterized placeholder, not string interpolation
    expect(sql).toMatch(/\$1/);
    expect(sql).toMatch(/\$2/);
  });
});

// ── POST /account/sessions/revoke-others ─────────────────────────────────────

describe('POST /account/sessions/revoke-others', () => {
  it('deletes all sessions except current and redirects to /account', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .post('/account/sessions/revoke-others');

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM session/);
    expect(params[0]).toBe(USER_SESSION.userId);
    expect(params[1]).toBe('current-sid');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account');
  });

  it('excludes the current session from deletion', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(makeApp(USER_SESSION, 'keep-this-sid'))
      .post('/account/sessions/revoke-others');
    const [sql, params] = db.query.mock.calls[0];
    // The current session ID must appear in the query to exclude it
    expect(sql).toMatch(/sid != \$2/);
    expect(params[1]).toBe('keep-this-sid');
  });
});
