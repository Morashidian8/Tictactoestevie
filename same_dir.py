"""
When a signal points the SAME way as the candle that just closed, does it win?

The question splits every signal in two. A signal either agrees with the candle
it was born on — the price just went up and the signal says up — or it argues
with it. "Follow" against "fade".

The settled research (docs/research/btc-5m-patterns.md) predicts the answer:
every rule that survived out-of-sample bets AGAINST the recent direction, so
the agreeing half should be the weaker one. This measures whether that holds
for the bot's own rules as they are actually wired today.

    python same_dir.py                 # last 30 days, then the whole archive
    python same_dir.py --days 90
    python same_dir.py --data path.csv  # a different candle file

Candles come from research/btc5m/btc5m.csv.gz, or from a fresher file fetched
with research/btc5m/fetch_data.py. Grading is close-to-close, the same
convention the market settles on; Polymarket uses a Chainlink 60-second TWAP,
so expect roughly 1-2 points lower live.
"""

import csv
import gzip
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")      # bot.py refuses to import bare
import bot

GRAN = 300
ARCHIVE = os.path.join("research", "btc5m", "btc5m.csv.gz")
FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def two_prop_z(w1, n1, w2, n2):
    """Is the gap between two rates bigger than the noise in both of them?"""
    if not n1 or not n2:
        return 0.0
    p = (w1 + w2) / (n1 + n2)
    se = (p * (1 - p) * (1 / n1 + 1 / n2)) ** 0.5
    return ((w1 / n1) - (w2 / n2)) / se if se else 0.0


def load_candles(path):
    op = gzip.open if path.endswith(".gz") else open
    closes = {}
    with op(path, "rt", newline="") as f:
        for r in csv.DictReader(f):
            closes[int(r["t"])] = float(r["c"])
    return closes


def replay(closes, since=None):
    """
    Every signal the rules produce, tagged with the direction of the candle it
    was born on.

    A signal fires at the close of window t and bets on t+1, so "the previous
    candle" is window t itself — the one that had just finished when the rules
    spoke. Its direction is close-to-close, matching how the market settles.
    """
    ts = sorted(closes)
    need = bot.BREAKOUT_FULL_HISTORY + bot.RULE8_MA
    out = []
    for i in range(need + 1, len(ts) - 1):
        t = ts[i]
        if since is not None and t < since:
            continue
        # The rules read rolling extremes; a hole behind the window makes them
        # meaningless, so require a clean contiguous run first.
        if ts[i - need] != t - need * GRAN or ts[i + 1] != t + GRAN:
            continue
        hits = bot.BreakoutMonitor.evaluate([closes[x] for x in ts[i - need:i + 1]])
        if not hits:
            continue
        bets = {h[2] for h in hits}
        if len(bets) != 1:
            continue
        bet = bets.pop()
        prev = closes[t] - closes[t - GRAN]          # the candle just closed
        nxt = closes[t + GRAN] - closes[t]           # the one being bet on
        if prev == 0 or nxt == 0:
            continue                                 # a flat candle has no side
        out.append({
            "t": t,
            "bet": bet,
            "aligned": (bet == "up") == (prev > 0),
            "won": (bet == "up") == (nxt > 0),
            "rules": [h[0] for h in hits],
            "golden": any(h[0].startswith("🏆") for h in hits),
        })
    return out


def line(label, sel, width=42):
    n = len(sel)
    if not n:
        print(f"  {label:<{width}}{'—':>8}")
        return
    w = sum(1 for s in sel if s["won"])
    lo, hi = wilson(w, n)
    print(f"  {label:<{width}}{w:>6,}/{n:<7,}{w / n * 100:>7.2f}%"
          f"   [{lo * 100:>5.2f}–{hi * 100:<5.2f}]")


