"""
Measure the mean-reversion thesis on Polymarket's own settled outcomes.

Every number this project runs on was computed from exchange candles: Binance
closes, later Chainlink samples. The market settles on neither, and the whole
strategy rests on one claim — that a run of same-direction windows is more
likely than not to end. Now that a month of actual resolutions is on disk, that
claim can be checked against the thing that paid.

    python chart_stats.py

Reads polymarket_chart.csv (written by chart_pull.py). Nothing here touches the
bot; it is a measurement, not a change.
"""

import csv
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

IN = os.environ.get("CHART_FILE", "polymarket_chart.csv")
GRAN = 300


def wilson(w, n, z=1.96):
    """95% interval. A bare percentage on 40 samples invites reading noise."""
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def load():
    """
    Read by shape, not by header.

    The file was written by two versions of the puller: the first stored prices
    (beat/final/moved), the second stores the winner — and because rows were
    appended, the header on line 1 describes only the first. DictReader then
    handed back the wrong keys and every row looked empty.

    A row is unambiguous without its header: the first cell is the window epoch,
    and exactly one cell reads "up" or "down". Matching on that costs nothing
    and survives the next rename too.
    """
    rows = {}
    with open(IN, newline="") as f:
        for cells in csv.reader(f):
            if not cells or not cells[0].strip().isdigit():
                continue                      # header, or a price-only row
            w = next((c.strip().lower() for c in cells[1:]
                      if c.strip().lower() in ("up", "down")), None)
            if w:
                rows[int(cells[0])] = w
    return rows


def runs_of(seq):
    """
    Contiguous stretches only.

    A run length counted across a missing window is not a run — it is two runs
    with the join hidden. Four windows are absent from the month; splitting on
    them costs almost nothing and keeps every count honest.
    """
    out, cur = [], []
    prev = None
    for t in sorted(seq):
        if prev is not None and t - prev != GRAN:
            if cur:
                out.append(cur)
            cur = []
        cur.append(seq[t])
        prev = t
    if cur:
        out.append(cur)
    return out


def main():
    if not os.path.exists(IN):
        print(f"{IN} not found — run chart_pull.py first.")
        return
    data = load()
    if not data:
        print("no settled windows in the file.")
        return
    ts = sorted(data)
    days = (ts[-1] - ts[0]) / 86400
    print(f"{len(data):,} settled windows · {days:.1f} days · "
          f"{datetime.fromtimestamp(ts[0], timezone.utc):%Y-%m-%d} → "
          f"{datetime.fromtimestamp(ts[-1], timezone.utc):%Y-%m-%d} UTC\n")

    c = Counter(data.values())
    n = len(data)
    lo, hi = wilson(c["up"], n)
    print("=" * 62)
    print("BASE RATE — is the coin fair?")
    print("=" * 62)
    print(f"  up   {c['up']:>6,}  ({c['up']/n*100:.2f}%)   95% CI "
          f"[{lo*100:.2f} – {hi*100:.2f}]")
    print(f"  down {c['down']:>6,}  ({c['down']/n*100:.2f}%)")
    print(f"  {'no detectable bias' if lo <= 0.5 <= hi else 'BIASED — the interval excludes 50%'}")

    # The claim the whole system rests on.
    chains = runs_of(data)
    print(f"\n{'=' * 62}")
    print("THE THESIS — after k windows the same way, does the next one flip?")
    print("=" * 62)
    print(f"{'run':>5}{'n':>9}{'flipped':>10}{'95% CI':>16}   verdict")
    tally = defaultdict(lambda: [0, 0])
    for chain in chains:
        run = 1
        for i in range(1, len(chain)):
            prev, cur = chain[i - 1], chain[i]
            for k in range(1, min(run, 12) + 1):
                tally[k][0] += 1
                tally[k][1] += cur != prev
            run = run + 1 if cur == prev else 1
    for k in sorted(tally):
        tot, flip = tally[k]
        if tot < 100:
            continue
        a, b = wilson(flip, tot)
        edge = "fade wins" if a > 0.5 else ("follow wins" if b < 0.5 else "—")
        print(f"{'≥' + str(k):>5}{tot:>9,}{flip/tot*100:>9.2f}%"
              f"   [{a*100:>5.2f}–{b*100:<5.2f}]   {edge}")
    print("\n  'fade wins' means the interval sits entirely above 50%: betting")
    print("  against the run beat a coin on this month, after fees of zero.")

    print(f"\n{'=' * 62}")
    print("BY HOUR (Tehran) — where the flips live")
    print("=" * 62)
    by_h = defaultdict(lambda: [0, 0])
    prev_t = prev_w = None
    for t in ts:
        if prev_t is not None and t - prev_t == GRAN:
            h = datetime.fromtimestamp(t, timezone.utc).hour
            h = (h + 3) % 24                       # UTC+3:30, hour part
            by_h[h][0] += 1
            by_h[h][1] += data[t] != prev_w
        prev_t, prev_w = t, data[t]
    for h in sorted(by_h):
        tot, flip = by_h[h]
        a, b = wilson(flip, tot)
        star = " *" if a > 0.5 else ""
        bar = "█" * round((flip / tot - 0.4) * 100) if tot else ""
        print(f"  {h:02d}:30  {flip/tot*100:>6.2f}%  n={tot:>5,}  "
              f"[{a*100:>5.1f}–{b*100:<5.1f}] {bar}{star}")
    print("\n  * = the whole interval is above 50%")


if __name__ == "__main__":
    main()
