"""
Re-grade every signal the way Polymarket actually settles it.

Everything in this project grades close-to-close: the 5-minute candle's closing
price at the start of the window against its closing price at the end. That is
not how the money is decided. Polymarket resolves these markets from Chainlink's
BTC/USD 60-second TWAP — a time-weighted average, not an instant — and the
market page states the tie rule explicitly: anything that is not strictly up
"will resolve to Down".

Two differences, then, and both cut the same way:

  * an AVERAGE over sixty seconds instead of a single print, which erases the
    small moves that decide most 5-minute windows;
  * ties lost rather than discarded.

The gap has been measured once before at roughly five points (54.72% grading
close-to-close against 49.86% graded as Polymarket would). Five points is
larger than every edge this project has found put together, so it deserves to
be measured properly rather than carried as a footnote.

HOW THE TWAP IS APPROXIMATED

Chainlink's stream is a rolling 60-second average of its own multi-venue
aggregate. What is available here is Bitstamp one-minute OHLC, so the average
price inside the minute ending at T is approximated as (O+H+L+C)/4 of the bar
covering [T-60, T). The script also runs (H+L)/2 as a second estimator; if the
two disagree the approximation is too crude to trust, and it says so.

This cannot reproduce Chainlink exactly — different venues, and an approximated
average rather than a true one. It answers a narrower question, which is the
one that matters: how much of the measured edge survives being graded on a
sixty-second average instead of a closing print?

    python twap_grade.py [--days 365] [--fetch]

--fetch re-downloads the one-minute data (needed once; it is not in the repo).
"""

import csv
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

SRC = ("https://raw.githubusercontent.com/ff137/bitstamp-btcusd-minute-data/"
       "main/data/updates/btcusd_bitstamp_1min_latest.csv")
MIN1 = "btc1m.csv"
TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN, MIN = 300, 60
PLANB = ["۸) پلن بی"]


def fetch(path=MIN1):
    print(f"downloading one-minute data …", file=sys.stderr)
    with urllib.request.urlopen(SRC, timeout=300) as r:
        text = r.read().decode()
    with open(path, "w") as f:
        f.write(text)
    print(f"  saved {path}", file=sys.stderr)


def load_1m(path=MIN1):
    """ts -> (o, h, l, c). Timestamps are the bar's OPEN, so it covers [ts, ts+60)."""
    out = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            t = int(float(r["timestamp"]))
            out[t] = (float(r["open"]), float(r["high"]),
                      float(r["low"]), float(r["close"]))
    return out


def to_5m(m1):
    """Close of each 5-minute bucket, matching what fetch_data.py builds."""
    buck = {}
    for t, (o, h, l, c) in m1.items():
        k = t // GRAN * GRAN
        cur = buck.get(k)
        if cur is None or t > cur[0]:
            buck[k] = (t, c)
    return {k: v[1] for k, v in buck.items()}


def twaps(m1, buckets):
    """
    The 60-second TWAP at the moment each 5-minute bucket CLOSES, keyed by the
    bucket so it drops straight into the same lookups `closes` uses.

    The keying matters more than it looks and cost a wrong answer once. A
    bucket keyed k covers [k, k+300), so closes[k] is the price at wall-clock
    k+300 — not at k. Reading the TWAP at k instead graded every signal against
    the window BEFORE the one it bet on, and since every rule here fades the
    previous candle, that inverted almost all of them and produced a 0% win
    rate that looked like a discovery.

    So: twap[k] = average over [k+240, k+300), the last minute of bucket k,
    which is the minute Chainlink's 60s stream covers when the window closes.
    """
    o4, hl = {}, {}
    for k in buckets:
        bar = m1.get(k + GRAN - MIN)
        if bar is None:
            continue
        o, h, l, c = bar
        o4[k] = (o + h + l + c) / 4.0
        hl[k] = (h + l) / 2.0
    return o4, hl


def grade(sigs, price_at, tie_down=True):
    """
    Re-decide each signal against a price series, without changing the signals.

    The signal set stays exactly what the rules produced, so the comparison is
    grading against grading and not one universe against another. Polymarket's
    stated rule is that anything not strictly up resolves Down, which is what
    tie_down reproduces.
    """
    out, missing = [], 0
    for s in sigs:
        a, b = price_at.get(s["t"]), price_at.get(s["t"] + GRAN)
        if a is None or b is None:
            missing += 1
            continue
        up = b > a if tie_down else b >= a
        out.append({**s, "won": (s["bet"] == "up") == up,
                    "flat": b == a, "move": b - a})
    return out, missing


def book(name, sigs):
    n = len(sigs)
    w = sum(1 for s in sigs if s["won"])
    lo, hi = S.wilson(w, n) if n else (0, 0)
    return name, w, n, (w / n if n else 0.0), lo, hi


def line(nm, w, n, p, lo, hi, ref=None):
    tail = "" if ref is None else f"{(p - ref) * 100:>+9.2f}"
    print(f"  {nm:<30}{w:>7,}/{n:<7,}{p * 100:>7.2f}%"
          f"   [{lo * 100:>5.2f}–{hi * 100:<5.2f}]{tail}")


