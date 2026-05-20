jest.mock('sharp');

const sharp = require('sharp');
const { dHash, hammingDistance, findDuplicates } = require('../photoHash');

beforeEach(() => jest.resetAllMocks());

// Build a fake sharp chain that returns a 9×8 pixel buffer.
// `pixels` is a flat array of 72 grayscale values.
function mockSharp(pixels) {
  const chain = {
    resize: jest.fn().mockReturnThis(),
    grayscale: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue({ data: Buffer.from(pixels) }),
  };
  sharp.mockReturnValue(chain);
  return chain;
}

describe('dHash', () => {
  it('returns a BigInt', async () => {
    mockSharp(new Array(72).fill(128));
    const h = await dHash('/fake/photo.jpg');
    expect(typeof h).toBe('bigint');
  });

  it('sets bit when left pixel is brighter than right', async () => {
    // Row 0: pixel 0 = 200 (bright), pixel 1 = 100 (dark) → bit 0 should be 1
    const pixels = new Array(72).fill(128);
    pixels[0] = 200; pixels[1] = 100;
    mockSharp(pixels);
    const h = await dHash('/fake/photo.jpg');
    expect(h & 1n).toBe(1n);
  });

  it('clears bit when right pixel is brighter', async () => {
    const pixels = new Array(72).fill(128);
    pixels[0] = 50; pixels[1] = 200;
    mockSharp(pixels);
    const h = await dHash('/fake/photo.jpg');
    expect(h & 1n).toBe(0n);
  });
});

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance(0b1100n, 0b0011n)).toBe(4);
  });

  it('handles large 64-bit values', () => {
    const a = (1n << 63n) | 1n;
    const b = 0n;
    expect(hammingDistance(a, b)).toBe(2);
  });
});

describe('findDuplicates', () => {
  it('groups photos whose hashes are within maxDist', async () => {
    // Two calls: hash 0b00 and hash 0b01 → distance 1 → same group
    let call = 0;
    sharp.mockImplementation(() => ({
      resize: jest.fn().mockReturnThis(),
      grayscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        data: Buffer.from(call++ === 0
          ? [200, 100, ...new Array(70).fill(128)]  // hash bit 0 = 1
          : [100, 200, ...new Array(70).fill(128)]), // hash bit 0 = 0
      }),
    }));

    const photos = [
      { id: 1, filename: 'a.jpg', title: 'A' },
      { id: 2, filename: 'b.jpg', title: 'B' },
    ];
    const groups = await findDuplicates(photos, '/uploads', 10);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('returns no groups when all photos are distinct', async () => {
    let call = 0;
    sharp.mockImplementation(() => ({
      resize: jest.fn().mockReturnThis(),
      grayscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue({
        // Photo 1: pixels alternate 255,0,255,0... → every left > right → all bits 1 → hash ~= (1<<64)-1
        // Photo 2: pixels alternate 0,255,0,255... → every left < right → all bits 0 → hash = 0
        // Hamming distance = 64, which is >> any reasonable threshold
        data: Buffer.from(call++ === 0
          ? Array.from({ length: 72 }, (_, i) => (i % 2 === 0 ? 255 : 0))
          : Array.from({ length: 72 }, (_, i) => (i % 2 === 0 ? 0   : 255))),
      }),
    }));

    const photos = [
      { id: 1, filename: 'a.jpg', title: 'A' },
      { id: 2, filename: 'b.jpg', title: 'B' },
    ];
    const groups = await findDuplicates(photos, '/uploads', 10);
    expect(groups).toHaveLength(0);
  });

  it('skips photos that throw when hashing', async () => {
    sharp.mockImplementation(() => ({
      resize: jest.fn().mockReturnThis(),
      grayscale: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValue(new Error('unsupported format')),
    }));
    const photos = [{ id: 1, filename: 'bad.gif', title: 'Bad' }];
    const groups = await findDuplicates(photos, '/uploads');
    expect(groups).toHaveLength(0);
  });
});
