"""
Are Saturdays and Sundays really better?

A plain table of win rate by weekday is not enough to answer this, for a reason
this project has already been bitten by: the market's own character drifts over
a year, and any split that lines up with the calendar inherits that drift and
looks predictive. Documented in docs/research/btc-5m-patterns.md — the test
half is globally more mean-reverting than the train half, which is why
`day-of-week` failed there once block-stratified contrasts were used.

So three things are computed, and only the third one decides:

  1. The raw table, because it is what the eye sees and the claim came from.
  2. BLOCK-STRATIFIED — each weekday compared with the OTHER days of its own
     calendar month, and those within-month contrasts averaged. A year-long
     drift cannot survive that, because it moves both sides of every contrast.
  3. SPLIT-HALF — the same contrast in the first half of the span and the
     second. A real weekday effect is in both.

Bonferroni over the seven days, because looking at seven and reporting the best
is how a coin gets a reputation.

    python weekday_check.py [--days 365] [--data btc5m_fresh.csv]
"""

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import NormalDist

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
FA = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"]
EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "SAT", "SUN"]


def rate(sel):
    n = len(sel)
    if not n:
        return 0, 0, 0.0
    w = sum(1 for s in sel if s["won"])
    return w, n, w / n * 100


def two_prop_z(w1, n1, w2, n2):
    if not n1 or not n2:
        return 0.0
    p = (w1 + w2) / (n1 + n2)
    se = (p * (1 - p) * (1 / n1 + 1 / n2)) ** 0.5
    return ((w1 / n1) - (w2 / n2)) / se if se else 0.0


def main():
    argv = sys.argv[1:]
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 365
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    closes = S.load_candles(data)
    ts = sorted(closes)
    cut = ts[-1] - days * 86400
    print("replaying …")
    sigs = [s for s in S.replay(closes) if s["t"] >= cut]
    if not sigs:
        print("no signals in this span.")
        return
    for s in sigs:
        d = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
        s["wd"] = d.weekday()          # 0=Mon .. 5=Sat, 6=Sun
        s["blk"] = d.strftime("%Y-%m")
    w, n, r = rate(sigs)
    print(f"{n:,} signals  "
          f"{datetime.fromtimestamp(sigs[0]['t'], TEHRAN):%Y-%m-%d} -> "
          f"{datetime.fromtimestamp(sigs[-1]['t'], TEHRAN):%Y-%m-%d} (Tehran)")
    print(f"baseline {w:,}/{n:,} = {r:.2f}%\n")

    bar = NormalDist().inv_cdf(1 - 0.05 / (2 * 7))
    print("=" * 76)
    print("1.  THE RAW TABLE — what the eye sees")
    print("=" * 76)
    print(f"  {'day':<12}{'n':>7}{'won':>7}{'rate':>8}{'95% CI':>17}"
          f"{'vs rest':>9}")
    for wd in range(7):
        sel = [s for s in sigs if s["wd"] == wd]
        rest = [s for s in sigs if s["wd"] != wd]
        if len(sel) < 50:
            continue
        w1, n1, r1 = rate(sel)
        w2, n2, _ = rate(rest)
        lo, hi = S.wilson(w1, n1)
        z = two_prop_z(w1, n1, w2, n2)
        star = "  <" if wd in (5, 6) else ""
        print(f"  {EN[wd]:<5}{FA[wd]:<9}{n1:>6,}{w1:>7,}{r1:>7.2f}%"
              f"   [{lo * 100:>5.2f}–{hi * 100:<5.2f}]{z:>+8.2f}{star}")
    we = [s for s in sigs if s["wd"] in (5, 6)]
    wk = [s for s in sigs if s["wd"] not in (5, 6)]
    w1, n1, r1 = rate(we)
    w2, n2, r2 = rate(wk)
    z = two_prop_z(w1, n1, w2, n2)
    print(f"\n  {'شنبه+یکشنبه':<14}{n1:>6,}{w1:>7,}{r1:>7.2f}%")
    print(f"  {'بقیهٔ هفته':<14}{n2:>6,}{w2:>7,}{r2:>7.2f}%")
    print(f"  gap {r1 - r2:+.2f} points · z = {z:+.2f} · "
          f"needs |z| >= {bar:.2f} after Bonferroni over 7 days")

    # ---- 2. the same contrast, inside each month --------------------------- #
    # A drift that runs across the year moves every day of a given month
    # together, so comparing a weekday only with the other days of its OWN month
    # cannot be fooled by it. This is the step that killed day-of-week the last
    # time it was looked at.
    print(f"\n{'=' * 76}")
    print("2.  BLOCK-STRATIFIED — each month judged against itself")
    print("=" * 76)
    print(f"  {'month':<10}{'weekend':>10}{'weekdays':>11}{'gap':>9}{'n':>8}")
    gaps, wts = [], []
    for blk in sorted({s["blk"] for s in sigs}):
        a = [s for s in sigs if s["blk"] == blk and s["wd"] in (5, 6)]
        b = [s for s in sigs if s["blk"] == blk and s["wd"] not in (5, 6)]
        if len(a) < 30 or len(b) < 30:
            continue
        _, na, ra = rate(a)
        _, nb, rb = rate(b)
        gaps.append(ra - rb)
        wts.append(na)
        print(f"  {blk:<10}{ra:>9.2f}%{rb:>10.2f}%{ra - rb:>+9.2f}{na:>8,}")
    if gaps:
        avg = sum(g * w for g, w in zip(gaps, wts)) / sum(wts)
        pos = sum(1 for g in gaps if g > 0)
        m = sum(gaps) / len(gaps)
        sd = (sum((g - m) ** 2 for g in gaps) / max(1, len(gaps) - 1)) ** 0.5
        se = sd / (len(gaps) ** 0.5) if len(gaps) > 1 else 0.0
        t = m / se if se > 0 else 0.0
        print(f"\n  weighted average gap: {avg:+.2f} points")
        print(f"  months where the weekend was better: {pos} of {len(gaps)}")
        print(f"  mean of the monthly gaps {m:+.2f} ± {se:.2f}  ->  t = {t:+.2f}")
        if abs(t) < 2:
            print("  -> the within-month gap is not distinguishable from zero.")
        else:
            print("  -> the gap survives being measured inside each month.")

    # ---- 3. does it hold in both halves? ----------------------------------- #
    print(f"\n{'=' * 76}")
    print("3.  SPLIT-HALF — the same question asked twice")
    print("=" * 76)
    half = sigs[len(sigs) // 2]["t"]
    print(f"  {'half':<10}{'weekend':>10}{'weekdays':>11}{'gap':>9}{'z':>8}")
    for name, sel in (("first", [s for s in sigs if s["t"] < half]),
                      ("second", [s for s in sigs if s["t"] >= half])):
        a = [s for s in sel if s["wd"] in (5, 6)]
        b = [s for s in sel if s["wd"] not in (5, 6)]
        if not a or not b:
            continue
        wa, na, ra = rate(a)
        wb, nb, rb = rate(b)
        print(f"  {name:<10}{ra:>9.2f}%{rb:>10.2f}%{ra - rb:>+9.2f}"
              f"{two_prop_z(wa, na, wb, nb):>+8.2f}")

    print(f"\n{'=' * 76}")
    print("  A weekday effect has to clear all three. The raw table alone is")
    print("  the weakest evidence there is — seven days were looked at, and")
    print("  the best of seven beats the rest by chance most of the time.")
    print("=" * 76)


if __name__ == "__main__":
    main()
