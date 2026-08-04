#!/usr/bin/env python3
"""
Record Polymarket's own price for every BTC Up/Down 5m window, and who won.

    python polymarket_collector.py            # collect, 24/7
    python polymarket_collector.py --report   # summary, broken down by hour
    python polymarket_collector.py --once     # one window, to check it works

For each window it stores one row: the Up and Down percentages quoted a few
seconds BEFORE the window opens, which side was the favourite, and which side
actually won. Rows go to polymarket_odds.jsonl, one JSON object per line, so a
crash or a reboot costs at most the window in flight.

The winner comes from Polymarket's own resolution when it is published, and
falls back to comparing the market's price-to-beat with its final price. Both
are recorded so the two can be checked against each other later.
"""

import argparse
import json
import re
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta

try:
    import requests
except ImportError:
    sys.exit("requests is missing:  pip install requests")

GRAN = 300                                  # the 5-minute window
LEAD = int(os.environ.get("ODDS_LEAD", "15"))       # seconds before the open
SETTLE_WAIT = int(os.environ.get("ODDS_SETTLE_WAIT", "45"))  # after the close
STORE = os.environ.get("ODDS_STORE", "polymarket_odds.jsonl")
GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
# Short and shallow on purpose. A five-minute window is only worth chasing for
# seconds, and the caller retries anyway — deep urllib3 retries turned a dead
# network into a four-minute stall that swallowed the NEXT window too.
TIMEOUT = int(os.environ.get("ODDS_TIMEOUT", "6"))
RETRIES = int(os.environ.get("ODDS_RETRIES", "1"))
UA = {"User-Agent": "Mozilla/5.0 (Android) btc-odds/1.0"}
ET = timezone(timedelta(hours=-4))          # Polymarket labels windows in ET


def log(msg):
    print(f"{datetime.now():%m-%d %H:%M:%S} | {msg}", flush=True)


# One session for the whole run: it keeps the TLS connection alive, so a name
# that resolved once can serve many requests without asking DNS again. On a link
# where the resolver only answers intermittently that is the difference between
# collecting a window and losing it.
_SESSION = requests.Session()
_SESSION.headers.update(UA)
try:
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    _SESSION.mount("https://", HTTPAdapter(max_retries=Retry(
        total=RETRIES, connect=RETRIES, read=1, backoff_factor=0.3,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]))))
except Exception:                       # noqa: BLE001 - retries are a bonus
    pass


