#!/bin/sh
# Install the custom Lithuanian warning fork over an existing HACS Weather Radar Card.
# Home Assistant OS / Terminal & SSH add-on. No HA restarts.
set -eu
DIR="${HA_RADAR_DIR:-/config/www/community/weather-radar-card}"
BASE="https://raw.githubusercontent.com/braticks/weather-radar-card/refs/heads/feature/lt-weather-warnings/dist"
FILES="weather-radar-card.js weather-radar-card-maplibre.js home-circle-dark.svg home-circle-light.svg pause.png play.png preview.jpg radar-colour-bar-dwd.png radar-colour-bar-nws.png radar-colour-bar-universalblue.png recenter.png skip-back.png skip-next.png"
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
mkdir -p "$DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
echo "Downloading Weather Radar Card Lithuania experimental build..."
for f in $FILES; do
  curl --fail --location --silent --show-error --retry 2 "$BASE/$f" -o "$TMP/$f"
  [ -s "$TMP/$f" ] || { echo "Empty download: $f" >&2; exit 1; }
done
[ -f "$DIR/weather-radar-card.js" ] && cp "$DIR/weather-radar-card.js" "$DIR/weather-radar-card.js.backup" || :
[ -f "$DIR/weather-radar-card-maplibre.js" ] && cp "$DIR/weather-radar-card-maplibre.js" "$DIR/weather-radar-card-maplibre.js.backup" || :
for f in $FILES; do cp "$TMP/$f" "$DIR/$f"; done
echo "Installed in $DIR. Refresh your dashboard with Ctrl+F5."
echo "Keep the existing HACS resource (/hacsfiles/weather-radar-card/weather-radar-card.js)."
echo "HACS automatic updates of the original card may overwrite the fork."
