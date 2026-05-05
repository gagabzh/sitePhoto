jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(), compare: jest.fn() }));

const request = require('supertest');
const app = require('../../app');
const db = require('../../db');
const bcrypt = require('bcryptjs');

const FAKE_USER = { id: 1, name: 'Saev', password_hash: '$hashed', role: 'admin' };

describe('GET /login', () => {
  it('returns 200 with a login form', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign in');
    expect(res.text).toContain('<form');
  });

  it('shows error message when ?error=1', async () => {
    const res = await request(app).get('/login?error=1');
    expect(res.text).toContain('Invalid email or password');
  });
});

describe('POST /login', () => {
  it('redirects to / on valid credentials', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_USER] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/login')
      .send('email=saev%40test.com&password=secret');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('redirects to /login?error=1 when password is wrong', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_USER] });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/login')
      .send('email=saev%40test.com&password=wrong');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=1');
  });

  it('redirects to /login?error=1 when user does not exist', async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/login')
      .send('email=nobody%40test.com&password=secret');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=1');
  });
});

describe('POST /logout', () => {
  it('redirects to /login and clears session', async () => {
    db.query.mockResolvedValue({ rows: [FAKE_USER] });
    bcrypt.compare.mockResolvedValue(true);

    const agent = request.agent(app);
    await agent.post('/login').send('email=saev%40test.com&password=secret');

    const res = await agent.post('/logout');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');

    // After logout, / should redirect to /login
    const protected_ = await agent.get('/');
    expect(protected_.headers.location).toBe('/login');
  });
});
