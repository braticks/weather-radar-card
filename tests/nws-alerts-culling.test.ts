// Alerts outside the padded view are not built as Leaflet polygons (Leaflet
// re-projects every vertex of every built polygon on each zoom), zones enter
// the cache simplified, and fetch failures reach the host as a status.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { geoJSON, built } = vi.hoisted(() => {
  const built: Array<{ features: GeoJSON.Feature[]; layer: any }> = [];
  const geoJSON = vi.fn((features: GeoJSON.Feature[]) => {
    const layer = {
      features,
      addTo: vi.fn(),
      on: vi.fn(),
      getLayers: () => features.map(() => ({ isPopupOpen: () => layer.popupOpen })),
      popupOpen: false,
    };
    built.push({ features, layer });
    return layer;
  });
  return { geoJSON, built };
});

vi.mock('leaflet', () => {
  class Layer {}
  class TileLayer {}
  class WMS {}
  (TileLayer as unknown as { WMS: typeof WMS }).WMS = WMS;
  class Control { constructor(_o?: unknown) { void _o; } }
  const canvas = vi.fn(() => ({}));
  return { Layer, TileLayer, Control, geoJSON, canvas, default: { Layer, TileLayer, Control, geoJSON, canvas } };
});

import { NwsAlertsLayer, boundsIntersect } from '../src/nws-alerts-layer';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ZONE = (id: string): string => `https://api.weather.gov/zones/forecast/${id}`;

function view(west: number, south: number, east: number, north: number): any {
  return { getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north };
}

/** A map whose padded view is the given box; size 0 means "not laid out yet". Zoom 9 draws the stored outline. */
function fakeMap(box: [number, number, number, number] | null, zoom = 9): any {
  return {
    on: vi.fn(),
    off: vi.fn(),
    getZoom: () => zoom,
    getSize: () => (box ? { x: 600, y: 400 } : { x: 0, y: 0 }),
    getBounds: () => ({ pad: () => (box ? view(...box) : null) }),
    removeLayer: vi.fn(),
  };
}

function polygonAt(lng: number, lat: number, id: string, event = 'Flood Warning'): GeoJSON.Feature {
  return {
    type: 'Feature', id,
    properties: { event, severity: 'Severe' },
    geometry: { type: 'Polygon', coordinates: [[[lng, lat], [lng + 0.1, lat], [lng + 0.1, lat + 0.1], [lng, lat + 0.1], [lng, lat]]] },
  };
}

function makeLayer(map: any, onStatus?: (s: any) => void): any {
  const layer = new NwsAlertsLayer(map, () => ({ type: 'custom:weather-radar-card' } as any), undefined, onStatus) as any;
  return layer;
}

describe('boundsIntersect', () => {
  const v = view(-100, 30, -90, 40);
  it('overlapping and contained boxes intersect', () => {
    expect(boundsIntersect({ minLng: -95, minLat: 35, maxLng: -94, maxLat: 36 }, v)).toBe(true);
    expect(boundsIntersect({ minLng: -105, minLat: 25, maxLng: -85, maxLat: 45 }, v)).toBe(true);
    expect(boundsIntersect({ minLng: -91, minLat: 39, maxLng: -80, maxLat: 50 }, v)).toBe(true);
  });
  it('boxes beside, above or below the view do not', () => {
    expect(boundsIntersect({ minLng: -80, minLat: 35, maxLng: -70, maxLat: 36 }, v)).toBe(false);
    expect(boundsIntersect({ minLng: -95, minLat: 41, maxLng: -94, maxLat: 42 }, v)).toBe(false);
    expect(boundsIntersect({ minLng: -95, minLat: 20, maxLng: -94, maxLat: 29 }, v)).toBe(false);
  });
  it('a shape answered in the 0..360 window meets a view west of the antimeridian', () => {
    // Far Aleutians: geometryLngLatBounds gives 170..190; the map is centred at -175.
    expect(boundsIntersect({ minLng: 170, minLat: 50, maxLng: 190, maxLat: 55 }, view(-200, 45, -150, 60))).toBe(true);
    expect(boundsIntersect({ minLng: 170, minLat: 50, maxLng: 190, maxLat: 55 }, view(-120, 45, -100, 60))).toBe(false);
  });
  it('a view past +180 meets a shape just west of -180', () => {
    expect(boundsIntersect({ minLng: -179, minLat: 50, maxLng: -170, maxLat: 55 }, view(150, 45, 200, 60))).toBe(true);
  });
});

