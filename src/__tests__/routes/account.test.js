jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('../../storage', () => ({
  uploadPhoto: jest.fn(),
  streamPhoto: jest.fn(),
  deletePhoto:  jest.fn(),
}));
jest.mock('sharp', () => {
  const chain = {
    resize: jest.fn().mockReturnThis(),
    jpeg:   jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-jpeg')),
  };
  return jest.fn(() => chain);
});
jest.mock('uuid', () => ({ v4: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const bcrypt = require('bcryptjs');
const { uploadPhoto, streamPhoto, deletePhoto } = require('../../storage');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

beforeEach(() => jest.resetAllMocks());

const USER_SESSION   = { userId: 10, name: 'Saev',  role: 'editor', csrf: 'test-csrf' };
const ADMIN_SESSION  = { userId: 1,  name: 'Admin', role: 'admin',  csrf: 'test-csrf' };
const VIEWER_SESSION = { userId: 20, name: 'Bob',   role: 'viewer', csrf: 'test-csrf' };

function makeApp(sessionData, sessionID = 'test-sid') {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, res, next) => {
    req.session   = { ...sessionData, destroy: (cb) => cb() };
    req.sessionID = sessionID;
    next();
  });
  app.use(require('../../routes/account'));
  // Error handler required so wrapAsync-caught errors produce a 500 response
  app.use((err, req, res, _next) => res.status(500).send(err.message));
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
  // Promise.all execution order for non-viewer (editor / admin):
  // [0] db.query → uploads stat  (SELECT COUNT FROM photos WHERE user_id)
  // [1] db.query → albums stat   (SELECT COUNT FROM albums WHERE user_id)
  // [2] db.query → recipes stat  (SELECT COUNT FROM tag_recipes WHERE user_id)
  // [3] db.query → sessions      (SELECT sid, sess, expire FROM session WHERE userId)
  // [4] db.query → recent uploads (SELECT ... FROM photos ORDER BY created_at LIMIT 10)
  // [5] db.query → albums list   (SELECT id, title FROM albums WHERE user_id)
  // [6] db.query → profile + prefs (SELECT u.name, u.email, u.avatar_s3_key, ... FROM users JOIN user_prefs)
  // [7] Promise.resolve          — favourites count placeholder (no db.query consumed)
  // [8] Promise.resolve          — comments count placeholder (no db.query consumed)
  // [9] db.query → tag recipes for left-column card (SELECT id, name FROM tag_recipes LIMIT N)
  //
  // For viewer, slots [4] and [9] are Promise.resolve({rows:[]}) — they do NOT consume db.query mocks.
  // Promise.all execution order for viewer:
  // [0] db.query → uploads stat  (via album_access JOIN)
  // [1] db.query → albums stat   (SELECT COUNT FROM album_access WHERE viewer_id)
  // [2] db.query → recipes stat  (SELECT COUNT FROM tag_recipes WHERE user_id)
  // [3] db.query → sessions      (SELECT sid, sess, expire FROM session WHERE userId)
  // [4] Promise.resolve          — skips db.query entirely
  // [5] db.query → albums list   (SELECT ... FROM albums JOIN album_access WHERE viewer_id)
  // [6] db.query → profile + prefs
  // [7] Promise.resolve          — favourites count placeholder
  // [8] Promise.resolve          — comments count placeholder
  // [9] Promise.resolve          — tag recipes (viewer has none)
  function mockAccountQueries({ uploads = 5, albums = 2, recipes = 1, sessions = [],
                                 recentUploads = [], userAlbums = [], recipeRows = [],
                                 profile = { name: 'Saev', email: 'saev@test.com',
                                             avatar_s3_key: null, language: 'en',
                                             theme: 'light', notif_enabled: true } } = {}) {
    db.query
      // [0] stats: upload count
      .mockResolvedValueOnce({ rows: [{ n: uploads }] })
      // [1] stats: album count
      .mockResolvedValueOnce({ rows: [{ n: albums }] })
      // [2] stats: recipes count
      .mockResolvedValueOnce({ rows: [{ n: recipes }] })
      // [3] sessions (ACC-4: rows include sess blob)
      .mockResolvedValueOnce({ rows: sessions })
      // [4] recent uploads
      .mockResolvedValueOnce({ rows: recentUploads })
      // [5] albums list
      .mockResolvedValueOnce({ rows: userAlbums })
      // [6] profile + prefs
      .mockResolvedValueOnce({ rows: [profile] })
      // [7] Promise.resolve for favourites — no db.query mock needed
      // [8] Promise.resolve for comments — no db.query mock needed
      // [9] tag recipes for left-column card
      .mockResolvedValueOnce({ rows: recipeRows });
  }

  it('returns 200 and shows the user name', async () => {
    mockAccountQueries();
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saev');
  });

  it('shows sessions section with current session when only one session exists', async () => {
    // ACC-4: sessions section is always rendered, even with just 1 session
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid', sess: { userId: '10', userAgent: 'Chrome/120', loginIp: '1.2.3.4' }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Active sessions');
    expect(res.text).toContain('current session');
  });

  it('shows sessions section when user has multiple active sessions', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid',  sess: { userId: '10', userAgent: 'Chrome/120', loginIp: '1.2.3.4' }, expire: new Date('2026-06-01') },
        { sid: 'other-sid', sess: { userId: '10', userAgent: 'Firefox/90', loginIp: '1.2.3.5' }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Active sessions');
    expect(res.text).toContain('current session');
    expect(res.text).toContain('Revoke');
  });

  it('shows "No other active sessions" bulk button when only one session', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid', sess: { userId: '10', userAgent: null, loginIp: null }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('No other active sessions');
  });

  it('shows "Sign out all other devices" when other sessions exist', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid',  sess: { userId: '10', userAgent: null, loginIp: null }, expire: new Date('2026-06-01') },
        { sid: 'other-sid', sess: { userId: '10', userAgent: null, loginIp: null }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign out all other devices');
  });

  it('displays UA label for known browser', async () => {
    mockAccountQueries({
      sessions: [
        {
          sid: 'test-sid',
          sess: { userId: '10', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', loginIp: '1.2.3.4' },
          expire: new Date('2026-06-01'),
        },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Chrome on macOS');
  });

  it('shows "Unknown device" for session without userAgent', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid', sess: { userId: '10' }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unknown device');
  });

  it('shows IP address in session row', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid', sess: { userId: '10', userAgent: null, loginIp: '192.168.1.1' }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('192.168.1.1');
  });

  it('shows "Unknown location" when no loginIp stored', async () => {
    mockAccountQueries({
      sessions: [
        { sid: 'test-sid', sess: { userId: '10', userAgent: null, loginIp: null }, expire: new Date('2026-06-01') },
      ],
    });
    const res = await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unknown location');
  });

  it('sessions query uses string userId comparison', async () => {
    mockAccountQueries({ sessions: [] });
    await request(makeApp(USER_SESSION, 'test-sid')).get('/account');
    // The sessions query is the 4th call (index 3)
    const sessionCall = db.query.mock.calls[3];
    expect(sessionCall[0]).toMatch(/sess->>'userId'\s*=\s*\$1/);
    expect(sessionCall[1]).toEqual([String(USER_SESSION.userId)]);
  });

  it('admin sees admin quick links', async () => {
    mockAccountQueries();
    const res = await request(makeApp(ADMIN_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Manage users');
    expect(res.text).toContain('AI tools');
  });

  it('viewer does not see upload links', async () => {
    // Viewer Promise.all execution order (slots [4] and [9] are Promise.resolve — no db.query consumed):
    // [0] db.query → uploads stat  (via album_access JOIN)
    // [1] db.query → albums stat   (SELECT COUNT FROM album_access WHERE viewer_id)
    // [2] db.query → recipes stat
    // [3] db.query → sessions
    // [4] Promise.resolve          — skips db.query
    // [5] db.query → albums list   (via album_access JOIN)
    // [6] db.query → profile + prefs
    // [7] Promise.resolve          — favourites placeholder
    // [8] Promise.resolve          — comments placeholder
    // [9] Promise.resolve          — tag recipes (viewer has none)
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // [0] uploads via album_access
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // [1] albums via album_access
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // [2] recipes
      .mockResolvedValueOnce({ rows: [] })           // [3] sessions
      // [4] Promise.resolve — no db.query mock needed
      .mockResolvedValueOnce({ rows: [] })           // [5] albums list via album_access
      .mockResolvedValueOnce({ rows: [{ name: 'Bob', email: 'bob@test.com', avatar_s3_key: null, language: 'en', theme: 'light', notif_enabled: true }] }); // [6]
    // [7] Promise.resolve — no db.query mock needed
    // [8] Promise.resolve — no db.query mock needed
    // [9] Promise.resolve — no db.query mock needed (viewer)

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

  // DS-ACC-4: left column card rendering
  it('editor sees acc-uploads-card and acc-recipes-card, not viewer placeholders', async () => {
    mockAccountQueries();
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('acc-uploads-card');
    expect(res.text).toContain('acc-recipes-card');
    expect(res.text).not.toContain('acc-favourites-card');
    expect(res.text).not.toContain('acc-activity-card');
  });

  it('viewer sees acc-favourites-card and acc-activity-card, not uploads or recipes cards', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // [0] uploads stat
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // [1] albums stat
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })  // [2] recipes stat
      .mockResolvedValueOnce({ rows: [] })           // [3] sessions
      // [4] Promise.resolve — skipped
      .mockResolvedValueOnce({ rows: [] })           // [5] albums list
      .mockResolvedValueOnce({ rows: [{ name: 'Bob', email: 'bob@test.com', avatar_s3_key: null, language: 'en', theme: 'light', notif_enabled: true }] }); // [6]
    // [7][8][9] Promise.resolve — skipped
    const res = await request(makeApp(VIEWER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('acc-favourites-card');
    expect(res.text).toContain('acc-activity-card');
    expect(res.text).not.toContain('acc-uploads-card');
    expect(res.text).not.toContain('acc-recipes-card');
  });

  it('mosaic featured cell present when recentUploads.length >= 3', async () => {
    const uploads = [
      { id: 1, s3_key: 'a.jpg' },
      { id: 2, s3_key: 'b.jpg' },
      { id: 3, s3_key: 'c.jpg' },
    ];
    mockAccountQueries({ recentUploads: uploads });
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.text).toContain('acc-mosaic-cell--featured');
  });

  it('mosaic featured cell absent when recentUploads.length < 3', async () => {
    const uploads = [
      { id: 1, s3_key: 'a.jpg' },
      { id: 2, s3_key: 'b.jpg' },
    ];
    mockAccountQueries({ recentUploads: uploads });
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.text).not.toContain('acc-mosaic-cell--featured');
  });

  it('renders acc-mosaic-empty when recentUploads is empty', async () => {
    mockAccountQueries({ recentUploads: [] });
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.text).toContain('acc-mosaic-empty');
  });

  it('HTML-escapes recipe name in output', async () => {
    mockAccountQueries({ recipeRows: [{ id: 1, name: '<script>alert(1)</script>' }] });
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('returns 500 when db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('db failure'));
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(500);
  });

  it('shows Delete account link for all roles', async () => {
    mockAccountQueries();
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Delete account');
    expect(res.text).toContain('/account/delete');
  });

  it('renders editable profile fields with data-field attributes', async () => {
    mockAccountQueries({
      profile: { name: 'Saev', email: 'saev@test.com', avatar_s3_key: null,
                 language: 'en', theme: 'light', notif_enabled: true },
    });
    const res = await request(makeApp(USER_SESSION)).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-field="name"');
    expect(res.text).toContain('data-field="email"');
    expect(res.text).toContain('data-field="language"');
    expect(res.text).toContain('data-field="theme"');
    expect(res.text).toContain('data-field="notif_enabled"');
    expect(res.text).toContain('data-current="Saev"');
    expect(res.text).toContain('data-current="saev@test.com"');
  });

  it('shows avatar img tag when session.avatarS3Key is set', async () => {
    mockAccountQueries({
      profile: { name: 'Saev', email: 'saev@test.com', avatar_s3_key: 'test-key.jpg',
                 language: 'en', theme: 'light', notif_enabled: true },
    });
    const res = await request(makeApp({ ...USER_SESSION, avatarS3Key: 'test-key.jpg' })).get('/account');
    expect(res.status).toBe(200);
    expect(res.text).toContain('acc-avatar-img');
    expect(res.text).toContain('/account/avatar');
    expect(res.text).toContain('js-avatar-remove');
  });
});

