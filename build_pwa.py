"""
Build the static PWA: precompute the full alternation statistics for every
window (both clock-hour and rolling 5-minute-step) and every weekday over the
past year into site/data.json, then copy the PWA shell (pwa/*) next to it.

The heavy work (alternation per window across a year) is done here once; the
installed web app only sorts/filters the precomputed numbers, so it is instant
and works offline.

Run (after the data source is reachable, e.g. in CI):
    PWA_OUT=site python build_pwa.py
"""

import os
import json
import shutil
from datetime import datetime, timezone

# Sensible defaults for the published app.
os.environ.setdefault("ANALYSIS_SOURCE", "binance")
os.environ.setdefault("ANALYSIS_DAYS", "365")
os.environ.setdefault("ANALYSIS_TZ", "Asia/Tehran")

import analyze_history as A  # noqa: E402  (env must be set first)

OUT = os.environ.get("PWA_OUT", "site").strip()
HERE = os.path.dirname(os.path.abspath(__file__))


def pack(stats):
    """Compact one summarize_hour() dict for JSON."""
    return {
        "n": stats["n"],
        "avg": round(stats["avg"], 3),
        "ap": stats["above_pct"],  # % of occurrences above the average
        "mx": stats["max"],
        "mxc": stats["max_count"],
        "hist": [[v, c] for v, c in stats["hist"]],
    }


def main():
    tz, tz_name = A.get_tz()
    candles = A.get_candles()
    if not candles:
        raise SystemExit("No candles available — run where the source is reachable.")

    clock = A.build_hour_samples(candles, tz)
    rolling = A.build_rolling_samples(candles, tz)

    clock_out, rolling_out = {}, {}
    for wd in range(7):
        c = []
        for h in range(24):
            vals = clock[wd][h]
            if vals:
                c.append({"start": h * 60, "label": A.hour_label(h), **pack(A.summarize_hour(vals))})
        c.sort(key=lambda x: x["start"])
        clock_out[str(wd)] = c

        r = []
        for (h, m), vals in rolling[wd].items():
            r.append({"start": h * 60 + m, "label": A.window_label(h, m), **pack(A.summarize_hour(vals))})
        r.sort(key=lambda x: x["start"])
        rolling_out[str(wd)] = r

    oldest = datetime.fromtimestamp(candles[0]["time"], tz=tz)
    newest = datetime.fromtimestamp(candles[-1]["time"], tz=tz)
    data = {
        "meta": {
            "source": A.ANALYSIS_SOURCE,
            "candles": len(candles),
            "tz": tz_name,
            "oldest": oldest.strftime("%Y-%m-%d %H:%M"),
            "newest": newest.strftime("%Y-%m-%d %H:%M"),
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "win_minutes": A.WIN_MINUTES,
        },
        # Iranian display order, Mon=0..Sun=6 keys, with Persian names.
        "order": A.WEEKDAY_DISPLAY_ORDER,
        "names": {str(k): v for k, v in A.PERSIAN_WEEKDAY.items()},
        "clock": clock_out,
        "rolling": rolling_out,
    }

    os.makedirs(OUT, exist_ok=True)
    # Copy the PWA shell (index.html, app.js, manifest, sw.js, icons).
    shell = os.path.join(HERE, "pwa")
    for name in os.listdir(shell):
        shutil.copy(os.path.join(shell, name), os.path.join(OUT, name))
    with open(os.path.join(OUT, "data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"PWA built into {OUT}/ — {len(candles):,} candles, "
          f"{sum(len(v) for v in rolling_out.values())} rolling windows.")


if __name__ == "__main__":
    main()
