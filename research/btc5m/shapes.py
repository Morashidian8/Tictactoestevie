"""
Exhaustive search over candle SHAPE, not indicators.

Instead of guessing which named patterns to test, every candle is encoded into
one letter of a small alphabet and every sequence of letters up to length four
is mined. That covers the named patterns automatically — a hammer, a marubozu,
an engulfing pair and a run of eight are all just letters or letter pairs — and
it covers the thousands nobody has named.

The alphabet, all measured RELATIVE to the recent regime so it means the same
thing in a busy hour and a quiet one:

    colour   U up   ·   D down   ·   F flat
    body     s small (<0.5x median)  ·  m medium  ·  l large (>1.5x median)
    wicks    = balanced  ·  ^ top-heavy  ·  _ bottom-heavy

so "Ul^" is a big green candle with a long upper wick. 18 letters, plus F.

Two extra families are mined alongside, because they are not sequences:
runs of one colour of length 1..15 (the thing the user asked about directly),
and the raw geometric ratios — body/range, wick/body, range/median — bucketed.

Discipline is the same as the indicator hunt, and it has to be stricter here
because the candidate count is in the thousands: train-only discovery, a 300
occurrence floor, Bonferroni over the real count, and an empirical null built
by shuffling the candle labels and re-mining the whole thing.

Run:
    python3 research/btc5m/shapes.py
"""

import math
import os
import pickle
import random
from collections import defaultdict

import hunt_lib as H

MIN_N = 300
MAX_LEN = 4


