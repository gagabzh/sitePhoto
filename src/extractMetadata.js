const exifr = require('exifr');

function formatExposureTime(value) {
  if (value == null) return null;
  if (value >= 1) return `${value} s`;
  const denom = Math.round(1 / value);
  return `1/${denom}`;
}

async function extractMetadata(filepath) {
  try {
    const data = await exifr.parse(filepath, ['DateTimeOriginal', 'ExposureTime', 'FocalLength']);
    if (!data) return {};
    return {
      takenAt:      data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : null,
      exposureTime: formatExposureTime(data.ExposureTime),
      focalLength:  data.FocalLength != null ? data.FocalLength : null,
    };
  } catch {
    return {};
  }
}

module.exports = { extractMetadata };
