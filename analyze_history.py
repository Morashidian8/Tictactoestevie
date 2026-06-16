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

Data source (ANALYSIS_SOURCE):
  * "polymarket" (default) — the BTC Up/Down 5-minute series. Each 5-minute
    window is its own market (slug btc-updown-5m-<unix>) whose resolved
    Up/Down outcome IS the candle color (Up=green, Down=red). One request per
    window, so a full year is ~105k requests; results are cached + resumable,
    and the walk stops automatically once it reaches the start of the series
    (these markets do not go back a full year).
  * "binance" — public 5-minute klines (no API key), full year guaranteed.

Both sources feed the exact same alternation analysis, reusing bot.py helpers.

Usage:
    python analyze_history.py                  # Polymarket
    python analyze_history.py --probe          # just find when the series starts
    ANALYSIS_SOURCE=binance python analyze_history.py

Environment variables (all optional):
    ANALYSIS_SOURCE  "polymarket" or "binance"            (default polymarket)
    ANALYSIS_DAYS    number of days back to analyze        (default 365)
    ANALYSIS_TZ      timezone for weekday/hour bucketing   (default Asia/Tehran)
    PRODUCT          Binance symbol                         (default BTCUSDT)
    INTERVAL         Binance kline interval                 (default 5m)
    POLY_MAX_MISSING consecutive missing windows before we
                     decide the series has ended            (default 2016 = 7d)
    POLY_SLEEP       seconds between Polymarket requests     (default 0.1)
    CACHE_FILE       where to cache raw candles as CSV      (default auto)
