jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../../middleware');

beforeEach(() => jest.resetAllMocks());

const ADMIN_SESSION = { userId: 1, name: 'Admin', role: 'admin' };
const EDITOR_SESSION = { userId: 2, name: 'Editor', role: 'editor' };

const FAKE_USERS = [
  { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin', created_at: new Date('2024-01-01') },
  { id: 2, name: 'Alice', email: 'alice@test.com', role: 'editor', created_at: new Date('2024-02-01') },
];

function makeApp(sessionData) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { ...sessionData, destroy: (cb) => cb() };
    next();
  });
  app.use('/admin/users', requireAdmin, require('../../routes/admin'));
  return app;
}

describe('US-1: GET /admin/users — list users', () => {
  it('returns 200 and lists all users for admin', async () => {
    db.query.mockResolvedValue({ rows: FAKE_USERS });
    const res = await request(makeApp(ADMIN_SESSION)).get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Admin');
    expect(res.text).toContain('Alice');
    expect(res.text).toContain('admin@test.com');
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(makeApp(EDITOR_SESSION)).get('/admin/users');
    expect(res.status).toBe(403);
  });
});

describe('US-2: Create user', () => {
  it('GET /admin/users/new returns 200 with form', async () => {
    const res = await request(makeApp(ADMIN_SESSION)).get('/admin/users/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('New user');
  });

  it('POST /admin/users creates user and redirects to list', async () => {
    bcrypt.hash.mockResolvedValue('$hashed');
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users')
      .send('name=Bob&email=bob%40test.com&password=password1&role=viewer');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      ['Bob', 'bob@test.com', '$hashed', 'viewer']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users');
  });

  it('POST /admin/users redirects with error on duplicate email', async () => {
    bcrypt.hash.mockResolvedValue('$hashed');
    db.query.mockRejectedValue({ code: '23505' });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users')
      .send('name=Bob&email=admin%40test.com&password=password1&role=viewer');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users/new?error=1');
  });

  it('POST /admin/users returns 400 for invalid role', async () => {
    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users')
      .send('name=Bob&email=bob%40test.com&password=password1&role=superadmin');

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('US-3: Edit user', () => {
  it('GET /admin/users/:id/edit returns 200 with pre-filled form', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_USERS[1]] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/admin/users/2/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('alice@test.com');
  });

  it('GET /admin/users/:id/edit returns 404 for unknown user', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/admin/users/999/edit');
    expect(res.status).toBe(404);
  });

  it('POST /admin/users/:id updates user and redirects to list', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users/2')
      .send('name=Alice+Updated&email=alice2%40test.com&role=admin');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['Alice Updated', 'alice2@test.com', 'admin', '2']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users');
  });

  it('POST /admin/users/:id redirects with error on duplicate email', async () => {
    db.query.mockRejectedValue({ code: '23505' });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users/2')
      .send('name=Alice&email=admin%40test.com&role=editor');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users/2/edit?error=1');
  });

  it('POST /admin/users/:id returns 400 for invalid role', async () => {
    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users/2')
      .send('name=Alice&email=alice%40test.com&role=god');

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('US-4: Delete user', () => {
  it('POST /admin/users/:id/delete deletes user and redirects', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })   // SELECT id FROM photos (user's photos — none)
      .mockResolvedValueOnce({ rows: [] });  // DELETE FROM users

    const res = await request(makeApp(ADMIN_SESSION)).post('/admin/users/2/delete');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM photos'),
      ['2']
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM users'),
      ['2']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users');
  });

  it('POST /admin/users/:id/delete unlinks photo files via deletePhotos', async () => {
    const fs = require('fs');
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 11 }, { id: 12 }] })           // SELECT id FROM photos
      .mockResolvedValueOnce({ rows: [{ filename: 'abc.jpg' }, { filename: 'def.jpg' }] }) // deletePhotos SELECT filename
      .mockResolvedValueOnce({ rows: [] })                                  // deletePhotos DELETE FROM photos
      .mockResolvedValueOnce({ rows: [] });                                 // DELETE FROM users

    await request(makeApp(ADMIN_SESSION)).post('/admin/users/2/delete');

    expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('abc.jpg'));
    expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('def.jpg'));
    fs.promises.unlink.mockRestore();
  });

  it('POST /admin/users/:id/delete does not delete self', async () => {
    const res = await request(makeApp(ADMIN_SESSION)).post('/admin/users/1/delete');

    expect(db.query).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users');
  });
});

describe('US-5: Admin reset user password', () => {
  it('GET /admin/users/:id/password returns 200 with form', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 2, name: 'Alice' }] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/admin/users/2/password');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Reset password');
    expect(res.text).toContain('Alice');
  });

  it('GET /admin/users/:id/password returns 404 for unknown user', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(makeApp(ADMIN_SESSION)).get('/admin/users/999/password');
    expect(res.status).toBe(404);
  });

  it('POST /admin/users/:id/password hashes and saves new password', async () => {
    bcrypt.hash.mockResolvedValue('$newhash');
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(makeApp(ADMIN_SESSION))
      .post('/admin/users/2/password')
      .send('password=newpassword');

    expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET password_hash'),
      ['$newhash', '2']
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users/2/password?done=1');
  });
});
