'use strict';

// We mock socket.io and session at the top level (no resetModules) so that V8
// coverage tracks a single module instance throughout the suite.  State
// isolation between tests is achieved by:
//   - calling initSocketIO() afresh in each test (resets `io`)
//   - using distinct userId values per test so userSockets entries don't bleed
//   - disconnecting sockets explicitly where needed

let mockUse;
let mockIoOn;
let mockToEmit;
let mockTo;
// Build a fresh set of io-level mock fns and re-apply the Server mock impl
// before every test so resetAllMocks() doesn't leave Server returning undefined.
function rebuildSocketIOMock() {
  mockToEmit = jest.fn();
  mockTo = jest.fn(() => ({ emit: mockToEmit }));
  mockUse = jest.fn();
  mockIoOn = jest.fn();
  // Re-apply on the already-mocked module reference after resetAllMocks clears it
  require('socket.io').Server.mockImplementation(() => ({
    use: mockUse,
    on: mockIoOn,
    to: mockTo,
  }));
  // Restore session middleware mock — resetAllMocks clears its implementation
  require('../session').mockImplementation((req, res, next) => next());
}

jest.mock('socket.io', () => ({
  Server: jest.fn(),
}));
jest.mock('../session', () => jest.fn((req, res, next) => next()));

const { Server } = require('socket.io');
const { initSocketIO, notifyUser, _resetForTesting, _registerSocketForTesting } = require('../notifications');

// Each test gets a unique userId base to avoid cross-test userSockets bleed.
// Start at 1000 and increment so tests never share a userId accidentally.
let nextUserId = 1000;
function uid() { return nextUserId++; }

beforeEach(() => {
  rebuildSocketIOMock();
});

afterEach(() => {
  jest.resetAllMocks();
});

// ── initSocketIO ──────────────────────────────────────────────────────────────

