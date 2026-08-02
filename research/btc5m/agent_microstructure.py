#!/usr/bin/env python3
"""
BTC 5m candle SHAPE / MICROSTRUCTURE mining.

Target: sign(close[i+1] - close[i])  (close-to-close, exactly how Polymarket settles)
Split : chronological 70/30, everything chosen on train, test reported separately.
Gate  : >= 300 train occurrences.
Multi : Bonferroni over K = every variant evaluated; require |z| >= sqrt(2*ln K).

Run:  python3 research/btc5m/agent_microstructure.py
"""
import gzip, csv, math, itertools, sys
import numpy as np

CSV = "/home/user/Tictactoestevie/research/btc5m/btc5m.csv.gz"
MIN_N = 300
BARS_PER_DAY = 288

# ---------------------------------------------------------------- load
def load():
    o, h, l, c, v = [], [], [], [], []
    with gzip.open(CSV, "rt") as f:
        r = csv.DictReader(f)
        for row in r:
            o.append(float(row["o"])); h.append(float(row["h"]))
            l.append(float(row["l"])); c.append(float(row["c"]))
            v.append(float(row["v"]))
    return (np.array(o), np.array(h), np.array(l), np.array(c), np.array(v))

O, H, L, C, V = load()
N = len(C)

# ---------------------------------------------------------------- helpers
def shift(a, k, fill=np.nan):
    """a shifted forward by k bars: out[i] = a[i-k]"""
    out = np.full_like(a, fill, dtype=float)
    if k > 0:
        out[k:] = a[:-k]
    elif k < 0:
        out[:k] = a[-k:]
    else:
        out[:] = a
    return out

def roll(a, w, fn):
    """causal rolling stat over the w bars ENDING at i (inclusive)."""
    out = np.full(N, np.nan)
    if w > N:
        return out
    st = np.lib.stride_tricks.sliding_window_view(a, w)
    out[w - 1:] = fn(st, axis=1)
    return out

def roll_prev(a, w, fn):
    """rolling stat over the w bars ENDING at i-1 (excludes current bar)."""
    return shift(roll(a, w, fn), 1)

def safe(num, den):
    den = np.where(np.abs(den) < 1e-9, np.nan, den)
    return num / den

# ---------------------------------------------------------------- features
rng   = H - L
body  = C - O
abody = np.abs(body)
up_w  = H - np.maximum(O, C)
lo_w  = np.minimum(O, C) - L
mid   = (H + L) / 2.0

# true range / ATR (causal, includes current bar)
prev_c = shift(C, 1)
tr = np.maximum.reduce([H - L, np.abs(H - prev_c), np.abs(L - prev_c)])
atr14 = roll(tr, 14, np.mean)
atr50 = roll(tr, 50, np.mean)

# --- shape ratios ---------------------------------------------------
f = {}
f["clspos"]   = safe(C - L, rng)                 # close position in bar range 0..1
f["opnpos"]   = safe(O - L, rng)
f["bodyfrac"] = safe(abody, rng)                 # body as fraction of range
f["upfrac"]   = safe(up_w, rng)
f["lofrac"]   = safe(lo_w, rng)
f["wickasym"] = safe(up_w - lo_w, rng)           # +1 all upper wick, -1 all lower
f["up_over_body"] = safe(up_w, np.maximum(abody, 1e-9))
f["lo_over_body"] = safe(lo_w, np.maximum(abody, 1e-9))
f["up_over_lo"]   = safe(up_w, np.maximum(lo_w, 1e-9))

# --- size relative to recent --------------------------------------
med_rng20  = roll_prev(rng, 20, np.median)
med_body20 = roll_prev(abody, 20, np.median)
f["rng_ratio20"]  = safe(rng, med_rng20)         # range expansion / contraction
f["body_ratio20"] = safe(abody, med_body20)
f["body_atr"]     = safe(abody, shift(atr14, 1))
f["rng_atr"]      = safe(rng, shift(atr14, 1))
f["atr_regime"]   = safe(shift(atr14, 1), shift(atr50, 1))