// ── ACC-4: DELETE /account/sessions/:sid — individual revoke ──────────────────

describe('DELETE /account/sessions/:sid', () => {
  it('returns 200 JSON { ok: true } on successful revoke', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .delete('/account/sessions/other-sid')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('uses correct parameterized SQL with ownership and not-current guards', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    await request(makeApp(USER_SESSION, 'current-sid'))
      .delete('/account/sessions/other-sid')
      .set('x-csrf-token', 'test-csrf');

    const [sql, params] = db.query.mock.calls[0];
    // Must use $1 for target sid, $2 for userId (string), $3 for current sessionID
    expect(sql).toMatch(/DELETE FROM session/);
    expect(sql).toMatch(/\$1/);
    expect(sql).toMatch(/\$2/);
    expect(sql).toMatch(/\$3/);
    expect(params[0]).toBe('other-sid');
    expect(params[1]).toBe(String(USER_SESSION.userId));
    expect(params[2]).toBe('current-sid');
  });

  it('returns 403 when trying to revoke own current session', async () => {
    const res = await request(makeApp(USER_SESSION, 'my-sid'))
      .delete('/account/sessions/my-sid')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/current session/i);
    // No db.query call since guard fires before DB
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 404 when session not found or wrong owner', async () => {
    // rowCount === 0 means DELETE matched nothing (wrong owner or already gone)
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .delete('/account/sessions/nonexistent-sid')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 401 when session has no userId (unauthenticated)', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      // No userId — simulates unauthenticated state
      req.session   = { csrf: 'test-csrf' };
      req.sessionID = 'anon-sid';
      next();
    });
    app.use(require('../../routes/account'));
    app.use((err, req, res, _next) => res.status(500).send(err.message));

    const res = await request(app)
      .delete('/account/sessions/some-sid')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('SQL uses string cast for userId', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1 });

    await request(makeApp({ ...USER_SESSION, userId: 42 }, 'current-sid'))
      .delete('/account/sessions/other-sid')
      .set('x-csrf-token', 'test-csrf');

    const params = db.query.mock.calls[0][1];
    expect(params[1]).toBe('42');
  });
});

