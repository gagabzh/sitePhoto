const { isEnabled, onJobAdded, onQueueDrained, _resetForTesting } = require('../instance-lifecycle');

const PROJECT = 'proj-123';
const INSTANCE_ID = 'inst-456';
const OVH_TIME_URL = 'https://eu.api.ovh.com/1.0/auth/time';

// Flush microtask queue. Each await in an async chain consumes one tick;
// the deepest path here is ~15 levels (ovhTimestamp × 2 awaits → ovhRequest
// × 2 → getStatus → unshelveIfNeeded × 2 → POST path). 30 gives a 2× safety
// margin — if the chain grows deeper and tests start failing, raise this.
const flushPromises = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

// Build a minimal fetch mock: time endpoint returns current unix seconds;
// GET instance returns given status; POST succeeds silently.
function buildFetchMock(status) {
  return jest.fn((url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (url === OVH_TIME_URL) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(Math.floor(Date.now() / 1000)) });
    }
    if (method === 'GET') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status }) });
    }
    return Promise.resolve({ ok: true });
  });
}

beforeEach(() => {
  // doNotFake nextTick so flushPromises() works while setTimeout is still faked
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
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
  delete global.fetch;
  ['OVH_APP_KEY', 'OVH_APP_SECRET', 'OVH_CONSUMER_KEY', 'OVH_PROJECT_ID', 'INSTANCE2_ID', 'INSTANCE2_IDLE_MINUTES']
    .forEach(k => delete process.env[k]);
});

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
    global.fetch = jest.fn();
    onJobAdded();
    await flushPromises();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not call unshelve when instance is ACTIVE', async () => {
    global.fetch = buildFetchMock('ACTIVE');
    onJobAdded();
    await flushPromises();
    const postCalls = global.fetch.mock.calls.filter(([, o]) => o && o.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('unshelves when instance is SHELVED_OFFLOADED', async () => {
    global.fetch = buildFetchMock('SHELVED_OFFLOADED');
    onJobAdded();
    await flushPromises();
    const unshelveCalls = global.fetch.mock.calls.filter(([u, o]) => o && o.method === 'POST' && u.includes('/unshelve'));
    expect(unshelveCalls).toHaveLength(1);
  });

  it('skips unshelve when instance is already UNSHELVING', async () => {
    global.fetch = buildFetchMock('UNSHELVING');
    onJobAdded();
    await flushPromises();
    const postCalls = global.fetch.mock.calls.filter(([, o]) => o && o.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('fires unshelve only once when two jobs arrive before cache is warm', async () => {
    global.fetch = buildFetchMock('SHELVED_OFFLOADED');
    onJobAdded();
    onJobAdded();
    await flushPromises();
    const unshelveCalls = global.fetch.mock.calls.filter(([u, o]) => o && o.method === 'POST' && u.includes('/unshelve'));
    expect(unshelveCalls).toHaveLength(1);
  });

  it('cancels pending idle timer when a new job arrives', async () => {
    global.fetch = buildFetchMock('ACTIVE');
    onQueueDrained();
    onJobAdded();
    await flushPromises();
    await jest.runAllTimersAsync();
    const shelveCalls = global.fetch.mock.calls.filter(([u, o]) => o && o.method === 'POST' && u.includes('/shelve'));
    expect(shelveCalls).toHaveLength(0);
  });
});

describe('onQueueDrained()', () => {
  it('is a no-op when lifecycle is disabled', async () => {
    delete process.env.INSTANCE2_ID;
    global.fetch = jest.fn();
    onQueueDrained();
    await jest.runAllTimersAsync();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shelves instance after idle timeout when instance is ACTIVE', async () => {
    global.fetch = buildFetchMock('ACTIVE');
    onQueueDrained();
    await jest.runAllTimersAsync();
    const shelveCalls = global.fetch.mock.calls.filter(([u, o]) => o && o.method === 'POST' && u.includes('/shelve'));
    expect(shelveCalls).toHaveLength(1);
  });

  it('does not shelve when instance is already SHELVED_OFFLOADED', async () => {
    global.fetch = buildFetchMock('SHELVED_OFFLOADED');
    onQueueDrained();
    await jest.runAllTimersAsync();
    const postCalls = global.fetch.mock.calls.filter(([, o]) => o && o.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });
});

describe('error handling', () => {
  it('swallows fetch errors in onJobAdded without throwing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    expect(() => onJobAdded()).not.toThrow();
    await flushPromises();
  });

  it('swallows OVH error responses in shelveInstance without throwing', async () => {
    global.fetch = jest.fn((url) => {
      if (url === OVH_TIME_URL) return Promise.resolve({ ok: true, json: () => Promise.resolve(Math.floor(Date.now() / 1000)) });
      if (url.includes('/shelve')) return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('service unavailable') });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ACTIVE' }) });
    });
    onQueueDrained();
    await jest.runAllTimersAsync();
    // No unhandled rejection — passes if we reach here
  });
});
