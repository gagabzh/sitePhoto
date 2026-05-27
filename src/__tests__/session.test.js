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

// Capture the options passed to express-session so tests can assert on them.
let mockSessionOptions;
const mockMiddleware = jest.fn();

jest.mock('express-session', () => {
  return function expressSession(options) {
    mockSessionOptions = options;
    return mockMiddleware;
  };
});

describe('session middleware', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Clear module cache so session.js is freshly evaluated for each test.
    jest.resetModules();
    // Reset captured state to avoid bleed between tests.
    mockStoreInstance._options = undefined;
    mockSessionOptions = undefined;
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
    require('../session');
    expect(mockSessionOptions.secret).toBe('test-secret-value');
    delete process.env.SESSION_SECRET;
  });

  it('falls back to dev-secret when SESSION_SECRET is not set', () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    require('../session');
    expect(mockSessionOptions.secret).toBe('dev-secret');
    if (saved !== undefined) process.env.SESSION_SECRET = saved;
  });

  it('sets cookie httpOnly and sameSite=lax', () => {
    require('../session');
    expect(mockSessionOptions.cookie.httpOnly).toBe(true);
    expect(mockSessionOptions.cookie.sameSite).toBe('lax');
  });

  it('sets rolling:true so active users stay logged in', () => {
    require('../session');
    expect(mockSessionOptions.rolling).toBe(true);
  });

  it('sets cookie.maxAge to 7 days', () => {
    require('../session');
    expect(mockSessionOptions.cookie.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
