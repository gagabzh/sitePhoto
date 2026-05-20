'use strict';

const { parseGpx } = require('../gpxParse');

const VALID_GPX_WITH_TIMES = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="48.0" lon="2.0"><time>2024-01-01T10:00:00Z</time></trkpt>
      <trkpt lat="48.1" lon="2.1"><time>2024-01-01T11:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const VALID_GPX_NO_TIMES = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="48.0" lon="2.0"></trkpt>
      <trkpt lat="48.1" lon="2.1"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const MULTI_SEGMENT_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="48.0" lon="2.0"></trkpt>
      <trkpt lat="48.1" lon="2.1"></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="49.0" lon="3.0"></trkpt>
      <trkpt lat="49.1" lon="3.1"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const WAYPOINT_ONLY_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="48.0" lon="2.0"><name>Summit</name></wpt>
</gpx>`;

describe('parseGpx', () => {
  describe('valid GPX with track', () => {
    it('returns a GeoJSON FeatureCollection', () => {
      const { geojson } = parseGpx(VALID_GPX_WITH_TIMES);
      expect(geojson).toBeDefined();
      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features.length).toBeGreaterThan(0);
    });

    it('counts trackpoints correctly', () => {
      const { trackpoints } = parseGpx(VALID_GPX_WITH_TIMES);
      expect(trackpoints).toBe(2);
    });

    it('calculates positive distance between two points (~13.4 km)', () => {
      const { distanceKm } = parseGpx(VALID_GPX_WITH_TIMES);
      expect(distanceKm).toBeCloseTo(13.4, 0);
    });

    it('calculates duration in minutes from timestamps', () => {
      const { durationMin } = parseGpx(VALID_GPX_WITH_TIMES);
      expect(durationMin).toBe(60);
    });

    it('returns null durationMin when no timestamps', () => {
      const { durationMin, distanceKm } = parseGpx(VALID_GPX_NO_TIMES);
      expect(durationMin).toBeNull();
      expect(distanceKm).toBeGreaterThan(0);
    });

    it('rounds distanceKm to one decimal place', () => {
      const { distanceKm } = parseGpx(VALID_GPX_WITH_TIMES);
      expect(distanceKm).toBe(Math.round(distanceKm * 10) / 10);
    });
  });

  describe('multi-segment track', () => {
    it('accumulates coords from all segments', () => {
      const { trackpoints, distanceKm } = parseGpx(MULTI_SEGMENT_GPX);
      expect(trackpoints).toBe(4);
      expect(distanceKm).toBeGreaterThan(0);
    });
  });

  describe('GPX without track lines', () => {
    it('returns null distanceKm, durationMin and zero trackpoints', () => {
      const result = parseGpx(WAYPOINT_ONLY_GPX);
      expect(result.distanceKm).toBeNull();
      expect(result.durationMin).toBeNull();
      expect(result.trackpoints).toBe(0);
    });

    it('still returns a GeoJSON object', () => {
      const { geojson } = parseGpx(WAYPOINT_ONLY_GPX);
      expect(geojson).toBeDefined();
    });
  });
});
