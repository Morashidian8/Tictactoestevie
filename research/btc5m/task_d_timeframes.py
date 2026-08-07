#!/usr/bin/env python3
"""
Task D — the same strategies on 10m / 15m / 30m instead of 5m.

Nothing here is a new rule. Every signal comes from engine.py, the shared
definition of what bot.py ships, evaluated on bars produced by engine.resample.
The question is only whether the SAME rule behaves differently when the window
is longer, and in particular whether the bust count per unit of time falls,
which is the thing the user actually asked for.

Deterministic: the only randomness is the shuffled-label control, seeded.

Run:  python3 research/btc5m/task_d_timeframes.py
Out:  research/btc5m/out/task_d.pkl

---------------------------------------------------------------------------
STRUCTURE OF task_d.pkl
---------------------------------------------------------------------------
{
  "meta": {
      "generated": iso8601 str,
      "days": float,                 # span of the analysed year
      "base": 20.0, "rungs": 3, "bankroll": 2000.0,
      "candles": {tf: int},          # bar count per timeframe
      "span": {tf: (t_first, t_last)},
  },

  "sanity": {                        # resampling verification
      "dropped": {tf: {"groups": int, "kept": int, "dropped": int}},
      "checked": int,                # how many resampled bars re-derived by hand
      "mismatches": [ ... ],         # empty == resampling is correct
      "sample": [ {bar, recomputed} ... ],   # a few spot checks, for the report
  },

  "baseline": {                      # unconditional fade rate, the honest null
      tf: {"all": {...}, "train": {...}, "test": {...}}
  },                                 # each {...} = {"n","wins","acc","lo","hi","z"}

  "strategies": {
      tf: {                          # tf in "5m","10m","15m","30m"
        name: {                      # name in rule1..rule7, golden, pool
          "n","wins","losses","acc","lo","hi","z",
          "busts","bust_rate","max_streak","streaks",
          "pnl","drawdown","path_low","ruin",
          "per_day","busts_per_day","busts_per_signal",
          "pnl_per_signal","pnl_per_day","flat_pnl",
          "excess",                  # acc minus that block's fade baseline
          "train": {...}, "test": {...},   # same fields, chronological 70/30
          "shuffle": {"best_acc","best_z","mean_acc","p_value"},
        }
      }
  },

  "sweep": {                         # parameter rescaling question, 15m only
      "K": int,                      # variants tried -> bonferroni bar
      "z_bar": float,                # engine.bonferroni_z(K)
      "z_bar_empirical": float,      # 95th pct of max|z| under 200 shuffles
      "variants": [ {"family","label","params","n","acc","lo","hi","z",
                     "busts","bust_rate","pnl","train_acc","test_acc"} ],
      "best_per_family": {family: label},
  },

  "overlap": {                       # question 5: 5m vs 15m signals together
      name: {
        "base_rate_5m": float,       # unconditional 5m firing rate, %
        "contemporaneous": BLOCK,    # 5m decided at the SAME instant (offset +600)
        "lookahead": BLOCK,          # 5m decided inside the window (+900,+1200)
        "any": BLOCK,                # all three, kept only for continuity
      },
      "_pooled_fade": same, for rule1/2/3/5 merged to one bet per window,
  }
  where BLOCK = {
        "n15", "with_5m", "overlap_rate", "expected_rate", "lift",
        "pairs", "agree_pairs", "disagree_pairs",
        "agree": {...}, "disagree": {...}, "mixed": {...}, "alone": {...},
        "agree_5m": {...}, "disagree_5m": {...},
  }
  Only "contemporaneous" is decision-usable. "lookahead" is measured after the
  15m stake is already down and is descriptive only.
}
Every {...} accuracy block carries n / acc / lo / hi / z. A block with n < 200
is reported but flagged; do not treat it as a finding.
"""

import datetime
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine

BASE = 20.0
RUNGS = 3
BANKROLL = 2000.0
SHUFFLES = 200
SEED = 20260807

