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
TIMEOUT = 20
UA = {"User-Agent": "Mozilla/5.0 (Android) btc-odds/1.0"}
ET = timezone(timedelta(hours=-4))          # Polymarket labels windows in ET


def log(msg):
    print(f"{datetime.now():%m-%d %H:%M:%S} | {msg}", flush=True)


def get(url, **params):
    r = requests.get(url, params=params or None, timeout=TIMEOUT, headers=UA)
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
def _candidates():
    """Every open BTC up/down market Gamma will admit to, newest window first."""
    out = []
    for path, key in (("markets", "question"), ("events", "title")):
        try:
            data = get(f"{GAMMA}/{path}", closed="false", limit=500,
                       order="endDate", ascending="true")
        except Exception as exc:
            log(f"gamma /{path} failed: {type(exc).__name__}: {str(exc)[:120]}")
            continue
        for item in data if isinstance(data, list) else []:
            text = (item.get(key) or "").lower()
            if "up or down" not in text or "bitcoin" not in text and "btc" not in text:
                continue
            markets = item.get("markets") if path == "events" else [item]
            for m in markets or []:
                out.append(m)
        if out:
            break
    return out


def market_for(boundary):
    """
    The market whose window STARTS at `boundary`.

    Gamma reports endDate; a five-minute market ending at boundary+300 is the
    one about to open. Matching on the end lets this work no matter how the
    title is worded.
    """
    want_end = boundary + GRAN
    best, best_gap = None, 1e9
    for m in _candidates():
        end = m.get("endDate") or m.get("end_date_iso") or ""
        try:
            ts = datetime.fromisoformat(end.replace("Z", "+00:00")).timestamp()
        except (ValueError, AttributeError):
            continue
        gap = abs(ts - want_end)
        if gap < best_gap:
            best, best_gap = m, gap
    # Anything more than half a window away is a different market.
    return best if best and best_gap <= GRAN / 2 else None


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
           "source": src, "market_id": m.get("id")}
    append(row)
    hit = "—" if winner is None else ("✅" if winner == fav else "❌")
    log(f"   نتیجه: {winner or 'نامشخص'}  {hit}   (ثبت شد)")
    return row


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


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    if a.report:
        report()
    else:
        run(once=a.once)
