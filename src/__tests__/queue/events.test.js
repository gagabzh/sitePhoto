'use strict';

// Mock BullMQ before requiring the events module.
// jest.resetAllMocks() wipes mockImplementation, so we re-apply it in
// beforeEach so each test gets a fresh instance with its own on() spy.
jest.mock('bullmq', () => ({
  QueueEvents: jest.fn(),
}));

// Mock instance-lifecycle to isolate from OVH API calls.
jest.mock('../../instance-lifecycle', () => ({ onQueueDrained: jest.fn() }));

const { QueueEvents } = require('bullmq');
const { onQueueDrained } = require('../../instance-lifecycle');
const { startQueueEvents } = require('../../queue/events');

// Capture the QueueEvents constructor call made at module load time
// (if any — events.js defers construction to startQueueEvents(), so none).
// Re-apply the mock implementation before every test so resetAllMocks() does
// not leave QueueEvents returning undefined.
let lastInstance;

beforeEach(() => {
  QueueEvents.mockImplementation(() => {
    const instance = { on: jest.fn() };
    lastInstance = instance;
    return instance;
  });
});

afterEach(() => {
  jest.resetAllMocks();
});

// ── startQueueEvents ──────────────────────────────────────────────────────────

describe('startQueueEvents()', () => {
  it('constructs a QueueEvents instance for the "identification" queue', () => {
    startQueueEvents();
    expect(QueueEvents).toHaveBeenCalledWith(
      'identification',
      expect.objectContaining({ connection: expect.any(Object) }),
    );
  });

  it('registers a "drained" event listener that calls onQueueDrained', () => {
    startQueueEvents();
    const instance = lastInstance;

    // Find the "drained" listener registered via on()
    const drainedCall = instance.on.mock.calls.find(([event]) => event === 'drained');
    expect(drainedCall).toBeDefined();

    // Invoke the listener and verify it delegates to onQueueDrained
    const drainedHandler = drainedCall[1];
    drainedHandler();
    expect(onQueueDrained).toHaveBeenCalledTimes(1);
  });

  it('registers an "error" event listener', () => {
    startQueueEvents();
    const instance = lastInstance;

    const errorCall = instance.on.mock.calls.find(([event]) => event === 'error');
    expect(errorCall).toBeDefined();
  });

  it('"error" listener does not throw when called with an error', () => {
    startQueueEvents();
    const instance = lastInstance;

    const errorCall = instance.on.mock.calls.find(([event]) => event === 'error');
    const errorHandler = errorCall[1];
    expect(() => errorHandler(new Error('Redis went away'))).not.toThrow();
  });

  it('returns the QueueEvents instance', () => {
    const result = startQueueEvents();
    expect(result).toBe(lastInstance);
  });
});
