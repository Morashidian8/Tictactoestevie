"""
Historical BTC 5-minute candle alternation ("تناوب") analysis — one year back.

For EACH weekday (شنبه ... جمعه) separately, this finds the 2 hours of the day
that had the LOWEST candle-direction alternation over the past year, and for
each of those hours reports:

  1) the hour itself (in the configured timezone),
  2) how many times that weekday-hour occurred during the year (sample size),
  3) the MINIMUM alternation value seen in that hour and how many times it
     occurred,
  4) the AVERAGE alternation in that hour,
  5) the MAXIMUM alternation value seen in that hour and how many times it
     occurred during the year.

"تناوب" here = consecutive flips of candle color (green/red) — exactly the
metric the live bot (bot.py) alerts on. For each hour-instance (a specific
date+hour, up to 12 five-minute candles) we measure the LONGEST run of
strictly alternating candles ("متوالی") and express it as a flip count:

    flips = (length of longest alternating run in candles) - 1

So an hour whose 12 candles go 🟢🔴🟢🔴🟢🔴🟢🔴🟢🔴🟢🔴 scores 11 flips, while a
calm trending hour (🟢🟢🟢🟢...) scores 0.

Data source: Binance public 5-minute klines (no API key), using the same host
list and helpers as bot.py.

Usage:
    python analyze_history.py

Environment variables (all optional):
    ANALYSIS_DAYS   number of days back to analyze        (default 365)
    ANALYSIS_TZ     timezone for weekday/hour bucketing   (default Asia/Tehran)
    PRODUCT         Binance symbol                         (default BTCUSDT)
    INTERVAL        Binance kline interval                 (default 5m)
    CACHE_FILE      where to cache raw candles as CSV      (default .cache/klines.csv)
"""

import os
import sys
import csv
import time
from datetime import datetime, timedelta, timezone

import requests

# Reuse the project's existing definitions so this analysis stays consistent
# with the live bot's notion of candle direction and data source.
from bot import (
    candle_direction,
    BINANCE_HOSTS,
    PRODUCT,
    INTERVAL,
    GRANULARITY,
)

ANALYSIS_DAYS = int(os.environ.get("ANALYSIS_DAYS", "365"))
ANALYSIS_TZ = os.environ.get("ANALYSIS_TZ", "Asia/Tehran").strip()
CACHE_FILE = os.environ.get("CACHE_FILE", ".cache/klines.csv").strip()

# Persian weekday names, ordered the Iranian way (week starts on Saturday).
# Mapping is from Python's date.weekday(): Monday=0 ... Sunday=6.
PERSIAN_WEEKDAY = {
    5: "شنبه",        # Saturday
    6: "یک‌شنبه",      # Sunday
    0: "دوشنبه",       # Monday
    1: "سه‌شنبه",      # Tuesday
    2: "چهارشنبه",     # Wednesday
    3: "پنج‌شنبه",     # Thursday
    4: "جمعه",        # Friday
}
WEEKDAY_DISPLAY_ORDER = [5, 6, 0, 1, 2, 3, 4]


# ---------------------------------------------------------------------------
# Timezone handling (weekday + hour bucketing depends on this!)
# ---------------------------------------------------------------------------
def get_tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(ANALYSIS_TZ), ANALYSIS_TZ
    except Exception as exc:  # missing tzdata or bad name -> fall back to UTC
        print(
            f"⚠️  Could not load timezone '{ANALYSIS_TZ}' ({exc}); "
            "falling back to UTC. (pip install tzdata to fix.)",
            file=sys.stderr,
        )
        return timezone.utc, "UTC"