def get(url, **params):
    r = _SESSION.get(url, params=params or None, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _jload(v, default):
    """Gamma returns some fields as JSON-encoded strings, some as lists."""
    if v is None:
        return default
    if isinstance(v, (list, dict)):
        return v
    try:
        return json.loads(v)
    except (ValueError, TypeError):
        return default


# --- finding the market for one particular window ---------------------------
LIMIT = 100          # Gamma caps a page at 100 no matter what you ask for


def _iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _slug_for(boundary):
    """
    Polymarket's own slug for this window.

    Titles look like "Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET", and
    the slug is that lower-cased with the punctuation dropped. Asking for it
    directly is the cheapest possible lookup when the format holds.
    """
    o = datetime.fromtimestamp(boundary, ET)
    e = datetime.fromtimestamp(boundary + GRAN, ET)

    def hm(d):
        return f"{d.strftime('%I').lstrip('0')}{d:%M}{d.strftime('%p').lower()}"

    return (f"bitcoin-up-or-down-{o.strftime('%B').lower()}-{o.day}-"
            f"{hm(o)}-{hm(e)}-et")


def _by_date(boundary):
    """
    Markets ending within a minute of this window's close.

    The first version asked for every open market ordered by end date and took
    the nearest — which returned markets from January that had never resolved,
    193 days away from the target. Bounding the end date is the fix: the query
    itself now can only return the right window.
    """
    want = boundary + GRAN
    return get(f"{GAMMA}/markets", closed="false", limit=LIMIT,
               order="endDate", ascending="true",
               end_date_min=_iso(want - 90), end_date_max=_iso(want + 90))


def _matches(item):
    text = (item.get("question") or item.get("title") or "").lower()
    return "up or down" in text and ("bitcoin" in text or "btc" in text)


def _duration(m):
    """Window length in seconds, or None when the dates are unreadable."""
    def parse(v):
        try:
            return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
        except (ValueError, AttributeError, TypeError):
            return None
    a = parse(m.get("startDate") or m.get("start_date_iso") or m.get("gameStartTime"))
    b = parse(m.get("endDate") or m.get("end_date_iso"))
    return (b - a) if (a is not None and b is not None) else None


_RANGE = re.compile(r"(\d{1,2}):(\d{2})\s*([AP]M)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*([AP]M)",
                    re.IGNORECASE)


def _is_five_minute(m, boundary):
    """
    Is this the 5-minute market opening at `boundary`?

    The TITLE decides, because it names both ends of the window
    ("4:15PM-4:20PM ET") and cannot be confused with the 15-minute market that
    finishes at the same instant. Duration is only a fallback: Gamma's
    startDate is when the market opened for TRADING, which for these can be an
    hour or a day before the window it settles — trusting it rejected the
    correct market and cost a night of data.
    """
    title = m.get("question") or m.get("title") or ""
    hit = _RANGE.search(title)
    if hit:
        o = datetime.fromtimestamp(boundary, ET)
        want = (int(o.strftime("%I")), int(o.strftime("%M")), o.strftime("%p").upper())
        got = (int(hit.group(1)), int(hit.group(2)), hit.group(3).upper())
        return want == got
    d = _duration(m)
    return d is not None and abs(d - GRAN) <= 60


def market_for(boundary, deadline=None):
    """
    The 5-minute market whose window STARTS at `boundary`, or None.

    `deadline` is a hard wall-clock stop. Without it a dead network let this
    walk all three sources at full timeout and return minutes later, by which
    point the next window had already been missed as well.
    """
    want_end = boundary + GRAN
    slug = _slug_for(boundary)
    # Slug first: it names both ends of the window, so it cannot return the
    # 15-minute market. The date range is the fallback for when the slug format
    # changes, and it needs the duration guard.
    tries = (
        ("slug", lambda: get(f"{GAMMA}/markets", slug=slug)),
        ("slug via events", lambda: [
            m for e in get(f"{GAMMA}/events", slug=slug)
            for m in (e.get("markets") or [])]),
        ("end-date window", lambda: _by_date(boundary)),
    )
    for _, fn in tries:
        if deadline and time.time() >= deadline:
            return None
        try:
            data = fn()
        except Exception:
            continue
        for m in (data if isinstance(data, list) else []):
            if not _matches(m):
                continue
            end = m.get("endDate") or m.get("end_date_iso") or ""
            try:
                ts = datetime.fromisoformat(end.replace("Z", "+00:00")).timestamp()
            except (ValueError, AttributeError):
                continue
            if abs(ts - want_end) > GRAN / 2:
                continue
            if not _is_five_minute(m, boundary):
                d = _duration(m)
                log(f"   رد شد: بازارِ {int(d/60)} دقیقه‌ای" if d
                    else "   رد شد: بازارِ ۵ دقیقه‌ای نیست")
                continue
            return m
    return None


def quote(market):
    """
    (up, down) as fractions of a dollar, live.

    CLOB midpoints are the real-time number the screen shows; Gamma's cached
    outcomePrices are the fallback when the CLOB refuses.
    """
    outcomes = [str(o).lower() for o in _jload(market.get("outcomes"), [])]
    tokens = _jload(market.get("clobTokenIds"), [])
    if tokens and len(tokens) == len(outcomes):
        prices = {}
        for name, tok in zip(outcomes, tokens):
            try:
                prices[name] = float(get(f"{CLOB}/midpoint", token_id=tok)["mid"])
            except Exception:
                prices = {}
                break
        if prices:
            return prices.get("up"), prices.get("down"), "clob-midpoint"
    cached = [float(p) for p in _jload(market.get("outcomePrices"), [])]
    if len(cached) == len(outcomes) == 2:
        d = dict(zip(outcomes, cached))
        return d.get("up"), d.get("down"), "gamma-cached"
    return None, None, "unavailable"


def resolution(market_id):
    """Which side Polymarket paid out, once it has resolved. None while open."""
    try:
        m = get(f"{GAMMA}/markets/{market_id}")
    except Exception:
        return None, None, None
    outcomes = [str(o).lower() for o in _jload(m.get("outcomes"), [])]
    prices = [float(p) for p in _jload(m.get("outcomePrices"), [])]
    beat, final = m.get("startPrice"), m.get("endPrice")
    if len(prices) == 2 and max(prices) > 0.99:
        return outcomes[prices.index(max(prices))], beat, final
    return None, beat, final


# --- the loop ---------------------------------------------------------------
def append(row):
    with open(STORE, "a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def collect_one(boundary):
    """Quote the window opening at `boundary`, then record who won."""
    m = market_for(boundary)
    if not m:
        log(f"{datetime.fromtimestamp(boundary, ET):%H:%M} — بازارش پیدا نشد")
        return None
    up, down, src = quote(m)
    if up is None:
        log(f"{datetime.fromtimestamp(boundary, ET):%H:%M} — قیمت خوانده نشد ({src})")
        return None
    fav = "up" if up > down else ("down" if down > up else "tie")
    log(f"{datetime.fromtimestamp(boundary, ET):%H:%M} ET  "
        f"بالا {up*100:.0f}¢  پایین {down*100:.0f}¢  →  گران‌تر: {fav}  [{src}]")

    # Wait for the window to finish, then ask who won.
    time.sleep(max(0, boundary + GRAN + SETTLE_WAIT - time.time()))
    winner, beat, final = resolution(m.get("id"))
    if winner is None and beat and final:
        winner = "up" if float(final) > float(beat) else "down"
    row = {"t": boundary,
           "et": datetime.fromtimestamp(boundary, ET).isoformat(),
           "hour_et": datetime.fromtimestamp(boundary, ET).hour,
           "up": up, "down": down, "favourite": fav,
           "winner": winner, "beat": beat, "final": final,
           "source": src, "market_id": m.get("id"),
           "title": (m.get("question") or m.get("title") or "")[:70],
           "minutes": int((_duration(m) or GRAN) / 60)}
    append(row)
    hit = "—" if winner is None else ("✅" if winner == fav else "❌")
    log(f"   نتیجه: {winner or 'نامشخص'}  {hit}   (ثبت شد)")
    return row


# --- filling in results that were not published in time ---------------------
def resolve_pending(max_age_h=24, limit=15):
    """
    Go back over rows stored without a winner and fill them in.

    Polymarket does not always publish the outcome within the seconds the
    collector waits, and a row written with winner=None was previously dead —
    the report drops it, so the window was collected and then thrown away. This
    rewrites the file with whatever has resolved since.
    """
    if not os.path.exists(STORE):
        return 0
    rows, changed = [], 0
    now = time.time()
    with open(STORE) as f:
        for line in f:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if (not r.get("winner") and r.get("market_id") and changed < limit
                    and now - r["t"] < max_age_h * 3600):
                w, beat, final = resolution(r["market_id"])
                if w is None and beat and final:
                    w = "up" if float(final) > float(beat) else "down"
                if w:
                    r["winner"], r["beat"], r["final"] = w, beat, final
                    changed += 1
            rows.append(r)
    if changed:
        tmp = STORE + ".tmp"
        with open(tmp, "w") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        os.replace(tmp, STORE)          # atomic: a crash cannot truncate the data
        log(f"نتیجهٔ {changed} پنجرهٔ معلق الحاق شد.")
    return changed


def run(once=False):
    log(f"شروع — هر پنجره {LEAD} ثانیه قبل از باز شدن خوانده می‌شود. فایل: {STORE}")
    while True:
        now = time.time()
        nxt = (int(now) // GRAN + 1) * GRAN
        wait = nxt - LEAD - now
        if wait > 0:
            time.sleep(wait)
        try:
            collect_one(nxt)
            # Every hour, sweep up anything the market had not resolved yet.
            if int(nxt) % 3600 < GRAN:
                resolve_pending()
        except Exception as exc:                      # never die on one window
            log(f"خطا: {type(exc).__name__}: {str(exc)[:160]}")
            time.sleep(5)
        if once:
            return


# --- the summary ------------------------------------------------------------
def load():
    if not os.path.exists(STORE):
        return []
    rows = []
    with open(STORE) as f:
        for line in f:
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
    return [r for r in rows if r.get("winner") and r.get("favourite") != "tie"]


def report_text(html=False):
    """The summary as text. `html` wraps the headline numbers for Telegram."""
    b = (lambda x: f"<b>{x}</b>") if html else (lambda x: str(x))
    out = []

    def p(line=""):
        out.append(line)

    rows = load()
    if not rows:
        return f"هنوز داده‌ای در {STORE} نیست."
    n = len(rows)
    hit = sum(1 for r in rows if r["winner"] == r["favourite"])
    paid = sum(max(r["up"], r["down"]) for r in rows) / n
    edge = hit / n / paid - 1
    p(f"📈 قیمتِ پلی‌مارکت، {LEAD} ثانیه قبل از باز شدنِ پنجره")
    p()
    p(f"پنجره‌های ثبت‌شده: {b(n)}")
    p(f"سمتِ گران‌تر برد: {b(f'{hit}/{n} = {hit/n*100:.1f}%')}")
    p(f"میانگینِ قیمتش: {b(f'{paid*100:.1f}¢')} — برای سود باید دقت از این بیشتر باشد")
    p(f"سود/زیانِ هر معامله: {b(f'{edge*100:+.1f}%')}")

    by_hour = defaultdict(lambda: [0, 0])
    for r in rows:
        h = by_hour[r["hour_et"]]
        h[0] += 1
        h[1] += r["winner"] == r["favourite"]
    p()
    p("⏰ به تفکیکِ ساعتِ ET:")
    for h in sorted(by_hour):
        c, w = by_hour[h]
        p(f"  {h:>2}:00  {c:>4} پنجره  {w/c*100:>5.1f}%  "
          + "█" * round(w / c * 12))

    buckets = defaultdict(lambda: [0, 0])
    for r in rows:
        key = min(int(max(r["up"], r["down"]) * 100) // 5 * 5, 95)
        k = buckets[key]
        k[0] += 1
        k[1] += r["winner"] == r["favourite"]
    p()
    p("💵 به تفکیکِ قیمت — آیا بازار درست قیمت می‌زند؟")
    for k in sorted(buckets):
        c, w = buckets[k]
        flag = "✅" if w / c * 100 > k + 2.5 else "❌"
        p(f"  {k}-{k+5}¢  {c:>4} پنجره  واقعاً برد {w/c*100:>5.1f}%  {flag}")
    return "\n".join(out)


def report():
    print(report_text())


# --- why is nothing being collected? ----------------------------------------
def diagnose(boundary=None):
    """Walk the lookup once and report exactly where it stops."""
    if boundary is None:
        boundary = (int(time.time()) // GRAN + 1) * GRAN
    want_end = boundary + GRAN
    out = ["🔧 <b>عیب‌یابیِ بالا/پایین</b>",
           f"پنجرهٔ هدف: {datetime.fromtimestamp(boundary, ET):%H:%M} ET",
           f"پایانِ موردِ انتظار: {_iso(want_end)}", ""]

    try:
        get(f"{GAMMA}/markets", limit=1)
        out.append("۱) اتصال به گاما: ✅")
    except Exception as exc:
        out.append(f"۱) اتصال به گاما: ❌ {type(exc).__name__}")
        out.append(f"   <code>{str(exc)[:160]}</code>")
        out.append("\n<i>شبکه/فیلترینگ. با VPN امتحان کن.</i>")
        return "\n".join(out)

    slug = _slug_for(boundary)
    out.append(f"۲) اسلاگِ ساخته‌شده: <code>{slug}</code>")

    found = None
    for label, fn in (("بازهٔ endDate", lambda: _by_date(boundary)),
                      ("اسلاگ", lambda: get(f"{GAMMA}/markets", slug=slug)),
                      ("اسلاگ از events", lambda: [
                          m for e in get(f"{GAMMA}/events", slug=slug)
                          for m in (e.get("markets") or [])])):
        try:
            data = fn()
        except Exception as exc:
            out.append(f"۳) {label}: ❌ {type(exc).__name__} {str(exc)[:80]}")
            continue
        rows = data if isinstance(data, list) else []
        hits = [m for m in rows if _matches(m)]
        out.append(f"۳) {label}: {len(rows)} ردیف، {len(hits)} تای BTC up/down")
        for m in hits[:2]:
            end = m.get("endDate") or ""
            try:
                ts = datetime.fromisoformat(end.replace("Z", "+00:00")).timestamp()
                gap = f"{ts - want_end:+.0f} ثانیه"
                if abs(ts - want_end) > GRAN / 2:
                    ok = "❌ خارج از محدوده"
                elif not _is_five_minute(m, boundary):
                    d = _duration(m)
                    ok = (f"❌ ۵ دقیقه‌ای نیست"
                          + (f" (طول {int(d/60)} دقیقه)" if d else ""))
                else:
                    ok = "✅"
            except (ValueError, AttributeError):
                gap, ok = end or "—", "❌ endDate خوانده نشد"
            out.append(f"   • {(m.get('question') or '')[:58]}")
            out.append(f"     اختلاف: {gap}  {ok}")
            if found is None and ok.startswith("✅"):
                found = m
        if found:
            break

    if not found:
        out.append("\n<b>بازارِ این پنجره پیدا نشد.</b>")
        out.append("<i>اگر ردیف‌ها صفرند یعنی کوئری چیزی برنمی‌گرداند؛ اگر "
                   "هست ولی اختلاف بزرگ است یعنی زمان‌ها جور نیستند.</i>")
        return "\n".join(out)

    up, down, src = quote(found)
    if up is None:
        out.append(f"\n۴) خواندنِ قیمت: ❌ ({src})")
        out.append(f"   outcomes=<code>{str(found.get('outcomes'))[:50]}</code>")
        out.append(f"   tokens=<code>{str(found.get('clobTokenIds'))[:50]}</code>")
        out.append(f"   prices=<code>{str(found.get('outcomePrices'))[:50]}</code>")
    else:
        out.append(f"\n۴) قیمت: 🟢 بالا {up*100:.0f}¢ · "
                   f"🔴 پایین {down*100:.0f}¢  [{src}] ✅")
        out.append("<i>یعنی همه‌چیز درست است — جمع‌آوری از همین حالا کار می‌کند.</i>")
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--diagnose", action="store_true")
    ap.add_argument("--resolve", action="store_true",
                    help="نتیجهٔ پنجره‌های معلق را الحاق کن و خارج شو")
    a = ap.parse_args()
    if a.resolve:
        print(f"{resolve_pending()} ردیف تکمیل شد.")
    elif a.diagnose:
        import re as _re
        print(_re.sub(r"</?[a-z]+>", "", diagnose()))
    elif a.report:
        report()
    else:
        run(once=a.once)
