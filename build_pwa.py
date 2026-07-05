"""
Build the static PWA data: precompute the full alternation statistics for every
window (clock-hour and rolling) and every weekday over a growing window that
starts at a fixed date (see ANALYSIS_START) and extends to now, for each
combination of exchange (Binance, Coinbase) and timeframe (5m, 15m), into
site/data.json. Then copy the PWA shell (pwa/*) next to it.

The installed web app just sorts/filters these precomputed numbers, so it is
instant and works offline, and lets the user switch exchange + timeframe.

Run (where the exchanges are reachable, e.g. in CI):
    PWA_OUT=site python build_pwa.py
"""

import os
import csv
import json
import time
import shutil
from datetime import datetime, timezone

os.environ.setdefault("ANALYSIS_TZ", "Asia/Tehran")
import analyze_history as A  # noqa: E402  (env must be set first)

OUT = os.environ.get("PWA_OUT", "site").strip()
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, ".cache")

# Fixed analysis START date (locked). The analysed range runs from this date to
# "now", so it GROWS every day instead of sliding as a rolling 1-year window.
# Candles are cached per dataset and only the new tail is downloaded on each
# build, so the range can grow indefinitely without re-downloading everything.
ANALYSIS_START = os.environ.get("ANALYSIS_START", "2025-07-03").strip()
START_TS = int(datetime.strptime(ANALYSIS_START, "%Y-%m-%d")
               .replace(tzinfo=timezone.utc).timestamp())


def _days_since(ts):
    return max(2, (int(time.time()) - ts) // 86400 + 1)


DAYS = _days_since(START_TS)  # span currently covered (for meta/reporting only)

# Coins to analyse: (key, Persian label, Binance symbol, Coinbase product).
COINS = [
    ("btc", "بیت‌کوین", "BTCUSDT", "BTC-USD"),
    ("eth", "اتریوم", "ETHUSDT", "ETH-USD"),
    ("sol", "سولانا", "SOLUSDT", "SOL-USD"),
]
EXCHANGES = [("binance", "Binance"), ("coinbase", "Coinbase")]
TIMEFRAMES = [("5m", "۵ دقیقه", 300), ("15m", "۱۵ دقیقه", 900), ("1h", "۱ ساعت", 3600)]

# One dataset per coin × exchange × timeframe. Dataset key = "<coin>_<src>_<tf>"
# (e.g. "eth_binance_5m"). Each entry:
#   (key, coin-key, coin-label, exchange-label, tf-label, source, interval,
#    granularity, product)
CONFIGS = [
    (f"{ck}_{src}_{interval}", ck, clabel, exlabel, tflabel, src, interval, gran,
     (bsym if src == "binance" else cprod))
    for ck, clabel, bsym, cprod in COINS
    for src, exlabel in EXCHANGES
    for interval, tflabel, gran in TIMEFRAMES
]
# Rolling-window lengths to precompute (minutes), 30m … 10h. A window is only
# built for a timeframe when it spans at least 2 candles (so 1h windows are
# skipped on the 1-hour timeframe, 30m only applies to 5m/15m, etc.).
WIN_LENGTHS = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600]
RECENT_K = 6  # how many most-recent occurrences of each window to keep
RECORD_RECENT = 4  # flag a window if its all-time max was beaten within the
#                    last this-many occurrences (~weeks) -> "record just broke"


def recent_record(pairs, tz):
    """
    If the window's all-time maximum alternation was beaten *recently* (within
    the last RECORD_RECENT occurrences), return {"w": date, "f": old_max,
    "t": new_max}; otherwise None. `pairs` is the chronological (time, flips)
    list. A "record break" is an occurrence strictly higher than every earlier
    one — this is exactly the silent upward correction the user wants flagged.
    """
    best = None
    brk = None          # (time, old_best, new_value)
    brk_idx = None
    for i, (t, f) in enumerate(pairs):
        if best is not None and f > best:
            brk = (t, best, f)
            brk_idx = i
        best = f if best is None else max(best, f)
    if brk is None or brk_idx < len(pairs) - RECORD_RECENT:
        return None  # never beaten, or the last break is too old to be "recent"
    t, old, new = brk
    return {"w": datetime.fromtimestamp(t, tz=tz).strftime("%Y-%m-%d"),
            "f": old, "t": new}


def pack(stats):
    return {
        "n": stats["n"],
        "avg": round(stats["avg"], 3),
        "ap": stats["above_pct"],
        "mx": stats["max"],
        "mxc": stats["max_count"],
        "hist": [[v, c] for v, c in stats["hist"]],
    }


def _cache_path(source, interval, product):
    safe = product.replace("/", "-")
    return os.path.join(CACHE_DIR, f"pwa_{source}_{interval}_{safe}.csv")