# ---------------------------------------------------------------------------
# Fetching one year of 5-minute candles from Binance (paginated)
# ---------------------------------------------------------------------------
def _get_klines(start_ms, end_ms, limit=1000):
    """One Binance klines page, trying each host until one works."""
    last_err = None
    for host in BINANCE_HOSTS:
        try:
            resp = requests.get(
                f"{host}/api/v3/klines",
                params={
                    "symbol": PRODUCT,
                    "interval": INTERVAL,
                    "startTime": start_ms,
                    "endTime": end_ms,
                    "limit": limit,
                },
                timeout=20,
                headers={"User-Agent": "btc-history-analysis/1.0"},
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            last_err = exc
            print(f"  host {host} failed: {exc}", file=sys.stderr)
            continue
    raise last_err if last_err else RuntimeError("all Binance hosts failed")


def fetch_year(days):
    """Return a list of closed candles (dicts) oldest -> newest for `days`."""
    now_ms = int(time.time() * 1000)
    start_ms = now_ms - days * 86400 * 1000
    step = GRANULARITY * 1000

    out = {}
    cur = start_ms
    pages = 0
    while cur < now_ms:
        rows = _get_klines(cur, now_ms, limit=1000)
        if not rows:
            break
        for row in rows:
            open_time = int(row[0])
            close_time = int(row[6])
            if close_time / 1000.0 > time.time():
                continue  # skip the still-forming candle
            out[open_time] = {
                "time": open_time // 1000,
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
            }
        pages += 1
        last_open = int(rows[-1][0])
        nxt = last_open + step
        if nxt <= cur:  # no forward progress -> stop
            break
        cur = nxt
        if len(rows) < 1000:
            break  # reached the end of the available range
        if pages % 10 == 0:
            print(f"  ...fetched {pages} pages, {len(out)} candles so far")
        time.sleep(0.25)  # be polite to the API

    candles = [out[k] for k in sorted(out)]
    return candles


# ---------------------------------------------------------------------------
# Caching (so you don't re-download a year of data on every run)
# ---------------------------------------------------------------------------
def load_cache():
    if not os.path.exists(CACHE_FILE):
        return None
    try:
        with open(CACHE_FILE, newline="") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            return None
        return [
            {
                "time": int(r["time"]),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
            }
            for r in rows
        ]
    except Exception:
        return None


def save_cache(candles):
    os.makedirs(os.path.dirname(CACHE_FILE) or ".", exist_ok=True)
    with open(CACHE_FILE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["time", "open", "high", "low", "close"])
        w.writeheader()
        w.writerows(candles)


def get_candles():
    cached = load_cache()
    if cached:
        newest = datetime.fromtimestamp(cached[-1]["time"], tz=timezone.utc)
        age_h = (datetime.now(timezone.utc) - newest).total_seconds() / 3600
        oldest = datetime.fromtimestamp(cached[0]["time"], tz=timezone.utc)
        span_days = (newest - oldest).days
        if age_h < 24 and span_days >= ANALYSIS_DAYS - 2:
            print(
                f"Using cached candles ({len(cached)} rows, "
                f"{span_days} days, {age_h:.1f}h old). Delete {CACHE_FILE} to refresh."
            )
            return cached
    print(f"Downloading ~{ANALYSIS_DAYS} days of {INTERVAL} {PRODUCT} candles...")
    candles = fetch_year(ANALYSIS_DAYS)
    if candles:
        save_cache(candles)
    return candles


# ---------------------------------------------------------------------------
# Alternation metric
# ---------------------------------------------------------------------------
def longest_alt_flips(directions):
    """
    Number of flips in the LONGEST strictly-alternating run inside `directions`.

    A "flip" is two adjacent candles with opposite non-flat directions
    (cur == -prev). Doji (0) breaks the run. An all-trending hour returns 0.
    """
    best = 0
    cur = 0
    for i in range(1, len(directions)):
        a, b = directions[i], directions[i - 1]
        if a != 0 and b != 0 and a == -b:
            cur += 1
            if cur > best:
                best = cur
        else:
            cur = 0
    return best


# ---------------------------------------------------------------------------
# Build per (weekday, hour) samples and summarize
# ---------------------------------------------------------------------------
def build_hour_samples(candles, tz):
    """
    Returns: samples[weekday][hour] = list of per-instance flip counts.

    Each instance is one (calendar date, hour) bucket containing that hour's
    five-minute candles, in time order.
    """
    # Group candle directions by (date, weekday, hour) in the target timezone.
    buckets = {}  # (date, weekday, hour) -> list of (minute_key, direction)
    for c in candles:
        dt = datetime.fromtimestamp(c["time"], tz=timezone.utc).astimezone(tz)
        key = (dt.date(), dt.weekday(), dt.hour)
        buckets.setdefault(key, []).append((c["time"], candle_direction(c)))

    samples = {wd: {h: [] for h in range(24)} for wd in range(7)}
    for (date, weekday, hour), items in buckets.items():
        items.sort(key=lambda x: x[0])  # chronological within the hour
        dirs = [d for _, d in items]
        flips = longest_alt_flips(dirs)
        samples[weekday][hour].append(flips)
    return samples


def summarize_hour(values):
    """Return a stats dict for one (weekday, hour) sample list."""
    n = len(values)
    mn = min(values)
    mx = max(values)
    return {
        "n": n,
        "avg": sum(values) / n,
        "min": mn,
        "min_count": values.count(mn),
        "max": mx,
        "max_count": values.count(mx),
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def hour_label(h):
    return f"{h:02d}:00–{h:02d}:59"


def main():
    tz, tz_name = get_tz()
    candles = get_candles()
    if not candles:
        print(
            "No candles were returned. If you are running inside a restricted "
            "network, run this where Binance is reachable (locally or in CI)."
        )
        return

    oldest = datetime.fromtimestamp(candles[0]["time"], tz=tz)
    newest = datetime.fromtimestamp(candles[-1]["time"], tz=tz)
    print()
    print("=" * 64)
    print("تحلیل تاریخی تناوب کندل ۵ دقیقه‌ای بیت‌کوین")
    print("=" * 64)
    print(f"نماد            : {PRODUCT}  ({INTERVAL})")
    print(f"منطقه زمانی     : {tz_name}")
    print(f"تعداد کندل      : {len(candles):,}")
    print(f"بازه            : {oldest:%Y-%m-%d %H:%M} تا {newest:%Y-%m-%d %H:%M}")
    print(
        "معیار تناوب     : طول بلندترین رشته‌ی متناوب (سبز/قرمز) داخل هر ساعت، "
        "برحسب تعداد تغییر رنگ (flip)"
    )
    print("=" * 64)

    samples = build_hour_samples(candles, tz)

    for wd in WEEKDAY_DISPLAY_ORDER:
        name = PERSIAN_WEEKDAY[wd]
        # Rank the 24 hours of this weekday by AVERAGE alternation, ascending.
        hour_stats = []
        for h in range(24):
            vals = samples[wd][h]
            if not vals:
                continue
            hour_stats.append((h, summarize_hour(vals)))
        if not hour_stats:
            continue
        hour_stats.sort(key=lambda x: (x[1]["avg"], x[1]["max"]))
        lowest_two = hour_stats[:2]

        print()
        print(f"📅 {name}  —  ۲ ساعتِ کم‌ترین تناوب در طول سال")
        print("-" * 64)
        for rank, (h, s) in enumerate(lowest_two, start=1):
            print(f"  {rank}) ساعت {hour_label(h)}  (به وقت {tz_name})")
            print(f"       • تعداد تکرار این ساعت در سال : {s['n']} بار")
            print(
                f"       • کم‌ترین تناوب متوالی        : {s['min']} "
                f"(در {s['min_count']} بار از {s['n']})"
            )
            print(f"       • میانگین تناوب در این ساعت   : {s['avg']:.2f}")
            print(
                f"       • بیشینه تناوب در این ساعت     : {s['max']} "
                f"(در {s['max_count']} بار از {s['n']} تکرار شده)"
            )
        print()

    print("=" * 64)
    print(
        "یادداشت: «روز هفته» و «ساعت» بر اساس منطقه زمانی بالا محاسبه شده‌اند؛ "
        f"برای تغییر، متغیر ANALYSIS_TZ را ست کنید (مثلاً ANALYSIS_TZ=UTC)."
    )
    print("=" * 64)


if __name__ == "__main__":
    main()
