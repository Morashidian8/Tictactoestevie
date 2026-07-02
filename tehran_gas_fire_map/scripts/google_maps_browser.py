#!/usr/bin/env python3
"""Runs in GitHub Actions with Playwright Chromium. Searches Google Maps
(the real web app, JS rendered) for every gas office and records the
result names + coordinates parsed from result links / the final URL.
Writes data/google_coords.json for review; nothing is replaced blindly.
"""
import json
import re
import time
import urllib.parse

from playwright.sync_api import sync_playwright

HERE = "tehran_gas_fire_map"
LAT = (35.40, 36.05)
LON = (50.90, 51.85)


def parse_coords(url):
    m = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"/@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None


def in_tehran(lat, lon):
    return LAT[0] <= lat <= LAT[1] and LON[0] <= lon <= LON[1]


def collect_candidates(page):
    """Candidates from a results feed or a direct place page."""
    out = []
    # direct place hit: URL carries the pin coords
    c = parse_coords(page.url)
    if "/maps/place/" in page.url and c:
        title = page.title().replace(" - Google Maps", "").replace("‏", "").strip()
        out.append({"name": title, "lat": c[0], "lon": c[1], "src": "place-url"})
    # results feed links
    for a in page.locator("a[href*='/maps/place/']").all()[:8]:
        href = a.get_attribute("href") or ""
        c = parse_coords(href)
        if not c:
            continue
        name = a.get_attribute("aria-label") or ""
        if not name:
            m = re.search(r"/maps/place/([^/]+)/", href)
            name = urllib.parse.unquote_plus(m.group(1)) if m else ""
        out.append({"name": name.strip(), "lat": c[0], "lon": c[1], "src": "feed"})
    seen, res = set(), []
    for cand in out:
        if not in_tehran(cand["lat"], cand["lon"]):
            continue
        key = (round(cand["lat"], 5), round(cand["lon"], 5))
        if key in seen:
            continue
        seen.add(key)
        res.append(cand)
    return res


def main():
    with open(f"{HERE}/data/gas_offices.json", encoding="utf-8") as f:
        offices = json.load(f)["offices"]

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            locale="fa-IR",
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        )
        page = ctx.new_page()

        for o in offices:
            queries = [
                f"{o['unit']} تهران",
                f"شرکت گاز {o['name']} تهران",
                f"اداره گاز {o['address']} تهران",
            ]
            entry = {"id": o["id"], "name": o["name"], "unit": o["unit"],
                     "old_lat": o["lat"], "old_lon": o["lon"], "queries": []}
            for q in queries:
                url = "https://www.google.com/maps/search/" + urllib.parse.quote(q) + "?hl=fa"
                cands = []
                try:
                    page.goto(url, timeout=45000, wait_until="domcontentloaded")
                    # consent interstitial (rare on US runners)
                    try:
                        page.get_by_role("button", name=re.compile("Accept all|I agree|قبول")).click(timeout=2500)
                    except Exception:
                        pass
                    # wait for either a place redirect or the results feed
                    try:
                        page.wait_for_url(re.compile(r"/maps/(place|search)/.*@"), timeout=15000)
                    except Exception:
                        pass
                    page.wait_for_timeout(2500)
                    cands = collect_candidates(page)[:5]
                except Exception as e:  # noqa: BLE001
                    print(f"  office {o['id']} query error: {str(e)[:120]}")
                entry["queries"].append({"q": q, "candidates": cands})
                print(f"office {o['id']} [{q[:45]}] -> {len(cands)}"
                      + (f" first={cands[0]['name'][:40]!r} {cands[0]['lat']:.5f},{cands[0]['lon']:.5f}" if cands else ""))
                time.sleep(2)
                # stop early once we have a gas-related hit
                if any("گاز" in c["name"] for c in cands):
                    break
            results.append(entry)

        browser.close()

    with open(f"{HERE}/data/google_coords.json", "w", encoding="utf-8") as f:
        json.dump({"generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "source": "google-maps-playwright", "results": results}, f, ensure_ascii=False, indent=1)
    print("Wrote google_coords.json")


if __name__ == "__main__":
    main()
