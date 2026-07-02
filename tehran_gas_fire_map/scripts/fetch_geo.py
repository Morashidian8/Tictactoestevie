#!/usr/bin/env python3
"""Runs in GitHub Actions (full internet). Fetches for each Tehran gas office:
  - fire stations in Tehran from OpenStreetMap (Overpass)
  - Tehran city boundary geometry
  - refined office coordinates via Nominatim (kept only if close to prior estimate)
  - nearest fire station by real driving time + route geometry via OSRM
Writes tehran_gas_fire_map/data/geo_results.json
Uses stdlib only.
"""
import json
import math
import os
import time
import urllib.parse
import urllib.request

HERE = "tehran_gas_fire_map"
UA = {"User-Agent": "tehran-gas-fire-map/1.0 (safety mapping; contact via repo)"}

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
OSRM = "https://router.project-osrm.org"
NOMINATIM = "https://nominatim.openstreetmap.org/search"

BBOX = "35.50,51.05,35.87,51.70"  # south,west,north,east — Tehran city + margins


def http_json(url, post_data=None, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(
                url,
                data=post_data.encode("utf-8") if post_data else None,
                headers=UA,
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001 — retry any transient failure
            print(f"  attempt {i + 1} failed: {e} :: {url[:100]}")
            time.sleep(3 * (i + 1))
    return None


def overpass(query):
    for ep in OVERPASS_ENDPOINTS:
        res = http_json(ep, post_data="data=" + urllib.parse.quote(query))
        if res and res.get("elements"):
            return res
    return None


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fetch_fire_stations():
    print("Fetching fire stations from Overpass ...")
    q = f"""[out:json][timeout:180];
(
  node["amenity"="fire_station"]({BBOX});
  way["amenity"="fire_station"]({BBOX});
  relation["amenity"="fire_station"]({BBOX});
);
out center tags;"""
    res = overpass(q)
    stations = []
    for el in (res or {}).get("elements", []):
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        tags = el.get("tags", {})
        stations.append(
            {
                "osm_id": f"{el['type']}/{el['id']}",
                "name": tags.get("name") or tags.get("name:fa") or "ایستگاه آتش‌نشانی (بدون نام در OSM)",
                "operator": tags.get("operator", ""),
                "address": " ".join(
                    filter(None, [tags.get("addr:street", ""), tags.get("addr:housenumber", "")])
                ),
                "phone": tags.get("phone", tags.get("contact:phone", "")),
                "lat": lat,
                "lon": lon,
            }
        )
    print(f"  {len(stations)} stations found")
    return stations


def fetch_boundary():
    print("Fetching Tehran boundary ...")
    q = """[out:json][timeout:180];
relation["boundary"="administrative"]["admin_level"="8"]["name"="تهران"](35.4,50.9,36.0,51.8);
out geom;"""
    res = overpass(q)
    lines = []
    for el in (res or {}).get("elements", []):
        for m in el.get("members", []):
            if m.get("type") == "way" and m.get("geometry"):
                pts = [[g["lat"], g["lon"]] for g in m["geometry"]]
                lines.append(pts[:: max(1, len(pts) // 200)])
    print(f"  {len(lines)} boundary segments")
    return lines


def refine_coords(offices):
    print("Refining office coordinates via Nominatim ...")
    for o in offices:
        if o.get("source") == "google-maps":
            continue  # user-verified Google Maps coords take precedence
        q = o.get("geocode")
        if not q:
            continue
        url = NOMINATIM + "?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": "ir", "accept-language": "fa"}
        )
        res = http_json(url, tries=2)
        time.sleep(1.1)  # Nominatim usage policy: max 1 req/s
        if res:
            lat, lon = float(res[0]["lat"]), float(res[0]["lon"])
            d = haversine_km(o["lat"], o["lon"], lat, lon)
            if d <= 4.0:
                print(f"  office {o['id']}: refined ({d:.1f} km shift)")
                o["lat"], o["lon"], o["geocoded"] = lat, lon, True
            else:
                print(f"  office {o['id']}: geocode {d:.1f} km away from estimate — kept estimate")


def osrm_route(slat, slon, dlat, dlon, geometry=False):
    coords = f"{slon},{slat};{dlon},{dlat}"
    params = "overview=full&geometries=geojson" if geometry else "overview=false"
    res = http_json(f"{OSRM}/route/v1/driving/{coords}?{params}", tries=3)
    time.sleep(0.25)
    if not res or res.get("code") != "Ok" or not res.get("routes"):
        return None
    r = res["routes"][0]
    out = {"distance_km": round(r["distance"] / 1000, 2), "duration_min": round(r["duration"] / 60, 1)}
    if geometry:
        out["geometry"] = [[c[1], c[0]] for c in r["geometry"]["coordinates"]]
    return out


def main():
    with open(f"{HERE}/data/gas_offices.json", encoding="utf-8") as f:
        offices = json.load(f)["offices"]

    stations_cache = f"{HERE}/data/stations.json"
    if os.path.exists(stations_cache):
        with open(stations_cache, encoding="utf-8") as f:
            stations = json.load(f)["stations"]
        print(f"Loaded {len(stations)} stations from cache")
    else:
        stations = fetch_fire_stations()
    boundary = [] if os.environ.get("SKIP_BOUNDARY") else fetch_boundary()
    refine_coords(offices)

    results = []
    for o in offices:
        cands = sorted(stations, key=lambda s: haversine_km(o["lat"], o["lon"], s["lat"], s["lon"]))[:4]
        best, best_route = None, None
        for c in cands:
            r = osrm_route(c["lat"], c["lon"], o["lat"], o["lon"])
            if r and (best_route is None or r["duration_min"] < best_route["duration_min"]):
                best, best_route = c, r
        if best is None and cands:
            best = cands[0]
            d = haversine_km(o["lat"], o["lon"], best["lat"], best["lon"]) * 1.35
            best_route = {"distance_km": round(d, 2), "duration_min": round(d / 40 * 60, 1), "fallback": True}
        geom = osrm_route(best["lat"], best["lon"], o["lat"], o["lon"], geometry=True) if best else None
        results.append(
            {
                "office": o,
                "station": best,
                "route": {**best_route, **({"geometry": geom["geometry"]} if geom and "geometry" in geom else {})},
            }
        )
        print(
            f"office {o['id']} -> {best['name'] if best else '??'} "
            f"({best_route['distance_km']} km, {best_route['duration_min']} min)"
        )

    out = {"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "stations_total": len(stations), "boundary": boundary, "results": results}
    with open(f"{HERE}/data/geo_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("Wrote geo_results.json")


if __name__ == "__main__":
    main()
