"""
Flat stake against martingale, over the month we actually have data for.

Everything is priced at 50c — an even-money coin — because that is what was
asked: a win pays the stake, a loss costs it, and the market's real price is
left out of it. That makes the comparison purely about SIZING, which is the
thing being decided.

The two are not different bets. They take the identical signals in the
identical order and differ only in how much rides on each one. Any gap between
them is sizing alone.

    python flat_stake.py [--days 30] [--data btc5m_fresh.csv] [--stake 20]

Also prints the losing streaks, because a streak is what ends a martingale and
nothing else about it matters as much.
"""

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
RUNGS = 3          # the bot's ladder: 20, 40, 80, then a bust and a fresh start


def flat(sigs, stake):
    """Same size every time. P&L is just wins minus losses."""
    run = peak = dip = 0.0
    curve = []
    for s in sigs:
        run += stake if s["won"] else -stake
        peak = max(peak, run)
        dip = min(dip, run - peak)
        curve.append(run)
    return run, dip, curve


def martingale(sigs, stake, rungs=RUNGS):
    """
    Double after every loss, up to `rungs`, then give up and start over.

    A completed ladder always nets +stake no matter which rung won, because
    2^k - (2^k - 1) = 1. A bust costs (2^rungs - 1) x stake — seven units on a
    three-rung ladder. That asymmetry is the whole story: the ladder wins small
    and often, and loses big and rarely, and the break-even sits exactly at the
    point where those two cancel.
    """
    run = peak = dip = 0.0
    rung = 0
    busts = 0
    curve = []
    worst_bet = 0.0
    for s in sigs:
        bet = stake * 2 ** rung
        worst_bet = max(worst_bet, bet)
        if s["won"]:
            run += bet
            rung = 0
        else:
            run -= bet
            rung += 1
            if rung >= rungs:
                rung = 0
                busts += 1
        peak = max(peak, run)
        dip = min(dip, run - peak)
        curve.append(run)
    return run, dip, busts, worst_bet, curve


def streaks(sigs):
    """Every run of consecutive losses, longest first, with when it happened."""
    out = []
    i = 0
    while i < len(sigs):
        if sigs[i]["won"]:
            i += 1
            continue
        j = i
        while j < len(sigs) and not sigs[j]["won"]:
            j += 1
        out.append((j - i, sigs[i]["t"], sigs[j - 1]["t"]))
        i = j
    return out


def teh(t):
    return datetime.fromtimestamp(t + GRAN, TEHRAN)