// ── ACC-4: DELETE /account/sessions — bulk revoke ─────────────────────────────

describe('DELETE /account/sessions (bulk)', () => {
  it('returns 200 JSON { revoked: N } on success', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 3 });

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .delete('/account/sessions')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 3 });
  });

  it('returns { revoked: 0 } when no other sessions exist', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .delete('/account/sessions')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 0 });
  });

  it('uses correct parameterized SQL excluding current session', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 2 });

    await request(makeApp(USER_SESSION, 'keep-this-sid'))
      .delete('/account/sessions')
      .set('x-csrf-token', 'test-csrf');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM session/);
    expect(sql).toMatch(/sess->>'userId'\s*=\s*\$1/);
    expect(sql).toMatch(/sid != \$2/);
    expect(params[0]).toBe(String(USER_SESSION.userId));
    expect(params[1]).toBe('keep-this-sid');
  });

  it('returns 401 when unauthenticated', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.session   = { csrf: 'test-csrf' };
      req.sessionID = 'anon-sid';
      next();
    });
    app.use(require('../../routes/account'));
    app.use((err, req, res, _next) => res.status(500).send(err.message));

    const res = await request(app)
      .delete('/account/sessions')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 500 when db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('db error'));

    const res = await request(makeApp(USER_SESSION, 'current-sid'))
      .delete('/account/sessions')
      .set('x-csrf-token', 'test-csrf');

    expect(res.status).toBe(500);
  });
});

