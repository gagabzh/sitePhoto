// Use a plain function (not jest.fn()) so jest.resetAllMocks() does NOT clear the
// factory — if it were a jest.fn(), resetAllMocks would wipe its implementation
// and ovh({...}) would return undefined, silently breaking all lifecycle calls.
let mockRequest;
jest.mock('ovh', () => function() { return { request: (...args) => mockRequest(...args) }; });

const { isEnabled, onJobAdded, onQueueDrained, _resetForTesting } = require('../instance-lifecycle');

const PROJECT = 'proj-123';
const INSTANCE_ID = 'inst-456';

// Flush microtask queue — needs 4 awaits to drain a 3-level Promise chain
const flushPromises = async () => {
  await Promise.resolve(); await Promise.resolve();
  await Promise.resolve(); await Promise.resolve();
};

beforeEach(() => {
  // doNotFake nextTick so flushPromises() works while setTimeout is still faked
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  mockRequest = jest.fn();
  _resetForTesting();

  process.env.OVH_APP_KEY = 'ak';
  process.env.OVH_APP_SECRET = 'as';
  process.env.OVH_CONSUMER_KEY = 'ck';
  process.env.OVH_PROJECT_ID = PROJECT;
  process.env.INSTANCE2_ID = INSTANCE_ID;
  process.env.INSTANCE2_IDLE_MINUTES = '10';
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
  ['OVH_APP_KEY', 'OVH_APP_SECRET', 'OVH_CONSUMER_KEY', 'OVH_PROJECT_ID', 'INSTANCE2_ID', 'INSTANCE2_IDLE_MINUTES']
    .forEach(k => delete process.env[k]);
});

// Helper: mock OVH request — GET returns given status, POST succeeds silently
function mockStatus(status) {
  mockRequest.mockImplementation((method, path, body, cb) => {
    if (method === 'GET') cb(null, { status });
    else cb(null, {});
  });
}

describe('isEnabled()', () => {
  it('returns true when all credentials are set', () => {
    expect(isEnabled()).toBe(true);
  });

  it('returns false when INSTANCE2_ID is missing', () => {
    delete process.env.INSTANCE2_ID;
    expect(isEnabled()).toBe(false);
  });

  it('returns false when OVH_APP_KEY is missing', () => {
    delete process.env.OVH_APP_KEY;
    expect(isEnabled()).toBe(false);
  });

  it('returns false when OVH_APP_SECRET is missing', () => {
    delete process.env.OVH_APP_SECRET;
    expect(isEnabled()).toBe(false);
  });

  it('returns false when OVH_CONSUMER_KEY is missing', () => {
    delete process.env.OVH_CONSUMER_KEY;
    expect(isEnabled()).toBe(false);
  });
});

describe('onJobAdded()', () => {
  it('is a no-op when lifecycle is disabled', async () => {
    delete process.env.INSTANCE2_ID;
    onJobAdded();
    await flushPromises();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does not call unshelve when instance is ACTIVE', async () => {
    mockStatus('ACTIVE');
    onJobAdded();
    await flushPromises();
    expect(mockRequest).toHaveBeenCalledTimes(1); // GET only
    expect(mockRequest).toHaveBeenCalledWith('GET', expect.stringContaining(INSTANCE_ID), expect.anything(), expect.any(Function));
  });

  it('unshelves when instance is SHELVED_OFFLOADED', async () => {
    mockStatus('SHELVED_OFFLOADED');
    onJobAdded();
    await flushPromises();
    expect(mockRequest).toHaveBeenCalledTimes(2); // GET + POST unshelve
    expect(mockRequest).toHaveBeenCalledWith('POST', expect.stringContaining('/unshelve'), expect.anything(), expect.any(Function));
  });

  it('skips unshelve when instance is already UNSHELVING', async () => {
    mockStatus('UNSHELVING');
    onJobAdded();
    await flushPromises();
    expect(mockRequest).toHaveBeenCalledTimes(1); // GET only
  });

  it('fires unshelve only once when two jobs arrive before cache is warm', async () => {
    mockStatus('SHELVED_OFFLOADED');
    // Simulate bulk upload: two concurrent onJobAdded() calls before the first
    // OVH GET completes and warms the cache.
    onJobAdded();
    onJobAdded();
    await flushPromises();
    const unshelveCalls = mockRequest.mock.calls.filter(([m, p]) => m === 'POST' && p.includes('/unshelve'));
    expect(unshelveCalls).toHaveLength(1);
  });

  it('cancels pending idle timer when a new job arrives', async () => {
    mockStatus('ACTIVE');
    onQueueDrained(); // starts idle timer
    onJobAdded();     // must cancel the timer
    await flushPromises();
    await jest.runAllTimersAsync();
    // No shelve POST should have fired
    const postCalls = mockRequest.mock.calls.filter(([m]) => m === 'POST');
    const shelveCalls = postCalls.filter(([, p]) => p.includes('/shelve'));
    expect(shelveCalls).toHaveLength(0);
  });
});

describe('onQueueDrained()', () => {
  it('is a no-op when lifecycle is disabled', () => {
    delete process.env.INSTANCE2_ID;
    onQueueDrained();
    jest.runAllTimers();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('shelves instance after idle timeout when instance is ACTIVE', async () => {
    mockStatus('ACTIVE');
    onQueueDrained();
    await jest.runAllTimersAsync(); // advance timers and drain resulting promises
    expect(mockRequest).toHaveBeenCalledWith('POST', expect.stringContaining('/shelve'), expect.anything(), expect.any(Function));
  });

  it('does not shelve when instance is already SHELVED_OFFLOADED', async () => {
    mockStatus('SHELVED_OFFLOADED');
    onQueueDrained();
    await jest.runAllTimersAsync();
    const postCalls = mockRequest.mock.calls.filter(([m]) => m === 'POST');
    expect(postCalls).toHaveLength(0);
  });
});

describe('error handling', () => {
  it('swallows OVH API errors in onJobAdded without throwing', async () => {
    mockRequest.mockImplementation((method, path, body, cb) => cb(new Error('OVH 403')));
    expect(() => onJobAdded()).not.toThrow();
    await flushPromises();
    // No unhandled rejection — test passes if we reach this line
  });

  it('swallows OVH API errors in shelveInstance without throwing', async () => {
    mockRequest.mockImplementation((method, path, body, cb) => cb(new Error('OVH 503')));
    onQueueDrained();
    await jest.runAllTimersAsync();
    // No unhandled rejection
  });
});
