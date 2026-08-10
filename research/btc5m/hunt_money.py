"""
The last question: do the survivors add money, or only a p-value?

A rule that is 52% on windows the live system misses is statistically real and
may still be worthless — the 3-rung ladder breaks even at exactly 50%, so 52%
is a thin margin that a two-cent fill cost erases entirely. And several of the
survivors measure the same thing as each other (distance from a moving average
in volatility units is Keltner, is gap-from-SMA, is a Bollinger band), so
adding them all would be adding one idea three times.

Each finalist is therefore judged on what it does to the LIVE configuration:
signals added, accuracy, three-rung busts, worst drawdown, and — the only fair
comparison — profit at a fixed risk budget rather than a fixed stake.

Run:
    python3 research/btc5m/hunt_money.py
"""

import math
import os
import pickle

import engine as E
import hunt_lib as H
import hunt_rules as R

BASE = 20.0
RUNGS = 3
RISK = 2000.0        # the drawdown budget every variant is scaled to


def ladder(sigs, base=BASE):
    """Returns (pnl, busts, max_drawdown, path_low, max_streak)."""
    rung = 0
    pnl = peak = dd = low = 0.0
    busts = streak = worst = 0
    for won in sigs:
        stake = base * 2 ** rung
        if won:
            pnl += stake
            rung = streak = 0
        else:
            pnl -= stake
            rung += 1
            streak += 1
            worst = max(worst, streak)
            if rung >= RUNGS:
                busts += 1
                rung = 0
        peak = max(peak, pnl)
        dd = max(dd, peak - pnl)
        low = min(low, pnl)
    return pnl, busts, dd, low, worst


def live_signals(d):
    """The configuration actually trading: rule 6 first, else the pool."""
    cl = d["c"]
    out = {}
    for i in range(E.WARMUP, d["n"] - 1):
        w = cl[i + 1 - E.WARMUP:i + 1]
        s6 = E.rule6(w)
        if s6:
            side = s6["side"]
        else:
            fired = [x for x in (E.rule1(w), E.rule2(w), E.rule3(w), E.rule5(w)) if x]
            if not fired:
                continue
            sides = {x["side"] for x in fired}
            if len(sides) != 1:
                continue
            side = sides.pop()
        out[i] = 1 if side == "up" else -1
    return out


def report(label, pairs, res):
    seq = [(i, s) for i, s in sorted(pairs.items())]
    outs = [(res[i] == s) for i, s in seq if res[i] != 0]
    n = len(outs)
    if not n:
        return None
    w = sum(outs)
    pnl, busts, dd, low, worst = ladder(outs)
    scale = RISK / dd if dd > 0 else 1.0
    lo, hi = H.wilson(w, n)
    return {"label": label, "n": n, "acc": w / n * 100, "lo": lo, "hi": hi,
            "z": H.zscore(w, n), "busts": busts, "dd": dd, "low": low,
            "streak": worst, "pnl": pnl, "base_eq": BASE * scale,
            "pnl_eq": pnl * scale,
            "busts_per_1k": busts / (pnl * scale / 1000) if pnl > 0 else float("nan")}


def show(r):
    if not r:
        print("   (no signals)")
        return
    print(f"  {r['label']:<34} n={r['n']:>6,}  acc={r['acc']:>5.2f}% "
          f"[{r['lo']:.1f}-{r['hi']:.1f}]  busts={r['busts']:>5,}  "
          f"maxstreak={r['streak']:>2}  P&L@$20={r['pnl']:>+9,.0f}  "
          f"dd={r['dd']:>7,.0f}  →  base ${r['base_eq']:>5,.0f} "
          f"gives {r['pnl_eq']:>+10,.0f}")


def main():
    d = H.load(days=365)
    S = R.build(d)
    res = H.outcomes(d)
    cands = {name: pairs for _, name, pairs in R.rules(d, S)}

    live = live_signals(d)
    print("=" * 118)
    print("BASELINE — the configuration now trading")
    print("=" * 118)
    base = report("live (rules 1,2,3,5,6)", live, res)
    show(base)

    # The finalists: the three that survived on windows the live system misses
    # AND are not restatements of each other. Keltner and Bollinger are dropped
    # as duplicates of gap-from-SMA — all three are "distance from a moving
    # average measured in volatility units".
    finalists = [
        ("gap from SMA20 >1.5 ATR fade", "کشیدگی از میانگین"),
        ("VWAP dev>+0.006 fade",          "فاصله از VWAP"),
        ("15m trend fade",                "خلافِ روندِ ۱۵ دقیقه"),
        ("Stoch14<20 fade",               "استوکاستیک اشباع فروش"),
    ]

    print(f"\n{'=' * 118}")
    print("EACH FINALIST ALONE, ON THE WINDOWS THE LIVE SYSTEM MISSES")
    print("=" * 118)
    frees = {}
    for name, fa in finalists:
        pairs = cands.get(name)
        if not pairs:
            print(f"  {name}: not in the library")
            continue
        free = {i: s for i, s in pairs if i not in live}
        frees[name] = free
        show(report(f"{fa}", free, res))

    print(f"\n{'=' * 118}")
    print("ADDED TO THE LIVE SYSTEM — live wins any window it already covers")
    print("=" * 118)
    show(base)
    for name, fa in finalists:
        free = frees.get(name)
        if not free:
            continue
        merged = dict(live)
        merged.update(free)
        show(report(f"live + {fa}", merged, res))

    # everything at once, to see whether they stack or overlap
    allmerged = dict(live)
    for name, _ in finalists:
        allmerged.update(frees.get(name, {}))
    show(report("live + همهٔ چهار مورد", allmerged, res))

    with open(os.path.join(H.HERE, "out", "hunt_money.pkl"), "wb") as f:
        pickle.dump({"base": base}, f)


if __name__ == "__main__":
    main()
