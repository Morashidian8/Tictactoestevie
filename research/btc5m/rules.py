"""
Reproduce every number in docs/research/btc-5m-patterns.md from btc5m.csv.

The three surviving mean-reversion edges, each evaluated on a CHRONOLOGICAL
70/30 train/test split (rules are specified up front, nothing is tuned on test):

  RULE 1  fade a 20-bar breakout while volatility is expanding   ~57% test
  RULE 2  three same-colour candles with an oversized body -> fade  ~55% test
  RULE 3  three or more same-colour candles -> fade                ~53% test

Run:
    python3 research/btc5m/fetch_data.py     # once, to produce btc5m.csv
    python3 research/btc5m/rules.py
"""

import argparse
import csv
import datetime
import gzip
import math
import os
from collections import Counter, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
# Frozen snapshot committed alongside this script, so the published numbers stay
# reproducible even though the upstream feed keeps growing. Pass --data to use a
# freshly fetched btc5m.csv instead.
FROZEN = os.path.join(HERE, "btc5m.csv.gz")

# Volatility filter for RULE 1: median of vol20/vol100 measured on the TRAIN
# split only. Hard-coded so the rule is fully specified in advance; rules.py
# re-derives it and warns if the data has drifted far from this value.
VOL_TH = 0.8884
TEHRAN = datetime.timezone(datetime.timedelta(hours=3, minutes=30))


def load(path):
    out = []
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        for x in csv.DictReader(f):
            out.append({"t": int(x["t"]), "o": float(x["o"]), "h": float(x["h"]),
                        "l": float(x["l"]), "c": float(x["c"])})
    return out


def colour(x):
    """1 = up, 0 = down, -1 = flat (excluded as a prediction target)."""
    return 1 if x["c"] > x["o"] else (0 if x["c"] < x["o"] else -1)


def stdev(a):
    n = len(a)
    if n < 2:
        return 0.0
    m = sum(a) / n
    return math.sqrt(sum((v - m) ** 2 for v in a) / (n - 1))


def zscore(wins, n):
    return (wins / n - 0.5) / (0.5 / math.sqrt(n)) if n else float("nan")


def report(label, sigs, split_t):
    """sigs: list of (ts, won). Print train/test/all accuracy."""
    tr = [s for s in sigs if s[0] < split_t]
    te = [s for s in sigs if s[0] >= split_t]
    print(f"\n{label}")
    for name, S in (("TRAIN", tr), ("TEST ", te), ("ALL  ", sigs)):
        n = len(S)
        if not n:
            continue
        w = sum(1 for s in S if s[1])
        print(f"  {name}  n={n:6d}  acc={w/n*100:6.2f}%  z={zscore(w, n):+6.2f}")
    return tr, te


# --------------------------------------------------------------------------- #
# RULE 1 — fade the volatility-expanding 20-bar breakout
# --------------------------------------------------------------------------- #
def rule1(c, vol_th=VOL_TH, lookback=20):
    """Yield (ts, bet, kind, won) for every breakout-fade signal."""
    n = len(c)
    ret = [0.0] * n
    for i in range(1, n):
        ret[i] = (c[i]["c"] - c[i - 1]["c"]) / c[i - 1]["c"] if c[i - 1]["c"] else 0.0
    out = []
    for i in range(100, n - 1):
        v20, v100 = stdev(ret[i - 19:i + 1]), stdev(ret[i - 99:i + 1])
        if v100 <= 0 or v20 / v100 < vol_th:
            continue
        hi = max(x["h"] for x in c[i - lookback:i])
        lo = min(x["l"] for x in c[i - lookback:i])
        if c[i]["c"] > hi:
            bet, kind = "down", "breakout-up"
        elif c[i]["c"] < lo:
            bet, kind = "up", "breakout-down"
        else:
            continue
        nxt = colour(c[i + 1])
        if nxt == -1:
            continue
        won = (bet == "up" and nxt == 1) or (bet == "down" and nxt == 0)
        out.append((c[i]["t"], bet, kind, won))
    return out


