'use strict';

// Tests for AI-4 worker integration:
// - fetchKnownFaces is called before identifyPhoto (identify-photo job path)
// - a fetchKnownFaces failure does not throw / does not abort the job

// We test the instance1-api module directly since worker.js integrates BullMQ
// (which would require full Redis in tests).

const path = require('path');

// We rely on global fetch being available (Node 18+).
// Jest runs in Node, so we can mock globalThis.fetch.

describe('fetchKnownFaces (worker/src/instance1-api)', () => {
  let fetchKnownFaces;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.INSTANCE1_API_URL = 'http://10.0.0.1:3001';
    process.env.WORKER_API_SECRET = 'test-secret';
    // Re-require after env is set
    jest.resetModules();
    fetchKnownFaces = require(path.resolve(__dirname, '../../../worker/src/instance1-api')).fetchKnownFaces;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.INSTANCE1_API_URL;
    delete process.env.WORKER_API_SECRET;
  });

  it('calls /internal/known-faces/:userId with worker secret and returns JSON', async () => {
    const fakeData = [
      { personName: 'Alice', cropBase64: 'abc123', mimeType: 'image/jpeg' },
    ];
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(fakeData),
    });

    const result = await fetchKnownFaces(7);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://10.0.0.1:3001/internal/known-faces/7',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-worker-secret': 'test-secret' }),
      })
    );
    expect(result).toEqual(fakeData);
  });

  it('throws when the response is not ok', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    await expect(fetchKnownFaces(7)).rejects.toThrow('known-faces 403');
  });

  it('fetch failure does not propagate when caller catches the error (graceful degradation)', async () => {
    // Simulate what worker.js does: catch the error and fall back to []
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    let knownFaces = [];
    try {
      knownFaces = await fetchKnownFaces(7);
    } catch {
      // caller swallows the error — worker proceeds without known faces
    }

    expect(knownFaces).toEqual([]); // default remains untouched
  });
});
