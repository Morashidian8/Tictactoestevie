#!/usr/bin/env python3
"""Builds the interactive Tehran map (Persian, RTL) from geo_results.json:
gas offices, their nearest fire stations, driving routes, distance & ETA.

Markers/routes are rendered by embedded JS (not static folium layers) so the
map supports an edit mode: the user drags an office marker to its correct
location and the browser re-picks the nearest station + route via the public
OSRM API, persists corrections in localStorage, and can export/import them
as JSON.

Output: tehran_gas_fire_map/output/tehran_gas_fire_map.html
"""
import json
import os

import folium
from folium.plugins import Fullscreen, MiniMap

HERE = os.path.join(os.path.dirname(__file__), "..")

APP_JS = r"""
<script>
window.addEventListener("load", function () {
  var MAP = null;
  for (var k in window) {
    try { if (window[k] instanceof L.Map) { MAP = window[k]; break; } } catch (e) {}
  }
  if (!MAP) { console.error("leaflet map not found"); return; }

  var RESULTS = __RESULTS__;
  var STATIONS = __STATIONS__;
  var OSRM = "https://router.project-osrm.org";
  var LSKEY = "tehran_gas_fire_corrections_v1";

  var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(MAP);
  var carto = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap © CARTO" });

  var officesFG = L.featureGroup().addTo(MAP);
  var stationsFG = L.featureGroup().addTo(MAP);
  var routesFG = L.featureGroup().addTo(MAP);
  L.control.layers(
    { "نقشه خیابانی": osm, "نقشه روشن": carto },
    { "ادارات گاز": officesFG, "ایستگاه‌های آتش‌نشانی": stationsFG, "مسیر خودروی آتش‌نشانی": routesFG },
    { collapsed: false }).addTo(MAP);

  var officeIcon = L.AwesomeMarkers.icon({ icon: "fire", prefix: "fa", markerColor: "orange" });
  var stationIcon = L.AwesomeMarkers.icon({ icon: "truck", prefix: "fa", markerColor: "red" });

  var stById = {};
  STATIONS.forEach(function (s) {
    stById[s.osm_id] = s;
    L.marker([s.lat, s.lon], { icon: stationIcon })
      .bindTooltip("🚒 " + s.name)
      .bindPopup("<div dir='rtl' style='font-family:Tahoma;font-size:13px'><b>🚒 " + s.name + "</b><br>" +
                 (s.address || "") + "<br>" + (s.phone || "") + "</div>", { maxWidth: 260 })
      .addTo(stationsFG);
  });

  function hav(lat1, lon1, lat2, lon2) {
    var R = 6371, toR = Math.PI / 180;
    var dp = (lat2 - lat1) * toR, dl = (lon2 - lon1) * toR;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function fmtMin(m) { return m >= 1 ? Math.round(m) + " دقیقه" : "کمتر از ۱ دقیقه"; }

  function popupHtml(o, s, r, corrected) {
    var meta = o.meta || {}, metaRows = "";
    for (var mk in meta) {
      if (meta[mk] !== "-" && meta[mk] !== "" && meta[mk] != null)
        metaRows += "<tr><td style='color:#666'>" + mk + "</td><td>" + meta[mk] + "</td></tr>";
    }
    var approx = r.fallback ? " (تقریبی — خط مستقیم)" : "";
    return "<div dir='rtl' style='font-family:Tahoma,sans-serif;font-size:13px;min-width:270px'>" +
      "<div style='background:#f57c00;color:#fff;padding:6px 8px;border-radius:6px 6px 0 0;font-weight:bold'>🔥 " +
      o.unit + " — " + o.name + (corrected ? " <span style='font-size:10px'>(اصلاح‌شده ✔)</span>" : "") + "</div>" +
      "<table style='width:100%;border-collapse:collapse;font-size:12px'>" +
      "<tr><td style='color:#666;width:35%'>آدرس</td><td>" + o.address + "</td></tr>" + metaRows +
      "<tr><td style='color:#666'>مختصات</td><td>" + o.lat.toFixed(5) + "، " + o.lon.toFixed(5) + "</td></tr>" +
      "</table>" +
      "<div style='background:#c62828;color:#fff;padding:5px 8px;margin-top:6px;border-radius:6px;font-weight:bold'>🚒 نزدیک‌ترین ایستگاه: " +
      s.name + "</div>" +
      "<table style='width:100%;border-collapse:collapse;font-size:12px'>" +
      (s.address ? "<tr><td style='color:#666;width:35%'>نشانی ایستگاه</td><td>" + s.address + "</td></tr>" : "") +
      (s.operator ? "<tr><td style='color:#666'>اپراتور</td><td>" + s.operator + "</td></tr>" : "") +
      (s.phone ? "<tr><td style='color:#666'>تلفن</td><td>" + s.phone + "</td></tr>" : "") +
      "<tr><td style='color:#666'>مسافت رانندگی</td><td><b>" + r.distance_km.toFixed(1) + " کیلومتر" + approx + "</b></td></tr>" +
      "<tr><td style='color:#666'>زمان تقریبی رسیدن</td><td><b>" + fmtMin(r.duration_min) + "</b></td></tr>" +
      "</table>" +
      "<div style='font-size:10px;color:#888;margin-top:4px'>برای اصلاح مکان، «حالت ویرایش» را روشن کنید و نشانگر را بکشید</div></div>";
  }

  var corrections = {};
  try { corrections = JSON.parse(localStorage.getItem(LSKEY) || "{}"); } catch (e) {}

  var items = {};
  RESULTS.forEach(function (it) {
    var o = it.office, s = it.station, r = it.route;
    if (!s) return;
    var c = corrections[o.id];
    if (c) {
      o.lat = c.lat; o.lon = c.lon;
      if (c.station_id && stById[c.station_id]) s = stById[c.station_id];
      if (c.route) r = c.route;
    }
    var mk = L.marker([o.lat, o.lon], { icon: officeIcon, draggable: false })
      .bindTooltip("اداره گاز: " + o.name).addTo(officesFG);
    var path = r.geometry || [[s.lat, s.lon], [o.lat, o.lon]];
    var line = L.polyline(path, { color: "#c62828", weight: 4, opacity: 0.85,
                                  dashArray: r.geometry ? null : "1,10" }).addTo(routesFG);
    var item = { o: o, s: s, r: r, mk: mk, line: line };
    items[o.id] = item;
    refreshUi(item, !!c);
    mk.on("dragend", function () { onMoved(item, mk.getLatLng()); });
  });

  function refreshUi(item, corrected) {
    item.mk.bindPopup(popupHtml(item.o, item.s, item.r, corrected), { maxWidth: 340 });
    item.line.bindTooltip("🚒 " + item.s.name + " ← " + item.o.name + " | " +
                          item.r.distance_km.toFixed(1) + " کیلومتر | " + fmtMin(item.r.duration_min));
  }

  async function onMoved(item, ll) {
    item.o.lat = ll.lat; item.o.lon = ll.lng;
    setStatus("⏳ در حال محاسبه نزدیک‌ترین ایستگاه و مسیر جدید…");
    var cands = STATIONS.slice().sort(function (a, b) {
      return hav(ll.lat, ll.lng, a.lat, a.lon) - hav(ll.lat, ll.lng, b.lat, b.lon);
    }).slice(0, 6);
    var best = null, bestRoute = null;
    try {
      var coords = cands.map(function (s) { return s.lon + "," + s.lat; }).join(";") + ";" + ll.lng + "," + ll.lat;
      var srcIdx = cands.map(function (_, i) { return i; }).join(";");
      var tRes = await fetch(OSRM + "/table/v1/driving/" + coords + "?sources=" + srcIdx +
                             "&destinations=" + cands.length + "&annotations=duration");
      var tj = await tRes.json();
      if (tj.code === "Ok" && tj.durations) {
        var bi = -1, bd = Infinity;
        tj.durations.forEach(function (row, i) {
          if (row[0] != null && row[0] < bd) { bd = row[0]; bi = i; }
        });
        if (bi >= 0) {
          best = cands[bi];
          var rRes = await fetch(OSRM + "/route/v1/driving/" + best.lon + "," + best.lat + ";" +
                                 ll.lng + "," + ll.lat + "?overview=full&geometries=geojson");
          var rj = await rRes.json();
          if (rj.code === "Ok" && rj.routes && rj.routes.length) {
            var R = rj.routes[0];
            bestRoute = { distance_km: Math.round(R.distance / 10) / 100,
                          duration_min: Math.round(R.duration / 6) / 10,
                          geometry: R.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) };
          }
        }
      }
    } catch (e) { console.warn("OSRM unreachable:", e); }
    if (!best || !bestRoute) {
      best = cands[0];
      var dk = hav(ll.lat, ll.lng, best.lat, best.lon) * 1.35;
      bestRoute = { distance_km: Math.round(dk * 100) / 100, duration_min: Math.round(dk / 40 * 600) / 10, fallback: true };
      setStatus("⚠️ مسیریاب آنلاین در دسترس نبود — فاصله/زمان تقریبی ثبت شد (با اتصال اینترنت دوباره جابه‌جا کنید)");
    } else {
      setStatus("✅ مسیر جدید محاسبه شد: " + best.name + " — " + bestRoute.distance_km.toFixed(1) +
                " کیلومتر، " + fmtMin(bestRoute.duration_min));
    }
    item.s = best; item.r = bestRoute;
    item.line.setLatLngs(bestRoute.geometry || [[best.lat, best.lon], [ll.lat, ll.lng]]);
    item.line.setStyle({ dashArray: bestRoute.geometry ? null : "1,10" });
    refreshUi(item, true);
    corrections[item.o.id] = { id: item.o.id, name: item.o.name, lat: ll.lat, lon: ll.lng,
                               station_id: best.osm_id, station_name: best.name, route: bestRoute,
                               edited_at: new Date().toISOString() };
    try { localStorage.setItem(LSKEY, JSON.stringify(corrections)); } catch (e) {}
    updateCount();
  }

  // ---- edit panel ----
  var editing = false;
  var Panel = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd: function () {
      var div = L.DomUtil.create("div");
      div.setAttribute("dir", "rtl");
      div.style.cssText = "background:rgba(255,255,255,.97);padding:8px 10px;border-radius:10px;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:Tahoma;font-size:12px;max-width:290px";
      div.innerHTML =
        "<b>🛠 اصلاح مکان ادارات گاز</b><br>" +
        "<button id='tgfEdit' style='margin:6px 2px 2px 0;padding:4px 10px;cursor:pointer;border-radius:6px;border:1px solid #f57c00;background:#fff'>🖊 حالت ویرایش: خاموش</button>" +
        "<button id='tgfSave' style='margin:2px;padding:4px 8px;cursor:pointer;border-radius:6px;border:1px solid #888;background:#fff'>💾 دانلود اصلاحات</button>" +
        "<label style='margin:2px;padding:4px 8px;cursor:pointer;border-radius:6px;border:1px solid #888;background:#fff;display:inline-block'>📤 بارگذاری<input id='tgfLoad' type='file' accept='.json' style='display:none'></label>" +
        "<button id='tgfReset' style='margin:2px;padding:4px 8px;cursor:pointer;border-radius:6px;border:1px solid #c62828;color:#c62828;background:#fff'>↩ بازنشانی</button>" +
        "<div id='tgfCount' style='color:#2e7d32;margin-top:4px'></div>" +
        "<div id='tgfStatus' style='color:#555;margin-top:2px;min-height:14px'></div>";
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  MAP.addControl(new Panel());

  function setStatus(t) { var el = document.getElementById("tgfStatus"); if (el) el.textContent = t; }
  function updateCount() {
    var n = Object.keys(corrections).length;
    var el = document.getElementById("tgfCount");
    if (el) el.textContent = n ? "✔ " + n + " اصلاح ذخیره‌شده (در همین مرورگر)" : "";
  }
  updateCount();

  document.getElementById("tgfEdit").addEventListener("click", function () {
    editing = !editing;
    this.textContent = editing ? "🖊 حالت ویرایش: روشن" : "🖊 حالت ویرایش: خاموش";
    this.style.background = editing ? "#f57c00" : "#fff";
    this.style.color = editing ? "#fff" : "#000";
    for (var id in items) {
      if (editing) items[id].mk.dragging.enable(); else items[id].mk.dragging.disable();
    }
    setStatus(editing ? "نشانگر نارنجی هر اداره را بگیرید و به جای درست بکشید — مسیر خودکار به‌روز می‌شود"
                      : "");
  });

  document.getElementById("tgfSave").addEventListener("click", function () {
    var payload = { exported_utc: new Date().toISOString(), corrections: corrections };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gas_offices_corrections.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("فایل اصلاحات دانلود شد — می‌توانید آن را برای اعمال دائمی روی نقشه بفرستید");
  });

  document.getElementById("tgfLoad").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result);
        var c = j.corrections || j;
        Object.keys(c).forEach(function (k) { corrections[k] = c[k]; });
        localStorage.setItem(LSKEY, JSON.stringify(corrections));
        location.reload();
      } catch (e) { setStatus("❌ فایل نامعتبر است"); }
    };
    rd.readAsText(f);
  });

  document.getElementById("tgfReset").addEventListener("click", function () {
    if (!confirm("همه اصلاحات این مرورگر حذف و مکان‌ها به حالت اولیه برگردد؟")) return;
    localStorage.removeItem(LSKEY);
    location.reload();
  });

  // exposed for automated testing
  window._tgf = { items: items, onMoved: onMoved, corrections: function () { return corrections; } };
});
</script>
"""