// ── Legacy POST /account/sessions/:sid/revoke ─────────────────────────────────

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

  it('allows revoking the current session (self-logout)', async () => {
    // The legacy implementation issues a DELETE regardless of whether :sid === req.sessionID.
    // Self-revocation is allowed by design in the legacy form endpoint.
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(USER_SESSION, 'test-sid'))
      .post('/account/sessions/test-sid/revoke');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM session'),
      ['test-sid', USER_SESSION.userId]
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account');
  });
});

// ── Legacy POST /account/sessions/revoke-others ───────────────────────────────

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

// ── PATCH /account (ACC-2) ────────────────────────────────────────────────────

describe('PATCH /account (ACC-2)', () => {
  it('updates name — returns 200 ok', async () => {
    // db.query mock order: [0] UPDATE users
    db.query.mockResolvedValueOnce({ rows: [] }); // UPDATE users SET name
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET'),
      expect.arrayContaining(['New Name'])
    );
  });

  it('returns 422 for empty name', async () => {
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ name: '' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Name is required/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 422 for name longer than 100 chars — distinct message from empty name', async () => {
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ name: 'a'.repeat(101) });
    expect(res.status).toBe(422);
    // HRD-2: too-long case has its own message, distinct from "Name is required"
    expect(res.body.error).toBe('Name must be 1–100 characters');
  });

  it('returns 422 for notif_enabled sent as string "false" — boolean coercion guard', async () => {
    // HRD-3: string "false" must not silently coerce to true
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ notif_enabled: 'false' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/notif_enabled must be a boolean/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 422 for notif_enabled sent as string "true" — boolean coercion guard', async () => {
    // HRD-3: string "true" must also be rejected
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ notif_enabled: 'true' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/notif_enabled must be a boolean/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('accepts name of exactly 100 chars — returns 200', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // UPDATE users SET name
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ name: 'a'.repeat(100) });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 422 for invalid email format', async () => {
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid email/);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns 409 when email is already in use by another user', async () => {
    // db.query mock order: [0] SELECT id FROM users WHERE email AND id != userId
    db.query.mockResolvedValueOnce({ rows: [{ id: 99 }] }); // conflict found
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ email: 'taken@test.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in use/);
  });

  it('allows updating to own current email — returns 200', async () => {
    // db.query mock order: [0] SELECT id (no conflict), [1] UPDATE users SET email
    db.query
      .mockResolvedValueOnce({ rows: [] })   // no conflict
      .mockResolvedValueOnce({ rows: [] });  // UPDATE users
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ email: 'saev@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('upserts language preference — returns 200', async () => {
    // db.query mock order: [0] INSERT INTO user_prefs ... ON CONFLICT DO UPDATE
    db.query.mockResolvedValueOnce({ rows: [] }); // upsert prefs
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ language: 'fr' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_prefs'),
      expect.arrayContaining([USER_SESSION.userId, 'fr'])
    );
  });

  it('upserts theme preference — returns 200', async () => {
    // db.query mock order: [0] INSERT INTO user_prefs ... ON CONFLICT DO UPDATE
    db.query.mockResolvedValueOnce({ rows: [] }); // upsert prefs
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ theme: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_prefs'),
      expect.arrayContaining([USER_SESSION.userId, 'dark'])
    );
  });

  it('upserts notif_enabled = false — returns 200', async () => {
    // db.query mock order: [0] INSERT INTO user_prefs ... ON CONFLICT DO UPDATE
    db.query.mockResolvedValueOnce({ rows: [] }); // upsert prefs
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ notif_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_prefs'),
      expect.arrayContaining([USER_SESSION.userId, false])
    );
  });

  it('returns 422 for invalid language value', async () => {
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ language: 'de' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid language/);
  });

  it('returns 422 for invalid theme value', async () => {
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ theme: 'blue' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid theme/);
  });

  it('returns 422 when no valid fields sent', async () => {
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/No valid fields/);
  });

  it('updates both name and language in one request — 2 db calls', async () => {
    // db.query mock order: [0] UPDATE users SET name, [1] INSERT INTO user_prefs
    db.query
      .mockResolvedValueOnce({ rows: [] })   // UPDATE users SET name
      .mockResolvedValueOnce({ rows: [] });  // INSERT INTO user_prefs (language)
    const res = await request(makeApp(USER_SESSION))
      .patch('/account')
      .set('Content-Type', 'application/json')
      .send({ name: 'Updated Name', language: 'fr' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});

// ── POST /account/avatar (ACC-3) ──────────────────────────────────────────────

describe('POST /account/avatar (ACC-3)', () => {
  const JPEG_BUFFER = Buffer.from('fake-jpeg-data');

  beforeEach(() => {
    // After resetAllMocks() wipes mock implementations, re-apply them.
    // uuid v4 must return a known value so we can assert on the generated key.
    uuidv4.mockReturnValue('test-uuid');

    // sharp factory mock: returns a chainable object with resize/jpeg/toBuffer.
    const chain = {
      resize: jest.fn().mockReturnThis(),
      jpeg:   jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-jpeg')),
    };
    sharp.mockReturnValue(chain);
  });

  it('returns 400 when no file is provided', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file provided/);
  });

  it('returns 415 for unsupported file type (gif)', async () => {
    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', Buffer.from('fakegif'), { filename: 'test.gif', contentType: 'image/gif' });
    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/Unsupported file type/);
  });

  it('returns 413 for file over 5MB', async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 'x');
    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', bigBuffer, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/);
  });

  it('returns 413 for file 1 byte over 5 MB limit', async () => {
    // Edge case: 5*1024*1024 + 2 bytes must be rejected.
    // The multer limit is set to MAX+1 so exactly 5 MB (MAX) is accepted;
    // anything above MAX is rejected. Use MAX+2 to be clearly over.
    const overLimit = Buffer.alloc(5 * 1024 * 1024 + 2, 'x');
    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', overLimit, { filename: 'over.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/);
  });

  it('accepts file of exactly 5 MB — returns 200', async () => {
    // Edge case: exactly 5*1024*1024 bytes must be accepted
    // db.query mock order: [0] SELECT old key, [1] UPDATE users
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: null }] })
      .mockResolvedValueOnce({ rows: [] });
    uploadPhoto.mockResolvedValueOnce();

    const exactLimit = Buffer.alloc(5 * 1024 * 1024, 'x');
    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', exactLimit, { filename: 'exact.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('uploads JPEG successfully — returns 200 with ok:true (no key field)', async () => {
    // db.query mock order: [0] SELECT avatar_s3_key (no old key), [1] UPDATE users SET avatar_s3_key
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: null }] })  // SELECT old key
      .mockResolvedValueOnce({ rows: [] });                         // UPDATE users SET avatar_s3_key
    uploadPhoto.mockResolvedValueOnce();

    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // HRD-6: S3 key must not be exposed in the response
    expect(res.body.key).toBeUndefined();
    expect(uploadPhoto).toHaveBeenCalledWith('test-uuid.jpg', expect.any(Buffer), 'image/jpeg');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET avatar_s3_key'),
      ['test-uuid.jpg', USER_SESSION.userId]
    );
  });

  it('returns 500 when sharp throws on corrupt image input', async () => {
    // HRD-5: sharp failure path — toBuffer rejects with an error
    const chain = {
      resize: jest.fn().mockReturnThis(),
      jpeg:   jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValue(new Error('corrupt image data')),
    };
    sharp.mockReturnValue(chain);

    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Upload failed/);
    // Neither S3 nor DB should be touched after sharp failure
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('deletes old S3 key when user already has an avatar', async () => {
    // db.query mock order: [0] SELECT avatar_s3_key (old key exists), [1] UPDATE users
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: 'old-key.jpg' }] })  // SELECT old key
      .mockResolvedValueOnce({ rows: [] });                                   // UPDATE users
    uploadPhoto.mockResolvedValueOnce();
    deletePhoto.mockResolvedValueOnce();

    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    // deletePhoto is called fire-and-forget; give the promise a tick to run
    await new Promise(r => setImmediate(r));
    expect(deletePhoto).toHaveBeenCalledWith('old-key.jpg');
  });

  it('returns 500 when S3 upload fails — no DB update', async () => {
    uploadPhoto.mockRejectedValueOnce(new Error('S3 down'));

    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Upload failed/);
    // DB should not be called at all (upload failed before DB update)
    expect(db.query).not.toHaveBeenCalled();
  });

  it('accepts PNG and outputs JPEG', async () => {
    // db.query mock order: [0] SELECT old key, [1] UPDATE users
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: null }] })
      .mockResolvedValueOnce({ rows: [] });
    uploadPhoto.mockResolvedValueOnce();

    const res = await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', Buffer.from('fakepng'), { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    // Output is always JPEG regardless of input mime type
    expect(uploadPhoto).toHaveBeenCalledWith('test-uuid.jpg', expect.any(Buffer), 'image/jpeg');
  });

  it('calls sharp with 256x256 cover resize', async () => {
    // db.query mock order: [0] SELECT old key, [1] UPDATE users
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: null }] })
      .mockResolvedValueOnce({ rows: [] });
    uploadPhoto.mockResolvedValueOnce();

    await request(makeApp(USER_SESSION))
      .post('/account/avatar')
      .attach('avatar', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });

    const sharpInstance = sharp.mock.results[0].value;
    expect(sharpInstance.resize).toHaveBeenCalledWith(256, 256, { fit: 'cover' });
    expect(sharpInstance.jpeg).toHaveBeenCalledWith({ quality: 85 });
  });
});

