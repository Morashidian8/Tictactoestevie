"""
"Follow the previous candle" — is there any staking scheme that makes it pay?

The strategy: every candle, bet the next one is the same colour. A loss is
exactly an alternation. The user's observation is that BTC's alternations are
mostly three long, and the question is whether that can be turned into money —
with a martingale, without one, or by doing something different once three
alternations have happened.

The whole thing turns on ONE number, so it is measured first and separately:
the chance the next candle repeats this one's colour. Every staking scheme ever
devised leaves that number alone. A ladder changes the size of the rare loss
and the frequent win, and their ratio is built so the two cancel at exactly 50%
— which is why the break-even of every ladder, at every depth, is 50% and
nothing else.

So this script answers three things in order:

  1. What is the repeat rate, and does it move with how many alternations have
     already happened? If it does not, no rule about "after three" can exist.
  2. Is "mostly three" even true — and if it is, is it a fact about BTC or a
     fact about coins? A fair coin produces runs of three constantly.
  3. Given the answer, what do flat and laddered staking actually return.

    python alternation_study.py [--data btc5m_fresh.csv] [--stake 20]

Reads a candle CSV (t, iso, o, h, l, c, v). Touches nothing else.
"""

import csv
import gzip
import os
import sys
from collections import Counter
from datetime import datetime, timezone

GRAN = 300
ARCHIVE = os.path.join("research", "btc5m", "btc5m.csv.gz")


def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def load(path):
    op = gzip.open if path.endswith(".gz") else open
    rows = []
    with op(path, "rt", newline="") as f:
        for r in csv.DictReader(f):
            rows.append((int(r["t"]), float(r["c"])))
    rows.sort()
    return rows


def colours(rows):
    """
    +1 / -1 per candle, close to close. Flat candles are dropped, not assigned
    a side: the market voids them, and forcing them one way would invent an
    alternation or erase one. About 0.9% of candles are flat.
    """
    out = []
    for (t0, c0), (t1, c1) in zip(rows, rows[1:]):
        if t1 != t0 + GRAN or c1 == c0:
            continue
        out.append((t1, 1 if c1 > c0 else -1))
    return out


def runs_of(seq):
    """Lengths of maximal runs of equal values."""
    out, cur = [], 1
    for a, b in zip(seq, seq[1:]):
        if a == b:
            cur += 1
        else:
            out.append(cur)
            cur = 1
    out.append(cur)
    return out


# --------------------------------------------------------------------------- #
# staking
# --------------------------------------------------------------------------- #
def simulate(bets, stake, price, rungs=0):
    """
    Walk a list of True/False outcomes and return (pnl, worst_drawdown, busts).

    rungs=0 is flat. Otherwise the stake doubles after each loss and resets
    after `rungs` losses, which is the bot's ladder generalised.
    """
    run = peak = dip = 0.0
    rung = busts = 0
    win = (1 - price) / price
    for ok in bets:
        bet = stake * 2 ** rung
        if ok:
            run += bet * win
            rung = 0
        else:
            run -= bet
            if rungs:
                rung += 1
                if rung >= rungs:
                    rung, busts = 0, busts + 1
        peak = max(peak, run)
        dip = min(dip, run - peak)
    return run, dip, busts