# --- gap: this bar's open vs previous close -----------------------
f["gap_atr"] = safe(O - shift(C, 1), shift(atr14, 1))
f["gap_rng"] = safe(O - shift(C, 1), shift(rng, 1))

# --- close vs previous bar's midpoint / structure ------------------
f["c_vs_prevmid"] = safe(C - shift(mid, 1), shift(atr14, 1))
f["o_vs_prevmid"] = safe(O - shift(mid, 1), shift(atr14, 1))
f["c_vs_prevc"]   = safe(C - shift(C, 1), shift(atr14, 1))

# --- close position within last N bars' range ---------------------
for w in (6, 12, 24, 48):
    hi = roll(H, w, np.max); lo = roll(L, w, np.min)
    f[f"clspos{w}"] = safe(C - lo, hi - lo)

# --- lagged shape -------------------------------------------------
f["clspos_p1"]   = shift(f["clspos"], 1)
f["clspos_p2"]   = shift(f["clspos"], 2)
f["wickasym_p1"] = shift(f["wickasym"], 1)
f["rng_ratio20_p1"] = shift(f["rng_ratio20"], 1)

# consecutive close-position agreement
cp, cp1, cp2 = f["clspos"], f["clspos_p1"], f["clspos_p2"]
f["cp_mean3"] = (cp + cp1 + cp2) / 3.0
f["cp_min3"]  = np.minimum(np.minimum(cp, cp1), cp2)
f["cp_max3"]  = np.maximum(np.maximum(cp, cp1), cp2)

# volume
f["vol_ratio20"] = safe(V, roll_prev(V, 20, np.median))

# ---------------------------------------------------------------- boolean primitives
Hp, Lp = shift(H, 1), shift(L, 1)
inside  = (H < Hp) & (L > Lp)
outside = (H > Hp) & (L < Lp)
b_inside2  = inside & shift(inside, 1).astype(bool)
b_outside_after_inside = outside & shift(inside, 1).astype(bool)
b_inside_after_outside = inside & shift(outside, 1).astype(bool)

# ---------------------------------------------------------------- label
y = np.zeros(N, dtype=float)            # 1 = next close higher
y[:-1] = (C[1:] > C[:-1]).astype(float)
y[-1] = np.nan

WARM = 100                              # warmup for rolling windows
valid = np.zeros(N, dtype=bool)
valid[WARM:N - 1] = True

split = int(N * 0.70)
tr_mask = valid & (np.arange(N) < split)
te_mask = valid & (np.arange(N) >= split)

# ---------------------------------------------------------------- predicate construction
QS = [0.05, 0.10, 0.20, 0.30, 0.70, 0.80, 0.90, 0.95]

preds = {}   # name -> bool array
FAMILY = {}  # predicate name -> feature family

# features that use ONLY the current bar + the immediately preceding bar's OHLC
INTRABAR = {
    "clspos", "opnpos", "bodyfrac", "upfrac", "lofrac", "wickasym",
    "up_over_body", "lo_over_body", "up_over_lo",
    "rng_ratio20", "body_ratio20", "body_atr", "rng_atr",
    "gap_atr", "gap_rng", "o_vs_prevmid", "c_vs_prevmid",
    "clspos_p1", "clspos_p2", "wickasym_p1", "rng_ratio20_p1",
    "cp_mean3", "cp_min3", "cp_max3", "vol_ratio20",
}
INTRABAR_BOOL = {
    "inside", "outside", "inside2", "outside_after_inside", "inside_after_outside",
    "bull_bar", "bear_bar", "close_gt_prevhigh", "close_lt_prevlow",
    "high_gt_prevhigh_close_lt_prevclose", "low_lt_prevlow_close_gt_prevclose",
}

def add(name, arr, family):
    a = np.asarray(arr)
    a = np.where(np.isnan(a.astype(float)), False, a).astype(bool) if a.dtype != bool else a
    preds[name] = a
    FAMILY[name] = family