TFS = [("5m", 1), ("10m", 2), ("15m", 3), ("30m", 6)]
NAMES = ["rule1", "rule2", "rule3", "rule4", "rule5", "rule6", "rule7",
         "golden", "pool"]


def fn_for(name):
    return engine.pool if name == "pool" else engine.RULES[name]


def acc_block(wins, n):
    lo, hi = engine.wilson(wins, n)
    return {"n": n, "wins": wins, "acc": wins / n * 100 if n else float("nan"),
            "lo": lo, "hi": hi, "z": engine.zscore(wins, n) if n else float("nan"),
            "thin": n < 200}


def block_of(signals):
    w = sum(1 for s in signals if s[3])
    return acc_block(w, len(signals))


# --- 1. sanity: is resample() actually producing correct bars? ---------------
def sanity(year):
    rng = random.Random(SEED)
    out = {"dropped": {}, "checked": 0, "mismatches": [], "sample": []}
    by_t = {x["t"]: x for x in year}
    for tf, k in TFS:
        span = k * 300
        keys = []
        seen = set()
        for x in year:
            key = x["t"] - (x["t"] % span)
            if key not in seen:
                seen.add(key)
                keys.append(key)
        bars = engine.resample(year, k)
        out["dropped"][tf] = {"groups": len(keys), "kept": len(bars),
                              "dropped": len(keys) - len(bars)}
        if k == 1:
            continue
        # re-derive a random sample of bars straight from the 5m rows
        idx = list(range(len(bars)))
        rng.shuffle(idx)
        for j in idx[:200]:
            b = bars[j]
            parts = [by_t.get(b["t"] + m * 300) for m in range(k)]
            if any(p is None for p in parts):
                out["mismatches"].append(("missing", tf, b["t"]))
                continue
            ref = {"t": b["t"], "o": parts[0]["o"],
                   "h": max(p["h"] for p in parts),
                   "l": min(p["l"] for p in parts), "c": parts[-1]["c"]}
            out["checked"] += 1
            if any(abs(b[f] - ref[f]) > 1e-9 for f in "ohlc"):
                out["mismatches"].append(("value", tf, b["t"], b, ref))
            elif len(out["sample"]) < 6:
                out["sample"].append({"tf": tf, "bar": b, "recomputed": ref})
    return out


# --- 2. unconditional fade baseline, per timeframe and per block -------------
def fade_baseline(candles):
    """P(next move opposite to the previous move) — the null every fade rule
    has to beat. Voids (unchanged close) are dropped, as in settlement."""
    cl = engine.closes_of(candles)
    rows = []
    for i in range(engine.WARMUP, len(cl) - 1):
        prev = cl[i] - cl[i - 1]
        nxt = cl[i + 1] - cl[i]
        if prev == 0 or nxt == 0:
            continue
        rows.append((candles[i]["t"], (prev > 0) != (nxt > 0)))
    if not rows:
        return {}
    cut = rows[int(len(rows) * 0.70)][0]
    tr = [r for r in rows if r[0] < cut]
    te = [r for r in rows if r[0] >= cut]
    mk = lambda xs: acc_block(sum(1 for r in xs if r[1]), len(xs))
    return {"all": mk(rows), "train": mk(tr), "test": mk(te)}


