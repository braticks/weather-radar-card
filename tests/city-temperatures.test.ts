import { describe, it, expect } from 'vitest';
import { latestTemperature } from '../src/city-temperatures-layer';

describe('Meteo.lt measured city temperatures', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  it('selects the newest actual measurement', () => {
    expect(latestTemperature([
      { observationTimeUtc: '2026-10-24 10:00:00', airTemperature: 4.2 },
      { observationTimeUtc: '2026-10-24 11:00:00', airTemperature: 5.1 },
    ], now)?.airTemperature).toBe(5.1);
  });
  it('does not display old or missing temperatures', () => {
    expect(latestTemperature([{ observationTimeUtc: '2026-10-24 08:00:00', airTemperature: 5 }], now)).toBeNull();
    expect(latestTemperature([{ observationTimeUtc: '2026-10-24 11:00:00', airTemperature: null }], now)).toBeNull();
  });
});