# threshold predicates from every continuous feature, cut at train quantiles
for fname, arr in f.items():
    tvals = arr[tr_mask]
    tvals = tvals[np.isfinite(tvals)]
    if len(tvals) < 1000:
        continue
    for q in QS:
        thr = float(np.quantile(tvals, q))
        if q <= 0.30:
            add(f"{fname}<{thr:.4g}(q{int(q*100)})", np.nan_to_num(arr, nan=np.inf) < thr, fname)
        else:
            add(f"{fname}>{thr:.4g}(q{int(q*100)})", np.nan_to_num(arr, nan=-np.inf) > thr, fname)

# structural booleans
add("inside", inside, "inside")
add("outside", outside, "outside")
add("inside2", b_inside2, "inside2")
add("outside_after_inside", b_outside_after_inside, "outside_after_inside")
add("inside_after_outside", b_inside_after_outside, "inside_after_outside")
add("prev_up", np.nan_to_num(shift(C, 1) - shift(C, 2), nan=0) > 0, "prevdir")
add("prev_dn", np.nan_to_num(shift(C, 1) - shift(C, 2), nan=0) < 0, "prevdir")
add("bull_bar", body > 0, "bull_bar")
add("bear_bar", body < 0, "bull_bar")
add("close_gt_prevhigh", C > Hp, "close_gt_prevhigh")
add("close_lt_prevlow", C < Lp, "close_lt_prevlow")
add("high_gt_prevhigh_close_lt_prevclose", (H > Hp) & (C < shift(C, 1)), "sweep_up")
add("low_lt_prevlow_close_gt_prevclose", (L < Lp) & (C > shift(C, 1)), "sweep_dn")

BASE = list(preds.items())
BASE_INTRA = [(nm, cd) for nm, cd in BASE
              if FAMILY[nm] in INTRABAR or FAMILY[nm] in INTRABAR_BOOL]

# ---------------------------------------------------------------- evaluation
def z_of(p, n):
    return (p - 0.5) / math.sqrt(0.25 / n)

def search(base, universe_tr, universe_te, tag, dedup=0.55, max_keep=25):
    """Full singles/pairs/triples sweep over `base` predicates. Returns (kept, K, BONF_Z, counts)."""
    results = []
    K = [0]

    def evaluate(name, cond, fams):
        K[0] += 1
        m = cond & universe_tr
        n_tr = int(m.sum())
        if n_tr < MIN_N:
            return None
        p_tr = float(y[m].mean())
        z = z_of(p_tr, n_tr)
        side = 1 if p_tr > 0.5 else 0          # direction chosen ON TRAIN ONLY
        acc_tr = p_tr if side == 1 else 1 - p_tr
        mt = cond & universe_te
        n_te = int(mt.sum())
        p_te = float(y[mt].mean()) if n_te > 0 else float("nan")
        acc_te = (p_te if side == 1 else 1 - p_te) if n_te > 0 else float("nan")
        return dict(rule=name, acc_tr=acc_tr, n_tr=n_tr, acc_te=acc_te, n_te=n_te,
                    z=z, side=side, cond=cond, fams=fams)

    for name, cond in base:
        r = evaluate(name, cond, frozenset([FAMILY[name]]))
        if r: results.append(r)
    n_singles = K[0]

    pool = [(nm, cd) for nm, cd in base if (cd & universe_tr).sum() >= MIN_N * 2]
    for (n1, c1), (n2, c2) in itertools.combinations(pool, 2):
        if FAMILY[n1] == FAMILY[n2]:
            continue
        r = evaluate(f"{n1} AND {n2}", c1 & c2, frozenset([FAMILY[n1], FAMILY[n2]]))
        if r: results.append(r)
    n_pairs = K[0] - n_singles

    results.sort(key=lambda r: -abs(r["z"]))
    top_for_triple = [r for r in results if abs(r["z"]) >= 3.0 and " AND " in r["rule"]][:60]
    for r in top_for_triple:
        for n3, c3 in pool:
            if FAMILY[n3] in r["fams"]:
                continue
            rr = evaluate(f"{r['rule']} AND {n3}", r["cond"] & c3, r["fams"] | {FAMILY[n3]})
            if rr: results.append(rr)
    n_triples = K[0] - n_singles - n_pairs

    BONF_Z = math.sqrt(2 * math.log(max(K[0], 2)))

    results.sort(key=lambda r: -abs(r["z"]))
    kept = []
    for r in results:
        dup = False
        for k in kept:
            a, b = r["cond"] & universe_tr, k["cond"] & universe_tr
            un = (a | b).sum()
            if un and (a & b).sum() / un > dedup:
                dup = True
                break
        if not dup:
            kept.append(r)
        if len(kept) >= max_keep:
            break
    return kept, K[0], BONF_Z, (n_singles, n_pairs, n_triples)