# --- 3. shuffled-label control ----------------------------------------------
def shuffle_control(signals, candles, rng):
    """
    Shuffle the candle direction labels across the whole year and re-score the
    SAME signal indices. Shuffling the win/loss booleans would be meaningless
    (a permutation cannot change a mean); what is permuted here is the market's
    up/down label per candle, so a directional rule can genuinely get luckier or
    unluckier depending on which side it happened to pick.
    """
    if not signals:
        return {"best_acc": float("nan"), "best_z": float("nan"),
                "mean_acc": float("nan"), "p_value": float("nan")}
    cl = engine.closes_of(candles)
    idx, labels = [], []
    pos = {}
    for i in range(engine.WARMUP, len(cl) - 1):
        d = cl[i + 1] - cl[i]
        if d == 0:
            continue
        pos[i] = len(labels)
        labels.append(d > 0)
    sig = [(pos[s[0]], s[2] == "up") for s in signals if s[0] in pos]
    n = len(sig)
    real = sum(1 for p, up in sig if labels[p] == up) / n * 100
    best_acc, best_z, tot, ge = -1.0, 0.0, 0.0, 0
    perm = list(labels)
    for _ in range(SHUFFLES):
        rng.shuffle(perm)
        w = 0
        for p, up in sig:
            if perm[p] == up:
                w += 1
        a = w / n * 100
        tot += a
        if a >= real:
            ge += 1
        if a > best_acc:
            best_acc, best_z = a, engine.zscore(w, n)
    return {"best_acc": best_acc, "best_z": best_z,
            "mean_acc": tot / SHUFFLES, "p_value": (ge + 1) / (SHUFFLES + 1),
            "real_acc": real, "n": n}


# --- 4. one strategy on one timeframe ---------------------------------------
def measure(name, candles, days, base_block, rng, do_shuffle=True):
    sigs = engine.run_rule(name, candles, fn=fn_for(name))
    st = engine.simulate(sigs, base=BASE, rungs=RUNGS, bankroll=BANKROLL)
    tr, te = engine.split(sigs, 0.70)
    row = acc_block(st["wins"], st["n"])
    row.update({
        "losses": st["losses"],
        "busts": st["busts"], "bust_rate": st["bust_rate"],
        "max_streak": st["max_streak"], "streaks": dict(st["streaks"]),
        "pnl": st["pnl"], "drawdown": st["drawdown"],
        "path_low": st["path_low"], "ruin": st["ruin"],
        "per_day": st["n"] / days,
        "busts_per_day": st["busts"] / days,
        "busts_per_signal": st["busts"] / st["n"] if st["n"] else float("nan"),
        "pnl_per_signal": st["pnl"] / st["n"] if st["n"] else float("nan"),
        "pnl_per_day": st["pnl"] / days,
        "flat_pnl": engine.flat(sigs, BASE)["pnl"],
        "excess": (st["wins"] / st["n"] * 100 - base_block["all"]["acc"])
                  if st["n"] and base_block else float("nan"),
    })
    for tag, part, ref in (("train", tr, "train"), ("test", te, "test")):
        b = block_of(part)
        s2 = engine.simulate(part, base=BASE, rungs=RUNGS, bankroll=BANKROLL)
        b.update({"busts": s2["busts"], "bust_rate": s2["bust_rate"],
                  "pnl": s2["pnl"], "max_streak": s2["max_streak"],
                  "excess": (b["acc"] - base_block[ref]["acc"])
                            if b["n"] and base_block else float("nan")})
        row[tag] = b
    row["shuffle"] = (shuffle_control(sigs, candles, rng) if do_shuffle
                      else None)
    return row, sigs


