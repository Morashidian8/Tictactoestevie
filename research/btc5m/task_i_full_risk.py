"""
The complete picture for the configuration now running: returns, and what can go wrong.

An average is the least useful number here. A strategy that earns $170 a day on
average while losing $700 on its worst day is not described by "$170 a day", and
the account that has to survive it does not experience the average. So this
reports the distribution at every horizon the user actually lives in — a day, a
week, a month — and then asks the only question that matters for a martingale:
how bad does it get, and how often.

Three separate things are computed and must not be blurred together:

  * WHAT HAPPENED. The last year, replayed on the live configuration including
    the new depth filter. One realisation of history, not a forecast.
  * WHAT COULD HAVE HAPPENED. Bootstrapped windows drawn from the same year, so
    the spread of outcomes at each horizon is visible rather than a single path.
  * WHAT HAPPENS IF THE EDGE IS SMALLER THAN MEASURED. The break-even is exactly
    50%, and the live scorecard currently reads 49.9% over 541 signals. The
    table at the end prices every accuracy from 49% to 56%, because that
    uncertainty dominates every other risk here.

Run:
    python3 research/btc5m/task_i_full_risk.py
"""

import datetime
import random
import statistics

import engine as E
from task_g_last12days import extended_candles

TEHRAN = E.TEHRAN
BASE = 20.0
RUNGS = 3
BANKROLL = 2000.0
SEED = 20260807


def live_signals(candles):
    """The bot as it now ships: rule 6 first, else the pool, with the depth filter."""
    cl = E.closes_of(candles)
    out = []
    for i in range(E.WARMUP, len(cl) - 1):
        w = cl[i + 1 - E.WARMUP:i + 1]
        s6 = E.rule6(w)
        s1 = E.rule1(w)
        others = [x for x in (E.rule2(w), E.rule3(w), E.rule5(w), s6, E.rule7(w)) if x]
        if s1:
            med = E._median([abs(m) for m in E._moves(w[-101:])])
            if med > 0 and abs(w[-1] - s1["level"]) / med < 0.5 and not others:
                s1 = None          # shallow and alone: not emitted any more
        if s6:
            side = s6["side"]
        else:
            fired = [x for x in (s1, E.rule2(w), E.rule3(w), E.rule5(w)) if x]
            if not fired:
                continue
            sides = {x["side"] for x in fired}
            if len(sides) != 1:
                continue
            side = sides.pop()
        nxt = cl[i + 1] - cl[i]
        if nxt == 0:
            continue
        out.append((i, candles[i]["t"], side, (side == "up") == (nxt > 0)))
    return out


def ladder(sigs, base=BASE, rungs=RUNGS):
    """Per-signal P&L and bust flags, so any window can be summed afterwards."""
    rung = 0
    rows = []
    for s in sigs:
        stake = base * 2 ** rung
        if s[3]:
            delta, rung, bust = +stake, 0, False
        else:
            delta, rung = -stake, rung + 1
            bust = rung >= rungs
            if bust:
                rung = 0
        rows.append((s[1], delta, bust, s[3]))
    return rows


def by_day(rows):
    days = {}
    for t, delta, bust, won in rows:
        d = datetime.datetime.fromtimestamp(t, TEHRAN).date()
        a = days.setdefault(d, [0, 0.0, 0, 0])
        a[0] += 1
        a[1] += delta
        a[2] += bust
        a[3] += won
    return days


def pct(xs, p):
    s = sorted(xs)
    return s[max(0, min(len(s) - 1, int(len(s) * p / 100)))]


def ev_per_signal(p, rungs=RUNGS, base=BASE):
    """
    Expected P&L per signal at a true win rate p, exactly.

    A cycle nets +base on a win and -(2^rungs - 1)*base on a bust, and it lasts
    1+q+...+q^(rungs-1) signals. So EV per signal = base*p - (2^r-1)*base*q^r
    divided by nothing at all — the wins-per-signal term is already p. Break-even
    lands on p = 0.5 for every rung count, which is why the depth of the ladder
    changes the shape of the ride and never the sign of it.
    """
    q = 1 - p
    cycle_len = sum(q ** i for i in range(rungs))
    busts_per_signal = q ** rungs / cycle_len
    return base * p - (2 ** rungs - 1) * base * busts_per_signal


