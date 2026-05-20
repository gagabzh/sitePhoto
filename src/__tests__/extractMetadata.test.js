jest.mock('exifr', () => ({ parse: jest.fn(), gps: jest.fn() }));

const exifr = require('exifr');
const { extractMetadata } = require('../extractMetadata');

beforeEach(() => {
  jest.resetAllMocks();
  exifr.gps.mockResolvedValue(null);
});

describe('extractMetadata', () => {
  it('returns takenAt, exposureTime, focalLength, and GPS from EXIF', async () => {
    exifr.parse.mockResolvedValue({
      DateTimeOriginal: new Date('2024-06-15T10:30:00Z'),
      ExposureTime: 1 / 250,
      FocalLength: 50,
    });
    exifr.gps.mockResolvedValue({ latitude: 48.8566, longitude: 2.3522 });

    const result = await extractMetadata('/some/photo.jpg');

    expect(result.takenAt).toEqual(new Date('2024-06-15T10:30:00Z'));
    expect(result.exposureTime).toBe('1/250');
    expect(result.focalLength).toBe(50);
    expect(result.latitude).toBeCloseTo(48.8566);
    expect(result.longitude).toBeCloseTo(2.3522);
  });

  it('returns no GPS fields when exifr.gps returns undefined', async () => {
    exifr.parse.mockResolvedValue({});
    exifr.gps.mockResolvedValue(undefined);
    const result = await extractMetadata('/some/photo.jpg');
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
  });

  it('returns no GPS fields when exifr.gps returns null coords (GPS tag present but no fix)', async () => {
    exifr.parse.mockResolvedValue({});
    exifr.gps.mockResolvedValue({ latitude: null, longitude: null });
    const result = await extractMetadata('/some/photo.jpg');
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
  });

  it('returns no GPS fields when exifr.gps returns NaN coords (corrupted GPS tag)', async () => {
    exifr.parse.mockResolvedValue({});
    exifr.gps.mockResolvedValue({ latitude: NaN, longitude: NaN });
    const result = await extractMetadata('/some/photo.jpg');
    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
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