def _load_candles_csv(path):
    if not os.path.exists(path):
        return []
    try:
        with open(path, newline="") as f:
            out = [{"time": int(r["time"]), "open": float(r["open"]),
                    "high": float(r["high"]), "low": float(r["low"]),
                    "close": float(r["close"])} for r in csv.DictReader(f)]
    except Exception:
        return []
    out.sort(key=lambda c: c["time"])
    return out


def _save_candles_csv(path, candles):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["time", "open", "high", "low", "close"])
        w.writeheader()
        w.writerows(candles)


def _merge_candles(base, extra):
    """Union two candle lists by timestamp (extra wins on overlap), sorted."""
    d = {c["time"]: c for c in base}
    for c in extra:
        d[c["time"]] = c
    return [d[k] for k in sorted(d)]


def _raw_fetch(source, interval, granularity, days, product):
    if source == "coinbase":
        return A.fetch_coinbase(granularity, days, product)
    return A.fetch_binance(interval, granularity, days, product)


def fetch(source, interval, granularity, product):
    """
    Incrementally-cached fetch from the fixed START date to now.

    First build downloads the whole span and caches it; later builds only fetch
    the new tail (candles since the newest cached one) and append it, so the
    analysed range GROWS over time instead of re-downloading a year each run.
    The cache lives in .cache/ which CI persists between runs.
    """
    path = _cache_path(source, interval, product)
    cached = _load_candles_csv(path)
    now = int(time.time())
    if cached and cached[0]["time"] <= START_TS + granularity * 2:
        # Cache already reaches back to the fixed start: fetch only the recent
        # tail since the newest cached candle (small download) and append it.
        gap_days = max(1, (now - cached[-1]["time"]) // 86400 + 2)
        tail = _raw_fetch(source, interval, granularity, gap_days, product)
        merged = _merge_candles(cached, tail)
    else:
        # No cache yet (or it doesn't reach the start) -> full span download.
        merged = _merge_candles(cached, _raw_fetch(
            source, interval, granularity, _days_since(START_TS), product))
    _save_candles_csv(path, merged)
    return [c for c in merged if c["time"] >= START_TS]


def build_dataset(tz, source, interval, granularity, product, ex_label, tf_label,
                  coin_key="btc", coin_label="بیت‌کوین"):
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
                entry = {"start": h * 60 + m, "label": A.window_label(h, m, wm),
                         **pack(A.summarize_hour(flips)), "rc": rc, "rd": rd}
                rec = recent_record(pairs, tz)
                if rec:
                    entry["rec"] = rec  # all-time max was beaten recently
                r.append(entry)
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
            "coin": coin_key, "coin_label": coin_label,
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
    for (key, coin_key, coin_label, ex_label, tf_label,
         source, interval, gran, product) in CONFIGS:
        print(f"== building {key} ({coin_label} {ex_label} {tf_label}) ==")
        try:
            ds = build_dataset(tz, source, interval, gran, product, ex_label,
                               tf_label, coin_key, coin_label)
        except Exception as exc:  # one exchange failing must not kill the rest
            print(f"  ⚠️  {key} failed: {exc}")
            ds = None
        if ds:
            datasets[key] = ds
            print(f"  {key}: {ds['meta']['candles']:,} candles")

    if not datasets:
        raise SystemExit("No datasets built.")

    # Coins that actually produced at least one dataset, in COINS order — the
    # app builds its coin selector from this so new coins appear automatically.
    coins_built = [[ck, clabel] for ck, clabel, *_ in COINS
                   if any(k.startswith(ck + "_") for k in datasets)]

    # Real-data verification: highest 1-hour-window alternation actually seen
    # per weekday on BTC Binance 5m, with where/how often — so the deploy log
    # proves the stats capture high alternations (e.g. 7).
    bds = datasets.get("btc_binance_5m")
    if bds and "60" in bds["rolling"]:
        print("\n--- بازرسی داده‌ی واقعی: بیشترین تناوبِ بازه‌ی ۱ساعته در هر روز (BTC Binance 5m) ---")
        for wd in A.WEEKDAY_DISPLAY_ORDER:
            wins = bds["rolling"]["60"][str(wd)]
            top = max(wins, key=lambda w: w["mx"])
            print(f"{A.PERSIAN_WEEKDAY[wd]:>9}: بیشینه‌ی واقعی={top['mx']} "
                  f"(در بازه {top['label']}، {top['mxc']} بار)")

    # Console comparison: Binance vs Coinbase for BTC, calmest rolling window per
    # weekday. 5m uses 60-min windows; 15m uses 120-min (8-candle) windows.
    for tf, wm in (("5m", 60), ("15m", 120)):
        bk, ck = f"btc_binance_{tf}", f"btc_coinbase_{tf}"
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
            "start": ANALYSIS_START,
            "coins": coins_built,
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
