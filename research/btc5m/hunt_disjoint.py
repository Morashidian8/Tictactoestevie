"""
The only question that matters: does any candidate see something the 7 rules miss?

Fifty-seven candidates survive the statistics, and nearly all of them are the
same edge wearing a different indicator's clothes — RSI, Stochastic, Williams
%R, CCI, Bollinger, Keltner, Donchian and distance-from-average all say "price
is stretched, fade it", which is what rules 1, 2, 5 and 7 already say.

So each candidate is scored twice: on everything it fires on, and on the subset
where NONE of the seven live rules fire. The second number is the only one that
can justify adding anything, and it is where almost every "new" indicator dies.

Run:
    python3 research/btc5m/hunt_disjoint.py
"""

import pickle
import os
import random

import engine as E
import hunt_lib as H
import hunt_rules as R


def existing_mask(d):
    """
    For every index, does at least one of the seven live rules fire?

    engine.py holds the rules exactly as bot.py ships them, so this is the real
    coverage of the running system rather than an approximation of it.
    """
    cl = d["c"]
    fires = [False] * d["n"]
    names = ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7")
    for i in range(E.WARMUP, d["n"] - 1):
        w = cl[i + 1 - E.WARMUP:i + 1]
        for k in names:
            if E.RULES[k](w):
                fires[i] = True
                break
    return fires


def main():
    d = H.load(days=365)
    S = R.build(d)
    res = H.outcomes(d)
    split = int(d["n"] * H.TRAIN_FRAC)

    print("mapping where the existing seven rules already fire…")
    fires = existing_mask(d)
    covered = sum(1 for i in range(E.WARMUP, d["n"] - 1) if fires[i])
    total = d["n"] - 1 - E.WARMUP
    print(f"  the live system fires on {covered:,} of {total:,} windows "
          f"({covered / total * 100:.1f}%)\n")

    cands = R.rules(d, S)
    rows = []
    for fam, name, pairs in cands:
        n_all, w_all = H.score(pairs, res, 0, d["n"])
        if n_all < H.MIN_N:
            continue
        # the part the live system never sees
        free = [(i, s) for i, s in pairs if not fires[i]]
        n_f, w_f = H.score(free, res, 0, d["n"])
        tr_n, tr_w = H.score(free, res, 0, split)
        te_n, te_w = H.score(free, res, split, d["n"])
        rows.append((fam, name, n_all, w_all, n_f, w_f, tr_n, tr_w, te_n, te_w))

    # A candidate only earns a look if the DISJOINT part is both big enough to
    # measure and better than a coin on its own.
    keep = [r for r in rows if r[4] >= H.MIN_N]
    keep.sort(key=lambda r: -H.zscore(r[5], r[4]))

    print("=" * 104)
    print("EVERY CANDIDATE, SCORED ONLY WHERE THE SEVEN RULES ARE SILENT")
    print("=" * 104)
    print(f"{'all n':>8}{'all acc':>9}   {'free n':>8}{'free acc':>10}{'z':>7}"
          f"{'  95% CI':>16}{'  train':>8}{'  test':>8}  rule")
    print("-" * 104)
    K = len(keep)
    bar = H.bonferroni_z(K)
    shown = 0
    for fam, name, n_all, w_all, n_f, w_f, tr_n, tr_w, te_n, te_w in keep:
        z = H.zscore(w_f, n_f)
        if z < 1.0 and shown > 25:
            break
        lo, hi = H.wilson(w_f, n_f)
        tr = f"{tr_w / tr_n * 100:.1f}%" if tr_n >= 100 else "  —"
        te = f"{te_w / te_n * 100:.1f}%" if te_n >= 100 else "  —"
        star = " ***" if z >= bar and lo > 50 else ""
        print(f"{n_all:>8,}{w_all / n_all * 100:>8.2f}%   {n_f:>8,}"
              f"{w_f / n_f * 100:>9.2f}%{z:>+7.2f}"
              f"  [{lo:>5.1f}-{hi:<5.1f}]{tr:>8}{te:>8}  {name}{star}")
        shown += 1
    print("-" * 104)
    print(f"{K} candidates had at least {H.MIN_N} windows the live system misses.")
    print(f"Bonferroni bar over those {K}: z >= {bar:.2f}")
    print("*** = clears the bar AND its 95% lower bound is above 50%")

    winners = [r for r in keep
               if H.zscore(r[5], r[4]) >= bar and H.wilson(r[5], r[4])[0] > 50]
    print(f"\n{len(winners)} candidate(s) add something the seven rules do not see.")

    os.makedirs(os.path.join(H.HERE, "out"), exist_ok=True)
    with open(os.path.join(H.HERE, "out", "hunt_disjoint.pkl"), "wb") as f:
        pickle.dump({"rows": rows, "winners": winners, "bar": bar,
                     "covered": covered, "total": total}, f)
    return winners


if __name__ == "__main__":
    main()
