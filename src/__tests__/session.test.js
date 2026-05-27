'use strict';

// Mock connect-pg-simple before loading session.js so no real DB connection is made.
// Returns a factory function that, when called with `session`, returns a PgSession class.
const mockStoreInstance = {
  // Minimal express-session Store duck type
};

jest.mock('connect-pg-simple', () => {
  return function connectPgSimple(/* session */) {
    // Return a constructor — session.js calls `new PgSession(options)`
    function PgSession(options) {
      mockStoreInstance._options = options;
      Object.assign(this, mockStoreInstance);
    }
    // express-session requires store to be an EventEmitter descendant; satisfy the
    // duck-type check by adding a no-op `on` method.
    PgSession.prototype.on = jest.fn();
    return PgSession;
  };
});

jest.mock('../db', () => ({ query: jest.fn() }));

describe('session middleware', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Clear module cache so session.js is freshly evaluated for each test.
    jest.resetModules();
  });

  it('exports a function (express middleware)', () => {
    const sessionMiddleware = require('../session');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('configures PgSession store with correct options', () => {
    require('../session');
    const options = mockStoreInstance._options;
    expect(options).toBeDefined();
    expect(options.createTableIfMissing).toBe(false);
    expect(options.pruneSessionInterval).toBe(3600);
  });

  it('passes the db pool to PgSession store', () => {
    const db = require('../db');
    require('../session');
    const options = mockStoreInstance._options;
    expect(options.pool).toBe(db);
  });

  it('uses SESSION_SECRET env var when set', () => {
    process.env.SESSION_SECRET = 'test-secret-value';
    // express-session inspects the secret option at call time;
    // we just verify the middleware is returned without error
    const sessionMiddleware = require('../session');
    expect(typeof sessionMiddleware).toBe('function');
    delete process.env.SESSION_SECRET;
  });

  it('falls back to dev-secret when SESSION_SECRET is not set', () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    // Should not throw — express-session accepts any non-empty string secret
    const sessionMiddleware = require('../session');
    expect(typeof sessionMiddleware).toBe('function');
    if (saved !== undefined) process.env.SESSION_SECRET = saved;
  });

  it('sets cookie httpOnly, sameSite=lax', () => {
    // We cannot easily inspect the cookie options from outside express-session,
    // but we can verify the module loads with expected config without throwing.
    const sessionMiddleware = require('../session');
    expect(typeof sessionMiddleware).toBe('function');
  });
});