def main():
    with open(os.path.join(HERE, "data", "geo_results.json"), encoding="utf-8") as f:
        data = json.load(f)

    # Full station list for browser-side nearest-station recompute; fall back
    # to the stations referenced by results if the full fetch hasn't run yet.
    stations_path = os.path.join(HERE, "data", "stations.json")
    if os.path.exists(stations_path):
        with open(stations_path, encoding="utf-8") as f:
            stations = json.load(f)["stations"]
    else:
        seen = {}
        for it in data["results"]:
            s = it.get("station")
            if s:
                seen[s["osm_id"]] = s
        stations = list(seen.values())

    m = folium.Map(location=[35.700, 51.391], zoom_start=11, tiles=None, control_scale=True)

    has_boundary = bool(data.get("boundary"))
    if has_boundary:
        boundary = folium.FeatureGroup(name="محدوده شهر تهران", show=True)
        for seg in data["boundary"]:
            folium.PolyLine(seg, color="#2e7d32", weight=2.5, opacity=0.7, dash_array="6,6").add_to(boundary)
        boundary.add_to(m)

    boundary_line = "خط‌چین سبز = محدوده شهر تهران — " if has_boundary else ""
    title = f"""
<div dir="rtl" style="position:fixed;top:10px;right:60px;z-index:9999;background:rgba(255,255,255,.95);
     padding:10px 14px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.3);font-family:Tahoma;max-width:380px">
  <div style="font-size:15px;font-weight:bold;color:#333">🗺️ ادارات گاز شهر تهران و نزدیک‌ترین ایستگاه آتش‌نشانی</div>
  <div style="font-size:11px;color:#555;margin-top:4px">
    🔥 نارنجی = اداره گاز &nbsp;|&nbsp; 🚒 قرمز = ایستگاه آتش‌نشانی &nbsp;|&nbsp; خط قرمز = مسیر رانندگی خودروی آتش‌نشانی<br>
    {boundary_line}روی هر نشانگر کلیک کنید (فاصله و زمان رسیدن)<br>
    مکان اشتباه است؟ پایین‌چپ «حالت ویرایش» را روشن کنید و نشانگر را به جای درست بکشید<br>
    منبع داده: OpenStreetMap + مسیریابی OSRM — زمان‌ها بدون ترافیک است، فوریت: ۱۲۵
  </div>
</div>"""
    m.get_root().html.add_child(folium.Element(title))

    app = APP_JS.replace("__RESULTS__", json.dumps(data["results"], ensure_ascii=False)) \
                .replace("__STATIONS__", json.dumps(stations, ensure_ascii=False))
    m.get_root().html.add_child(folium.Element(app))

    Fullscreen(title="تمام‌صفحه", title_cancel="خروج").add_to(m)
    MiniMap(toggle_display=True).add_to(m)

    out = os.path.join(HERE, "output", "tehran_gas_fire_map.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    m.save(out)
    print("saved", out, "| stations embedded:", len(stations))


if __name__ == "__main__":
    main()