// ── DELETE /account/avatar (ACC-3) ────────────────────────────────────────────

describe('DELETE /account/avatar (ACC-3)', () => {
  it('removes avatar when key exists — returns 200 and calls deletePhoto', async () => {
    // db.query mock order: [0] SELECT avatar_s3_key, [1] UPDATE users SET avatar_s3_key = NULL
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: 'old.jpg' }] })  // SELECT old key
      .mockResolvedValueOnce({ rows: [] });                               // UPDATE users SET NULL
    deletePhoto.mockResolvedValueOnce();

    const res = await request(makeApp(USER_SESSION)).delete('/account/avatar');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET avatar_s3_key = NULL'),
      [USER_SESSION.userId]
    );
    // deletePhoto is fire-and-forget; give it a tick
    await new Promise(r => setImmediate(r));
    expect(deletePhoto).toHaveBeenCalledWith('old.jpg');
  });

  it('returns 200 even when no avatar key exists — does not call deletePhoto', async () => {
    // db.query mock order: [0] SELECT avatar_s3_key (null), [1] UPDATE users SET NULL
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: null }] })  // SELECT old key
      .mockResolvedValueOnce({ rows: [] });                          // UPDATE users SET NULL

    const res = await request(makeApp(USER_SESSION)).delete('/account/avatar');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    await new Promise(r => setImmediate(r));
    expect(deletePhoto).not.toHaveBeenCalled();
  });

  it('returns 200 even if S3 delete throws — DB update still applied', async () => {
    // db.query mock order: [0] SELECT old key, [1] UPDATE users SET NULL
    db.query
      .mockResolvedValueOnce({ rows: [{ avatar_s3_key: 'broken.jpg' }] })
      .mockResolvedValueOnce({ rows: [] });
    deletePhoto.mockRejectedValueOnce(new Error('S3 delete failed'));

    const res = await request(makeApp(USER_SESSION)).delete('/account/avatar');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── GET /account/avatar (ACC-3) ───────────────────────────────────────────────

describe('GET /account/avatar (ACC-3)', () => {
  it('streams avatar with correct content-type', async () => {
    const fakeStream = require('stream').Readable.from(['fake-image-data']);
    // db.query mock order: [0] SELECT avatar_s3_key
    db.query.mockResolvedValueOnce({ rows: [{ avatar_s3_key: 'some-uuid.jpg' }] });
    streamPhoto.mockResolvedValueOnce({ stream: fakeStream, contentType: 'image/jpeg' });

    const res = await request(makeApp(USER_SESSION)).get('/account/avatar');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(streamPhoto).toHaveBeenCalledWith('some-uuid.jpg');
  });

  it('returns 404 when user has no avatar', async () => {
    // db.query mock order: [0] SELECT avatar_s3_key (null)
    db.query.mockResolvedValueOnce({ rows: [{ avatar_s3_key: null }] });

    const res = await request(makeApp(USER_SESSION)).get('/account/avatar');
    expect(res.status).toBe(404);
    expect(streamPhoto).not.toHaveBeenCalled();
  });
});
