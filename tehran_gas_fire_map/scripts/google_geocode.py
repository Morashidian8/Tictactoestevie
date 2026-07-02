#!/usr/bin/env python3
"""Runs in GitHub Actions (full internet). Looks up each gas office on the
Google Maps *website* search page and extracts the top-result coordinates
(the user asked for Google Maps coords, which are more accurate in Tehran
than the address-based estimates). No API key: parses the coordinates that
the search page embeds in its HTML. Writes data/google_coords.json with all
candidates per office for human review before anything is replaced.
Uses stdlib only.
"""
import json
import re
import time
import urllib.parse
import urllib.request

HERE = "tehran_gas_fire_map"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept-Language": "fa,en;q=0.8",
    "Cookie": "CONSENT=YES+cb.20240101-00-p0.en+FX+000",
}
# Tehran sanity bbox
LAT = (35.40, 36.05)
LON = (50.90, 51.85)


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def candidates_from_html(html):
    """Extract (name, lat, lon) candidates from a maps search page."""
    out = []
    # explicit place links: /maps/place/<name>/@lat,lon  or ...!3dlat!4dlon
    for m in re.finditer(r"/maps/place/([^/\"\\]+)/@(-?\d+\.\d+),(-?\d+\.\d+)", html):
        name = urllib.parse.unquote_plus(m.group(1))
        out.append((name, float(m.group(2)), float(m.group(3))))
    for m in re.finditer(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", html):
        out.append(("", float(m.group(1)), float(m.group(2))))
    # APP_INITIALIZATION_STATE embeds [..., lon, lat] triples
    st = re.search(r"APP_INITIALIZATION_STATE=(.{0,2000})", html)
    if st:
        for m in re.finditer(r"\[-?[\d.]+,(5[01]\.\d{3,}),(3[56]\.\d{3,})\]", st.group(1)):
            out.append(("(viewport)", float(m.group(2)), float(m.group(1))))
    # de-dup, keep Tehran bbox only
    seen, res = set(), []
    for name, lat, lon in out:
        if not (LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1]):
            continue
        key = (round(lat, 5), round(lon, 5))
        if key in seen:
            continue
        seen.add(key)
        res.append({"name": name, "lat": lat, "lon": lon})
    return res


def main():
    with open(f"{HERE}/data/gas_offices.json", encoding="utf-8") as f:
        offices = json.load(f)["offices"]

    results = []
    for o in offices:
        queries = [
            f"{o['unit']} تهران {o['address']}",
            f"اداره گاز {o['name']} شرکت گاز استان تهران",
            f"شرکت گاز {o['address']} تهران",
        ]
        entry = {"id": o["id"], "name": o["name"], "unit": o["unit"],
                 "old_lat": o["lat"], "old_lon": o["lon"], "queries": []}
        for q in queries:
            url = "https://www.google.com/maps/search/" + urllib.parse.quote(q) + "?hl=fa"
            try:
                html = fetch(url)
                cands = candidates_from_html(html)[:5]
            except Exception as e:  # noqa: BLE001
                cands = []
                print(f"  office {o['id']} query failed: {e}")
            entry["queries"].append({"q": q, "candidates": cands})
            print(f"office {o['id']} [{q[:50]}...] -> {len(cands)} candidates"
                  + (f" first: {cands[0]}" if cands else ""))
            time.sleep(2.5)
            if cands:
                break  # first query with hits is usually the most specific
        results.append(entry)

    with open(f"{HERE}/data/google_coords.json", "w", encoding="utf-8") as f:
        json.dump({"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "results": results}, f, ensure_ascii=False, indent=1)
    print("Wrote google_coords.json")


if __name__ == "__main__":
    main()