describe('viewport culling', () => {
  beforeEach(() => { built.length = 0; geoJSON.mockClear(); });

  it('builds only the alerts whose box touches the padded view, and records the rest as hidden', () => {
    const layer = makeLayer(fakeMap([-100, 30, -90, 40]));
    layer._features = [polygonAt(-95, 35, 'in'), polygonAt(-70, 35, 'out'), polygonAt(-91, 39.95, 'edge')];
    layer._render();
    expect(built).toHaveLength(1);
    expect(built[0].features.map((f) => f.id)).toEqual(['in', 'edge']);
    expect(layer._renderDecisions.get('in')).toMatch(/\|v\|z9$/);
    expect(layer._renderDecisions.get('out')).toMatch(/\|h\|z9$/);
  });

  it('a map without a size yet renders everything', () => {
    const layer = makeLayer(fakeMap(null));
    layer._features = [polygonAt(-95, 35, 'a'), polygonAt(-70, 35, 'b')];
    layer._render();
    expect(built[0].features.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('zone-derived alerts use the union of their cached zones\' bounds and build geometry only when visible', () => {
    const layer = makeLayer(fakeMap([-100, 30, -90, 40]));
    layer._cacheZone(ZONE('A'), { type: 'Polygon', coordinates: [[[-96, 34], [-95, 34], [-95, 35], [-96, 35], [-96, 34]]] });
    layer._cacheZone(ZONE('B'), { type: 'Polygon', coordinates: [[[-60, 34], [-59, 34], [-59, 35], [-60, 35], [-60, 34]]] });
    layer._features = [
      { type: 'Feature', id: 'near', properties: { event: 'Wind Advisory', severity: 'Moderate', affectedZones: [ZONE('A')] }, geometry: null },
      { type: 'Feature', id: 'far', properties: { event: 'Wind Advisory', severity: 'Moderate', affectedZones: [ZONE('B')] }, geometry: null },
      { type: 'Feature', id: 'pending', properties: { event: 'Wind Advisory', severity: 'Moderate', affectedZones: [ZONE('C')] }, geometry: null },
    ];
    layer._render();
    expect(built[0].features.map((f) => f.id)).toEqual(['near']);
    expect(built[0].features[0].geometry?.type).toBe('MultiPolygon');
    expect(layer._renderDecisions.get('far')).toBe('Wind Advisory|Moderate|zones:1/1|h|z9');
    expect(layer._renderDecisions.get('pending')).toBe('Wind Advisory|Moderate|zones:0/1|v|z9');
  });

  it('draws coarser outlines at low zooms, memoised per zone and zoom, and redraws when the zoom level changes', () => {
    const map = fakeMap([-130, 20, -60, 55], 3);
    const layer = makeLayer(map);
    // A ring with 2000 points around a 2-degree circle: fine at zoom 9, a few dozen points at zoom 3.
    const ring: GeoJSON.Position[] = [];
    for (let i = 0; i < 2000; i++) ring.push([-95 + 2 * Math.cos((2 * Math.PI * i) / 2000), 35 + 2 * Math.sin((2 * Math.PI * i) / 2000)]);
    ring.push(ring[0]);
    layer._cacheZone(ZONE('circle'), { type: 'Polygon', coordinates: [ring] });
    const stored = layer._zoneCache.get(ZONE('circle')).coordinates[0].length;
    layer._features = [{ type: 'Feature', id: 'a', properties: { event: 'Wind Advisory', severity: 'Moderate', affectedZones: [ZONE('circle')] }, geometry: null }];
    layer._render();
    const atZoom3 = (built[0].features[0].geometry as any).coordinates[0][0].length;
    expect(atZoom3).toBeLessThan(stored / 5);
    expect(layer._renderDecisions.get('a')).toMatch(/\|z3$/);
    expect(layer._zoneLod.get(ZONE('circle')).size).toBe(1);
    // Same view, same zoom: nothing rebuilt. Zoom 9: rebuilt with the stored outline.
    layer._render({ skipIfDecisionsUnchanged: true });
    expect(built).toHaveLength(1);
    map.getZoom = () => 9;
    layer._render({ skipIfDecisionsUnchanged: true });
    expect(built).toHaveLength(2);
    expect((built[1].features[0].geometry as any).coordinates[0][0].length).toBe(stored);
    expect(layer._zoneLod.get(ZONE('circle')).size).toBe(1);   // zoom 9 needs no copy
  });

  it('a view change re-renders only when the visible set changes', () => {
    const map = fakeMap([-100, 30, -90, 40]);
    const layer = makeLayer(map);
    layer._features = [polygonAt(-95, 35, 'in'), polygonAt(-70, 35, 'out')];
    layer._render();
    expect(built).toHaveLength(1);
    // Same view: nothing to do.
    layer._onViewChange();
    expect(built).toHaveLength(1);
    // Pan east: 'out' comes into view.
    map.getBounds = () => ({ pad: () => view(-80, 30, -60, 40) });
    layer._onViewChange();
    expect(built).toHaveLength(2);
    expect(built[1].features.map((f) => f.id)).toEqual(['out']);
  });

  it('defers the re-render while a popup is open, and runs it on popupclose', () => {
    const map = fakeMap([-100, 30, -90, 40]);
    const layer = makeLayer(map);
    layer._features = [polygonAt(-95, 35, 'in'), polygonAt(-70, 35, 'out')];
    layer._render();
    built[0].layer.popupOpen = true;
    map.getBounds = () => ({ pad: () => view(-80, 30, -60, 40) });
    layer._onViewChange();
    expect(built).toHaveLength(1);
    built[0].layer.popupOpen = false;
    layer._onPopupClose();
    expect(built).toHaveLength(2);
    // A popupclose with nothing pending is a no-op.
    layer._onPopupClose();
    expect(built).toHaveLength(2);
  });

  it('is idle while the map moves: no render from a hass tick, a refresh or zones until the quiet callback', () => {
    const map = fakeMap([-100, 30, -90, 40]);
    const layer = makeLayer(map);
    layer._features = [polygonAt(-95, 35, 'in')];
    layer._render();
    expect(built).toHaveLength(1);
    layer._onMapBusy();
    // The zoom crosses a level mid-gesture and a hass tick lands: nothing is rebuilt.
    map.getZoom = () => 5;
    layer.updateHass({} as any);
    layer._render({ skipIfDecisionsUnchanged: true });
    layer._render();
    expect(built).toHaveLength(1);
    layer._onMapQuiet();
    expect(built).toHaveLength(2);
    expect(layer._renderDecisions.get('in')).toMatch(/\|z5$/);
  });

  it('start subscribes to view changes (quiet-gated) and resize; clear unsubscribes both', () => {
    const map = fakeMap([-100, 30, -90, 40]);
    const layer = makeLayer(map);
    global.fetch = vi.fn(() => new Promise(() => {})) as any;
    layer.start();
    expect(map.on).toHaveBeenCalledWith('moveend zoomend', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('movestart zoomstart move zoom', expect.any(Function));
    expect(map.on).toHaveBeenCalledWith('resize', layer._onViewChange);
    layer.clear();
    expect(map.off).toHaveBeenCalledWith('moveend zoomend', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('resize', layer._onViewChange);
  });
});

describe('zones enter the cache simplified', () => {
  it('_cacheZone drops points within the tolerance and records the bounds', () => {
    const layer = makeLayer(fakeMap([-100, 30, -90, 40]));
    const raw: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [0.5, 0.0005], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    const stored = layer._cacheZone(ZONE('X'), raw);
    expect(stored.coordinates[0]).toEqual([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
    expect(layer._zoneCache.get(ZONE('X'))).toBe(stored);
    expect(layer._zoneBounds.get(ZONE('X'))).toEqual({ minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 });
  });

  it('a zone fetched from the network is cached simplified', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const layer = makeLayer(fakeMap([-100, 30, -90, 40]));
    layer._features = [{ type: 'Feature', geometry: null, properties: { affectedZones: [ZONE('Y')] } }];
    layer._render = vi.fn();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.5, 0.0005], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    }))) as any;
    await layer._resolveZones();
    expect(layer._zoneCache.get(ZONE('Y')).coordinates[0]).toHaveLength(5);
    vi.restoreAllMocks();
  });
});

describe('status callback', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

  it('reports a failed alerts fetch once, and clears it on the next success', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const statuses: any[] = [];
    const layer = makeLayer(fakeMap([-100, 30, -90, 40]), (s) => statuses.push(s));
    layer._scheduleRetry = vi.fn();
    layer._scheduleNext = vi.fn();
    layer._resolveZones = vi.fn();
    global.fetch = vi.fn(async () => new Response('down', { status: 503 })) as any;
    await layer._fetch();
    await layer._fetch();
    expect(statuses).toEqual([{ kind: 'fetch', failures: 1 }, { kind: 'fetch', failures: 2 }]);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ features: [] }))) as any;
    await layer._fetch();
    expect(statuses[2]).toBeNull();
    expect(statuses).toHaveLength(3);
  });

  it('reports zone failures with the batch size, clears after a clean batch, and on clear()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const statuses: any[] = [];
    const layer = makeLayer(fakeMap([-100, 30, -90, 40]), (s) => statuses.push(s));
    layer._render = vi.fn();
    layer._features = [{ type: 'Feature', geometry: null, properties: { affectedZones: [ZONE('A'), ZONE('B'), ZONE('C')] } }];
    // 404s, not a block: no backoff, so the next batch runs at once.
    global.fetch = vi.fn(async (url: string) => {
      if (url === ZONE('A')) return new Response(JSON.stringify({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }));
      return new Response('gone', { status: 404 });
    }) as any;
    await layer._resolveZones();
    expect(statuses).toEqual([{ kind: 'zones', failures: 2, total: 3 }]);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }))) as any;
    await layer._resolveZones();
    expect(statuses[1]).toBeNull();
    layer._setStatus({ kind: 'fetch', failures: 1 });
    layer.clear();
    expect(statuses[statuses.length - 1]).toBeNull();
  });
});
