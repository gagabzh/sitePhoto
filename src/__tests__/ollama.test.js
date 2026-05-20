jest.mock('http');

const http = require('http');
const { generate } = require('../ollama');

function makeReq() {
  const req = {
    write: jest.fn(),
    end: jest.fn(),
    setTimeout: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
  };
  return req;
}

function makeRes(body, statusCode = 200) {
  return {
    statusCode,
    on: jest.fn((event, cb) => {
      if (event === 'data') cb(body);
      if (event === 'end') cb();
    }),
  };
}

beforeEach(() => jest.resetAllMocks());

describe('generate', () => {
  it('resolves with parsed JSON on success', async () => {
    const req = makeReq();
    http.request.mockImplementation((_, cb) => { cb(makeRes('{"response":"hello"}')); return req; });

    const result = await generate({ prompt: 'hi', images: [] });
    expect(result).toEqual({ response: 'hello' });
    expect(req.write).toHaveBeenCalled();
    expect(req.end).toHaveBeenCalled();
  });

  it('rejects with a descriptive error when the connection fails', async () => {
    const req = makeReq();
    req.on.mockImplementation((event, cb) => { if (event === 'error') cb(new Error('ECONNREFUSED')); });
    http.request.mockReturnValue(req);

    await expect(generate({ prompt: 'hi' })).rejects.toThrow('Ollama unreachable: ECONNREFUSED');
  });

  it('rejects when Ollama returns invalid JSON', async () => {
    const req = makeReq();
    http.request.mockImplementation((_, cb) => { cb(makeRes('not-json')); return req; });

    await expect(generate({ prompt: 'hi' })).rejects.toThrow('Ollama: invalid JSON');
  });

  it('destroys the request and rejects on timeout', async () => {
    const req = makeReq();
    req.setTimeout.mockImplementation((_, cb) => cb()); // fire immediately
    http.request.mockReturnValue(req);

    await expect(generate({ prompt: 'hi' })).rejects.toThrow('timed out');
    expect(req.destroy).toHaveBeenCalled();
  });

  it('rejects with Ollama error message on non-2xx status', async () => {
    const req = makeReq();
    http.request.mockImplementation((_, cb) => {
      cb(makeRes('{"error":"model \'llava\' not found"}', 404));
      return req;
    });

    await expect(generate({ prompt: 'hi' })).rejects.toThrow("model 'llava' not found");
  });

  it('includes images in the request payload', async () => {
    const req = makeReq();
    http.request.mockImplementation((_, cb) => { cb(makeRes('{"response":"ok"}')); return req; });

    await generate({ prompt: 'p', images: ['abc123'] });
    const [sentPayload] = req.write.mock.calls[0];
    expect(JSON.parse(sentPayload).images).toEqual(['abc123']);
  });
});
