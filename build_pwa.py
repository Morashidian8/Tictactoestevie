"""
Build the static PWA data: precompute the full alternation statistics for every
window (clock-hour and rolling) and every weekday over the past year, for each
combination of exchange (Binance, Coinbase) and timeframe (5m, 15m), into
site/data.json. Then copy the PWA shell (pwa/*) next to it.

The installed web app just sorts/filters these precomputed numbers, so it is
instant and works offline, and lets the user switch exchange + timeframe.

Run (where the exchanges are reachable, e.g. in CI):
    PWA_OUT=site python build_pwa.py
"""

import os
import json
import shutil
from datetime import datetime, timezone

os.environ.setdefault("ANALYSIS_TZ", "Asia/Tehran")
import analyze_history as A  # noqa: E402  (env must be set first)

OUT = os.environ.get("PWA_OUT", "site").strip()
DAYS = int(os.environ.get("ANALYSIS_DAYS", "365"))
HERE = os.path.dirname(os.path.abspath(__file__))

# (key, exchange-label, timeframe-label, source, interval, granularity, product)
CONFIGS = [
    ("binance_5m", "Binance", "۵ دقیقه", "binance", "5m", 300, "BTCUSDT"),
    ("binance_15m", "Binance", "۱۵ دقیقه", "binance", "15m", 900, "BTCUSDT"),
    ("binance_1h", "Binance", "۱ ساعت", "binance", "1h", 3600, "BTCUSDT"),
    ("coinbase_5m", "Coinbase", "۵ دقیقه", "coinbase", "5m", 300, "BTC-USD"),
    ("coinbase_15m", "Coinbase", "۱۵ دقیقه", "coinbase", "15m", 900, "BTC-USD"),
    ("coinbase_1h", "Coinbase", "۱ ساعت", "coinbase", "1h", 3600, "BTC-USD"),
]
# Rolling-window lengths to precompute (minutes), 30m … 10h. A window is only
# built for a timeframe when it spans at least 2 candles (so 1h windows are
# skipped on the 1-hour timeframe, 30m only applies to 5m/15m, etc.).
WIN_LENGTHS = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600]
RECENT_K = 6  # how many most-recent occurrences of each window to keep


def pack(stats):
    return {
        "n": stats["n"],
        "avg": round(stats["avg"], 3),
        "ap": stats["above_pct"],
        "mx": stats["max"],
        "mxc": stats["max_count"],
        "hist": [[v, c] for v, c in stats["hist"]],
    }


def fetch(source, interval, granularity, product):
    if source == "coinbase":
        return A.fetch_coinbase(granularity, DAYS, product)
    return A.fetch_binance(interval, granularity, DAYS, product)


def build_dataset(tz, source, interval, granularity, product, ex_label, tf_label):
    candles = fetch(source, interval, granularity, product)
    if not candles:
        print(f"  ⚠️  no candles for {source} {interval}")
        return None
    # Clock (on-the-hour) buckets only make sense when an hour holds several
    # candles; for the 1-hour timeframe each hour is a single candle, so skip.
    clock_out = {}
    if granularity < 3600:
        clock = A.build_hour_samples(candles, tz)
        for wd in range(7):
            c = []
            for h in range(24):
                vals = clock[wd][h]
                if vals:
                    c.append({"start": h * 60, "label": A.hour_label(h), **pack(A.summarize_hour(vals))})
            c.sort(key=lambda x: x["start"])
            clock_out[str(wd)] = c

    # Rolling windows for each length that is a whole number (>=2) of candles
    # on this timeframe (e.g. 90m is valid on 5m/15m but not on 1h).
    tf_min = granularity // 60
    rolling_out = {}
    for wm in WIN_LENGTHS:
        if wm % tf_min != 0:
            continue  # not an exact number of candles on this timeframe
        win = wm // tf_min  # candles per window
        if win < 2:
            continue  # window too short for this timeframe (e.g. 1h on 1h)
        samples = A.build_rolling_samples(candles, tz, win=win, with_times=True)
        per_wd = {}
        for wd in range(7):
            r = []
            for (h, m), pairs in samples[wd].items():
                flips = [f for _, f in pairs]
                recent = pairs[-RECENT_K:]              # oldest -> newest
                rc = [f for _, f in recent][::-1]        # newest first
                rd = datetime.fromtimestamp(recent[-1][0], tz=tz).strftime("%Y-%m-%d")
                r.append({"start": h * 60 + m, "label": A.window_label(h, m, wm),
                          **pack(A.summarize_hour(flips)), "rc": rc, "rd": rd})
            r.sort(key=lambda x: x["start"])
            per_wd[str(wd)] = r
        rolling_out[str(wm)] = per_wd

    oldest = datetime.fromtimestamp(candles[0]["time"], tz=tz)
    newest = datetime.fromtimestamp(candles[-1]["time"], tz=tz)

    # Whole-series stats per threshold N: gap to the next alternation, and the
    # length of that next alternation.
    runs = A.alternation_runs(candles)
    max_len = max((e - s + 1 for s, e in runs), default=0)
    gaps_out = {}
    for N in range(1, min(max_len, 25) + 1):
        gaps, nexts = A.next_run_stats(runs, N)
        g = A.gap_summary(gaps)
        if g:
            gaps_out[str(N)] = {"gap": g, "next": A.gap_summary(nexts)}

    return {
        "meta": {
            "exchange": ex_label, "timeframe": tf_label, "source": source,
            "interval": interval, "candles": len(candles),
            "oldest": oldest.strftime("%Y-%m-%d %H:%M"),
            "newest": newest.strftime("%Y-%m-%d %H:%M"),
            "tf_minutes": granularity // 60,
        },
        "clock": clock_out,
        "rolling": rolling_out,
        "gaps": gaps_out,
    }