def main():
    candles, _ = extended_candles()
    year = E.last_year(candles)
    sigs = live_signals(year)
    rows = ladder(sigs)
    st = E.simulate(sigs)
    days = by_day(rows)
    dl = sorted(days)
    n_days = len(dl)

    lo, hi = E.wilson(st["wins"], st["n"])
    print("=" * 92)
    print("THE CONFIGURATION NOW RUNNING — last year, $20 base, 3 rungs")
    print("=" * 92)
    print(f"signals {st['n']:,}   accuracy {st['acc']:.2f}% [{lo:.2f}-{hi:.2f}]   "
          f"busts {st['busts']:,}   longest losing run {st['max_streak']}")
    print(f"profit ${st['pnl']:+,.0f}   worst drawdown ${E.simulate(sigs)['drawdown']:,.0f}   "
          f"path low ${st['path_low']:+,.0f}")

    print(f"\n--- AVERAGES ---")
    print(f"  per year   ${st['pnl']:+,.0f}      {st['n']:,} signals, {st['busts']:,} busts")
    print(f"  per month  ${st['pnl']/12:+,.0f}      {st['n']/12:,.0f} signals, {st['busts']/12:.0f} busts")
    print(f"  per week   ${st['pnl']/52:+,.0f}      {st['n']/52:,.0f} signals, {st['busts']/52:.0f} busts")
    print(f"  per day    ${st['pnl']/n_days:+,.0f}      {st['n']/n_days:,.0f} signals, "
          f"{st['busts']/n_days:.1f} busts")
    print(f"  per signal ${st['pnl']/st['n']:+.2f}")

    # --- the spread, which is what the averages hide
    dp = [days[d][1] for d in dl]
    db = [days[d][2] for d in dl]
    print(f"\n--- WHAT A DAY ACTUALLY LOOKS LIKE ({n_days} days) ---")
    print(f"  best day      ${max(dp):+,.0f}        worst day   ${min(dp):+,.0f}")
    print(f"  median day    ${statistics.median(dp):+,.0f}        mean day    ${statistics.mean(dp):+,.0f}")
    print(f"  5th pct       ${pct(dp,5):+,.0f}        95th pct    ${pct(dp,95):+,.0f}")
    print(f"  losing days   {sum(1 for x in dp if x<0)}/{n_days} = "
          f"{sum(1 for x in dp if x<0)/n_days*100:.0f}%")
    print(f"  busts per day: median {statistics.median(db):.0f}  worst {max(db)}  "
          f"days with zero busts {sum(1 for x in db if x==0)}")

    worst = sorted(dl, key=lambda d: days[d][1])[:5]
    print("\n  the five worst days:")
    for d in worst:
        n, p, b, w = days[d]
        print(f"    {d}  {n:3d} signals  {w/n*100:5.1f}%  {b:2d} busts  ${p:+,.0f}")

    # --- rolling windows
    print(f"\n--- ROLLING WINDOWS (every start point in the year) ---")
    for span, lab in ((7, "week"), (30, "month"), (90, "quarter")):
        tot = [sum(days[dl[i + j]][1] for j in range(span))
               for i in range(n_days - span + 1)]
        neg = sum(1 for x in tot if x < 0)
        print(f"  {lab:<8} best ${max(tot):+9,.0f}   worst ${min(tot):+9,.0f}   "
              f"median ${statistics.median(tot):+8,.0f}   "
              f"in loss {neg}/{len(tot)} = {neg/len(tot)*100:.0f}%")

    # --- bootstrap: the same edge, different luck
    print(f"\n--- IF THE YEAR RAN AGAIN (1,000 bootstrapped paths) ---")
    random.seed(SEED)
    per_day_counts = [days[d][0] for d in dl]
    outcomes = [s[3] for s in sigs]
    for horizon, lab in ((30, "one month"), (90, "three months"), (365, "one year")):
        finals, lows, bursts = [], [], []
        for _ in range(1000):
            n = int(sum(random.choice(per_day_counts) for _ in range(horizon)))
            draw = [random.choice(outcomes) for _ in range(n)]
            rung = 0
            bal = low = 0.0
            nb = 0
            for won in draw:
                stake = BASE * 2 ** rung
                if won:
                    bal += stake
                    rung = 0
                else:
                    bal -= stake
                    rung += 1
                    if rung >= RUNGS:
                        nb += 1
                        rung = 0
                low = min(low, bal)
            finals.append(bal)
            lows.append(low)
            bursts.append(nb)
        neg = sum(1 for x in finals if x < 0)
        ruin = sum(1 for x in lows if -x >= BANKROLL)
        print(f"  {lab:<14} median ${statistics.median(finals):+8,.0f}   "
              f"5th ${pct(finals,5):+8,.0f}   95th ${pct(finals,95):+8,.0f}   "
              f"ends in loss {neg/10:.1f}%   worst dip ${min(lows):+,.0f}   "
              f"loses $2,000 {ruin/10:.1f}%")

    # --- the risk that dwarfs all the others
    print(f"\n--- WHAT IF THE TRUE WIN RATE IS NOT {st['acc']:.1f}%? ---")
    print("  break-even is exactly 50.00% for any ladder depth")
    print(f"  {'win rate':>9}{'$/signal':>11}{'per day':>10}{'per month':>12}{'per year':>12}")
    per_day_sig = st["n"] / n_days
    marks = {0.4990: "  <- live scorecard, 541 signals",
             0.5418: "  <- backtest, 20,029 signals"}
    for p in (0.490, 0.495, 0.4990, 0.500, 0.505, 0.510, 0.520, 0.530,
              0.5418, 0.550, 0.560):
        ev = ev_per_signal(p)
        star = marks.get(p, "")
        print(f"  {p*100:>8.2f}%{ev:>11.2f}{ev*per_day_sig:>10,.0f}"
              f"{ev*per_day_sig*30:>12,.0f}{ev*st['n']:>12,.0f}{star}")

    E.save({"stats": st, "days": {str(d): days[d] for d in dl}}, "task_i.pkl")


if __name__ == "__main__":
    main()