def median_vol_ratio(c, upto):
    """The vol20/vol100 median over [100, upto) — how VOL_TH was derived."""
    ret = [0.0] * len(c)
    for i in range(1, len(c)):
        ret[i] = (c[i]["c"] - c[i - 1]["c"]) / c[i - 1]["c"] if c[i - 1]["c"] else 0.0
    vals = []
    for i in range(100, upto):
        v100 = stdev(ret[i - 99:i + 1])
        if v100 > 0:
            vals.append(stdev(ret[i - 19:i + 1]) / v100)
    vals.sort()
    return vals[len(vals) // 2] if vals else float("nan")


# --------------------------------------------------------------------------- #
# RULE 2 — three same-colour candles with an oversized body -> fade
# RULE 3 — a run of >= k same-colour candles -> fade
# --------------------------------------------------------------------------- #
def rule2(c, body_mult=1.0):
    col = [colour(x) for x in c]
    out = []
    for i in range(100, len(c) - 1):
        if col[i] == -1 or col[i - 1] != col[i] or col[i - 2] != col[i]:
            continue
        rng = sorted(x["h"] - x["l"] for x in c[i - 100:i])
        med = rng[len(rng) // 2]
        if med <= 0 or abs(c[i]["c"] - c[i]["o"]) <= body_mult * med:
            continue
        nxt = col[i + 1]
        if nxt == -1:
            continue
        out.append((c[i]["t"], nxt != col[i]))   # fade: win if the colour flips
    return out


def rule3(c, k=3):
    col = [colour(x) for x in c]
    out = []
    run, rc = 0, None
    for i in range(len(c) - 1):
        v = col[i]
        if v == -1:
            run, rc = 0, None
            continue
        run = run + 1 if v == rc else 1
        rc = v
        nxt = col[i + 1]
        if nxt == -1 or run < k:
            continue
        out.append((c[i]["t"], nxt != rc))
    return out


def loss_streaks(sigs):
    runs, cur = [], 0
    for _, won in sigs:
        if won:
            if cur:
                runs.append(cur)
            cur = 0
        else:
            cur += 1
    if cur:
        runs.append(cur)
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=FROZEN,
                    help="candle CSV (.csv or .csv.gz); defaults to the frozen snapshot")
    args = ap.parse_args()
    if not os.path.exists(args.data):
        raise SystemExit(f"{args.data} not found — run fetch_data.py first.")

    c = load(args.data)
    n = len(c)
    split_i = int(n * 0.70)
    split_t = c[split_i]["t"]
    up = sum(1 for x in c if colour(x) == 1)
    dn = sum(1 for x in c if colour(x) == 0)
    print(f"candles={n:,}  {datetime.datetime.utcfromtimestamp(c[0]['t']):%Y-%m-%d} .. "
          f"{datetime.datetime.utcfromtimestamp(c[-1]['t']):%Y-%m-%d}  "
          f"gaps={sum(1 for i in range(1,n) if c[i]['t']-c[i-1]['t']!=300)}")
    print(f"up={up/n*100:.2f}%  down={dn/n*100:.2f}%  flat={(n-up-dn)/n*100:.3f}%")
    print(f"train/test split at index {split_i:,} "
          f"({datetime.datetime.utcfromtimestamp(split_t):%Y-%m-%d})")

    med = median_vol_ratio(c, split_i)
    print(f"\ntrain median vol20/vol100 = {med:.4f}  (rule uses VOL_TH={VOL_TH})")
    if abs(med - VOL_TH) > 0.05:
        print("  ! drifted from the documented threshold — data has changed materially")

    # ---- RULE 1 -----------------------------------------------------------
    r1 = rule1(c)
    sig1 = [(ts, won) for ts, _, _, won in r1]
    report("RULE 1 — fade the vol-expanding 20-bar breakout", sig1, split_t)
    print(f"  triggers/day ~ {len(r1)/(n/288):.1f}")
    for kind in ("breakout-up", "breakout-down"):
        s = [x for x in r1 if x[2] == kind]
        w = sum(1 for x in s if x[3])
        print(f"  {kind:15s} n={len(s):5d}  acc={w/len(s)*100:.2f}%")

    runs = loss_streaks(sig1)
    tot = len(runs)
    cnt = Counter(runs)
    print("  consecutive losses:")
    for k in sorted(cnt):
        if k in (3, 5, 7, 9):
            at = sum(v for kk, v in cnt.items() if kk >= k)
            print(f"    >={k}: {at:4d} of {tot} streaks ({at/tot*100:5.2f}%)")
    print(f"    longest: {max(runs)}")

    bym = OrderedDict()
    for ts, won in sig1:
        mo = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m")
        e = bym.setdefault(mo, [0, 0])
        e[0] += 1
        e[1] += 1 if won else 0
    good = sum(1 for _, (nn, ww) in bym.items() if ww / nn > 0.5)
    print(f"  monthly: {good}/{len(bym)} months above 50%")

    byh = {}
    for ts, _, _, won in r1:
        hh = datetime.datetime.fromtimestamp(ts, TEHRAN).hour
        e = byh.setdefault(hh, [0, 0])
        e[0] += 1
        e[1] += 1 if won else 0
    rows = sorted(byh.items(), key=lambda x: -(x[1][1] / x[1][0]))
    best = ", ".join(f"{h:02d}h={w/nn*100:.1f}%" for h, (nn, w) in rows[:4])
    worst = ", ".join(f"{h:02d}h={w/nn*100:.1f}%" for h, (nn, w) in rows[-3:])
    print(f"  best Tehran hours : {best}")
    print(f"  worst Tehran hours: {worst}")

    # ---- RULES 2 & 3 ------------------------------------------------------
    for mult in (1.0, 2.0, 3.0):
        report(f"RULE 2 — 3 same-colour + body > {mult}x median100(range) -> fade",
               rule2(c, mult), split_t)
    for k in (3, 5, 7):
        report(f"RULE 3 — run of >= {k} same-colour -> fade", rule3(c, k), split_t)

    # ---- economics --------------------------------------------------------
    w = sum(1 for s in sig1 if s[1])
    p = w / len(sig1)
    print(f"\nEconomics for RULE 1 at p={p*100:.2f}% (EV = p/q - 1 per $1 staked):")
    for q in (0.50, 0.52, 0.54, 0.55, 0.56):
        print(f"  price {q:.2f} (break-even {q*100:.0f}%): {(p/q-1)*100:+6.2f}$ per $100")
    print("\nNOTE: the 50% baseline is STATISTICAL, not a market price. The edge is only")
    print("real if Polymarket quotes your side below ~55c at signal time — still untested.")


if __name__ == "__main__":
    main()
