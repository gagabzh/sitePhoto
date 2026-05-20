const { DOMParser } = require('@xmldom/xmldom');
const { gpx } = require('@tmcw/togeojson');

const EARTH_R = 6371;

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.asin(Math.sqrt(a));
}

function parseGpx(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  const fc = gpx(doc);

  const lineFeatures = fc.features.filter(
    f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
  );

  if (!lineFeatures.length) {
    return { geojson: fc, distanceKm: null, durationMin: null, trackpoints: 0 };
  }

  let coords = [];
  for (const f of lineFeatures) {
    if (f.geometry.type === 'LineString') coords = coords.concat(f.geometry.coordinates);
    else for (const seg of f.geometry.coordinates) coords = coords.concat(seg);
  }

  let distanceKm = 0;
  for (let i = 1; i < coords.length; i++) distanceKm += haversineKm(coords[i - 1], coords[i]);

  let durationMin = null;
  const times = lineFeatures.flatMap(f => f.properties?.coordinateProperties?.times || []).flat();
  if (times.length >= 2) {
    const t0 = new Date(times[0]).getTime();
    const t1 = new Date(times[times.length - 1]).getTime();
    if (!isNaN(t0) && !isNaN(t1) && t1 > t0) durationMin = Math.round((t1 - t0) / 60000);
  }

  return {
    geojson: fc,
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMin,
    trackpoints: coords.length,
  };
}

module.exports = { parseGpx };
