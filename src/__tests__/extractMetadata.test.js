jest.mock('exifr', () => ({ parse: jest.fn() }));

const exifr = require('exifr');
const { extractMetadata } = require('../extractMetadata');

beforeEach(() => jest.clearAllMocks());

describe('extractMetadata', () => {
  it('returns takenAt, exposureTime, and focalLength from EXIF', async () => {
    exifr.parse.mockResolvedValue({
      DateTimeOriginal: new Date('2024-06-15T10:30:00Z'),
      ExposureTime: 1 / 250,
      FocalLength: 50,
    });

    const result = await extractMetadata('/some/photo.jpg');

    expect(result.takenAt).toEqual(new Date('2024-06-15T10:30:00Z'));
    expect(result.exposureTime).toBe('1/250');
    expect(result.focalLength).toBe(50);
  });

  it('formats exposure >= 1s as "N s"', async () => {
    exifr.parse.mockResolvedValue({ ExposureTime: 2 });
    const result = await extractMetadata('/some/photo.jpg');
    expect(result.exposureTime).toBe('2 s');
  });

  it('returns empty object when exifr returns undefined', async () => {
    exifr.parse.mockResolvedValue(undefined);
    const result = await extractMetadata('/some/photo.jpg');
    expect(result).toEqual({});
  });

  it('returns empty object when exifr throws', async () => {
    exifr.parse.mockRejectedValue(new Error('parse error'));
    const result = await extractMetadata('/some/photo.jpg');
    expect(result).toEqual({});
  });

  it('returns null for takenAt when DateTimeOriginal is not a Date', async () => {
    exifr.parse.mockResolvedValue({ DateTimeOriginal: 'not-a-date', FocalLength: 35 });
    const result = await extractMetadata('/some/photo.jpg');
    expect(result.takenAt).toBeNull();
    expect(result.focalLength).toBe(35);
  });
});
