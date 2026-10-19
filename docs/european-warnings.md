# Lithuania / Europe weather warnings – work in progress

The fork's planned new overlay uses **MeteoAlarm** alerts, initially for Lithuania.
The official Lithuania Atom feed is
`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-lithuania`.

## First step

`src/european-alerts.ts` adds a provider-independent warning model, Atom
parsing, severity normalization, and optional GeoJSON polygon handling.

## Not enabled in the card yet

The adapter is not wired to the map or layer-toggles. It does not display
warnings by itself. The existing Weather Radar Card 4.0 behavior remains
unchanged.

Before enabling the overlay:
1. Verify browser CORS against the production Atom feed, or fetch server-side
   via a Home Assistant integration/proxy; never embed API credentials in JS.
2. Confirm alert severity and validity time from CAP detail, rather than
   guessing from translated Atom titles.
3. Resolve **real** warning-region geometries; do not paint a whole country
   rectangle as if it were the official affected area.
4. Integrate a toggle alongside wind/lightning/US alerts, with country-aware
   availability, UI text, refresh caching, and handling of cancelled/expired alerts.
5. Test against live Lithuanian messages and add unit tests.

Official sources:
- https://api.meteoalarm.org/
- https://feeds.meteoalarm.org/

Attribution: EUMETNET MeteoAlarm and the issuing national weather service.
Warnings are informational; official agency guidance takes precedence.