def report(sigs, title):
    print(f"\n{'=' * 78}")
    print(title)
    print("=" * 78)
    if not sigs:
        print("  no signals in this span.")
        return
    agree = [s for s in sigs if s["aligned"]]
    against = [s for s in sigs if not s["aligned"]]
    print(f"  {'':<42}{'won':>6}/{'n':<7}{'rate':>7}   {'95% CI':>13}")
    line("SAME direction as the previous candle", agree)
    line("OPPOSITE to the previous candle", against)
    line("every signal", sigs)
    aw, bw = sum(1 for s in agree if s["won"]), sum(1 for s in against if s["won"])
    z = two_prop_z(aw, len(agree), bw, len(against))
    print(f"\n  gap: {(aw / len(agree) if agree else 0) * 100 - (bw / len(against) if against else 0) * 100:+.2f} "
          f"points   ·   z = {z:+.2f}   ·   "
          f"{'REAL' if abs(z) >= 1.96 else 'not significant'}")
    print(f"  share of signals that agree with the previous candle: "
          f"{len(agree) / len(sigs) * 100:.1f}%")

    print(f"\n  break-even: 50.00% at 50c   ·   52.00% at 52c   ·   "
          f"55.00% at 55c")

    # per rule, because the rules are not one thing
    print(f"\n  {'-' * 74}")
    print(f"  by rule (a signal is counted under every rule that fired it)")
    print(f"  {'-' * 74}")
    names = sorted({r for s in sigs for r in s["rules"]})
    for nm in names:
        sub = [s for s in sigs if nm in s["rules"]]
        a = [s for s in sub if s["aligned"]]
        b = [s for s in sub if not s["aligned"]]
        aw2, bw2 = sum(1 for s in a if s["won"]), sum(1 for s in b if s["won"])
        short = nm[:30]
        ra = f"{aw2 / len(a) * 100:.1f}%" if a else "—"
        rb = f"{bw2 / len(b) * 100:.1f}%" if b else "—"
        print(f"  {short:<32}same {ra:>7} (n={len(a):<6,})   "
              f"opp {rb:>7} (n={len(b):<6,})")


def main():
    argv = sys.argv[1:]
    days = 30
    if "--days" in argv:
        days = int(argv[argv.index("--days") + 1])
    path = ARCHIVE
    if "--data" in argv:
        path = argv[argv.index("--data") + 1]
    if not os.path.exists(path):
        print(f"{path} not found — run research/btc5m/fetch_data.py first.")
        return

    closes = load_candles(path)
    ts = sorted(closes)
    lo, hi = ts[0], ts[-1]
    print(f"{len(closes):,} candles  "
          f"{datetime.fromtimestamp(lo, timezone.utc):%Y-%m-%d} -> "
          f"{datetime.fromtimestamp(hi, timezone.utc):%Y-%m-%d}")
    print("grading close-to-close; Polymarket settles on a Chainlink 60s TWAP,")
    print("so expect roughly 1-2 points lower live.\n")
    print("replaying the rules …")
    t0 = time.time()
    sigs = replay(closes)
    print(f"  {len(sigs):,} signals in {time.time() - t0:.0f}s")

    cut = hi - days * 86400
    report([s for s in sigs if s["t"] >= cut],
           f"THE LAST {days} DAYS")
    report(sigs, f"THE WHOLE ARCHIVE — {(hi - lo) / 86400:.0f} days")

    # ---- does it survive being cut in half? ------------------------------- #
    # Anything measured on the same data that suggested it needs this. The
    # archive is long enough to split chronologically, which is the protocol
    # that separated the one real edge from thousands of artifacts.
    half = ts[len(ts) // 2]
    print(f"\n{'=' * 78}")
    print("CHRONOLOGICAL HALVES — the same split, measured twice")
    print("=" * 78)
    print(f"  {'half':<20}{'same dir':>22}{'opposite':>22}{'gap':>8}{'z':>8}")
    for nm, sel in (("first",  [s for s in sigs if s["t"] < half]),
                    ("second", [s for s in sigs if s["t"] >= half])):
        a = [s for s in sel if s["aligned"]]
        b = [s for s in sel if not s["aligned"]]
        if not a or not b:
            continue
        aw = sum(1 for s in a if s["won"])
        bw = sum(1 for s in b if s["won"])
        ra, rb = aw / len(a) * 100, bw / len(b) * 100
        z = two_prop_z(aw, len(a), bw, len(b))
        print(f"  {nm:<20}{f'{ra:.2f}% (n={len(a):,})':>22}"
              f"{f'{rb:.2f}% (n={len(b):,})':>22}{ra - rb:>+8.2f}{z:>+8.2f}")


if __name__ == "__main__":
    main()
