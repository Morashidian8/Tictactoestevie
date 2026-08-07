"""
The user's theory, tested: deep breaks only, several rules at once, bigger base.

Three claims are bundled together and they have to be separated, because two of
them are testable and the third is arithmetic:

  1. Rule 1 should only count when the close clears the 20-candle level by 2 or
     more median moves.
  2. Enter only when several strategies fire on the same window.
  3. Fewer trades at a higher win rate can carry a bigger base, so the money is
     better even though the trade count collapses.

Claims 1 and 2 are measured over the last year. Claim 3 is not a measurement at
all: martingale P&L scales exactly linearly with the base, so ANY configuration
can be made to earn any amount by raising the stake. The only honest way to
compare configurations is therefore to give each one the SAME risk budget and
ask what it earns — which is what `equal_risk` below does. Comparing annual
profit at a shared $20 base, as every earlier table in this project did,
systematically flatters whichever configuration trades most.

One thing to keep in mind while reading claim 2: over the last year, in 12,876
windows where rule 1 fired alongside another rule, the two NEVER disagreed.
These rules are all fades of the same recent move, so "several rules agree" does
not mean independent confirmation — it means the move was extreme on several
correlated measures at once. That is still information, but it is not a vote.

Run:
    python3 research/btc5m/task_h_depth_x_consensus.py
"""

import datetime
import math

import engine as E
from task_g_last12days import extended_candles

TEHRAN = E.TEHRAN
POOL = ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7")
DEPTHS = (0.0, 0.5, 1.0, 2.0, 3.0)
KS = (1, 2, 3, 4)
RISK_BUDGET = 2000.0     # the drawdown the user is willing to sit through


def rule1_deep(w, floor):
    """Rule 1, but only when the break clears the level by `floor` median moves."""
    s = E.rule1(w)
    if not s:
        return None
    if floor <= 0:
        return s
    med = E._median([abs(m) for m in E._moves(w[-101:])])
    if med <= 0 or abs(w[-1] - s["level"]) < floor * med:
        return None
    return s


def scan(candles):
    """
    One pass over the chart recording, per window, which rules fired and the side.

    Every configuration below is then assembled from this single scan. Re-walking
    105,000 candles once per configuration would take hours and produce exactly
    the same numbers.
    """
    cl = E.closes_of(candles)
    out = []
    for i in range(E.WARMUP, len(cl) - 1):
        w = cl[i + 1 - E.WARMUP:i + 1]
        s1 = E.rule1(w)
        depth = None
        if s1:
            med = E._median([abs(m) for m in E._moves(w[-101:])])
            depth = abs(w[-1] - s1["level"]) / med if med > 0 else 0.0
        fired = {}
        if s1:
            fired["rule1"] = s1["side"]
        for k in POOL[1:]:
            s = E.RULES[k](w)
            if s:
                fired[k] = s["side"]
        nxt = cl[i + 1] - cl[i]
        if not fired or nxt == 0:
            continue
        out.append((candles[i]["t"], fired, depth, nxt))
    return out


def build(scanned, depth_floor, k):
    """Signals for one (depth, k) configuration, from the shared scan."""
    sigs = []
    for t, fired, depth, nxt in scanned:
        f = dict(fired)
        if "rule1" in f and depth is not None and depth < depth_floor:
            del f["rule1"]
        if len(f) < k:
            continue
        sides = set(f.values())
        if len(sides) != 1:
            continue
        side = sides.pop()
        sigs.append((0, t, side, (side == "up") == (nxt > 0)))
    return sigs


def drawdown(sigs, base):
    """Worst peak-to-trough of the running balance, at this base."""
    rung = 0
    bal = peak = dd = 0.0
    for s in sigs:
        stake = base * 2 ** rung
        if s[3]:
            bal += stake
            rung = 0
        else:
            bal -= stake
            rung += 1
            if rung >= E.LADDER_RUNGS:
                rung = 0
        peak = max(peak, bal)
        dd = max(dd, peak - bal)
    return dd


def equal_risk(sigs, budget=RISK_BUDGET):
    """
    The base this configuration could carry for a given drawdown, and what it earns.

    This is the whole point of the exercise. A configuration that trades a fifth
    as often but rides a fifth of the drawdown can carry five times the base, and
    then its 'smaller' profit is not smaller at all. Only this comparison can
    answer whether trading less is actually worth more.
    """
    dd20 = drawdown(sigs, 20.0)
    if dd20 <= 0:
        return None
    scale = budget / dd20
    base = 20.0 * scale
    st = E.simulate(sigs, base=base)
    return {"base": base, "pnl": st["pnl"], "dd": drawdown(sigs, base),
            "low": st["path_low"], "busts": st["busts"]}