# --- 5. parameter sweep on 15m ----------------------------------------------
def build_sweep():
    """(family, label, rule-name, kwargs, warmup) for every variant tried."""
    V = []
    for L in (5, 8, 10, 12, 15, 20, 25, 30, 40, 60):
        V.append(("rule1.lookback", f"lookback={L}", "rule1",
                  {"lookback": L}, 106))
    for th in (0.0, 0.70, 0.80, 0.8884, 1.00, 1.10):
        V.append(("rule1.vol_th", f"vol_th={th}", "rule1",
                  {"vol_th": th}, 106))
    for m in (1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0):
        V.append(("rule2.mult", f"mult={m}", "rule2", {"mult": m}, 106))
    for r in (3, 4, 5, 6, 7, 8):
        V.append(("rule3.run", f"run={r}", "rule3", {"run": r}, 106))
    for m in (3.0, 4.0, 4.5, 5.0, 5.7, 6.5, 7.0, 8.0):
        for sp in (2, 3, 4, 6):
            V.append(("rule5", f"mult={m},span={sp}", "rule5",
                      {"mult": m, "span": sp}, 114))
    for p in (7, 9, 14):
        for hi in (60.0, 65.0, 70.0, 75.0, 80.0):
            V.append(("rule6", f"rsi{p}>{hi:.0f}", "rule6",
                      {"period": p, "rsi_hi": hi}, 106))
    for n in (10, 14, 20, 30):
        for sd in (1.5, 2.0, 2.5):
            for rn in (7, 14):
                for hi, lo in ((80.0, 20.0), (70.0, 30.0)):
                    V.append(("rule7", f"bb{n}/{sd},rsi{rn}({lo:.0f},{hi:.0f})",
                              "rule7", {"bb_n": n, "bb_sd": sd, "rsi_n": rn,
                                        "rsi_hi": hi, "rsi_lo": lo}, 106))
    for need in (2, 3):
        for m in (6.0, 9.0, 12.0):
            V.append(("golden", f"need={need},mult={m}", "golden",
                      {"need": need, "mult": m}, 106))
    return V


def run_sweep(c15, rng):
    V = build_sweep()
    rows, sig_sets = [], []
    for fam, label, rule, kw, wu in V:
        sigs = engine.run_rule(rule, c15, warmup=wu, **kw)
        st = engine.simulate(sigs, base=BASE, rungs=RUNGS, bankroll=BANKROLL)
        tr, te = engine.split(sigs, 0.70)
        lo, hi = engine.wilson(st["wins"], st["n"])
        rows.append({"family": fam, "label": label, "rule": rule, "params": kw,
                     "n": st["n"], "acc": st["acc"], "lo": lo, "hi": hi,
                     "z": engine.zscore(st["wins"], st["n"]) if st["n"] else float("nan"),
                     "busts": st["busts"], "bust_rate": st["bust_rate"],
                     "pnl": st["pnl"], "path_low": st["path_low"],
                     "per_day": st["n"],
                     "train_acc": block_of(tr)["acc"], "test_acc": block_of(te)["acc"],
                     "train_n": len(tr), "test_n": len(te),
                     "thin": st["n"] < 200})
        sig_sets.append(sigs)

    # empirical max-|z| null: the bar the BEST of K variants must clear
    cl = engine.closes_of(c15)
    pos, labels = {}, []
    for i in range(engine.WARMUP, len(cl) - 1):
        d = cl[i + 1] - cl[i]
        if d == 0:
            continue
        pos[i] = len(labels)
        labels.append(d > 0)
    packed = [[(pos[s[0]], s[2] == "up") for s in ss if s[0] in pos]
              for ss in sig_sets]
    perm = list(labels)
    maxes = []
    for _ in range(SHUFFLES):
        rng.shuffle(perm)
        mz = 0.0
        for sg in packed:
            if len(sg) < 200:
                continue
            w = sum(1 for p, up in sg if perm[p] == up)
            mz = max(mz, abs(engine.zscore(w, len(sg))))
        maxes.append(mz)
    maxes.sort()
    emp = maxes[int(0.95 * len(maxes))]

    K = len(V)
    best = {}
    for r in rows:
        if r["thin"]:
            continue
        f = r["family"]
        if f not in best or abs(r["z"]) > abs(best[f]["z"]):
            best[f] = r
    return {"K": K, "z_bar": engine.bonferroni_z(K), "z_bar_empirical": emp,
            "variants": rows,
            "best_per_family": {f: r["label"] for f, r in best.items()},
            "best_rows": best}