kept, K, BONF_Z, (n_singles, n_pairs, n_triples) = search(BASE, tr_mask, te_mask, "ALL")

# ---------------------------------------------------------------- known rules for overlap
known = {}
known["hammer"] = (lo_w >= 2 * abody) & (up_w <= abody) & (rng > 0)
known["shooting_star"] = (up_w >= 2 * abody) & (lo_w <= abody) & (rng > 0)
known["doji"] = np.nan_to_num(safe(abody, rng), nan=1.0) <= 0.10
known["bull_engulf"] = (C > O) & (shift(C, 1) < shift(O, 1)) & (C >= shift(O, 1)) & (O <= shift(C, 1))
known["bear_engulf"] = (C < O) & (shift(C, 1) > shift(O, 1)) & (C <= shift(O, 1)) & (O >= shift(C, 1))
known["inside_bar"] = inside
known["outside_bar"] = outside
known["follow_prev"] = np.nan_to_num(shift(C, 1) - shift(C, 2), nan=0) != 0   # momentum universe
for k in known:
    known[k] = np.nan_to_num(known[k].astype(float), nan=0).astype(bool)

# ---------------------------------------------------------------- report
def pct(x):
    return "  n/a " if (x is None or (isinstance(x, float) and math.isnan(x))) else f"{100*x:5.2f}%"

print("=" * 118)
print(f"BTC 5m microstructure mining | N={N} bars | train={int(tr_mask.sum())} test={int(te_mask.sum())}")
print(f"Baseline P(up) train={y[tr_mask].mean()*100:.2f}%  test={y[te_mask].mean()*100:.2f}%")
print(f"K evaluated = {K}  (singles={n_singles}, pairs={n_pairs}, triples={n_triples})"
      f"   Bonferroni |z| >= sqrt(2*lnK) = {BONF_Z:.2f}")
print("=" * 118)
hdr = f"{'#':>2}  {'rule':<62} {'bet':>4} {'trAcc':>7} {'trN':>6} {'teAcc':>7} {'teN':>6} {'z':>6} {'bonf':>5}"
print(hdr)
print("-" * 118)
for i, r in enumerate(kept[:10], 1):
    surv = "YES" if abs(r["z"]) >= BONF_Z else "no"
    nm = r["rule"] if len(r["rule"]) <= 62 else r["rule"][:59] + "..."
    print(f"{i:>2}  {nm:<62} {'UP' if r['side'] else 'DOWN':>4} {pct(r['acc_tr'])} {r['n_tr']:>6} "
          f"{pct(r['acc_te'])} {r['n_te']:>6} {r['z']:>6.2f} {surv:>5}")
print("-" * 118)

survivors = [r for r in kept if abs(r["z"]) >= BONF_Z]
print(f"\nSurvivors of Bonferroni on train: {len(survivors)}")
if not survivors:
    print("NOTHING SURVIVED.")
