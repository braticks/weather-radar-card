# European weather warnings (experimental)

This fork now supports an **optional** European weather warnings map overlay,
controlled with a top-right layer toggle alongside the other 4.0 overlays.

Example card YAML:

```yaml
type: custom:weather-radar-card
show_layer_toggles: true
show_european_alerts: true
european_alerts_url: /local/weather-warnings.geojson
```

The URL must return a **GeoJSON FeatureCollection** of warning polygons or
multipolygons, readable by the card's browser (same-origin HA URL recommended).
Supported feature properties: `id` or `alertId` (required),
`headline`/`event`/`title`, `description`, and
`awareness_level` (2/yellow, 3/orange, 4/red), or
`severity` (Moderate/Severe/Extreme).

The map redraws approximately every five minutes while the layer is enabled.
Warning text is inserted safely into HTML via textContent; popup titles and
descriptions are never interpreted as HTML.

**Important: this is not a live Lithuania feed out of the box.**
The GeoJSON URL is currently user-provided; no operational MeteoAlarm/HA
proxy is supplied. Do not use invented polygon shapes or assume the Atom
feed includes them. A test GeoJSON file is not an authoritative live warning.

MeteoAlarm's direct EDR API requires authorized access. Public Atom feeds
provide alert discovery, but translating these to exact polygons and filtering
cancelled/expired alerts requires a validated server-side adapter. The
current GeoJSON adapter requires the provider to filter its output to
*currently active* alerts.

This is an unreleased draft branch. Build and live-data integration have not
been verified. Do not merge or install this branch as production yet.

Sources:
- https://api.meteoalarm.org/
- https://feeds.meteoalarm.org/

Attribution: EUMETNET MeteoAlarm and national meteorological agencies.
Consult official agencies for decisions affecting safety.