# --- 6. 5m vs 15m overlap ----------------------------------------------------
def _overlap_at(sig5_by_ts, sig15, offsets, base_rate):
    """Shared machinery: compare each 15m signal with the 5m signals living at
    the given offsets from its bar open."""
    out = {"n15": len(sig15), "with_5m": 0, "pairs": 0,
           "agree_pairs": 0, "disagree_pairs": 0}
    agree, disagree, mixed, alone, dis5, agr5 = [], [], [], [], [], []
    for i, T, side, won in sig15:
        mates = []
        for off in offsets:
            mates.extend(sig5_by_ts.get(T + off, []))
        if not mates:
            alone.append(won)
            continue
        out["with_5m"] += 1
        out["pairs"] += len(mates)
        same = sum(1 for s, _ in mates if s == side)
        out["agree_pairs"] += same
        out["disagree_pairs"] += len(mates) - same
        if same == len(mates):
            agree.append(won)
            agr5.extend(w for _, w in mates)
        elif same == 0:
            disagree.append(won)
            dis5.extend(w for s, w in mates if s != side)
        else:
            mixed.append(won)
    mk = lambda xs: acc_block(sum(1 for x in xs if x), len(xs))
    n15 = len(sig15)
    # under independence the chance of at least one 5m signal in `offsets`
    exp = (1 - (1 - base_rate) ** len(offsets)) * 100
    out.update({"agree": mk(agree), "disagree": mk(disagree),
                "mixed": mk(mixed), "alone": mk(alone),
                "disagree_5m": mk(dis5), "agree_5m": mk(agr5),
                "overlap_rate": out["with_5m"] / n15 * 100 if n15 else float("nan"),
                "expected_rate": exp,
                "lift": (out["with_5m"] / n15 * 100 / exp) if n15 and exp else float("nan")})
    return out


def overlap(sig5, sig15, n5_windows):
    """
    Do the two timeframes see the same thing, and when they disagree who wins?

    A 15m signal is emitted at the CLOSE of the bar that opened at T, so it is
    decided at T+900 and settles at T+1800. Which 5m signals may be compared
    with it depends entirely on when they are decided:

      * offset +600 — the 5m candle opening at T+600 closes at exactly T+900.
        Its signal is decided at the same instant as the 15m one. This is the
        ONLY comparison a live trader could act on, so it is the answer to the
        question "if both fire at once, which do I follow?".

      * offsets +900 and +1200 — decided at T+1200 and T+1500, i.e. INSIDE the
        15m window, after the 15m stake is already down. Their agreement with
        the 15m bet is partly an echo of how the window is already going. They
        are reported separately and labelled look-ahead; they are descriptive
        only and must never be read as a tradable filter.

    Mapping is by timestamp, never by index — the two lists are different bars.
    """
    by_ts = {}
    for i, ts, side, won in sig5:
        by_ts.setdefault(ts, []).append((side, won))
    base_rate = len(sig5) / n5_windows if n5_windows else 0.0
    return {
        "base_rate_5m": base_rate * 100,
        "contemporaneous": _overlap_at(by_ts, sig15, (600,), base_rate),
        "lookahead": _overlap_at(by_ts, sig15, (900, 1200), base_rate),
        "any": _overlap_at(by_ts, sig15, (600, 900, 1200), base_rate),
    }