# --------------------------------------------------------------------------- #
# encoding
# --------------------------------------------------------------------------- #
def encode(d, win=100):
    """One letter per candle, relative to the last `win` candles."""
    o, h, l, c, n = d["o"], d["h"], d["l"], d["c"], d["n"]
    body = [abs(c[i] - o[i]) for i in range(n)]
    rng = [h[i] - l[i] for i in range(n)]
    med_body = [None] * n
    run = sorted(body[:win])
    for i in range(win, n):
        seg = sorted(body[i - win:i])
        med_body[i] = seg[len(seg) // 2]
    letters = [None] * n
    for i in range(win, n):
        mb = med_body[i]
        if not mb or rng[i] <= 0:
            continue
        if c[i] == o[i]:
            letters[i] = "F"
            continue
        col = "U" if c[i] > o[i] else "D"
        b = body[i] / mb
        size = "s" if b < 0.5 else ("l" if b > 1.5 else "m")
        up_w = h[i] - max(o[i], c[i])
        dn_w = min(o[i], c[i]) - l[i]
        tot = up_w + dn_w
        if tot < 0.25 * rng[i]:
            wick = "="
        elif up_w > 2 * dn_w:
            wick = "^"
        elif dn_w > 2 * up_w:
            wick = "_"
        else:
            wick = "="
        letters[i] = col + size + wick
    return letters


# --------------------------------------------------------------------------- #
# mining
# --------------------------------------------------------------------------- #
def mine(letters, res, lo, hi, max_len=MAX_LEN):
    """Every letter sequence up to max_len -> (n, wins_up) over [lo, hi)."""
    stats = defaultdict(lambda: [0, 0])
    n = len(letters)
    for i in range(lo, min(hi, n - 1)):
        if res[i] == 0:
            continue
        seq = []
        for k in range(max_len):
            j = i - k
            if j < 0 or letters[j] is None:
                break
            seq.insert(0, letters[j])
            key = " ".join(seq)
            a = stats[key]
            a[0] += 1
            a[1] += (res[i] == 1)
    return stats


def runs_family(d, res, lo, hi):
    """Runs of one colour, length 1..15 — the pattern asked about by name."""
    o, c, n = d["o"], d["c"], d["n"]
    out = defaultdict(lambda: [0, 0])
    run, col = 0, 0
    for i in range(n - 1):
        v = 1 if c[i] > o[i] else (-1 if c[i] < o[i] else 0)
        if v == 0:
            run, col = 0, 0
            continue
        run = run + 1 if v == col else 1
        col = v
        if not (lo <= i < hi) or res[i] == 0:
            continue
        for k in range(1, min(run, 15) + 1):
            key = f"run>={k} {'green' if col == 1 else 'red'}"
            a = out[key]
            a[0] += 1
            a[1] += (res[i] == 1)
    return out


def ratios_family(d, res, lo, hi, win=100):
    """Raw geometry: body/range, wick/body, range vs its own median."""
    o, h, l, c, n = d["o"], d["h"], d["l"], d["c"], d["n"]
    out = defaultdict(lambda: [0, 0])
    body = [abs(c[i] - o[i]) for i in range(n)]
    rng = [h[i] - l[i] for i in range(n)]
    for i in range(win, n - 1):
        if not (lo <= i < hi) or res[i] == 0 or rng[i] <= 0:
            continue
        seg = sorted(rng[i - win:i])
        mr = seg[len(seg) // 2]
        col = "green" if c[i] > o[i] else ("red" if c[i] < o[i] else "flat")
        br = body[i] / rng[i]
        for lo_, hi_ in ((0.0, 0.1), (0.1, 0.3), (0.3, 0.5),
                         (0.5, 0.7), (0.7, 0.9), (0.9, 1.01)):
            if lo_ <= br < hi_:
                out[f"body/range {lo_:.1f}-{hi_:.1f} {col}"][0] += 1
                out[f"body/range {lo_:.1f}-{hi_:.1f} {col}"][1] += (res[i] == 1)
        if mr > 0:
            rr = rng[i] / mr
            for lo_, hi_ in ((0, 0.5), (0.5, 1), (1, 2), (2, 3), (3, 99)):
                if lo_ <= rr < hi_:
                    k = f"range {lo_}-{hi_}x median {col}"
                    out[k][0] += 1
                    out[k][1] += (res[i] == 1)
        up_w = h[i] - max(o[i], c[i])
        dn_w = min(o[i], c[i]) - l[i]
        if body[i] > 0:
            for k_ in (1, 2, 3, 5):
                if up_w > k_ * body[i]:
                    out[f"upper wick >{k_}x body {col}"][0] += 1
                    out[f"upper wick >{k_}x body {col}"][1] += (res[i] == 1)
                if dn_w > k_ * body[i]:
                    out[f"lower wick >{k_}x body {col}"][0] += 1
                    out[f"lower wick >{k_}x body {col}"][1] += (res[i] == 1)
    return out


def collect(d, letters, res, lo, hi):
    s = dict(mine(letters, res, lo, hi))
    s.update(runs_family(d, res, lo, hi))
    s.update(ratios_family(d, res, lo, hi))
    return s


def main():
    d = H.load(days=365)
    res = H.outcomes(d)
    letters = encode(d)
    split = int(d["n"] * H.TRAIN_FRAC)
    print(f"candles {d['n']:,}   alphabet: "
          f"{len(set(x for x in letters if x))} distinct letters")

    train = collect(d, letters, res, 0, split)
    big = {k: v for k, v in train.items() if v[0] >= MIN_N}
    K = len(big)
    bar = H.bonferroni_z(K)
    print(f"{K:,} patterns cleared the {MIN_N}-occurrence floor on train")
    print(f"Bonferroni bar: z >= {bar:.2f}")

    # empirical null: re-mine the WHOLE search on shuffled candle labels
    rng = random.Random(20260810)
    nulls = []
    for _ in range(12):
        fake = H.shuffled_outcomes(res, rng)
        st = collect(d, letters, fake, 0, split)
        best = 0.0
        for k, (n_, w_) in st.items():
            if n_ >= MIN_N:
                best = max(best, abs(H.zscore(w_, n_)))
        nulls.append(best)
    nulls.sort()
    p95 = nulls[int(len(nulls) * 0.95) - 1]
    floor = max(bar, p95)
    print(f"shuffled null: median {nulls[len(nulls)//2]:.2f}, "
          f"95th {p95:.2f}, max {nulls[-1]:.2f}")
    print(f"bar a real pattern must clear: z >= {floor:.2f}\n")

    ranked = sorted(big.items(), key=lambda kv: -abs(H.zscore(kv[1][1], kv[1][0])))
    print("=" * 100)
    print("TOP 20 ON TRAIN")
    print("=" * 100)
    print(f"{'z':>7}{'n':>8}{'up-rate':>10}   pattern")
    for k, (n_, w_) in ranked[:20]:
        print(f"{H.zscore(w_, n_):>+7.2f}{n_:>8,}{w_ / n_ * 100:>9.2f}%   {k}")

    test = collect(d, letters, res, split, d["n"])
    survivors = [(k, v) for k, v in ranked if abs(H.zscore(v[1], v[0])) >= floor]
    print(f"\n{'=' * 100}")
    print(f"{len(survivors)} cleared the bar on train — now out of sample")
    print("=" * 100)
    print(f"{'train z':>8}{'train up':>10}{'test n':>8}{'test up':>9}"
          f"{'test z':>8}   {'95% CI':>14}  pattern")
    kept = []
    for k, (n_, w_) in survivors:
        tn, tw = test.get(k, (0, 0))
        if tn < 100:
            continue
        tz = H.zscore(tw, tn)
        same = (H.zscore(w_, n_) > 0) == (tz > 0)
        lo, hi = H.wilson(tw, tn)
        ok = same and abs(tz) >= 1.96
        print(f"{H.zscore(w_, n_):>+8.2f}{w_ / n_ * 100:>9.2f}%{tn:>8,}"
              f"{tw / tn * 100:>8.2f}%{tz:>+8.2f}   [{lo:>5.1f}-{hi:<5.1f}]"
              f" {'OK' if ok else '  '}  {k}")
        if ok:
            kept.append((k, n_, w_, tn, tw))
    print(f"\n{len(kept)} pattern(s) survived train AND test with the same sign.")
    os.makedirs(os.path.join(H.HERE, "out"), exist_ok=True)
    with open(os.path.join(H.HERE, "out", "shapes.pkl"), "wb") as f:
        pickle.dump({"kept": kept, "floor": floor, "K": K}, f)
    return kept


if __name__ == "__main__":
    main()
