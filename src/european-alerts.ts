/**
 * MeteoAlarm Atom/CAP warning normalization for European overlays.
 *
 * Data source (Lithuania):
 * https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-lithuania
 *
 * This is a pure adapter. It deliberately does not assume that a browser can
 * fetch cross-origin Atom feeds (CORS), nor that Atom entries contain exact
 * polygons. Map integration must use a verified backend/proxy and geometries.
 */
export interface EuropeanWarning {
  id: string;
  title: string;
  description: string;
  level: 'yellow' | 'orange' | 'red' | 'unknown';
  published?: string;
  updated?: string;
  link?: string;
  /** Geographic shapes are NOT inferred from a text-only Atom entry. */
  geometry?: GeoJSON.Geometry;
}

export function normalizeAwarenessLevel(value: string | number | null | undefined): EuropeanWarning['level'] {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '2' || v === 'yellow' || v.includes('moderate')) return 'yellow';
  if (v === '3' || v === 'orange' || v.includes('severe')) return 'orange';
  if (v === '4' || v === 'red' || v.includes('extreme')) return 'red';
  return 'unknown';
}

export function parseMeteoalarmAtom(xml: string): EuropeanWarning[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Invalid MeteoAlarm Atom XML');
  const descendants = (parent: Element, local: string): Element | undefined =>
    Array.from(parent.children).find((el) => el.localName === local);
  const get = (parent: Element, local: string): string =>
    descendants(parent, local)?.textContent?.trim() ?? '';
  const entries = Array.from(document.getElementsByTagNameNS('*', 'entry'));
  return entries.map((entry) => {
    const id = get(entry, 'id');
    const title = get(entry, 'title');
    const description = get(entry, 'summary') || get(entry, 'content');
    const category = Array.from(entry.getElementsByTagNameNS('*', 'category'))
      .map((el) => el.getAttribute('term') || '')
      .join(' ');
    const level = normalizeAwarenessLevel(category + ' ' + title);
    const link = Array.from(entry.getElementsByTagNameNS('*', 'link'))
      .find((el) => el.getAttribute('rel') === 'alternate')?.getAttribute('href')
      || Array.from(entry.getElementsByTagNameNS('*', 'link'))[0]?.getAttribute('href')
      || undefined;
    return {
      id: id || link || title,
      title,
      description,
      level,
      published: get(entry, 'published') || undefined,
      updated: get(entry, 'updated') || undefined,
      link,
    };
  }).filter((entry) => entry.id && entry.title);
}

/** Convert an authenticated EDR/MeteoGate GeoJSON feature only if valid. */
export function normalizeEuropeanGeoJson(input: unknown): EuropeanWarning[] {
  if (!input || typeof input !== 'object' || !('features' in input)) return [];
  const raw = (input as { features?: unknown }).features;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((feature): EuropeanWarning[] => {
    if (!feature || typeof feature !== 'object') return [];
    const f = feature as { id?: string | number; properties?: Record<string, unknown>; geometry?: GeoJSON.Geometry | null };
    const p = f.properties || {};
    const id = String(p.alertId || p.id || f.id || '');
    if (!id) return [];
    // The GitHub-hosted GeoJSON may remain cached during an upstream outage.
    // Do not show alerts that have already expired on the viewer's clock.
    if (typeof p.expires === 'string') {
      const expiry = Date.parse(p.expires);
      if (!Number.isFinite(expiry) || expiry <= Date.now()) return [];
    }
    const title = String(p.headline || p.event || p.title || 'Weather warning');
    const level = normalizeAwarenessLevel(
      String(p.awareness_level ?? p.awarenessLevel ?? p.severity ?? ''),
    );
    const geometry = f.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type)
      ? f.geometry : undefined;
    return [{
      id, title, level, description: String(p.description || ''),
      published: typeof p.sent === 'string' ? p.sent : undefined,
      geometry,
    }];
  });
}
