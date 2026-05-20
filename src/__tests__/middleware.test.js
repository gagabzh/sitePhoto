const { requireAuth, requireAdmin, canModify, errorHandler, wrapAsync } = require('../middleware');

describe('requireAuth', () => {
  const next = jest.fn();

  beforeEach(() => next.mockClear());

  it('calls next() when session has userId', () => {
    const req = { session: { userId: 1 } };
    const res = { redirect: jest.fn() };
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects to /login when session is empty', () => {
    const req = { session: {} };
    const res = { redirect: jest.fn() };
    requireAuth(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /login when session has no userId', () => {
    const req = { session: { role: 'admin' } };
    const res = { redirect: jest.fn() };
    requireAuth(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/login');
  });
});

describe('requireAdmin', () => {
  const next = jest.fn();

  beforeEach(() => next.mockClear());

  it('calls next() when role is admin', () => {
    const req = { session: { role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when role is editor', () => {
    const req = { session: { role: 'editor' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is viewer', () => {
    const req = { session: { role: 'viewer' } };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when session has no role', () => {
    const req = { session: {} };
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('errorHandler', () => {
  let consoleSpy;
  const next = jest.fn();

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function makeRes() {
    return { status: jest.fn().mockReturnThis(), send: jest.fn() };
  }

  it('logs the error', () => {
    const err = new Error('boom');
    errorHandler(err, {}, makeRes(), next);
    expect(consoleSpy).toHaveBeenCalledWith(err);
  });

  it('returns 500 for a generic Error', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), {}, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalled();
  });

  it('uses err.status when present', () => {
    const res = makeRes();
    const err = Object.assign(new Error('gone'), { status: 410 });
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('uses err.statusCode when err.status is absent', () => {
    const res = makeRes();
    const err = Object.assign(new Error('bad'), { statusCode: 422 });
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('sends the error message in non-production', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const res = makeRes();
    errorHandler(new Error('db connection failed'), {}, res, next);
    expect(res.send).toHaveBeenCalledWith('db connection failed');
    process.env.NODE_ENV = saved;
  });

  it('sends a generic message in production', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    errorHandler(new Error('db connection failed'), {}, res, next);
    expect(res.send).toHaveBeenCalledWith('Internal server error');
    process.env.NODE_ENV = saved;
  });

  it('falls back to generic message when err has no message', () => {
    const res = makeRes();
    errorHandler({}, {}, res, next);
    expect(res.send).toHaveBeenCalledWith('Internal server error');
  });
});

describe('canModify', () => {
  it('returns true for admin regardless of ownership', () => {
    expect(canModify({ role: 'admin', userId: 99 }, { user_id: 10 })).toBe(true);
  });

  it('returns true for owner', () => {
    expect(canModify({ role: 'editor', userId: 10 }, { user_id: 10 })).toBe(true);
  });

  it('returns false for non-owner editor', () => {
    expect(canModify({ role: 'editor', userId: 20 }, { user_id: 10 })).toBe(false);
  });

  it('returns false for non-owner viewer', () => {
    expect(canModify({ role: 'viewer', userId: 20 }, { user_id: 10 })).toBe(false);
  });
});

describe('wrapAsync', () => {
  it('calls the handler and returns its promise', async () => {
    const handler = jest.fn().mockResolvedValue('ok');
    const wrapped = wrapAsync(handler);
    const req = {}, res = {}, next = jest.fn();
    await wrapped(req, res, next);
    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(err) when the handler rejects', async () => {
    const err = new Error('db down');
    const wrapped = wrapAsync(jest.fn().mockRejectedValue(err));
    const next = jest.fn();
    await wrapped({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('integrates with errorHandler: DB rejection → 500 response', async () => {
    const request = require('supertest');
    const express = require('express');
    const { errorHandler: eh } = require('../middleware');

    jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = express();
    app.get('/test', wrapAsync(async () => { throw new Error('db down'); }));
    app.use(eh);

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);

    console.error.mockRestore();
  });
});
