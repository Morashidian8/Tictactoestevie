#!/usr/bin/env python3
"""Builds the interactive Tehran map (Persian, RTL) from geo_results.json:
gas offices, their nearest fire stations, driving routes, distance & ETA.
Output: tehran_gas_fire_map/output/tehran_gas_fire_map.html
"""
import json
import os

import folium
from folium.plugins import Fullscreen, MiniMap

HERE = os.path.join(os.path.dirname(__file__), "..")


def fmt_min(m):
    return f"{m:.0f} دقیقه" if m >= 1 else "کمتر از ۱ دقیقه"


def office_popup(o, s, r):
    meta = o.get("meta", {})
    meta_rows = "".join(
        f"<tr><td style='color:#666'>{k}</td><td>{v}</td></tr>" for k, v in meta.items() if v not in ("-", "", None)
    )
    return f"""
<div dir="rtl" style="font-family:Tahoma,'Vazirmatn',sans-serif;font-size:13px;min-width:270px">
  <div style="background:#f57c00;color:#fff;padding:6px 8px;border-radius:6px 6px 0 0;font-weight:bold">
    🔥 {o['unit']} — {o['name']}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <tr><td style="color:#666;width:35%">آدرس</td><td>{o['address']}</td></tr>
    {meta_rows}
  </table>
  <div style="background:#c62828;color:#fff;padding:5px 8px;margin-top:6px;border-radius:6px;font-weight:bold">
    🚒 نزدیک‌ترین ایستگاه: {s['name']}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    {f"<tr><td style='color:#666;width:35%'>نشانی ایستگاه</td><td>{s['address']}</td></tr>" if s.get('address') else ''}
    {f"<tr><td style='color:#666'>اپراتور</td><td>{s['operator']}</td></tr>" if s.get('operator') else ''}
    {f"<tr><td style='color:#666'>تلفن</td><td>{s['phone']}</td></tr>" if s.get('phone') else ''}
    <tr><td style="color:#666">مسافت رانندگی</td><td><b>{r['distance_km']:.1f} کیلومتر</b></td></tr>
    <tr><td style="color:#666">زمان تقریبی رسیدن</td><td><b>{fmt_min(r['duration_min'])}</b></td></tr>
  </table>
</div>"""


def main():
    with open(os.path.join(HERE, "data", "geo_results.json"), encoding="utf-8") as f:
        data = json.load(f)

    m = folium.Map(location=[35.700, 51.391], zoom_start=11, tiles=None, control_scale=True)
    folium.TileLayer("OpenStreetMap", name="نقشه خیابانی").add_to(m)
    folium.TileLayer("CartoDB positron", name="نقشه روشن").add_to(m)

    # Tehran city boundary
    boundary = folium.FeatureGroup(name="محدوده شهر تهران", show=True)
    for seg in data.get("boundary", []):
        folium.PolyLine(seg, color="#2e7d32", weight=2.5, opacity=0.7, dash_array="6,6").add_to(boundary)
    boundary.add_to(m)

    routes_fg = folium.FeatureGroup(name="مسیر خودروی آتش‌نشانی")
    offices_fg = folium.FeatureGroup(name="ادارات گاز")
    stations_fg = folium.FeatureGroup(name="ایستگاه‌های آتش‌نشانی")

    seen_stations = {}
    for item in data["results"]:
        o, s, r = item["office"], item["station"], item["route"]
        if not s:
            continue

        folium.Marker(
            [o["lat"], o["lon"]],
            tooltip=f"اداره گاز: {o['name']}",
            popup=folium.Popup(office_popup(o, s, r), max_width=340),
            icon=folium.Icon(color="orange", icon="fire", prefix="fa"),
        ).add_to(offices_fg)

        key = s["osm_id"]
        if key not in seen_stations:
            seen_stations[key] = True
            folium.Marker(
                [s["lat"], s["lon"]],
                tooltip=f"🚒 {s['name']}",
                popup=folium.Popup(
                    f"<div dir='rtl' style='font-family:Tahoma;font-size:13px'><b>🚒 {s['name']}</b><br>"
                    f"{s.get('address') or ''}<br>{s.get('phone') or ''}</div>",
                    max_width=260,
                ),
                icon=folium.Icon(color="red", icon="truck", prefix="fa"),
            ).add_to(stations_fg)

        path = r.get("geometry") or [[s["lat"], s["lon"]], [o["lat"], o["lon"]]]
        is_fallback = "geometry" not in r
        folium.PolyLine(
            path,
            color="#c62828",
            weight=4,
            opacity=0.85,
            dash_array="1,10" if is_fallback else None,
            tooltip=f"🚒 {s['name']} ← {o['name']} | {r['distance_km']:.1f} کیلومتر | {fmt_min(r['duration_min'])}",
        ).add_to(routes_fg)

    routes_fg.add_to(m)
    stations_fg.add_to(m)
    offices_fg.add_to(m)

    title = """
<div dir="rtl" style="position:fixed;top:10px;right:60px;z-index:9999;background:rgba(255,255,255,.95);
     padding:10px 14px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:Tahoma;max-width:380px">
  <div style="font-size:15px;font-weight:bold;color:#333">🗺️ ادارات گاز شهر تهران و نزدیک‌ترین ایستگاه آتش‌نشانی</div>
  <div style="font-size:11px;color:#555;margin-top:4px">
    🔥 نارنجی = اداره گاز &nbsp;|&nbsp; 🚒 قرمز = ایستگاه آتش‌نشانی &nbsp;|&nbsp; خط قرمز = مسیر رانندگی خودروی آتش‌نشانی<br>
    خط‌چین سبز = محدوده شهر تهران — روی هر نشانگر کلیک کنید (فاصله و زمان رسیدن)<br>
    منبع داده: OpenStreetMap + مسیریابی OSRM — زمان‌ها بدون ترافیک است، فوریت: ۱۲۵
  </div>
</div>"""
    m.get_root().html.add_child(folium.Element(title))

    folium.LayerControl(collapsed=False).add_to(m)
    Fullscreen(title="تمام‌صفحه", title_cancel="خروج").add_to(m)
    MiniMap(toggle_display=True).add_to(m)

    out = os.path.join(HERE, "output", "tehran_gas_fire_map.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    m.save(out)
    print("saved", out)


if __name__ == "__main__":
    main()
