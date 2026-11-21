import * as L from 'leaflet';
import { normalizeEuropeanGeoJson } from './european-alerts';

/** Optional HTTPS / HA-local GeoJSON feed. No API keys in frontend code. */
export class EuropeanAlertsLayer {
  private layer: L.GeoJSON | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(private map: L.Map, private url: string) {}

  start(): void { this.disposed = false; void this.refresh(); }

  clear(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    if (this.layer) this.map.removeLayer(this.layer);
    this.layer = null;
  }

  private async refresh(): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const res = await fetch(this.url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`Warnings feed HTTP ${res.status}`);
      const warnings = normalizeEuropeanGeoJson(await res.json())
        .filter((w) => !!w.geometry);
      if (controller.signal.aborted || this.disposed) return;
      const features: GeoJSON.Feature[] = warnings.map((w) => ({
        type: 'Feature',
        properties: { title: w.title, description: w.description, level: w.level },
        geometry: w.geometry!,
      }));
      const group = L.geoJSON(({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection), {
        style: (feature) => {
          const level = feature?.properties?.level;
          const color = level === 'red' ? '#d32f2f' : level === 'orange' ? '#ef6c00' : level === 'yellow' ? '#fbc02d' : '#607d8b';
          return { color, weight: 2, fillColor: color, fillOpacity: 0.25 };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          const node = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = String(p.title || 'Weather warning');
          node.appendChild(title);
          if (p.description) {
            const desc = document.createElement('p');
            desc.textContent = String(p.description);
            node.appendChild(desc);
          }
          layer.bindPopup(node);
        },
      });
      if (this.layer) this.map.removeLayer(this.layer);
      this.layer = group.addTo(this.map);
    } catch (e) {
      if (!controller.signal.aborted) console.warn('[Weather Radar Card] European warnings:', e);
    } finally {
      if (!controller.signal.aborted && !this.disposed) {
        this.timer = setTimeout(() => void this.refresh(), 5 * 60 * 1000);
      }
    }
  }
}