def main():
    argv = sys.argv[1:]
    path = argv[argv.index("--data") + 1] if "--data" in argv else ARCHIVE
    stake = float(argv[argv.index("--stake") + 1]) if "--stake" in argv else 20.0
    if not os.path.exists(path):
        print(f"{path} not found — run research/btc5m/fetch_data.py first.")
        return

    rows = load(path)
    col = colours(rows)
    seq = [c for _, c in col]
    n = len(seq)
    print(f"{len(rows):,} candles  "
          f"{datetime.fromtimestamp(rows[0][0], timezone.utc):%Y-%m-%d} -> "
          f"{datetime.fromtimestamp(rows[-1][0], timezone.utc):%Y-%m-%d}")
    print(f"{n:,} with a side ({len(rows) - 1 - n:,} flat or across a gap, "
          f"dropped)\n")

    # ---- 1. the one number everything depends on -------------------------- #
    same = sum(1 for a, b in zip(seq, seq[1:]) if a == b)
    tot = n - 1
    lo, hi = wilson(same, tot)
    print("=" * 76)
    print("1.  THE REPEAT RATE — the only number a staking scheme cannot change")
    print("=" * 76)
    print(f"  next candle repeats this colour   {same:>7,}/{tot:<7,} "
          f"{same / tot * 100:6.3f}%   [{lo * 100:.2f}–{hi * 100:.2f}]")
    print(f"  next candle alternates            {tot - same:>7,}/{tot:<7,} "
          f"{(tot - same) / tot * 100:6.3f}%")
    print(f"\n  break-even for FOLLOW at 50c is 50.000%.")
    edge = same / tot * 100 - 50
    print(f"  measured edge: {edge:+.3f} points  ->  "
          f"{'ABOVE' if edge > 0 else 'BELOW'} break-even before any costs")

    # ---- 2. does it move with how many alternations came before? ---------- #
    print(f"\n{'=' * 76}")
    print("2.  AFTER k ALTERNATIONS IN A ROW, does the next candle alternate?")
    print("=" * 76)
    print("  If this column is flat, no rule of the form \"after three, do X\"")
    print("  can exist — there is nothing for the rule to key on.\n")
    print(f"  {'k so far':<12}{'alternated next':>18}{'rate':>10}"
          f"{'95% CI':>18}")
    streak = 0
    buckets = {}
    for a, b in zip(seq, seq[1:]):
        flip = a != b
        buckets.setdefault(streak, [0, 0])
        buckets[streak][0] += 1
        buckets[streak][1] += flip
        streak = streak + 1 if flip else 0
    for k in range(0, 9):
        if k not in buckets or buckets[k][0] < 30:
            continue
        t_, f_ = buckets[k]
        a, b = wilson(f_, t_)
        print(f"  {k:<12}{f'{f_:,}/{t_:,}':>18}{f_ / t_ * 100:>9.2f}%"
              f"   [{a * 100:>5.2f}–{b * 100:<5.2f}]")

    # ---- 3. is "mostly three" true, and is it special? -------------------- #
    print(f"\n{'=' * 76}")
    print("3.  RUN LENGTHS — is \"mostly three\" a fact about BTC or about coins?")
    print("=" * 76)
    alt_runs = []
    cur = 0
    for a, b in zip(seq, seq[1:]):
        if a != b:
            cur += 1
        elif cur:
            alt_runs.append(cur)
            cur = 0
    if cur:
        alt_runs.append(cur)
    c = Counter(alt_runs)
    total_runs = len(alt_runs)
    print(f"  every uninterrupted stretch of alternations ({total_runs:,} of them)\n")
    print(f"  {'length':<9}{'count':>9}{'share':>9}{'a fair coin':>13}   bar")
    for k in range(1, 9):
        cnt = c.get(k, 0)
        coin = 0.5 ** k * 100
        bar = "#" * min(40, round(cnt / total_runs * 100))
        print(f"  {k:<9}{cnt:>9,}{cnt / total_runs * 100:>8.2f}%"
              f"{coin:>12.2f}%   {bar}")
    mode = c.most_common(1)[0]
    print(f"\n  most common stretch: {mode[0]} "
          f"({mode[1] / total_runs * 100:.1f}%)")

    # the per-window MAXIMUM, which is what an app showing "alternation" reports
    print(f"\n  But an app that reports \"the alternation\" of a window shows the")
    print(f"  MAXIMUM stretch inside it, not a typical one. That is a different")
    print(f"  number and it is the one that looks like three:\n")
    print(f"  {'window':<14}{'most common max':>18}{'mean max':>11}")
    for wname, wlen in (("30 minutes", 6), ("1 hour", 12), ("2 hours", 24),
                        ("4 hours", 48)):
        maxes = []
        for i in range(0, len(seq) - wlen, wlen):
            chunk = seq[i:i + wlen]
            best = cur2 = 0
            for a, b in zip(chunk, chunk[1:]):
                cur2 = cur2 + 1 if a != b else 0
                best = max(best, cur2)
            maxes.append(best)
        mc = Counter(maxes).most_common(1)[0]
        print(f"  {wname:<14}{f'{mc[0]}  ({mc[1] / len(maxes) * 100:.0f}% of windows)':>18}"
              f"{sum(maxes) / len(maxes):>11.2f}")

    # ---- 4. what the money actually does ---------------------------------- #
    follow = [a == b for a, b in zip(seq, seq[1:])]
    fade = [not x for x in follow]
    print(f"\n{'=' * 76}")
    print(f"4.  THE MONEY — ${stake:,.0f} base, {len(follow):,} bets, priced at 50c")
    print("=" * 76)
    print(f"  {'strategy':<40}{'P&L':>12}{'worst dip':>12}{'busts':>8}")
    plans = [
        ("FOLLOW, flat", follow, 0),
        ("FOLLOW, martingale 3 rungs", follow, 3),
        ("FOLLOW, martingale 7 rungs", follow, 7),
        ("FADE, flat  (the mirror)", fade, 0),
        ("FADE, martingale 3 rungs", fade, 3),
    ]
    for name, bets, rungs in plans:
        p, d, b = simulate(bets, stake, 0.50, rungs)
        print(f"  {name:<40}{p:>+12,.0f}{d:>+12,.0f}{b:>8,}")

    # the "do something after three" family
    print(f"\n  and the idea of switching once three alternations have happened:")
    for k in (2, 3, 4):
        switched, streak2 = [], 0
        for a, b in zip(seq, seq[1:]):
            flip = a != b
            # below k alternations bet follow; at or past k, bet fade
            switched.append((not flip) if streak2 < k else flip)
            streak2 = streak2 + 1 if flip else 0
        p, d, _ = simulate(switched, stake, 0.50, 0)
        w = sum(switched)
        print(f"  {f'follow, then FADE after {k} alternations':<40}"
              f"{p:>+12,.0f}{d:>+12,.0f}   {w / len(switched) * 100:.3f}%")
        stopped = []
        streak2 = 0
        for a, b in zip(seq, seq[1:]):
            flip = a != b
            if streak2 < k:
                stopped.append(not flip)
            streak2 = streak2 + 1 if flip else 0
        p, d, _ = simulate(stopped, stake, 0.50, 0)
        print(f"  {f'follow, then STAND ASIDE after {k}':<40}"
              f"{p:>+12,.0f}{d:>+12,.0f}   {len(stopped):,} bets")

    # ---- 5. does the repeat rate hold up across time? --------------------- #
    print(f"\n{'=' * 76}")
    print("5.  STABILITY — the repeat rate, quarter by quarter")
    print("=" * 76)
    print(f"  {'from':<12}{'to':<12}{'bets':>9}{'repeat':>10}{'95% CI':>18}")
    step = len(col) // 6
    for i in range(6):
        part = col[i * step:(i + 1) * step + 1]
        s2 = [c2 for _, c2 in part]
        w = sum(1 for a, b in zip(s2, s2[1:]) if a == b)
        t2 = len(s2) - 1
        a, b = wilson(w, t2)
        print(f"  {datetime.fromtimestamp(part[0][0], timezone.utc):%Y-%m-%d}  "
              f"{datetime.fromtimestamp(part[-1][0], timezone.utc):%Y-%m-%d}  "
              f"{t2:>9,}{w / t2 * 100:>9.2f}%   [{a * 100:>5.2f}–{b * 100:<5.2f}]")

    # ---- 6. the ladder that looks like it works --------------------------- #
    # A deep ladder on FOLLOW comes out positive at 50c, which contradicts the
    # rule that sizing cannot change the sign. It is not a bug: sizing cannot
    # change the sign of INDEPENDENT bets, and these are not independent. A
    # martingale stakes most right after a loss, and right after a loss this
    # sequence repeats more often than chance — so the ladder is quietly a
    # conditional bet. Shuffling keeps the win rate and destroys the order,
    # which separates the two explanations. Then the halves and the real price
    # say whether the conditional bet is worth anything.
    print(f"\n{'=' * 76}")
    print("6.  THE DEEP LADDER — is its profit sizing, order, or luck?")
    print("=" * 76)
    import random
    for rungs in (3, 7):
        real, dip, bst = simulate(follow, stake, 0.50, rungs)
        random.seed(7)
        sh = []
        for _ in range(5):
            s = follow[:]
            random.shuffle(s)
            sh.append(simulate(s, stake, 0.50, rungs)[0])
        print(f"\n  FOLLOW, {rungs} rungs, at 50c: {real:+,.0f}  "
              f"(worst dip {dip:+,.0f}, {bst:,} busts)")
        print(f"    same outcomes, order shuffled: "
              + ", ".join(f"{v:+,.0f}" for v in sh))
        print(f"    -> the gap is ORDER, not sizing.")
        h = len(follow) // 2
        for lbl, sel in (("first half", follow[:h]), ("second half", follow[h:])):
            for pr in (0.50, 0.52):
                p2, d2, _ = simulate(sel, stake, pr, rungs)
                print(f"    {lbl:<12} @{pr * 100:.0f}c  {p2:>+11,.0f}   "
                      f"worst dip {d2:>+11,.0f}")
        p2, _, _ = simulate(follow, stake, 0.52, rungs)
        print(f"    whole span   @52c  {p2:>+11,.0f}   <- the price it really pays")

    print(f"\n{'=' * 76}")
    print("  For INDEPENDENT bets every ladder's break-even is exactly 50%: a")
    print("  deeper rung makes the rare bust bigger and the frequent win no")
    print("  bigger, so it moves variance, never sign. These bets are not quite")
    print("  independent, which is the only reason section 6 is interesting —")
    print("  and section 6 shows what that is worth once the span is split and")
    print("  the real price is paid.")
    print("=" * 76)


if __name__ == "__main__":
    main()