# --- main --------------------------------------------------------------------
def main():
    rng = random.Random(SEED)
    raw = engine.load()
    year = engine.last_year(raw)
    days = (year[-1]["t"] - year[0]["t"]) / 86400.0

    print(f"5m candles in the last year: {len(year):,}  ({days:.1f} days)")
    san = sanity(year)
    print(f"resample sanity: checked={san['checked']} "
          f"mismatches={len(san['mismatches'])} "
          + " ".join(f"{tf}:drop{d['dropped']}" for tf, d in san["dropped"].items()))

    bars = {tf: (year if k == 1 else engine.resample(year, k)) for tf, k in TFS}
    baseline = {tf: fade_baseline(c) for tf, c in bars.items()}
    for tf in bars:
        b = baseline[tf]
        print(f"  {tf:>4} bars={len(bars[tf]):6,}  fade baseline "
              f"{b['all']['acc']:.2f}%  train {b['train']['acc']:.2f}%  "
              f"test {b['test']['acc']:.2f}%")

    strategies, sig_store = {}, {}
    for tf, _ in TFS:
        strategies[tf], sig_store[tf] = {}, {}
        print(f"\n--- {tf} ---")
        for name in NAMES:
            row, sigs = measure(name, bars[tf], days, baseline[tf], rng)
            strategies[tf][name] = row
            sig_store[tf][name] = sigs
            print(f"{name:<7} n={row['n']:5d} acc={row['acc']:6.2f}% "
                  f"[{row['lo']:5.2f}-{row['hi']:5.2f}] z={row['z']:+5.2f} "
                  f"busts={row['busts']:4d} ({row['bust_rate']:5.2f}%) "
                  f"b/day={row['busts_per_day']:.3f} "
                  f"P&L={row['pnl']:+9,.0f} low={row['path_low']:+8,.0f} "
                  f"{'RUIN' if row['ruin'] else 'ok'}")

    print("\n--- sweep on 15m ---")
    sw = run_sweep(bars["15m"], rng)
    print(f"K={sw['K']}  bonferroni z={sw['z_bar']:.2f}  "
          f"empirical max|z| 95th pct={sw['z_bar_empirical']:.2f}")
    for fam, r in sorted(sw["best_rows"].items()):
        mark = "PASS" if abs(r["z"]) >= max(sw["z_bar"], sw["z_bar_empirical"]) else "fail"
        print(f"  {fam:<15} best {r['label']:<26} n={r['n']:5d} "
              f"acc={r['acc']:6.2f}% z={r['z']:+5.2f} {mark}")

    print("\n--- 5m vs 15m overlap (contemporaneous = same decision instant) ---")
    n5w = len(bars["5m"]) - engine.WARMUP - 1
    ov = {}
    for name in NAMES:
        ov[name] = overlap(sig_store["5m"][name], sig_store["15m"][name], n5w)
        c = ov[name]["contemporaneous"]
        la = ov[name]["lookahead"]
        print(f"{name:<7} 15m n={c['n15']:5d} | contemp overlap {c['with_5m']:5d} "
              f"({c['overlap_rate']:5.1f}% vs {c['expected_rate']:5.1f}% expected, "
              f"lift {c['lift']:.2f}x) agree n={c['agree']['n']:4d} "
              f"acc={c['agree']['acc']:6.2f}% | disagree n={c['disagree']['n']:4d} "
              f"15m={c['disagree']['acc']:6.2f}% 5m={c['disagree_5m']['acc']:6.2f}% "
              f"| alone n={c['alone']['n']:5d} acc={c['alone']['acc']:6.2f}% "
              f"|| lookahead disagree n={la['disagree']['n']:4d} "
              f"15m={la['disagree']['acc']:6.2f}%")

    # the fade family as a whole, deduplicated to one bet per window
    def dedup(sigs):
        best = {}
        for s in sigs:
            best.setdefault(s[0], s)
        return [best[k] for k in sorted(best)]
    fam = ("rule1", "rule2", "rule3", "rule5")
    ov["_pooled_fade"] = overlap(
        dedup(sorted(sum((sig_store["5m"][n] for n in fam), []), key=lambda s: s[0])),
        dedup(sorted(sum((sig_store["15m"][n] for n in fam), []), key=lambda s: s[0])),
        n5w)

    results = {
        "meta": {"generated": datetime.datetime.now(engine.UTC).isoformat(),
                 "days": days, "base": BASE, "rungs": RUNGS,
                 "bankroll": BANKROLL, "shuffles": SHUFFLES, "seed": SEED,
                 "candles": {tf: len(c) for tf, c in bars.items()},
                 "span": {tf: (c[0]["t"], c[-1]["t"]) for tf, c in bars.items()}},
        "sanity": san, "baseline": baseline, "strategies": strategies,
        "sweep": sw, "overlap": ov,
    }
    p = engine.save(results, "task_d.pkl")
    print(f"\nsaved -> {p}")
    return results


if __name__ == "__main__":
    main()