describe('initSocketIO()', () => {
  it('constructs a socket.io Server with the given httpServer', () => {
    const fakeServer = {};
    initSocketIO(fakeServer);

    expect(Server).toHaveBeenCalledWith(
      fakeServer,
      expect.objectContaining({ cors: expect.any(Object) }),
    );
  });

  it('returns the io instance', () => {
    const result = initSocketIO({});
    expect(result).toBeDefined();
    expect(result.use).toBe(mockUse);
    expect(result.on).toBe(mockIoOn);
  });

  it('registers a session-sharing middleware via io.use()', () => {
    initSocketIO({});
    expect(mockUse).toHaveBeenCalledTimes(1);
    expect(mockUse).toHaveBeenCalledWith(expect.any(Function));
  });

  it('registers a "connection" event handler via io.on()', () => {
    initSocketIO({});
    expect(mockIoOn).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('session middleware shim passes socket.request and calls next()', () => {
    initSocketIO({});
    const [[ioUseMiddleware]] = mockUse.mock.calls;

    const fakeSock = { request: {} };
    const next = jest.fn();
    ioUseMiddleware(fakeSock, next);

    // The session mock just calls next() — verify the chain completes
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sessionShim object methods (getHeader/setHeader/end) do not throw', () => {
    // The sessionShim is passed as the "res" object to express-session.
    // To exercise its methods, we temporarily replace the session middleware
    // with one that calls the shim methods directly (simulating express-session
    // reading/writing headers on the fake response).
    const sessionMock = require('../session');
    sessionMock.mockImplementationOnce((req, shimRes, next) => {
      // Simulate express-session calling response methods on the shim
      shimRes.getHeader('Set-Cookie');
      shimRes.setHeader('Set-Cookie', 'sid=abc');
      shimRes.end();
      next();
    });

    initSocketIO({});
    const [[ioUseMiddleware]] = mockUse.mock.calls;
    const fakeSock = { request: {} };
    const next = jest.fn();

    expect(() => ioUseMiddleware(fakeSock, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── connection handler: socket tracking ──────────────────────────────────────

describe('connection handler', () => {
  function makeSocket(userId, socketId) {
    const socketOnHandlers = {};
    return {
      id: socketId || `sid-${userId}`,
      request: { session: userId !== undefined ? { userId } : {} },
      disconnect: jest.fn(),
      on: jest.fn((event, handler) => { socketOnHandlers[event] = handler; }),
      _handlers: socketOnHandlers,
    };
  }

  function getConnectionHandler() {
    initSocketIO({});
    const [[, connectionHandler]] = mockIoOn.mock.calls;
    return connectionHandler;
  }

  it('disconnects socket when session has no userId', () => {
    const connectionHandler = getConnectionHandler();
    const socket = makeSocket(undefined);
    connectionHandler(socket);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not register a disconnect listener when userId is absent', () => {
    const connectionHandler = getConnectionHandler();
    const socket = makeSocket(undefined);
    connectionHandler(socket);
    expect(socket.on).not.toHaveBeenCalled();
  });

  it('registers a "disconnect" listener when userId is present', () => {
    const connectionHandler = getConnectionHandler();
    const userId = uid();
    const socket = makeSocket(userId);
    connectionHandler(socket);
    expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('removes socket from userSockets on disconnect', () => {
    const { initSocketIO: init2, notifyUser: notify2 } = require('../notifications');
    init2({});
    const [[, connectionHandler]] = mockIoOn.mock.calls;

    const userId = uid();
    const socket = makeSocket(userId);
    connectionHandler(socket);

    // Trigger disconnect
    socket._handlers['disconnect']();

    // After disconnect, notifyUser should not emit to the removed socket
    notify2(userId, { test: true });
    expect(mockTo).not.toHaveBeenCalled();
  });
});

// ── notifyUser ────────────────────────────────────────────────────────────────

describe('notifyUser()', () => {
  function makeSocket(userId, socketId) {
    const socketOnHandlers = {};
    return {
      id: socketId || `sid-${userId}`,
      request: { session: { userId } },
      disconnect: jest.fn(),
      on: jest.fn((event, handler) => { socketOnHandlers[event] = handler; }),
      _handlers: socketOnHandlers,
    };
  }

  function setupWithSockets(...userIdSocketIdPairs) {
    initSocketIO({});
    const [[, connectionHandler]] = mockIoOn.mock.calls;
    const sockets = userIdSocketIdPairs.map(([userId, socketId]) => {
      const sock = makeSocket(userId, socketId);
      connectionHandler(sock);
      return sock;
    });
    return sockets;
  }

  it('emits the payload to every socket registered for the userId', () => {
    const userId = uid();
    setupWithSockets([userId, 'sid-a'], [userId, 'sid-b']);

    const payload = { photoId: 1, tags: ['paris'] };
    notifyUser(userId, payload);

    expect(mockTo).toHaveBeenCalledWith('sid-a');
    expect(mockTo).toHaveBeenCalledWith('sid-b');
    expect(mockToEmit).toHaveBeenCalledTimes(2);
    expect(mockToEmit).toHaveBeenCalledWith('identification-complete', payload);
  });

  it('uses the default event name "identification-complete"', () => {
    const userId = uid();
    setupWithSockets([userId, `sid-${userId}`]);

    notifyUser(userId, { photoId: 99, tags: [] });

    expect(mockToEmit).toHaveBeenCalledWith('identification-complete', expect.any(Object));
  });

  it('coerces string userId to Number when looking up sockets', () => {
    const userId = uid();
    // Socket registered with numeric userId
    setupWithSockets([userId, `sid-${userId}`]);

    // Called with string version (as it arrives from the worker POST handler)
    notifyUser(String(userId), { photoId: 1, tags: [] });

    expect(mockTo).toHaveBeenCalledWith(`sid-${userId}`);
    expect(mockToEmit).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no sockets are registered for the userId', () => {
    initSocketIO({});
    expect(() => notifyUser(uid(), { photoId: 1 })).not.toThrow();
    expect(mockTo).not.toHaveBeenCalled();
  });

  it('is a no-op when io is not initialised but sockets are registered (hits !io branch)', () => {
    const userId = uid();
    _resetForTesting();                          // io = undefined, userSockets empty
    _registerSocketForTesting(userId, 'sock-1'); // userSockets has entry, io is still undefined
    expect(() => notifyUser(userId, { photoId: 1 })).not.toThrow();
    expect(mockTo).not.toHaveBeenCalled();       // nothing emitted
  });
});
