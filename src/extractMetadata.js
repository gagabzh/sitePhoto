const exifr = require('exifr');

function formatExposureTime(value) {
  if (value == null) return null;
  if (value >= 1) return `${value} s`;
  const denom = Math.round(1 / value);
  return `1/${denom}`;
}

async function extractMetadata(filepath) {
  try {
    const [data, gps] = await Promise.all([
      exifr.parse(filepath, ['DateTimeOriginal', 'ExposureTime', 'FocalLength']),
      exifr.gps(filepath).catch(() => null),
    ]);
    const result = {};
    if (data) {
      result.takenAt      = data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : null;
      result.exposureTime = formatExposureTime(data.ExposureTime);
      result.focalLength  = data.FocalLength != null ? data.FocalLength : null;
    }
    if (gps && gps.latitude != null && gps.longitude != null) {
      result.latitude  = gps.latitude;
      result.longitude = gps.longitude;
    }
    return result;
  } catch {
    return {};
  }
}

module.exports = { extractMetadata };