def main():
    candles, stitch = extended_candles()
    year = E.last_year(candles)
    print(f"year: {len(year):,} candles through "
          f"{datetime.datetime.fromtimestamp(year[-1]['t'], E.UTC):%Y-%m-%d}")
    scanned = scan(year)
    print(f"windows with at least one rule firing: {len(scanned):,}\n")

    rows = []
    for d in DEPTHS:
        for k in KS:
            sigs = build(scanned, d, k)
            if len(sigs) < 200:
                rows.append((d, k, sigs, None, None))
                continue
            st = E.simulate(sigs)
            er = equal_risk(sigs)
            rows.append((d, k, sigs, st, er))

    print("=" * 118)
    print(f"{'depth':>6}{'rules':>7}{'n':>7}{'acc':>8}{'95% CI':>15}{'z':>7}"
          f"{'busts':>7}{'b/100':>7}{'maxstk':>7}{'P&L@$20':>10}"
          f"{'drawdown':>10}{'  |  equal-risk base':>21}{'P&L there':>12}")
    print("-" * 118)
    K = sum(1 for _, _, _, st, _ in rows if st)
    bar = E.bonferroni_z(K)
    for d, k, sigs, st, er in rows:
        if not st:
            print(f"{d:>6.1f}{k:>7}{len(sigs):>7}   — fewer than 200 signals, not reported")
            continue
        lo, hi = E.wilson(st["wins"], st["n"])
        z = E.zscore(st["wins"], st["n"])
        dd = drawdown(sigs, 20.0)
        print(f"{d:>6.1f}{k:>7}{st['n']:>7}{st['acc']:>7.2f}%"
              f"{f'[{lo:.1f}-{hi:.1f}]':>15}{z:>+7.2f}{st['busts']:>7}"
              f"{st['bust_rate']:>7.2f}{st['max_streak']:>7}{st['pnl']:>+10,.0f}"
              f"{dd:>10,.0f}{er['base']:>21,.0f}{er['pnl']:>+12,.0f}")
    print("-" * 118)
    print(f"{K} configurations scored -> Bonferroni bar z >= {bar:.2f} "
          f"(a raw z of 1.96 means nothing at this grid size)")

    # Out-of-sample check on whatever the equal-risk table likes best.
    best = max((r for r in rows if r[3]), key=lambda r: r[4]["pnl"])
    d, k, sigs, st, er = best
    tr, te = E.split(sigs)
    print(f"\nbest by equal-risk profit: depth>={d}, at least {k} rules")
    for lab, S in (("train", tr), ("test ", te)):
        s = E.simulate(S)
        lo, hi = E.wilson(s["wins"], s["n"])
        print(f"  {lab}  n={s['n']:5d}  acc={s['acc']:5.2f}%  [{lo:.1f}-{hi:.1f}]  "
              f"busts={s['busts']:4d}")

    # The honest ceiling: how much of this is just picking the winner of a grid?
    #
    # The OUTCOMES are shuffled across the year and the whole grid is rebuilt on
    # them, so the same rules fire on the same windows against randomised
    # results. Shuffling the signals' own win/loss list instead — which is the
    # obvious thing to write — cannot change its mean and would report the real
    # accuracy back as its own null.
    import random
    random.seed(20260807)
    moves = [w[3] for w in scanned]
    best_any, best_same = 0.0, 0.0
    for _ in range(200):
        random.shuffle(moves)
        fake = [(t, f, d, mv) for (t, f, d, _), mv in zip(scanned, moves)]
        for dd_ in DEPTHS:
            for kk in KS:
                S = build(fake, dd_, kk)
                if len(S) < 200:
                    continue
                a = sum(1 for s in S if s[3]) / len(S) * 100
                best_any = max(best_any, a)
                if dd_ == d and kk == k:
                    best_same = max(best_same, a)
    print(f"  shuffled outcomes, 200 runs: best anywhere in the grid "
          f"{best_any:.2f}%, best in this cell {best_same:.2f}%  "
          f"(real {st['acc']:.2f}%)")

    E.save({"rows": [(d, k, st, er) for d, k, _, st, er in rows],
            "bar": bar, "budget": RISK_BUDGET}, "task_h.pkl")


if __name__ == "__main__":
    main()
