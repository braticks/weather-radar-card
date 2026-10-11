import * as L from 'leaflet';
import { HAZARD_MARKER_PANE, Z_HAZARD_MARKERS } from './const';

/**
 * The pane for wind arrows/barbs and fire icons, created on first use.
 * Out of Leaflet's markerPane so the place names can sit over them while
 * the user's own markers stay above the names (see const.ts).
 */
export function hazardMarkerPane(map: L.Map): string {
  if (!map.getPane(HAZARD_MARKER_PANE)) {
    map.createPane(HAZARD_MARKER_PANE).style.zIndex = String(Z_HAZARD_MARKERS);
  }
  return HAZARD_MARKER_PANE;
}
