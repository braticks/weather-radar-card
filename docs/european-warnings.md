# Lithuanian MeteoAlarm warnings – experimental Home Assistant fork

This fork extends Weather Radar Card 4.0 with a toggleable ⚠️ European weather warning overlay.

## Verified 2026-10-24

- TypeScript/Lovelace bundle builds successfully (GitHub Build #24).
- 1,540 automated tests pass (Validate European warnings #27).
- Live Lithuania MeteoAlarm feed parsed: 6 CAP messages, 2 active geographic polygons.
- Region boundaries come from EMMA_ID geocodes, when CAP lacks explicit polygons.
- A GitHub Actions schedule on the main branch refreshes the public GeoJSON every 15 minutes.
- Browser-side filtering hides expired warnings even when cached data is stale.

## Installation to Home Assistant OS

You can install the experimental fork over an existing HACS Weather Radar Card.
It backs up the existing JS bundles.

In Home Assistant Terminal & SSH, run:

```sh
curl -fsSL https://raw.githubusercontent.com/braticks/weather-radar-card/refs/heads/feature/lt-weather-warnings/scripts/install-ha-fork.sh | sh
```

Retain the original dashboard resource, e.g.
`/hacsfiles/weather-radar-card/weather-radar-card.js`.
Hard-refresh the browser after installation (Ctrl+F5).
HACS updates to the original package may overwrite these fork files.

Dashboard YAML:

```yaml
type: custom:weather-radar-card
show_layer_toggles: true
show_european_alerts: true
height: 460
```

By default, the layer fetches:
`https://raw.githubusercontent.com/braticks/weather-radar-card/feature/lt-weather-warnings/data/lt-warnings.geojson`

You can set `european_alerts_url` to a different GeoJSON FeatureCollection URL
if you operate a trusted local proxy.

## Data and safety

Warnings come from **EUMETNET MeteoAlarm**, published by national agencies.
EMMA region polygons are sourced from
`NiklasJordan/meteoalarm` (MIT-licensed geocodes dataset).
An empty layer can mean there are no current mapped warnings; always consult
the official meteorological service for safety-critical decisions.

This is an **experimental manual install**, not a HACS release.
Actual on-device verification across HA dashboards remains recommended.
