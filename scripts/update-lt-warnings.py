#!/usr/bin/env python3
"""Convert MeteoAlarm Lithuania Atom/CAP alerts into active GeoJSON warnings.

No secrets, non-standard modules or synthetic country-sized warning polygons.
When the upstream fails, exit nonzero without overwriting last good data.
"""
import datetime as dt
import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

FEED = os.environ.get("METEOALARM_FEED", "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-lithuania")
OUTPUT = Path(os.environ.get("WARNINGS_OUTPUT", "data/lt-warnings.geojson"))
ATOM = "{http://www.w3.org/2005/Atom}"
CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"
MAX_ENTRIES = 200

def get_xml(url):
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError("Only HTTPS sources accepted")
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; WeatherRadarCard/1.0; +https://github.com/braticks/weather-radar-card)", "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=25) as resp:
        data = resp.read(3_000_001)
        if len(data) > 3_000_000:
            raise ValueError("Oversize warning feed")
    return ET.fromstring(data)

def text(node, name):
    if node is None: return ""
    found = next((e for e in node.iter() if e.tag.split("}")[-1] == name), None)
    return (found.text or "").strip() if found is not None else ""

def timestamp(value):
    if not value: return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None

def severity(value):
    s = value.lower()
    if s in ("extreme", "red", "4"): return "red"
    if s in ("severe", "orange", "3"): return "orange"
    if s in ("moderate", "yellow", "2"): return "yellow"
    return "unknown"

def polygon_from_cap(value):
    # CAP coordinate order is LAT,LON; GeoJSON is LON,LAT.
    coords = []
    for point in value.replace("\n", " ").split():
        try:
            lat, lon = (float(x) for x in point.split(","))
        except (ValueError, TypeError):
            return None
        if not (-90 <= lat <= 90 and -180 <= lon <= 180): return None
        coords.append([lon, lat])
    if len(coords) < 3: return None
    if coords[0] != coords[-1]: coords.append(coords[0])
    return coords if len(coords) >= 4 else None

def cap_records(cap_root, now):
    if text(cap_root, "status").lower() not in ("actual", ""): return []
    if text(cap_root, "msgType").lower() in ("cancel", "ack", "error"): return []
    root_id = text(cap_root, "identifier")
    records = []
    for info in (n for n in cap_root.iter() if n.tag.split("}")[-1] == "info"):
        expires = timestamp(text(info, "expires"))
        starts = timestamp(text(info, "onset") or text(info, "effective"))
        if expires is None or expires <= now or (starts and starts > now): continue
        color = severity(text(info, "severity"))
        for parameter in (p for p in info.iter() if p.tag.split("}")[-1] == "parameter"):
            if text(parameter, "valueName").lower() in ("awareness_level", "awarenesslevel"):
                val = text(parameter, "value")
                if val: color = severity(val.split(";")[0])
        for area in (a for a in info if a.tag.split("}")[-1] == "area"):
            for part in (p for p in area if p.tag.split("}")[-1] == "polygon"):
                points = polygon_from_cap(part.text or "")
                if not points: continue
                records.append({
                    "type": "Feature",
                    "id": root_id + ":" + str(len(records)),
                    "properties": {
                        "alertId": root_id + ":" + str(len(records)),
                        "headline": text(info, "headline") or text(info, "event") or "Weather warning",
                        "description": text(info, "description"),
                        "severity": text(info, "severity"),
                        "awareness_level": color,
                        "expires": expires.isoformat(),
                        "area": text(area, "areaDesc"),
                    },
                    "geometry": {"type": "Polygon", "coordinates": [points]},
                })
    return records

def main():
    now = dt.datetime.now(dt.timezone.utc)
    root = get_xml(FEED)
    entries = [e for e in root.iter() if e.tag == ATOM + "entry"]
    result = []
    cap_entries = 0
    for entry in entries[:MAX_ENTRIES]:
        links = [e.attrib.get("href", "") for e in entry if e.tag == ATOM + "link"]
        # The Atom entry may embed CAP content; otherwise follow HTTPS detail URLs.
        embedded = next((e for e in entry.iter() if e.tag.split("}")[-1] == "alert"), None)
        candidates = [embedded] if embedded is not None else []
        if not candidates:
            cap_links = [u for u in links if u.startswith("https://") and (".xml" in u.lower() or "cap" in u.lower())]
            for url in cap_links[:1]:
                try: candidates.append(get_xml(url))
                except Exception as error: print("CAP detail unavailable:", error)
        if candidates:
            cap_entries += 1
        else:
            print("No CAP detail for Atom entry:", text(entry, "id")[:160], "links:", links[:3])
        for cap_root in candidates:
            result.extend(cap_records(cap_root, now))
    if entries and cap_entries == 0:
        raise RuntimeError("MeteoAlarm returned Atom entries but no CAP detail. Cannot build warning regions; inspect logged links.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "features": result,
        "metadata": {"generatedAt": now.isoformat(), "source": "EUMETNET MeteoAlarm", "feed": FEED},
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Entries: {len(entries)}; CAP details: {cap_entries}; active alert polygons: {len(result)}")

if __name__ == "__main__":
    main()
