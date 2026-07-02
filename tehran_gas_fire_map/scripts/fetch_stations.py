#!/usr/bin/env python3
"""Runs in GitHub Actions (full internet). Fetches ALL Tehran fire stations
from Overpass and writes tehran_gas_fire_map/data/stations.json — the full
list is embedded in the map so the browser-side edit mode can re-pick the
nearest station after the user moves an office marker. Uses stdlib only.
"""
import json
import time

from fetch_geo import fetch_fire_stations

HERE = "tehran_gas_fire_map"


def main():
    stations = fetch_fire_stations()
    if not stations:
        raise SystemExit("no stations fetched — keeping previous stations.json")
    out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "stations": stations}
    with open(f"{HERE}/data/stations.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"Wrote stations.json ({len(stations)} stations)")


if __name__ == "__main__":
    main()
