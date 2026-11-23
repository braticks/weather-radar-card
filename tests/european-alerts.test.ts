import { describe, expect, it } from 'vitest';
import { normalizeEuropeanGeoJson, normalizeAwarenessLevel } from '../src/european-alerts';

const geometry = {
  type: 'Polygon',
  coordinates: [[[21.0, 55.0], [22.0, 55.0], [22.0, 56.0], [21.0, 55.0]]],
};

describe('European warnings', () => {
  it('maps MeteoAlarm severity to correct colors', () => {
    expect(normalizeAwarenessLevel('2')).toBe('yellow');
    expect(normalizeAwarenessLevel('3')).toBe('orange');
    expect(normalizeAwarenessLevel('4')).toBe('red');
    expect(normalizeAwarenessLevel('Severe')).toBe('orange');
  });

  it('keeps active region polygons', () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    const result = normalizeEuropeanGeoJson({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'LT001',
        geometry,
        properties: { alertId: 'LT001', awareness_level: '3', headline: 'Vejas', expires },
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('orange');
    expect(result[0].geometry?.type).toBe('Polygon');
  });

  it('hides expired or invalid timestamps', () => {
    const result = normalizeEuropeanGeoJson({
      type: 'FeatureCollection',
      features: [
        { id: 'old', geometry, properties: { expires: '2020-01-01T00:00:00Z' } },
        { id: 'bad', geometry, properties: { expires: 'not-a-date' } },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it('rejects features without IDs and unexpected geometry', () => {
    const result = normalizeEuropeanGeoJson({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry, properties: {} },
        { type: 'Feature', id: 'point', geometry: { type: 'Point', coordinates: [22, 55] }, properties: {} },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].geometry).toBeUndefined();
  });
});
