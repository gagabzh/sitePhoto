'use strict';

// Mock BullMQ before requiring producer so the module-level `new Queue()`
// receives the mock constructor.
const mockAdd = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd })),
}));

// Mock instance-lifecycle so tests don't trigger OVH API calls.
jest.mock('../../instance-lifecycle', () => ({ onJobAdded: jest.fn() }));

const { Queue } = require('bullmq');
const { onJobAdded } = require('../../instance-lifecycle');
const { addIdentificationJob, addDescribePersonJob } = require('../../queue/producer');

afterEach(() => {
  jest.resetAllMocks();
});

// ── addIdentificationJob ──────────────────────────────────────────────────────

describe('addIdentificationJob()', () => {
  it('calls queue.add with job name "identify-photo" and the given payload', async () => {
    const fakeJob = { id: '1', name: 'identify-photo' };
    mockAdd.mockResolvedValueOnce(fakeJob);

    const payload = { photoId: 42, userId: 7, photoS3Key: 'photos/42.jpg' };
    const result = await addIdentificationJob(payload);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'identify-photo',
      payload,
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
    expect(result).toBe(fakeJob);
  });

  it('calls onJobAdded after successfully enqueuing the job', async () => {
    mockAdd.mockResolvedValueOnce({ id: '2' });
    await addIdentificationJob({ photoId: 1, userId: 1, photoS3Key: 'photos/1.jpg' });
    expect(onJobAdded).toHaveBeenCalledTimes(1);
  });

  it('propagates the error when queue.add rejects', async () => {
    mockAdd.mockRejectedValueOnce(new Error('Redis connection refused'));
    await expect(
      addIdentificationJob({ photoId: 1, userId: 1, photoS3Key: 'photos/1.jpg' }),
    ).rejects.toThrow('Redis connection refused');
  });

  it('does not call onJobAdded when queue.add rejects', async () => {
    mockAdd.mockRejectedValueOnce(new Error('queue failure'));
    await expect(
      addIdentificationJob({ photoId: 1, userId: 1, photoS3Key: 'photos/1.jpg' }),
    ).rejects.toThrow();
    expect(onJobAdded).not.toHaveBeenCalled();
  });
});

// ── addDescribePersonJob ──────────────────────────────────────────────────────

describe('addDescribePersonJob()', () => {
  it('calls queue.add with job name "describe-person" and the given payload', async () => {
    const fakeJob = { id: '3', name: 'describe-person' };
    mockAdd.mockResolvedValueOnce(fakeJob);

    const payload = { tagId: 5, tagName: 'alice', photoFilenames: ['a.jpg', 'b.jpg'], userId: 7 };
    const result = await addDescribePersonJob(payload);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'describe-person',
      payload,
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
    expect(result).toBe(fakeJob);
  });

  it('calls onJobAdded after successfully enqueuing the job', async () => {
    mockAdd.mockResolvedValueOnce({ id: '4' });
    await addDescribePersonJob({ tagId: 1, tagName: 'bob', photoFilenames: [], userId: 2 });
    expect(onJobAdded).toHaveBeenCalledTimes(1);
  });

  it('propagates the error when queue.add rejects', async () => {
    mockAdd.mockRejectedValueOnce(new Error('BullMQ unavailable'));
    await expect(
      addDescribePersonJob({ tagId: 1, tagName: 'bob', photoFilenames: [], userId: 2 }),
    ).rejects.toThrow('BullMQ unavailable');
  });

  it('does not call onJobAdded when queue.add rejects', async () => {
    mockAdd.mockRejectedValueOnce(new Error('queue failure'));
    await expect(
      addDescribePersonJob({ tagId: 1, tagName: 'bob', photoFilenames: [], userId: 2 }),
    ).rejects.toThrow();
    expect(onJobAdded).not.toHaveBeenCalled();
  });
});

// ── Queue construction ────────────────────────────────────────────────────────
// The Queue constructor is called at module load time (not inside a function),
// so we capture the call record immediately after require() above, before any
// afterEach(resetAllMocks) clears it.

const queueConstructorCalls = Queue.mock.calls.slice();

describe('Queue construction', () => {
  it('constructs a Queue named "identification"', () => {
    expect(queueConstructorCalls.length).toBeGreaterThanOrEqual(1);
    const [name, opts] = queueConstructorCalls[0];
    expect(name).toBe('identification');
    expect(opts).toEqual(expect.objectContaining({ connection: expect.any(Object) }));
  });
});