else:
    total_days = N / BARS_PER_DAY
    for r in survivors:
        cond = r["cond"] & valid
        n_all = int(cond.sum())
        print(f"\n--- {r['rule']}")
        print(f"    bet {'UP' if r['side'] else 'DOWN'} | train {pct(r['acc_tr'])} n={r['n_tr']} | "
              f"TEST {pct(r['acc_te'])} n={r['n_te']} | z_train={r['z']:.2f}")
        print(f"    signals/day = {n_all/total_days:.2f}  ({n_all} fires over {total_days:.0f} days)")
        print("    overlap with known rules (fraction of this rule's signals that are also X):")
        for kn, kc in known.items():
            ov = (cond & kc).sum() / max(n_all, 1)
            print(f"        {kn:<16} {100*ov:5.1f}%")

# consistency check: test-set z for the survivors
print("\nOut-of-sample z (survivors, direction fixed on train):")
for r in survivors:
    if r["n_te"] > 0:
        zt = (r["acc_te"] - 0.5) / math.sqrt(0.25 / r["n_te"])
        print(f"    {r['rule'][:70]:<70} test z = {zt:+.2f}")

# ================================================================ STAGE 2
# PURE INTRABAR: only features computable from the current bar + previous bar's
# OHLC. This isolates candle SHAPE from multi-bar range position.
print("\n" + "=" * 118)
print("STAGE 2 -- PURE INTRABAR SHAPE ONLY (no multi-bar range position, no clsposN)")
print("=" * 118)
k2, K2, B2, c2 = search(BASE_INTRA, tr_mask, te_mask, "INTRA")
print(f"K evaluated = {K2} (singles={c2[0]}, pairs={c2[1]}, triples={c2[2]})  "
      f"Bonferroni |z| >= {B2:.2f}")
print(hdr)
print("-" * 118)
for i, r in enumerate(k2[:10], 1):
    surv = "YES" if abs(r["z"]) >= B2 else "no"
    nm = r["rule"] if len(r["rule"]) <= 62 else r["rule"][:59] + "..."
    print(f"{i:>2}  {nm:<62} {'UP' if r['side'] else 'DOWN':>4} {pct(r['acc_tr'])} {r['n_tr']:>6} "
          f"{pct(r['acc_te'])} {r['n_te']:>6} {r['z']:>6.2f} {surv:>5}")
s2 = [r for r in k2 if abs(r["z"]) >= B2]
print(f"\nStage-2 survivors: {len(s2)}")
for r in s2[:8]:
    cond = r["cond"] & valid
    n_all = int(cond.sum())
    zt = (r["acc_te"] - 0.5) / math.sqrt(0.25 / r["n_te"]) if r["n_te"] else float("nan")
    print(f"  {r['rule'][:80]:<80} test z={zt:+.2f}  signals/day={n_all/(N/BARS_PER_DAY):.1f}")

# ================================================================ STAGE 3
# INCREMENTAL VALUE: does intrabar shape add anything ON TOP OF the multi-bar
# range-position edge? Test each intrabar predicate INSIDE the control stratum,
# against that stratum's own base rate (not against 50%).
print("\n" + "=" * 118)
print("STAGE 3 -- DOES INTRABAR SHAPE ADD ANYTHING ON TOP OF THE RANGE-POSITION EDGE?")
print("=" * 118)
best = kept[0]
ctrl = best["cond"]
ctrl_tr = ctrl & tr_mask
ctrl_te = ctrl & te_mask
p0_tr = float(y[ctrl_tr].mean())
p0_te = float(y[ctrl_te].mean())
print(f"Control stratum = {best['rule']}")
print(f"  stratum P(up): train {p0_tr*100:.2f}% (n={int(ctrl_tr.sum())})  "
      f"test {p0_te*100:.2f}% (n={int(ctrl_te.sum())})")

inc = []
K3 = 0
for nm, cd in BASE_INTRA:
    m = cd & ctrl_tr
    n = int(m.sum())
    K3 += 1
    if n < MIN_N:
        continue
    p = float(y[m].mean())
    zi = (p - p0_tr) / math.sqrt(p0_tr * (1 - p0_tr) / n)   # vs stratum base rate
    mt = cd & ctrl_te
    nte = int(mt.sum())
    pte = float(y[mt].mean()) if nte else float("nan")
    inc.append((abs(zi), nm, p, n, pte, nte, zi))
