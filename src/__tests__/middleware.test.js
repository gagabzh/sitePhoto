const { requireAuth, requireAdmin } = require('../middleware');

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