def main():
    argv = sys.argv[1:]
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 365
    if "--fetch" in argv or not os.path.exists(MIN1):
        fetch()

    m1 = load_1m()
    closes = to_5m(m1)
    o4, hl = twaps(m1, closes)
    ts = sorted(closes)
    print(f"{len(m1):,} one-minute bars · {len(closes):,} five-minute buckets")
    print(f"{datetime.utcfromtimestamp(ts[0]):%Y-%m-%d} -> "
          f"{datetime.utcfromtimestamp(ts[-1]):%Y-%m-%d}")

    cut = ts[-1] - days * 86400
    sigs = [s for s in S.replay(closes) if s["t"] >= cut]
    for s in sigs:
        s["d"] = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
    print(f"{len(sigs):,} signals in the last {days} days\n")

    graded = {}
    graded["close"], _ = grade(sigs, closes, tie_down=False)
    graded["twap"], miss = grade(sigs, o4)
    graded["twap_hl"], _ = grade(sigs, hl)
    if miss:
        print(f"note: {miss:,} signals dropped — no one-minute bar at a boundary\n")

    # Alignment guard. The TWAP over the last minute of a bucket and that
    # bucket's closing print describe nearly the same moment, so they must sit
    # within a whisker of each other. When the keying was off by one window
    # this gap ran to whole percent and the win rates inverted; the check is
    # here so that failure announces itself instead of looking like a result.
    gaps = sorted(abs(o4[k] - closes[k]) / closes[k] * 100
                  for k in o4 if k in closes)
    med = gaps[len(gaps) // 2]
    p99 = gaps[int(len(gaps) * 0.99)]
    print("=" * 82)
    print(f"  ALIGNMENT CHECK — |TWAP − close| as % of price: "
          f"median {med:.4f}%, 99th {p99:.4f}%")
    if med > 0.1:
        print("  ABORT: the TWAP series is not aligned with the closes.")
        return
    print("  aligned.")

    # The two estimators must agree, or the approximation is too crude to use.
    a = {(s["t"]): s["won"] for s in graded["twap"]}
    b = {(s["t"]): s["won"] for s in graded["twap_hl"]}
    both = set(a) & set(b)
    agree = sum(1 for t in both if a[t] == b[t])
    print("=" * 82)
    print(f"  ESTIMATOR CHECK — (O+H+L+C)/4 vs (H+L)/2 agree on "
          f"{agree:,}/{len(both):,} = {agree / len(both) * 100:.2f}% of signals")
    print("=" * 82)

    ties = sum(1 for s in graded["twap"] if s["flat"])
    print(f"\n  ties under the TWAP (resolve Down by Polymarket's rule): "
          f"{ties:,} of {len(graded['twap']):,}")

    books = [
        ("همهٔ سیگنال‌ها", lambda s: True),
        ("هفت قانون ۱ تا ۷", lambda s: s["rules"] != PLANB),
        ("پلن بی", lambda s: s["rules"] == PLANB),
        ("پلن بی — آخر هفته",
         lambda s: s["rules"] == PLANB and s["d"].weekday() in (5, 6)),
        ("عمق ۵+", lambda s: len(s["rules"]) >= 5),
    ]

    print(f"\n{'=' * 82}")
    print("  CLOSE-TO-CLOSE (what every number in this project used)")
    print("=" * 82)
    ref = {}
    for nm, f in books:
        sel = [s for s in graded["close"] if f(s)]
        if len(sel) < 50:
            continue
        _, w, n, p, lo, hi = book(nm, sel)
        ref[nm] = p
        line(nm, w, n, p, lo, hi)

    print(f"\n{'=' * 82}")
    print("  GRADED ON A 60-SECOND TWAP, TIES LOSING (how Polymarket settles)")
    print("=" * 82)
    for nm, f in books:
        sel = [s for s in graded["twap"] if f(s)]
        if len(sel) < 50:
            continue
        _, w, n, p, lo, hi = book(nm, sel)
        line(nm, w, n, p, lo, hi, ref.get(nm))

    # The rule that survived everything else, put through the same door.
    print(f"\n{'=' * 82}")
    print("  THE 5+/6-HOUR RULE UNDER BOTH GRADINGS")
    print("=" * 82)

    def pick(rows):
        out, last = [], -1e18
        for s in sorted(rows, key=lambda x: x["t"]):
            if len(s["rules"]) >= 5 and s["t"] - last >= 6 * 3600:
                out.append(s)
                last = s["t"]
        return out

    for lbl, key in (("close-to-close", "close"), ("60s TWAP", "twap")):
        sel = pick(graded[key])
        _, w, n, p, lo, hi = book(lbl, sel)
        line(lbl, w, n, p, lo, hi)
        wknd = [s for s in sel if s["d"].weekday() in (5, 6)]
        if len(wknd) >= 30:
            _, w2, n2, p2, lo2, hi2 = book(lbl + " + weekend", wknd)
            line("   + آخر هفته", w2, n2, p2, lo2, hi2)

    print(f"\n{'=' * 82}")
    print("  Break-even is 50% only if the entry is 50c. At the owner's real")
    print("  terms it is 57.30%. Read the rows above against that number.")
    print("=" * 82)


if __name__ == "__main__":
    main()
