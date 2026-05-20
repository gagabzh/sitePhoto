jest.mock('sharp', () => jest.fn());
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    stat: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
}));

const sharp = require('sharp');
const fs = require('fs');
const { optimizePhoto } = require('../imageOptimizer');

const MB = 1024 * 1024;
const SMALL = 500 * 1024;  // 500 KB — under the 2 MB threshold
const LARGE = 3 * MB;      // 3 MB  — over the threshold

let pipeline;

beforeEach(() => {
  jest.resetAllMocks();
  pipeline = {
    resize:   jest.fn().mockReturnThis(),
    jpeg:     jest.fn().mockReturnThis(),
    webp:     jest.fn().mockReturnThis(),
    png:      jest.fn().mockReturnThis(),
    toBuffer: jest.fn(),
  };
  sharp.mockReturnValue(pipeline);
});

describe('GIF — skipped', () => {
  it('does not call sharp and returns original size', async () => {
    fs.promises.stat.mockResolvedValue({ size: LARGE });
    const result = await optimizePhoto('/img.gif', 'image/gif');
    expect(sharp).not.toHaveBeenCalled();
    expect(result).toBe(LARGE);
  });
});

describe('JPEG under threshold', () => {
  it('resizes but does not apply quality compression', async () => {
    fs.promises.stat.mockResolvedValue({ size: SMALL });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(SMALL - 1024));

    await optimizePhoto('/img.jpg', 'image/jpeg');

    expect(pipeline.resize).toHaveBeenCalledWith(1920, null, expect.any(Object));
    expect(pipeline.jpeg).not.toHaveBeenCalled();
  });

  it('writes file when optimized buffer is smaller', async () => {
    fs.promises.stat.mockResolvedValue({ size: SMALL });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(SMALL - 1024));

    const result = await optimizePhoto('/img.jpg', 'image/jpeg');

    expect(fs.promises.writeFile).toHaveBeenCalledWith('/img.jpg', expect.any(Buffer));
    expect(result).toBe(SMALL - 1024);
  });

  it('does not overwrite when buffer is larger than original', async () => {
    fs.promises.stat.mockResolvedValue({ size: SMALL });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(SMALL + 1024));

    const result = await optimizePhoto('/img.jpg', 'image/jpeg');

    expect(fs.promises.writeFile).not.toHaveBeenCalled();
    expect(result).toBe(SMALL);
  });
});

describe('JPEG over threshold', () => {
  it('applies quality 75 compression', async () => {
    fs.promises.stat.mockResolvedValue({ size: LARGE });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(LARGE - MB));

    await optimizePhoto('/img.jpg', 'image/jpeg');

    expect(pipeline.jpeg).toHaveBeenCalledWith({ quality: 75 });
  });

  it('writes the compressed buffer and returns new size', async () => {
    fs.promises.stat.mockResolvedValue({ size: LARGE });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(LARGE - MB));

    const result = await optimizePhoto('/img.jpg', 'image/jpeg');

    expect(fs.promises.writeFile).toHaveBeenCalled();
    expect(result).toBe(LARGE - MB);
  });
});

describe('WebP over threshold', () => {
  it('applies quality 75 compression', async () => {
    fs.promises.stat.mockResolvedValue({ size: LARGE });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(LARGE - MB));

    await optimizePhoto('/img.webp', 'image/webp');

    expect(pipeline.webp).toHaveBeenCalledWith({ quality: 75 });
  });
});

describe('PNG over threshold', () => {
  it('applies maximum PNG compression level', async () => {
    fs.promises.stat.mockResolvedValue({ size: LARGE });
    pipeline.toBuffer.mockResolvedValue(Buffer.alloc(LARGE - MB));

    await optimizePhoto('/img.png', 'image/png');

    expect(pipeline.png).toHaveBeenCalledWith({ compressionLevel: 9 });
  });
});