B3 = math.sqrt(2 * math.log(max(K3, 2)))
inc.sort(reverse=True)
print(f"K evaluated = {K3}   Bonferroni |z| >= {B3:.2f}   (z measured vs the stratum's own rate)")
print(f"{'intrabar modifier':<52} {'trP(up)':>8} {'trN':>6} {'teP(up)':>8} {'teN':>6} {'z_inc':>7} {'bonf':>5}")
print("-" * 100)
for az, nm, p, n, pte, nte, zi in inc[:12]:
    surv = "YES" if az >= B3 else "no"
    print(f"{nm[:52]:<52} {100*p:7.2f}% {n:>6} {100*pte:7.2f}% {nte:>6} {zi:>7.2f} {surv:>5}")
n_inc = sum(1 for az, *_ in inc if az >= B3)
print(f"\nIntrabar modifiers with genuine incremental value over the control: {n_inc}")

# ================================================================ STAGE 4
# Head-to-head: does using the PREVIOUS BAR'S HIGH/LOW (c_vs_prevmid) beat pure
# close-to-close momentum (c_vs_prevc)? This is the "do highs/lows add info"
# question, since settlement never uses them.
print("\n" + "=" * 118)
print("STAGE 4 -- HEAD-TO-HEAD: prev-bar MIDPOINT (uses H/L) vs prev-bar CLOSE (settlement-only)")
print("=" * 118)

def stat(cond, label):
    mtr, mte = cond & tr_mask, cond & te_mask
    ntr, nte = int(mtr.sum()), int(mte.sum())
    ptr, pte = float(y[mtr].mean()), float(y[mte].mean())
    print(f"  {label:<46} train fade {100*(1-ptr):5.2f}% n={ntr:>6} z={z_of(ptr,ntr):+6.2f} | "
          f"test fade {100*(1-pte):5.2f}% n={nte:>5} z={z_of(pte,nte):+6.2f}")
    return ptr, pte

for q in (0.80, 0.90, 0.95):
    tm = f["c_vs_prevmid"][tr_mask]; tm = tm[np.isfinite(tm)]
    tc = f["c_vs_prevc"][tr_mask];   tc = tc[np.isfinite(tc)]
    A = np.nan_to_num(f["c_vs_prevc"], nan=-np.inf) > float(np.quantile(tc, q))
    B = np.nan_to_num(f["c_vs_prevmid"], nan=-np.inf) > float(np.quantile(tm, q))
    print(f"\nq={q}")
    stat(A, "A: c_vs_prevc  (close-to-close only)")
    stat(B, "B: c_vs_prevmid (uses prev bar H/L)")
    stat(B & ~A, "B AND NOT A  (mid-only signals)")
    stat(A & ~B, "A AND NOT B  (close-only signals)")
    ov = (A & B & valid).sum() / max((A | B) & valid, np.array(1)).sum()
    print(f"  Jaccard overlap A vs B = {100*ov:.1f}%")

# overlap of the best pure-intrabar rule with the known dead rules
if s2:
    r = s2[0] if abs(s2[0]["z"]) else None
print("\nOverlap of best PURE-INTRABAR survivors with known/dead rules:")
for r in s2[:3]:
    cond = r["cond"] & valid
    n_all = int(cond.sum())
    print(f"\n  {r['rule']}   ({n_all/(N/BARS_PER_DAY):.1f} signals/day)")
    for kn, kc in known.items():
        print(f"      {kn:<16} {100*(cond & kc).sum()/max(n_all,1):5.1f}%")
    print(f"      {'clspos24>q80':<16} "
          f"{100*(cond & (np.nan_to_num(f['clspos24'],nan=-1) > float(np.quantile(f['clspos24'][tr_mask][np.isfinite(f['clspos24'][tr_mask])],0.80)))).sum()/max(n_all,1):5.1f}%"
          "   <-- overlap with the stage-1 range-position edge")

