const { nonceMiddleware, csrfMiddleware, requireAuth, requireAdmin, errorHandler, wrapAsync } = require('../middleware');

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

describe('nonceMiddleware', () => {
  // nonceMiddleware replaces res.send with a patching wrapper; the original
  // send is stored as origSend internally. We capture output via a plain fn.
  function makeRes() {
    const captured = [];
    const res = { locals: {}, send: (body) => captured.push(body) };
    return { res, captured };
  }

  it('sets res.locals.nonce to a non-empty string and calls next()', () => {
    const { res } = makeRes();
    const next = jest.fn();
    nonceMiddleware({}, res, next);
    expect(typeof res.locals.nonce).toBe('string');
    expect(res.locals.nonce.length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('injects nonce into bare <script> tags in HTML response', () => {
    const { res, captured } = makeRes();
    nonceMiddleware({}, res, jest.fn());
    const nonce = res.locals.nonce;
    res.send('<!DOCTYPE html><script>alert(1)</script>');
    expect(captured[0]).toContain(`<script nonce="${nonce}">`);
  });

  it('adds nonce to <script src="..."> tags', () => {
    const { res, captured } = makeRes();
    nonceMiddleware({}, res, jest.fn());
    const nonce = res.locals.nonce;
    res.send('<!DOCTYPE html><script src="/app.js"></script>');
    expect(captured[0]).toContain(`<script nonce="${nonce}" src="/app.js">`);
  });

  it('does not modify non-HTML bodies', () => {
    const { res, captured } = makeRes();
    nonceMiddleware({}, res, jest.fn());
    res.send('{"ok":true}');
    expect(captured[0]).toBe('{"ok":true}');
  });

  it('generates a unique nonce per request', () => {
    const nonces = new Set();
    for (let i = 0; i < 5; i++) {
      const { res } = makeRes();
      nonceMiddleware({}, res, jest.fn());
      nonces.add(res.locals.nonce);
    }
    expect(nonces.size).toBe(5);
  });

  it('injects nonce into bare <style> tags in HTML response', () => {
    const { res, captured } = makeRes();
    nonceMiddleware({}, res, jest.fn());
    const nonce = res.locals.nonce;
    res.send('<!DOCTYPE html><style>body{margin:0}</style>');
    expect(captured[0]).toContain(`<style nonce="${nonce}">`);
  });

  it('adds nonce to <style> tags that already have other attributes', () => {
    const { res, captured } = makeRes();
    nonceMiddleware({}, res, jest.fn());
    const nonce = res.locals.nonce;
    res.send('<!DOCTYPE html><style type="text/css">body{}</style>');
    expect(captured[0]).toContain(`<style nonce="${nonce}" type="text/css">`);
  });

  it('does not double-inject nonce into <style> tags that already have one', () => {
    const { res, captured } = makeRes();
    nonceMiddleware({}, res, jest.fn());
    const nonce = res.locals.nonce;
    res.send(`<!DOCTYPE html><style nonce="${nonce}">body{}</style>`);
    expect(captured[0]).toBe(`<!DOCTYPE html><style nonce="${nonce}">body{}</style>`);
  });
});

describe('csrfMiddleware', () => {
  function makeReq(method = 'GET', sessionCsrf = undefined, headers = {}, body = {}) {
    return { method, session: sessionCsrf !== undefined ? { csrf: sessionCsrf } : {}, headers, body };
  }

  beforeEach(() => jest.resetAllMocks());

  it('generates a csrf token on the session when absent', () => {
    const req = makeReq('GET');
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(typeof req.session.csrf).toBe('string');
    expect(req.session.csrf.length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing csrf token', () => {
    const req = makeReq('GET', 'existing-token');
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(req.session.csrf).toBe('existing-token');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() for GET without checking token', () => {
    const req = makeReq('GET', 'tok');
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 for POST with no token', () => {
    const req = makeReq('POST', 'tok');
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for POST with wrong X-CSRF-Token header', () => {
    const req = makeReq('POST', 'tok', { 'x-csrf-token': 'wrong' });
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for POST with correct X-CSRF-Token header', () => {
    const req = makeReq('POST', 'tok', { 'x-csrf-token': 'tok' });
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() for POST with correct _csrf body field', () => {
    const req = makeReq('POST', 'tok', {}, { _csrf: 'tok' });
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips token check for multipart POST', () => {
    const req = makeReq('POST', 'tok', { 'content-type': 'multipart/form-data; boundary=abc' });
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('enforces token on DELETE requests', () => {
    const req = makeReq('DELETE', 'tok');
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const next = jest.fn();
    csrfMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
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
