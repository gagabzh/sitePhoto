const exifr = require('exifr');

function formatExposureTime(value) {
  if (value == null) return null;
  if (value >= 1) return `${value} s`;
  const denom = Math.round(1 / value);
  return `1/${denom}`;
}

// Accepts a file path string or a Buffer — exifr handles both.
async function extractMetadata(source) {
  try {
    const [data, gps] = await Promise.all([
      exifr.parse(source, ['DateTimeOriginal', 'ExposureTime', 'FocalLength']),
      exifr.gps(source).catch(() => null),
    ]);
    const result = {};
    if (data) {
      result.takenAt      = data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : null;
      result.exposureTime = formatExposureTime(data.ExposureTime);
      result.focalLength  = data.FocalLength != null ? data.FocalLength : null;
    }
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      result.latitude  = gps.latitude;
      result.longitude = gps.longitude;
    }
    return result;
  } catch {
    return {};
  }
}

module.exports = { extractMetadata };
