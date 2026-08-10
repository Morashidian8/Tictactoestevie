"""
The hunt: score every candidate, then try hard to kill each survivor.

Discovery happens on the TRAIN half only. The test half is opened once, at the
end, for the handful that survived — so it stays a genuine out-of-sample check
rather than another place to shop for a number.

Run:
    python3 research/btc5m/hunt.py
"""

import random
import sys

import hunt_lib as H
import hunt_rules as R


def main():
    d = H.load(days=365)
    S = R.build(d)
    res = H.outcomes(d)
    split = int(d["n"] * H.TRAIN_FRAC)
    print(f"candles {d['n']:,}   train [0,{split:,})   test [{split:,},{d['n']:,})")

    base_n = sum(1 for r in res[:split] if r)
    base_up = sum(1 for r in res[:split] if r == 1)
    print(f"unconditional up-rate on train: {base_up / base_n * 100:.2f}%")
    base_n2 = sum(1 for r in res[split:] if r)
    base_up2 = sum(1 for r in res[split:] if r == 1)
    print(f"unconditional up-rate on test : {base_up2 / base_n2 * 100:.2f}%\n")

    cands = R.rules(d, S)
    K = len(cands)
    bar = H.bonferroni_z(K)
    print(f"{K} candidates cleared the {H.MIN_N}-occurrence floor")
    print(f"Bonferroni bar for the best of {K}: z >= {bar:.2f}\n")

    scored = []
    for fam, name, pairs in cands:
        n, w = H.score(pairs, res, 0, split)
        if n < H.MIN_N:
            continue
        scored.append((H.zscore(w, n), fam, name, pairs, n, w))
    scored.sort(reverse=True, key=lambda x: abs(x[0]))

    print("=" * 96)
    print("TOP 25 ON TRAIN (discovery only — none of this is a finding yet)")
    print("=" * 96)
    print(f"{'z':>7} {'n':>7} {'acc':>8}  {'family':<16} rule")
    print("-" * 96)
    for z, fam, name, pairs, n, w in scored[:25]:
        print(f"{z:>+7.2f} {n:>7,} {w / n * 100:>7.2f}%  {fam:<16} {name}")

    # --------------------------------------------------------------- the null
    print(f"\n{'=' * 96}\nSHUFFLED-LABEL NULL — the same sweep on randomised outcomes")
    print("=" * 96)
    rng = random.Random(20260810)
    best_null = []
    for run in range(30):
        fake = H.shuffled_outcomes(res, rng)
        best = 0.0
        for fam, name, pairs in cands:
            n, w = H.score(pairs, fake, 0, split)
            if n >= H.MIN_N:
                best = max(best, abs(H.zscore(w, n)))
        best_null.append(best)
    best_null.sort()
    p95 = best_null[int(len(best_null) * 0.95)]
    print(f"  best |z| any rule reaches on random labels: "
          f"median {best_null[len(best_null) // 2]:.2f}, "
          f"95th pct {p95:.2f}, max {best_null[-1]:.2f}")
    floor = max(bar, p95)
    print(f"  the bar a real edge must clear: z >= {floor:.2f}"
          f"  ({'Bonferroni' if bar >= p95 else 'empirical null'} is stricter)\n")

    # --------------------------------------------------------- out of sample
    survivors = [s for s in scored if abs(s[0]) >= floor]
    print("=" * 96)
    print(f"{len(survivors)} candidates cleared the bar on train — now the test half")
    print("=" * 96)
    print(f"{'train z':>8} {'train':>8} {'test n':>8} {'test acc':>9} "
          f"{'test z':>8}  {'95% CI':>15}  rule")
    print("-" * 96)
    kept = []
    for z, fam, name, pairs, n, w in survivors:
        tn, tw = H.score(pairs, res, split, d["n"])
        if tn < 100:
            continue
        tz = H.zscore(tw, tn)
        lo, hi = H.wilson(tw, tn)
        same_side = (z > 0) == (tz > 0)
        flag = "OK " if (same_side and abs(tz) >= 1.96) else "   "
        print(f"{z:>+8.2f} {w / n * 100:>7.2f}% {tn:>8,} {tw / tn * 100:>8.2f}% "
              f"{tz:>+8.2f}  [{lo:>5.1f}-{hi:<5.1f}] {flag} {name}")
        if same_side and abs(tz) >= 1.96:
            kept.append((fam, name, pairs, z, tz, n, w, tn, tw))

    print(f"\n{len(kept)} survived train AND test with the same sign.")
    import pickle, os
    os.makedirs(os.path.join(H.HERE, "out"), exist_ok=True)
    with open(os.path.join(H.HERE, "out", "hunt.pkl"), "wb") as f:
        pickle.dump({"kept": [(f_, nm, z, tz, n, w, tn, tw)
                              for f_, nm, _, z, tz, n, w, tn, tw in kept],
                     "floor": floor, "K": K, "null_p95": p95}, f)
    return kept


if __name__ == "__main__":
    main()