def main():
    argv = sys.argv[1:]
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 30
    stake = float(argv[argv.index("--stake") + 1]) if "--stake" in argv else 20.0
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    closes = S.load_candles(data)
    ts = sorted(closes)
    cut = ts[-1] - days * 86400
    sigs = [s for s in S.replay(closes) if s["t"] >= cut]
    if not sigs:
        print("no signals in this span.")
        return

    w = sum(1 for s in sigs if s["won"])
    n = len(sigs)
    lo, hi = S.wilson(w, n)
    print(f"{n:,} signals  ·  {teh(sigs[0]['t']):%Y-%m-%d} to "
          f"{teh(sigs[-1]['t']):%Y-%m-%d} (Tehran)")
    print(f"won {w:,}  ·  lost {n - w:,}  ·  {w / n * 100:.2f}%  "
          f"[{lo * 100:.2f}–{hi * 100:.2f}]")
    print(f"priced at 50c — a win pays ${stake:,.0f}, a loss costs ${stake:,.0f}\n")

    fp, fdip, fcurve = flat(sigs, stake)
    mp, mdip, busts, worst, mcurve = martingale(sigs, stake)

    print("=" * 74)
    print(f"FLAT ${stake:,.0f} — the answer to the question")
    print("=" * 74)
    print(f"  profit and loss           {fp:>+12,.0f}")
    print(f"  per signal                {fp / n:>+12,.2f}")
    print(f"  worst drawdown            {fdip:>+12,.0f}")
    print(f"  most ever at risk on one bet {stake:>+9,.0f}")
    print(f"\n  P&L is exactly ${stake:,.0f} x ({w:,} - {n - w:,}) = "
          f"${fp:+,.0f}. Nothing else enters it.")

    print(f"\n{'=' * 74}")
    print(f"MARTINGALE {stake:,.0f}/{stake*2:,.0f}/{stake*4:,.0f} — the same "
          f"signals, same order")
    print("=" * 74)
    print(f"  profit and loss           {mp:>+12,.0f}")
    print(f"  per signal                {mp / n:>+12,.2f}")
    print(f"  worst drawdown            {mdip:>+12,.0f}")
    print(f"  most ever at risk on one bet {worst:>+9,.0f}")
    print(f"  busts (3 losses running)  {busts:>12,}")
    print(f"\n  difference: {fp - mp:+,.0f} in favour of "
          f"{'FLAT' if fp > mp else 'MARTINGALE'}")

    # ---- streaks: what actually kills a ladder ---------------------------- #
    st = sorted(streaks(sigs), key=lambda x: -x[0])
    print(f"\n{'=' * 74}")
    print("LOSING STREAKS — the thing that ends a martingale")
    print("=" * 74)
    print(f"  longest run of losses this month: {st[0][0]}")
    print(f"  {'length':<9}{'started':<18}{'ended':<18}"
          f"{'a ladder would owe':>20}")
    for ln, a, b in st[:8]:
        # A run of `ln` losses on a doubling ladder that never resets.
        owed = stake * (2 ** ln - 1)
        print(f"  {ln:<9}{teh(a):%m-%d %H:%M}{'':<4}{teh(b):%m-%d %H:%M}{'':<4}"
              f"{owed:>19,.0f}")
    long5 = sum(1 for ln, _, _ in st if ln >= 5)
    print(f"\n  runs of 5+ losses: {long5} of {len(st)} streaks "
          f"({long5 / len(st) * 100:.1f}%)")

    # ---- day by day ------------------------------------------------------- #
    per = defaultdict(lambda: [0, 0])
    for s in sigs:
        d = teh(s["t"]).strftime("%m-%d")
        per[d][0] += 1
        per[d][1] += 1 if s["won"] else 0
    print(f"\n{'=' * 74}")
    print(f"DAY BY DAY, FLAT ${stake:,.0f} (Tehran dates)")
    print("=" * 74)
    print(f"  {'date':<8}{'signals':>8}{'won':>6}{'lost':>6}{'rate':>8}"
          f"{'P&L':>9}{'running':>10}")
    run = 0.0
    for d in sorted(per):
        tot, won = per[d]
        p = stake * (won - (tot - won))
        run += p
        print(f"  {d:<8}{tot:>8,}{won:>6,}{tot - won:>6,}"
              f"{won / tot * 100:>7.1f}%{p:>+9,.0f}{run:>+10,.0f}")

    # ---- yesterday, specifically ------------------------------------------ #
    last_day = max(per)
    ydate = (datetime.fromtimestamp(ts[-1], TEHRAN) - timedelta(days=1))
    ykey = ydate.strftime("%m-%d")
    if ykey in per:
        ys = [s for s in sigs if teh(s["t"]).strftime("%m-%d") == ykey]
        yst = sorted(streaks(ys), key=lambda x: -x[0])
        tot, won = per[ykey]
        print(f"\n{'=' * 74}")
        print(f"YESTERDAY — {ydate:%Y-%m-%d} Tehran")
        print("=" * 74)
        print(f"  {tot} signals, {won} won, {tot - won} lost "
              f"({won / tot * 100:.1f}%)")
        print(f"  flat ${stake:,.0f}: {stake * (won - (tot - won)):+,.0f}")
        if yst:
            print(f"  longest losing run that day: {yst[0][0]}  "
                  f"({teh(yst[0][1]):%H:%M} to {teh(yst[0][2]):%H:%M})")
            print(f"  a doubling ladder over {yst[0][0]} losses would owe "
                  f"${stake * (2 ** yst[0][0] - 1):,.0f}")
    print(f"\n  (last data point: {teh(sigs[-1]['t']):%Y-%m-%d %H:%M} Tehran, "
          f"day {last_day})")


if __name__ == "__main__":
    main()