"""

import os
import sys
import csv
import time
from collections import Counter
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
    GAMMA_URL,
    POLY_SLUG_PREFIX,
    _poly_event_direction,
)

ANALYSIS_SOURCE = os.environ.get("ANALYSIS_SOURCE", "polymarket").strip().lower()
ANALYSIS_DAYS = int(os.environ.get("ANALYSIS_DAYS", "365"))
ANALYSIS_TZ = os.environ.get("ANALYSIS_TZ", "Asia/Tehran").strip()
# Window mode for the "lowest alternation" search:
#   "clock"   -> the 24 on-the-hour buckets (00:00–00:59, 01:00–01:59, ...)
#   "rolling" -> every 60-minute window starting on a 5-minute boundary
#                (00:00–01:00, 00:05–01:05, ... 23:55–00:55) = 288 windows/day
WINDOW_MODE = os.environ.get("WINDOW_MODE", "clock").strip().lower()
# Query controls (turn this script into a small configurable tool):
#   ORDER    "lowest" (calmest windows) or "highest" (most alternating)
#   TOP_N    how many windows to show per weekday
#   WEEKDAY  "all" or a single day (sat/sun/.../fri, Persian names, or 0-6)
#   SHOW_HIST whether to print the full value distribution (histogram)
ORDER = os.environ.get("ORDER", "lowest").strip().lower()
TOP_N = max(1, int(os.environ.get("TOP_N", "2")))
WEEKDAY_FILTER = os.environ.get("WEEKDAY", "all").strip().lower()
SHOW_HIST = os.environ.get("SHOW_HIST", "true").strip().lower() in (
    "1", "true", "yes", "y", "on",
)
# When True, the windows chosen for a day must not overlap each other (their
# 60-minute spans are disjoint), so you get genuinely different times of day.
NO_OVERLAP = os.environ.get("NO_OVERLAP", "true").strip().lower() in (
    "1", "true", "yes", "y", "on",
)
WIN_MINUTES = 60  # each window spans 12 five-minute candles = 60 minutes
DAY_MINUTES = 24 * 60

# Tokens accepted for WEEKDAY (value = Python date.weekday(): Mon=0 ... Sun=6).
_WD_TOKENS = {
    "sat": 5, "saturday": 5, "شنبه": 5,
    "sun": 6, "sunday": 6, "یکشنبه": 6, "یک‌شنبه": 6,
    "mon": 0, "monday": 0, "دوشنبه": 0,
    "tue": 1, "tuesday": 1, "سه‌شنبه": 1, "سهشنبه": 1,
    "wed": 2, "wednesday": 2, "چهارشنبه": 2,
    "thu": 3, "thursday": 3, "پنج‌شنبه": 3, "پنجشنبه": 3,
    "fri": 4, "friday": 4, "جمعه": 4,
}


def selected_weekdays():
    """Resolve WEEKDAY_FILTER to a list of Python weekday numbers."""
    if WEEKDAY_FILTER in ("", "all", "همه"):
        return WEEKDAY_DISPLAY_ORDER
    if WEEKDAY_FILTER in _WD_TOKENS:
        return [_WD_TOKENS[WEEKDAY_FILTER]]
    if WEEKDAY_FILTER.isdigit() and 0 <= int(WEEKDAY_FILTER) <= 6:
        return [int(WEEKDAY_FILTER)]
    print(f"⚠️  WEEKDAY='{WEEKDAY_FILTER}' شناخته نشد؛ همه‌ی روزها نشان داده می‌شود.")
    return WEEKDAY_DISPLAY_ORDER
POLY_MAX_MISSING = int(os.environ.get("POLY_MAX_MISSING", "2016"))  # ~7 days
POLY_SLEEP = float(os.environ.get("POLY_SLEEP", "0.1"))

# Default cache file depends on the source/interval so they never collide.
if ANALYSIS_SOURCE == "polymarket":
    _default_cache = ".cache/poly_updown.csv"
else:
    _default_cache = f".cache/{ANALYSIS_SOURCE}_{INTERVAL}.csv"
CACHE_FILE = os.environ.get("CACHE_FILE", _default_cache).strip()

# Coinbase Exchange public candles host(s). No API key required.
COINBASE_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "COINBASE_HOSTS",
        "https://api.exchange.coinbase.com,https://api.pro.coinbase.com",
    ).split(",")
    if h.strip()
]
COINBASE_PRODUCT = os.environ.get("COINBASE_PRODUCT", "BTC-USD").strip()

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
# Parametrized fetchers (used by the multi-exchange / multi-timeframe PWA)
# ---------------------------------------------------------------------------
def fetch_binance(interval, granularity, days, product="BTCUSDT"):
    """Binance klines for any interval, oldest -> newest."""
    now_ms = int(time.time() * 1000)
    cur = now_ms - days * 86400 * 1000
    step = granularity * 1000
    out = {}
    while cur < now_ms:
        rows, last_err = None, None
        for host in BINANCE_HOSTS:
            try:
                resp = requests.get(
                    f"{host}/api/v3/klines",
                    params={"symbol": product, "interval": interval,
                            "startTime": cur, "endTime": now_ms, "limit": 1000},
                    timeout=20, headers={"User-Agent": "btc-history-analysis/1.0"},
                )
                resp.raise_for_status()
                rows = resp.json()
                break
            except requests.RequestException as exc:
                last_err = exc
        if rows is None:
            raise last_err if last_err else RuntimeError("all Binance hosts failed")
        if not rows:
            break
        for row in rows:
            ot, ct = int(row[0]), int(row[6])
            if ct / 1000.0 > time.time():
                continue
            out[ot] = {"time": ot // 1000, "open": float(row[1]),
                       "high": float(row[2]), "low": float(row[3]),
                       "close": float(row[4])}
        nxt = int(rows[-1][0]) + step
        if nxt <= cur:
            break
        cur = nxt
        if len(rows) < 1000:
            break
        time.sleep(0.2)
    return [out[k] for k in sorted(out)]


def fetch_coinbase(granularity, days, product="BTC-USD"):
    """
    Coinbase Exchange candles, oldest -> newest. The public endpoint returns at
    most 300 candles per request as [time, low, high, open, close, volume].
    """
    now = int(time.time())
    seg_start = (now - days * 86400)
    seg_start -= seg_start % granularity
    span = 300 * granularity
    out = {}
    reqs = 0
    while seg_start < now:
        seg_end = min(seg_start + span, now)
        s_iso = datetime.fromtimestamp(seg_start, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        e_iso = datetime.fromtimestamp(seg_end, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        rows, last_err = None, None
        for host in COINBASE_HOSTS:
            try:
                resp = requests.get(
                    f"{host}/products/{product}/candles",
                    params={"granularity": granularity, "start": s_iso, "end": e_iso},
                    timeout=20, headers={"User-Agent": "btc-history-analysis/1.0"},
                )
                resp.raise_for_status()
                rows = resp.json()
                break
            except requests.RequestException as exc:
                last_err = exc
        if rows is None:
            raise last_err if last_err else RuntimeError("all Coinbase hosts failed")
        for row in rows:  # [time, low, high, open, close, volume]
            t = int(row[0])
            if t + granularity > now:
                continue  # candle not fully closed yet
            out[t] = {"time": t, "open": float(row[3]), "high": float(row[2]),
                      "low": float(row[1]), "close": float(row[4])}
        reqs += 1
        if reqs % 25 == 0:
            print(f"  ...coinbase {reqs} requests, {len(out)} candles so far")
        seg_start = seg_end
        time.sleep(0.2)
    return [out[k] for k in sorted(out)]


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


def get_candles_binance():
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
# Polymarket BTC Up/Down 5-minute series (one market per 5-minute window)
# ---------------------------------------------------------------------------
def _poll_poly_window(ts, retries=2):
    """+1 (Up), -1 (Down), or None if missing/unresolved/error."""
    slug = f"{POLY_SLUG_PREFIX}-{ts}"
    for attempt in range(retries + 1):
        try:
            resp = requests.get(
                GAMMA_URL,
                params={"slug": slug},
                timeout=15,
                headers={"User-Agent": "btc-history-analysis/1.0"},
            )
            resp.raise_for_status()
            return _poly_event_direction(resp.json())
        except requests.RequestException:
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))
            continue
    return None


def fetch_year_polymarket(days):
    """
    Walk the BTC Up/Down 5-minute markets backwards from the latest ended
    window. Each resolved window becomes a candle (Up=green, Down=red).

    Resumable: windows already in the cache are not re-requested, and the walk
    stops after POLY_MAX_MISSING consecutive windows with no resolved market
    (i.e. we've reached the start of the series — these markets do not extend a
    full year back).
    """
    now = time.time()
    last_ended = (int(now // GRANULARITY) - 1) * GRANULARITY
    start = last_ended - days * 86400

    resolved = {c["time"]: c for c in (load_cache() or [])}
    if resolved:
        print(f"Resuming from cache: {len(resolved)} windows already stored.")

    missing_streak = 0
    requests_made = 0
    ts = last_ended
    try:
        while ts >= start:
            if ts in resolved:
                missing_streak = 0
                ts -= GRANULARITY
                continue
            direction = _poll_poly_window(ts)
            requests_made += 1
            if direction is None:
                missing_streak += 1
                if missing_streak >= POLY_MAX_MISSING:
                    when = datetime.utcfromtimestamp(ts)
                    print(
                        f"  reached start of the Up/Down series near "
                        f"{when:%Y-%m-%d %H:%M} UTC "
                        f"({missing_streak} empty windows); stopping."
                    )
                    break
            else:
                missing_streak = 0
                c_open, c_close = (0.0, 1.0) if direction > 0 else (1.0, 0.0)
                resolved[ts] = {
                    "time": ts,
                    "open": c_open,
                    "high": 1.0,
                    "low": 0.0,
                    "close": c_close,
                }
            if requests_made % 200 == 0:
                save_cache([resolved[k] for k in sorted(resolved)])
                when = datetime.utcfromtimestamp(ts)
                print(
                    f"  ...{requests_made} requests, {len(resolved)} resolved "
                    f"windows, now at {when:%Y-%m-%d %H:%M} UTC"
                )
            ts -= GRANULARITY
            time.sleep(POLY_SLEEP)
    except KeyboardInterrupt:
        print("  interrupted — saving progress; rerun to resume.")

    candles = [resolved[k] for k in sorted(resolved)]
    save_cache(candles)
    return candles


def _poly_window_exists(ts, retries=3):
    """True if a market exists for this window, False if not, None on error."""
    slug = f"{POLY_SLUG_PREFIX}-{ts}"
    for attempt in range(retries + 1):
        try:
            resp = requests.get(
                GAMMA_URL,
                params={"slug": slug},
                timeout=15,
                headers={"User-Agent": "btc-history-analysis/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()
            return isinstance(data, list) and len(data) > 0
        except requests.RequestException:
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))
            continue
    return None


def probe_series_start(days, max_back_for_hi=24):
    """
    Binary-search the earliest existing btc-updown-5m window within `days`.

    The predicate "a market exists for window ts" is monotonic in ts (false for
    very old windows, true once the series begins), so ~log2(windows) ≈ 17
    probes locate the start instead of walking every window.
    """
    now = time.time()
    last_ended = (int(now // GRANULARITY) - 1) * GRANULARITY

    # Find a recent window that definitely exists -> the high anchor.
    hi = None
    ts = last_ended
    for _ in range(max_back_for_hi):
        if _poly_window_exists(ts):
            hi = ts
            break
        ts -= GRANULARITY
    if hi is None:
        print(
            "نتوانستم هیچ مارکت Up/Down اخیری پیدا کنم. شبکه یا POLY_SLUG_PREFIX "
            "را بررسی کن."
        )
        return None

    lo = last_ended - days * 86400
    lo -= lo % GRANULARITY
    if lo >= hi:
        lo = hi - GRANULARITY

    if _poly_window_exists(lo):
        when = datetime.utcfromtimestamp(lo)
        print(
            f"سری حداقل تا {when:%Y-%m-%d %H:%M} UTC (یعنی دست‌کم {days} روز) "
            "عقب می‌رود — قدیمی‌تر از بازه‌ی جستجو."
        )
        return lo

    # Invariant: exists(lo) = False, exists(hi) = True. Shrink to one window.
    a, b = lo, hi
    probes = 0
    while b - a > GRANULARITY:
        mid = a + ((b - a) // GRANULARITY // 2) * GRANULARITY
        ex = _poly_window_exists(mid)
        probes += 1
        if ex is None:
            print("خطای شبکه حین کاوش؛ بعداً دوباره امتحان کن.")
            return None
        if ex:
            b = mid
        else:
            a = mid

    start_ts = b
    when = datetime.utcfromtimestamp(start_ts)
    age_days = (now - start_ts) / 86400
    windows = int((last_ended - start_ts) // GRANULARITY) + 1
    est_minutes = windows * (POLY_SLEEP + 0.15) / 60
    print()
    print("=" * 60)
    print("کاوش سری Polymarket — BTC Up/Down 5m")
    print("=" * 60)
    print(f"شروع سری        : {when:%Y-%m-%d %H:%M} UTC")
    print(f"قدمت سری        : ~{age_days:.1f} روز")
    print(f"تعداد پنجره‌ها   : ~{windows:,} مارکت ۵ دقیقه‌ای")
    print(f"درخواست‌های کاوش: {probes + max_back_for_hi} (به‌جای ~{windows:,})")
    print(f"تخمین زمان fetch کامل: ~{est_minutes:.0f} دقیقه (با POLY_SLEEP={POLY_SLEEP})")
    print("=" * 60)
    print(
        "برای تحلیل، ANALYSIS_DAYS را روی همین قدمت یا کمتر بگذار، مثلاً:\n"
        f"  ANALYSIS_DAYS={int(age_days) + 1} python analyze_history.py"
    )
    return start_ts


def get_candles():
    if ANALYSIS_SOURCE == "polymarket":
        print(
            "Source: Polymarket BTC Up/Down 5m. This makes one request per "
            "5-minute window (slow); progress is cached and resumable."
        )
        return fetch_year_polymarket(ANALYSIS_DAYS)
    if ANALYSIS_SOURCE == "coinbase":
        cached = load_cache()
        if cached:
            newest = datetime.fromtimestamp(cached[-1]["time"], tz=timezone.utc)
            age_h = (datetime.now(timezone.utc) - newest).total_seconds() / 3600
            span_days = (newest - datetime.fromtimestamp(cached[0]["time"], tz=timezone.utc)).days
            if age_h < 24 and span_days >= ANALYSIS_DAYS - 2:
                print(f"Using cached Coinbase candles ({len(cached)} rows).")
                return cached
        print(f"Downloading ~{ANALYSIS_DAYS} days of {INTERVAL} Coinbase {COINBASE_PRODUCT}...")
        candles = fetch_coinbase(GRANULARITY, ANALYSIS_DAYS, COINBASE_PRODUCT)
        if candles:
            save_cache(candles)
        return candles
    return get_candles_binance()


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
# Whole-series alternation runs and the gap to the next run
# ---------------------------------------------------------------------------
def alternation_runs(candles):
    """
    Return a list of (start_flip, end_flip) flip-index spans for every maximal
    strictly-alternating run across the whole candle series. A run of flips
    i..j means candles i-1..j alternate; its length (in flips) is j-i+1.
    """
    dirs = [candle_direction(c) for c in candles]
    n = len(dirs)
    runs = []
    i = 1
    while i < n:
        if dirs[i] != 0 and dirs[i - 1] != 0 and dirs[i] == -dirs[i - 1]:
            j = i
            while (j + 1 < n and dirs[j] != 0 and dirs[j + 1] != 0
                   and dirs[j + 1] == -dirs[j]):
                j += 1
            runs.append((i, j))
            i = j + 1
        else:
            i += 1
    return runs


def gaps_for_threshold(runs, threshold):
    """
    For every alternation run whose length (flips) >= threshold, the number of
    non-alternating candles until the NEXT alternation run begins.
    """
    gaps = []
    for k in range(len(runs) - 1):
        s, e = runs[k]
        if (e - s + 1) >= threshold:
            gaps.append(runs[k + 1][0] - e - 1)
    return gaps


def gap_summary(gaps, cap=21):
    """Compact stats for a list of candle-gaps (None if empty)."""
    n = len(gaps)
    if n == 0:
        return None
    s = sorted(gaps)
    hist = Counter(min(g, cap) for g in gaps)  # `cap` means "cap or more"
    return {
        "n": n,
        "avg": round(sum(gaps) / n, 2),
        "med": s[n // 2],
        "min": s[0],
        "max": s[-1],
        "hist": [[k, hist[k]] for k in sorted(hist)],
    }


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


def build_rolling_samples(candles, tz, win=None):
    """
    Returns: samples[weekday][(hour, minute)] = list of per-window flip counts.

    A "window" is `win` consecutive 5-minute candles (default 12 = 60 minutes)
    starting on any 5-minute boundary. The window is tagged by the local
    weekday and clock time of its FIRST candle, so a window starting Sunday
    11:35 (and ending 12:35) lands in samples[Sun][(11, 35)]. Windows with a
    gap (missing candle) are skipped.
    """
    n = len(candles)
    times = [c["time"] for c in candles]
    dirs = [candle_direction(c) for c in candles]
    # Infer the candle step (seconds) from the data so this works for any
    # timeframe (5m, 15m, ...) regardless of the module-level GRANULARITY.
    diffs = [times[i + 1] - times[i] for i in range(min(n - 1, 1000))]
    step = min((d for d in diffs if d > 0), default=GRANULARITY)
    if win is None:
        win = max(2, round(3600 / step))  # a 60-minute window
    full_span = (win - 1) * step  # seconds between first & last open

    samples = {wd: {} for wd in range(7)}
    for i in range(n - win + 1):
        if times[i + win - 1] - times[i] != full_span:
            continue  # a candle is missing inside this window -> skip
        flips = longest_alt_flips(dirs[i : i + win])
        dt = datetime.fromtimestamp(times[i], tz=timezone.utc).astimezone(tz)
        key = (dt.hour, dt.minute)
        samples[dt.weekday()].setdefault(key, []).append(flips)
    return samples


def summarize_hour(values):
    """Return a stats dict for one (weekday, hour) sample list."""
    n = len(values)
    mn = min(values)
    mx = max(values)
    avg = sum(values) / n
    # Share of occurrences whose alternation is strictly above the average.
    above = sum(1 for v in values if v > avg)
    return {
        "n": n,
        "avg": avg,
        "min": mn,
        "min_count": values.count(mn),
        "max": mx,
        "max_count": values.count(mx),
        "above_pct": round(100 * above / n, 1),
        "hist": sorted(Counter(values).items()),  # [(value, count), ...]
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def hour_label(h):
    return f"{h:02d}:00–{h:02d}:59"


def pick_windows(sorted_stats, n):
    """
    Take the first `n` entries from `sorted_stats` (already ranked best-first).
    If NO_OVERLAP, skip any window whose 60-minute span overlaps one already
    chosen, measuring start-time distance circularly so 23:35 and 00:35 count
    as non-overlapping (they only touch).
    """
    chosen = []
    for item in sorted_stats:
        if NO_OVERLAP:
            s = item[0]
            clash = False
            for c in chosen:
                d = abs(s - c[0])
                d = min(d, DAY_MINUTES - d)  # circular distance
                if d < WIN_MINUTES:
                    clash = True
                    break
            if clash:
                continue
        chosen.append(item)
        if len(chosen) >= n:
            break
    return chosen


def window_label(hour, minute, win_minutes=60):
    """Label a rolling window by its start and end clock time, e.g. 11:35–12:35."""
    start = hour * 60 + minute
    end = (start + win_minutes) % (24 * 60)
    return f"{hour:02d}:{minute:02d}–{end // 60:02d}:{end % 60:02d}"


def main():
    # Probe mode: just discover when the Polymarket series begins, then exit.
    if "--probe" in sys.argv:
        if ANALYSIS_SOURCE != "polymarket":
            print("--probe فقط برای منبع polymarket معنی دارد.")
            return
        probe_series_start(ANALYSIS_DAYS)
        return

    tz, tz_name = get_tz()
    candles = get_candles()
    if not candles:
        print(
            "No candles were returned. If you are running inside a restricted "
            "network, run this where the data source is reachable (locally/CI)."
        )
        return

    source_label = (
        "Polymarket — BTC Up/Down 5m"
        if ANALYSIS_SOURCE == "polymarket"
        else f"Binance {PRODUCT} ({INTERVAL})"
    )
    oldest = datetime.fromtimestamp(candles[0]["time"], tz=tz)
    newest = datetime.fromtimestamp(candles[-1]["time"], tz=tz)
    span_days = (newest - oldest).days
    print()
    print("=" * 64)
    print("تحلیل تاریخی تناوب کندل ۵ دقیقه‌ای بیت‌کوین")
    print("=" * 64)
    print(f"منبع            : {source_label}")
    print(f"منطقه زمانی     : {tz_name}")
    if span_days < ANALYSIS_DAYS - 7:
        print(
            f"⚠️  توجه       : داده‌ی موجود فقط {span_days} روزه (نه کامل "
            f"{ANALYSIS_DAYS} روز) — سری Up/Down پولی‌مارکت به این قدمت نمی‌رسد."
        )
    print(f"تعداد کندل      : {len(candles):,}")
    print(f"بازه            : {oldest:%Y-%m-%d %H:%M} تا {newest:%Y-%m-%d %H:%M}")
    if WINDOW_MODE == "rolling":
        win_desc = "بازه‌های یک‌ساعته‌ی لغزان (شروع هر ۵ دقیقه، مثل ۱۱:۳۵–۱۲:۳۵)"
        unit = "بازه"
    else:
        win_desc = "ساعت‌های راس‌ساعت (۰۰:۰۰–۰۰:۵۹ و ...)"
        unit = "ساعت"
    print(f"حالت بازه       : {win_desc}")
    print(
        "معیار تناوب     : طول بلندترین رشته‌ی متناوب (سبز/قرمز) داخل هر بازه، "
        "برحسب تعداد تغییر رنگ (flip)"
    )
    print("=" * 64)

    # Build (start_minute, label, stats) tuples per weekday for the chosen mode.
    if WINDOW_MODE == "rolling":
        samples = build_rolling_samples(candles, tz)

        def weekday_buckets(wd):
            out = []
            for (h, m), vals in samples[wd].items():
                out.append((h * 60 + m, window_label(h, m), summarize_hour(vals)))
            return out

    else:
        samples = build_hour_samples(candles, tz)

        def weekday_buckets(wd):
            out = []
            for h in range(24):
                vals = samples[wd][h]
                if vals:
                    out.append((h * 60, hour_label(h), summarize_hour(vals)))
            return out

    highest = ORDER == "highest"
    kw = "بیشترین" if highest else "کم‌ترین"
    print(f"پرسش           : {TOP_N} {unit}ِ «{kw} تناوب» برای هر روز")
    if NO_OVERLAP:
        print("قید            : بازه‌های انتخابی هر روز با هم هم‌پوشانی ندارند")
    print("=" * 64)

    for wd in selected_weekdays():
        name = PERSIAN_WEEKDAY[wd]
        stats = weekday_buckets(wd)
        if not stats:
            continue
        # Sort by AVERAGE alternation; ascending for "lowest", descending for
        # "highest". Tie-break on max then start time.
        stats.sort(key=lambda x: (x[2]["avg"], x[2]["max"], x[0]), reverse=highest)
        chosen = pick_windows(stats, TOP_N)

        print()
        print(f"📅 {name}  —  {TOP_N} {unit}ِ {kw} تناوب در طول سال")
        print("-" * 64)
        for rank, (start_min, label, s) in enumerate(chosen, start=1):
            print(f"  {rank}) {label}  (به وقت {tz_name})")
            print(f"       • تعداد تکرار این {unit} در سال : {s['n']} بار")
            print(f"       • میانگین تناوب در این {unit}   : {s['avg']:.2f}")
            print(
                f"       • احتمال تناوب بالای میانگین   : {s['above_pct']}%"
            )
            print(
                f"       • بیشینه تناوب در این {unit}     : {s['max']} "
                f"(در {s['max_count']} بار از {s['n']} تکرار شده)"
            )
            if SHOW_HIST:
                dist = " | ".join(f"{v}→{cnt}" for v, cnt in s["hist"])
                print(f"       • توزیع کامل (تناوب→تعداد)    : {dist}")
        print()

    print("=" * 64)
    print(
        "یادداشت: «روز هفته» و «ساعت» بر اساس منطقه زمانی بالا محاسبه شده‌اند؛ "
        f"برای تغییر، متغیر ANALYSIS_TZ را ست کنید (مثلاً ANALYSIS_TZ=UTC)."
    )
    print("=" * 64)


if __name__ == "__main__":
    main()