def lowest_rolling(ds, wd, wm):
    """Return (label, avg) of the calmest `wm`-minute rolling window for a day."""
    items = ds["rolling"][str(wm)][str(wd)]
    if not items:
        return ("—", float("nan"))
    best = min(items, key=lambda x: x["avg"])
    return (best["label"], best["avg"])


def main():
    tz, tz_name = A.get_tz()
    datasets = {}
    for key, ex_label, tf_label, source, interval, gran, product in CONFIGS:
        print(f"== building {key} ({ex_label} {tf_label}) ==")
        try:
            ds = build_dataset(tz, source, interval, gran, product, ex_label, tf_label)
        except Exception as exc:  # one exchange failing must not kill the rest
            print(f"  ⚠️  {key} failed: {exc}")
            ds = None
        if ds:
            datasets[key] = ds
            print(f"  {key}: {ds['meta']['candles']:,} candles")

    if not datasets:
        raise SystemExit("No datasets built.")

    # Real-data verification: highest 1-hour-window alternation actually seen
    # per weekday on Binance 5m, with where/how often — so the deploy log
    # proves the stats capture high alternations (e.g. 7).
    bds = datasets.get("binance_5m")
    if bds and "60" in bds["rolling"]:
        print("\n--- بازرسی داده‌ی واقعی: بیشترین تناوبِ بازه‌ی ۱ساعته در هر روز (Binance 5m) ---")
        for wd in A.WEEKDAY_DISPLAY_ORDER:
            wins = bds["rolling"]["60"][str(wd)]
            top = max(wins, key=lambda w: w["mx"])
            print(f"{A.PERSIAN_WEEKDAY[wd]:>9}: بیشینه‌ی واقعی={top['mx']} "
                  f"(در بازه {top['label']}، {top['mxc']} بار طی سال)")

    # Console comparison: Binance vs Coinbase, calmest rolling window per weekday.
    # 5m uses 60-min windows; 15m uses the new 120-min (8-candle) windows.
    for tf, wm in (("5m", 60), ("15m", 120)):
        bk, ck = f"binance_{tf}", f"coinbase_{tf}"
        if bk in datasets and ck in datasets:
            print(f"\n--- مقایسه Binance vs Coinbase ({tf}, بازه {wm} دقیقه) ---")
            for wd in A.WEEKDAY_DISPLAY_ORDER:
                bl, ba = lowest_rolling(datasets[bk], wd, wm)
                cl, ca = lowest_rolling(datasets[ck], wd, wm)
                print(f"{A.PERSIAN_WEEKDAY[wd]:>9}: Binance {bl}={ba:.2f}  |  "
                      f"Coinbase {cl}={ca:.2f}  (Δmiang={abs(ba - ca):.2f})")

    data = {
        "meta": {
            "tz": tz_name,
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "win_lengths": WIN_LENGTHS,
            "days": DAYS,
        },
        "order": A.WEEKDAY_DISPLAY_ORDER,
        "names": {str(k): v for k, v in A.PERSIAN_WEEKDAY.items()},
        "datasets": datasets,
    }

    os.makedirs(OUT, exist_ok=True)
    shell = os.path.join(HERE, "pwa")
    for name in os.listdir(shell):
        shutil.copy(os.path.join(shell, name), os.path.join(OUT, name))
    with open(os.path.join(OUT, "data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nPWA built into {OUT}/ with datasets: {', '.join(datasets)}")


if __name__ == "__main__":
    main()
