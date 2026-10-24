import * as L from 'leaflet';

export interface MeteoStation {
  code: string;
  name: string;
  coordinates: { latitude: number; longitude: number };
}
interface Observation {
  observationTimeUtc: string;
  airTemperature: number | null;
}
const API = 'https://api.meteo.lt/v1';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const REFRESH_MS = 15 * 60 * 1000;

export function latestTemperature(observations: Observation[], now = Date.now()): Observation | null {
  return observations
    .filter((o) => typeof o.airTemperature === 'number' && Number.isFinite(o.airTemperature)
      && Number.isFinite(Date.parse(o.observationTimeUtc + (/[zZ]|[+-]\d\d:\d\d$/.test(o.observationTimeUtc) ? '' : 'Z')))
      && now - Date.parse(o.observationTimeUtc + (/[zZ]|[+-]\d\d:\d\d$/.test(o.observationTimeUtc) ? '' : 'Z')) >= 0
      && now - Date.parse(o.observationTimeUtc + (/[zZ]|[+-]\d\d:\d\d$/.test(o.observationTimeUtc) ? '' : 'Z')) <= MAX_AGE_MS)
    .sort((a, b) => Date.parse(b.observationTimeUtc) - Date.parse(a.observationTimeUtc))[0] ?? null;
}

export class CityTemperaturesLayer {
  private markers = L.layerGroup();
  private timer: ReturnType<typeof setInterval> | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private map: L.Map, private stationCodes: string[]) {}
  start(): void {
    this.markers.addTo(this.map);
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }
  clear(): void {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.markers.clearLayers();
    this.map.removeLayer(this.markers);
  }
  private async refresh(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const gen = ++this.generation;
    try {
      const response = await fetch(API + '/stations', { signal: controller.signal });
      if (!response.ok) throw new Error('Station list ' + response.status);
      const stations = await response.json() as MeteoStation[];
      const selected = stations.filter((s) => this.stationCodes.includes(s.code));
      const results = await Promise.all(selected.map(async (station) => {
        try {
          const r = await fetch(API + '/stations/' + encodeURIComponent(station.code) + '/observations/latest', { signal: controller.signal });
          if (!r.ok) return null;
          const data = await r.json() as { observations: Observation[] };
          const obs = latestTemperature(data.observations ?? []);
          return obs ? { station, obs } : null;
        } catch { return null; }
      }));
      if (controller.signal.aborted || gen !== this.generation) return;
      this.markers.clearLayers();
      for (const result of results) {
        if (!result) continue;
        const { station, obs } = result;
        const { latitude, longitude } = station.coordinates;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const label = station.name.replace(/ meteorologijos stotis| AMS| automatinė meteorologijos stotis/gi, '').trim();
        const temp = (obs.airTemperature as number).toFixed(1).replace('.', ',');
        const html = '<div style="background:rgba(20,30,45,.82);color:#fff;border-radius:9px;padding:3px 7px;text-align:center;white-space:nowrap;font:600 12px sans-serif;box-shadow:0 1px 5px #0006"><div style="font-size:10px;font-weight:400">' + escapeText(label) + '</div>' + temp + '°C</div>';
        const icon = L.divIcon({ className: 'wrc-city-temperature', html, iconSize: [90, 40], iconAnchor: [45, 20] });
        L.marker([latitude, longitude], { icon, interactive: false, zIndexOffset: 900 }).addTo(this.markers);
      }
    } catch (err) {
      if (!controller.signal.aborted) console.warn('[weather-radar-card] City temperatures unavailable', err);
    }
  }
}
function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
}
