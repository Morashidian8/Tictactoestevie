#!/usr/bin/env python3
"""
BTC 5m — MARKET REGIME AND TREND REVERSAL study.

Question: can we know in advance whether the market is in a state where fading
(mean reversion) works, and can we call the turn?

Protocol:
  - target = sign(close[i+1] - close[i]) (and close[i+k]-close[i] for horizons)
  - chronological 70/30 split; everything chosen on TRAIN, TEST reported apart
  - min 300 train occurrences
  - Bonferroni over K = every variant evaluated, |z| >= sqrt(2 ln K)
  - below-50% is an edge too (rank by |z|)
  - every reported finding broken into 6 chronological blocks (drift check)

Run:  python3 research/btc5m/agent_regime.py
"""
import gzip
import csv
import math
import datetime as dt
from collections import OrderedDict

import numpy as np

CSV = "research/btc5m/btc5m.csv.gz"
MIN_N = 300


# --------------------------------------------------------------------------
# data
# --------------------------------------------------------------------------
def load():
    ts, o, h, l, c, v = [], [], [], [], [], []
    with gzip.open(CSV, "rt") as f:
        rd = csv.reader(f)
        next(rd)
        for row in rd:
            ts.append(int(row[0]))
            o.append(float(row[2]))
            h.append(float(row[3]))
            l.append(float(row[4]))
            c.append(float(row[5]))
            v.append(float(row[6]))
    return (np.array(ts, dtype=np.int64), np.array(o), np.array(h),
            np.array(l), np.array(c), np.array(v))


def roll(a, w):
    """sliding windows ending at index i (length w); rows 0..w-2 invalid."""
    sw = np.lib.stride_tricks.sliding_window_view(a, w)
    out = np.full((a.size, w), np.nan)
    out[w - 1:] = sw
    return out


def roll_stat(a, w, fn):
    out = np.full(a.size, np.nan)
    sw = np.lib.stride_tricks.sliding_window_view(a, w)
    out[w - 1:] = fn(sw, axis=1)
    return out


# --------------------------------------------------------------------------
# stats helpers
# --------------------------------------------------------------------------
def zscore(k, n, p0=0.5):
    if n == 0:
        return 0.0
    p = k / n
    return (p - p0) / math.sqrt(p0 * (1 - p0) / n)


class KCounter:
    def __init__(self):
        self.k = 0

    def bump(self, m=1):
        self.k += m


K = KCounter()


# --------------------------------------------------------------------------
# feature construction
# --------------------------------------------------------------------------
def build():
    ts, o, h, l, c, v = load()
    n = c.size
    r = np.full(n, np.nan)
    r[1:] = c[1:] - c[:-1]
    absr = np.abs(r)
    ret = np.full(n, np.nan)
    ret[1:] = c[1:] / c[:-1] - 1.0

    F = {}
    F["ts"] = ts
    F["o"], F["h"], F["l"], F["c"], F["v"] = o, h, l, c, v
    F["r"], F["absr"], F["ret"] = r, absr, ret

    # ---- median abs move over last 100 candles (ending at i) ----
    ar = np.nan_to_num(absr, nan=0.0)
    F["medabs100"] = roll_stat(ar, 100, np.median)

    # ---- realised vol ----
    rr = np.nan_to_num(ret, nan=0.0)
    F["vol20"] = roll_stat(rr, 20, np.std)
    F["vol100"] = roll_stat(rr, 100, np.std)
    F["volratio"] = F["vol20"] / np.where(F["vol100"] > 0, F["vol100"], np.nan)

    # vol percentile: rank of vol20 within trailing 500 values of vol20
    v20 = np.nan_to_num(F["vol20"], nan=0.0)
    w = 500
    sw = np.lib.stride_tricks.sliding_window_view(v20, w)
    pct = np.full(n, np.nan)
    pct[w - 1:] = (sw < v20[w - 1:, None]).sum(axis=1) / float(w)
    F["volpct"] = pct

    # ---- efficiency ratio (Kaufman) over 20 / 50 ----
    for L in (20, 50):
        net = np.full(n, np.nan)
        net[L:] = np.abs(c[L:] - c[:-L])
        tot = roll_stat(ar, L, np.sum)
        F[f"er{L}"] = net / np.where(tot > 0, tot, np.nan)

    # ---- ADX(14), Wilder ----
    tr = np.full(n, np.nan)
    tr[1:] = np.maximum.reduce([h[1:] - l[1:],
                                np.abs(h[1:] - c[:-1]),
                                np.abs(l[1:] - c[:-1])])
    up = np.full(n, 0.0)
    dn = np.full(n, 0.0)
    up[1:] = h[1:] - h[:-1]
    dn[1:] = l[:-1] - l[1:]
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    ndm = np.where((dn > up) & (dn > 0), dn, 0.0)
    p = 14
    trs = np.zeros(n)
    pds = np.zeros(n)
    nds = np.zeros(n)
    trn = np.nan_to_num(tr, nan=0.0)
    # Wilder smoothing (recursive)
    acc_tr = acc_p = acc_n = 0.0
    for i in range(1, n):
        if i <= p:
            acc_tr += trn[i]
            acc_p += pdm[i]
            acc_n += ndm[i]
        else:
            acc_tr = acc_tr - acc_tr / p + trn[i]
            acc_p = acc_p - acc_p / p + pdm[i]
            acc_n = acc_n - acc_n / p + ndm[i]
        trs[i], pds[i], nds[i] = acc_tr, acc_p, acc_n
    with np.errstate(invalid="ignore", divide="ignore"):
        pdi = 100.0 * pds / np.where(trs > 0, trs, np.nan)
        ndi = 100.0 * nds / np.where(trs > 0, trs, np.nan)
        dx = 100.0 * np.abs(pdi - ndi) / np.where((pdi + ndi) > 0, pdi + ndi, np.nan)
    dx = np.nan_to_num(dx, nan=0.0)
    adx = np.full(n, np.nan)
    acc = 0.0
    start = 2 * p
    for i in range(1, n):
        if i <= start:
            acc += dx[i]
            if i == start:
                adx[i] = acc / start
        else:
            adx[i] = adx[i - 1] + (dx[i] - adx[i - 1]) / p
    F["adx"] = adx

    # ---- lag-1 autocorrelation of last 20 returns ----
    W = roll(rr, 21)  # returns r[i-20..i]
    a1 = W[:, 1:]     # r[i-19..i]
    a0 = W[:, :-1]    # r[i-20..i-1]
    m1 = a1.mean(axis=1, keepdims=True)
    m0 = a0.mean(axis=1, keepdims=True)
    num = ((a1 - m1) * (a0 - m0)).sum(axis=1)
    den = np.sqrt(((a1 - m1) ** 2).sum(axis=1) * ((a0 - m0) ** 2).sum(axis=1))
    with np.errstate(invalid="ignore", divide="ignore"):
        F["ac20"] = np.where(den > 0, num / den, np.nan)

    # ---- Hurst-like: log(range/std)/log(n) over 50 (rescaled range, crude) ----
    Wc = roll(np.nan_to_num(rr, nan=0.0), 50)
    dev = Wc - Wc.mean(axis=1, keepdims=True)
    cum = np.cumsum(dev, axis=1)
    R = cum.max(axis=1) - cum.min(axis=1)
    S = Wc.std(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        F["hurst50"] = np.where(S > 0, np.log(R / S) / math.log(50), np.nan)

    # ---- run length of same-direction candles ending at i ----
    sgn = np.sign(np.nan_to_num(r, nan=0.0))
    runlen = np.zeros(n, dtype=np.int32)
    cur = 0
    prev = 0.0
    for i in range(n):
        s = sgn[i]
        if s == 0:
            cur = 0
        elif s == prev:
            cur += 1
        else:
            cur = 1
        runlen[i] = cur
        prev = s
    F["sgn"] = sgn
    F["runlen"] = runlen

    # ---- 20-candle close extremes (prior 20, exclusive of i) ----
    prevmax = np.full(n, np.nan)
    prevmin = np.full(n, np.nan)
    prevmax[20:] = roll_stat(c, 20, np.max)[19:-1]
    prevmin[20:] = roll_stat(c, 20, np.min)[19:-1]
    F["prevmax20"], F["prevmin20"] = prevmax, prevmin
    hmax = np.full(n, np.nan)
    lmin = np.full(n, np.nan)
    hmax[20:] = roll_stat(h, 20, np.max)[19:-1]
    lmin[20:] = roll_stat(l, 20, np.min)[19:-1]
    F["prevhigh20"], F["prevlow20"] = hmax, lmin

    # ---- calendar ----
    hours = np.zeros(n, dtype=np.int32)
    dows = np.zeros(n, dtype=np.int32)
    for i in range(n):
        d = dt.datetime.utcfromtimestamp(int(ts[i]))
        hours[i] = d.hour
        dows[i] = d.weekday()
    F["hour"], F["dow"] = hours, dows
    return F


# --------------------------------------------------------------------------
# signals (direction to FADE). sig[i] = +1 means the market just went UP and
# the fade bet is DOWN for candle i+1; -1 means fade bet is UP.
# --------------------------------------------------------------------------
def build_signals(F):
    n = F["c"].size
    c, r, med = F["c"], F["r"], F["medabs100"]
    S = OrderedDict()

    # PREV: unconditional fade of the last candle
    S["PREV"] = F["sgn"].copy()

    # A: close breaks 20-candle close extreme AND vol20/vol100 >= 0.8884
    a = np.zeros(n)
    brk_up = c > F["prevmax20"]
    brk_dn = c < F["prevmin20"]
    ok = F["volratio"] >= 0.8884
    a[np.nan_to_num(brk_up & ok, nan=False)] = 1.0
    a[np.nan_to_num(brk_dn & ok, nan=False)] = -1.0
    S["A"] = a

    # B: |c[i]-c[i-4]| >= 5.7 * medabs100
    b = np.zeros(n)
    d4 = np.full(n, np.nan)
    d4[4:] = c[4:] - c[:-4]
    big = np.abs(d4) >= 5.7 * med
    b[np.nan_to_num(big & (d4 > 0), nan=False)] = 1.0
    b[np.nan_to_num(big & (d4 < 0), nan=False)] = -1.0
    S["B"] = b

    # C: three same-direction moves, last one > 2x medabs100
    cc = np.zeros(n)
    s = F["sgn"]
    three = np.zeros(n, dtype=bool)
    three[2:] = (s[2:] != 0) & (s[2:] == s[1:-1]) & (s[2:] == s[:-2])
    bigl = np.abs(r) > 2.0 * med
    m = np.nan_to_num(three & bigl, nan=False)
    cc[m] = s[m]
    S["C"] = cc
    return S


# --------------------------------------------------------------------------
# evaluation
# --------------------------------------------------------------------------
def fade_correct(F, k=1):
    """correct[i] for fading a +1 signal at i over horizon k (c[i+k] < c[i])."""
    c = F["c"]
    n = c.size
    fwd = np.full(n, np.nan)
    fwd[:n - k] = c[k:] - c[:n - k]
    return fwd  # >0 means up; fade(+1) correct when fwd < 0


def eval_mask(F, sig, mask, fwd):
    """returns (n, wins) for fading sig over rows where mask & sig!=0."""
    m = mask & (sig != 0) & ~np.isnan(fwd)
    if not m.any():
        return 0, 0
    s = sig[m]
    f = fwd[m]
    wins = int((((s > 0) & (f < 0)) | ((s < 0) & (f > 0))).sum())
    return int(m.sum()), wins


def contrast(F, sig, mask, fwd, period, nstrata=8):
    """Block-stratified difference: fade accuracy INSIDE the regime minus
    OUTSIDE it, pooled by inverse variance across chronological strata within
    `period`. Because every stratum compares in vs out over the SAME calendar
    window, the dataset-wide drift in the fade rate cannot produce a signal.
    Returns (pooled_diff, z, n_in, n_out)."""
    n = F["c"].size
    ids = np.flatnonzero(period)
    if ids.size == 0:
        return float("nan"), 0.0, 0, 0
    edges = np.linspace(ids[0], ids[-1] + 1, nstrata + 1).astype(int)
    num = 0.0
    den = 0.0
    tot_in = tot_out = 0
    for j in range(nstrata):
        sm = np.zeros(n, dtype=bool)
        sm[edges[j]:edges[j + 1]] = True
        sm &= period
        n1, w1 = eval_mask(F, sig, sm & mask, fwd)
        n0, w0 = eval_mask(F, sig, sm & ~mask, fwd)
        tot_in += n1
        tot_out += n0
        if n1 < 20 or n0 < 20:
            continue
        p1, p0 = w1 / n1, w0 / n0
        var = p1 * (1 - p1) / n1 + p0 * (1 - p0) / n0
        if var <= 0:
            continue
        num += (p1 - p0) / var
        den += 1.0 / var
    if den == 0:
        return float("nan"), 0.0, tot_in, tot_out
    d = num / den
    return d, d * math.sqrt(den), tot_in, tot_out


def blocks6(F, sig, mask, fwd, nblocks=6):
    n = F["c"].size
    edges = np.linspace(0, n, nblocks + 1).astype(int)
    out = []
    for j in range(nblocks):
        bm = np.zeros(n, dtype=bool)
        bm[edges[j]:edges[j + 1]] = True
        nn, ww = eval_mask(F, sig, mask & bm, fwd)
        out.append((nn, ww / nn if nn else float("nan")))
    return out


def fmt_blocks(bl):
    return " ".join(f"{p * 100:5.1f}" if p == p else "  n/a" for _, p in bl)


# --------------------------------------------------------------------------
# regime definitions -> dict name -> list of (label, boolean mask)
# thresholds computed on TRAIN only
# --------------------------------------------------------------------------
def quartile_buckets(F, key, tr_mask, labels=("Q1", "Q2", "Q3", "Q4")):
    x = F[key]
    valid = ~np.isnan(x) & tr_mask
    qs = np.quantile(x[valid], [0.25, 0.5, 0.75])
    masks = []
    v = ~np.isnan(x)
    masks.append((f"{key} {labels[0]} (<{qs[0]:.4g})", v & (x < qs[0])))
    masks.append((f"{key} {labels[1]}", v & (x >= qs[0]) & (x < qs[1])))
    masks.append((f"{key} {labels[2]}", v & (x >= qs[1]) & (x < qs[2])))
    masks.append((f"{key} {labels[3]} (>={qs[2]:.4g})", v & (x >= qs[2])))
    return masks, qs


def main():
    F = build()
    n = F["c"].size
    split = int(n * 0.70)
    idx = np.arange(n)
    TR = idx < split
    TE = idx >= split
    warm = idx >= 600  # feature warm-up
    TR = TR & warm
    TE = TE & warm

    S = build_signals(F)
    fwd1 = fade_correct(F, 1)

    print("=" * 100)
    print(f"rows={n}  train={TR.sum()}  test={TE.sum()}  "
          f"split at {dt.datetime.utcfromtimestamp(int(F['ts'][split]))}")
    ties = int((fwd1[:-1] == 0).sum())
    print(f"next-candle exact ties: {ties} ({ties / n * 100:.2f}%) — counted as losses")
    allm = np.ones(n, dtype=bool)
    for name, sig in S.items():
        nn, ww = eval_mask(F, sig, TR, fwd1)
        nt, wt = eval_mask(F, sig, TE, fwd1)
        print(f"  baseline fade {name:5s}: train {ww/nn*100:5.2f}% n={nn:7d} "
              f"z={zscore(ww,nn):6.2f} | test {wt/nt*100:5.2f}% n={nt:6d} z={zscore(wt,nt):6.2f}")

    # ---------------- regime bucket universe ----------------
    regimes = OrderedDict()
    for key in ("er20", "er50", "adx", "volpct", "volratio", "ac20", "hurst50"):
        masks, qs = quartile_buckets(F, key, TR)
        regimes[key] = masks

    # time of day: 6 x 4h blocks
    tod = []
    for j in range(6):
        lo, hi = j * 4, (j + 1) * 4
        tod.append((f"hour {lo:02d}-{hi:02d}", (F["hour"] >= lo) & (F["hour"] < hi)))
    regimes["tod"] = tod

    dowm = []
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for j, nm in enumerate(names):
        dowm.append((f"dow {nm}", F["dow"] == j))
    dowm.append(("dow weekend", (F["dow"] >= 5)))
    dowm.append(("dow weekday", (F["dow"] < 5)))
    regimes["dow"] = dowm

    # run length regime (exhaustion)
    rl = []
    for lab, m in (("runlen 1", F["runlen"] == 1), ("runlen 2", F["runlen"] == 2),
                   ("runlen 3", F["runlen"] == 3), ("runlen 4", F["runlen"] == 4),
                   ("runlen >=5", F["runlen"] >= 5),
                   ("runlen >=4", F["runlen"] >= 4),
                   ("runlen >=3", F["runlen"] >= 3)):
        rl.append((lab, m))
    regimes["runlen"] = rl

    # ---------------- pass 1: every (regime bucket x signal) on TRAIN ----------
    rows = []
    for rname, masks in regimes.items():
        for lab, m in masks:
            for sname, sig in S.items():
                nn, ww = eval_mask(F, sig, TR & m, fwd1)
                K.bump()
                if nn < MIN_N:
                    continue
                rows.append({
                    "regime": rname, "bucket": lab, "sig": sname,
                    "n": nn, "acc": ww / nn, "z": zscore(ww, nn),
                    "mask": m,
                })

    # ---------------- exhaustion signature variants ----------------
    exh = OrderedDict()
    c, h, l, r, med = F["c"], F["h"], F["l"], F["r"], F["medabs100"]
    absr = F["absr"]
    # decelerating run: 3 same direction, each smaller than the last
    dec = np.zeros(n)
    s = F["sgn"]
    same3 = np.zeros(n, dtype=bool)
    same3[2:] = (s[2:] != 0) & (s[2:] == s[1:-1]) & (s[2:] == s[:-2])
    slower = np.zeros(n, dtype=bool)
    slower[2:] = (absr[2:] < absr[1:-1]) & (absr[1:-1] < absr[:-2])
    mm = same3 & slower
    dec[mm] = s[mm]
    exh["EXH_decel3"] = dec

    # failed new extreme: high makes new 20-bar high but close below prior close
    # (new 20-bar high but candle closes down = failed upside extreme -> bet down)
    fx = np.zeros(n)
    fh = np.nan_to_num((h > F["prevhigh20"]) & (r < 0), nan=False)
    fl = np.nan_to_num((l < F["prevlow20"]) & (r > 0), nan=False)
    fx[fh] = 1.0
    fx[fl] = -1.0
    exh["EXH_failext"] = fx

    # long run losing momentum: runlen>=4 and |r| < |r[-1]|
    lm = np.zeros(n)
    dd = np.zeros(n, dtype=bool)
    dd[1:] = absr[1:] < absr[:-1]
    mm = (F["runlen"] >= 4) & dd
    lm[mm] = s[mm]
    exh["EXH_run4slow"] = lm

    # exhaustion: runlen>=3 AND cumulative run move >= 3x medabs100
    cum = np.zeros(n)
    acc = 0.0
    prev = 0.0
    for i in range(n):
        if s[i] == 0:
            acc = 0.0
        elif s[i] == prev:
            acc += r[i]
        else:
            acc = r[i]
        cum[i] = acc
        prev = s[i]
    F["runcum"] = cum
    ex = np.zeros(n)
    mm = np.nan_to_num((F["runlen"] >= 3) & (np.abs(cum) >= 3.0 * med), nan=False)
    ex[mm] = s[mm]
    exh["EXH_run3big"] = ex

    S.update(exh)
    print("\n--- exhaustion signals, unconditional (train/test) ---")
    for name in exh:
        sig = S[name]
        nn, ww = eval_mask(F, sig, TR, fwd1)
        nt, wt = eval_mask(F, sig, TE, fwd1)
        K.bump()
        if nn >= MIN_N:
            print(f"  {name:16s} train {ww/nn*100:5.2f}% n={nn:6d} z={zscore(ww,nn):6.2f}"
                  f" | test {wt/nt*100:5.2f}% n={nt:5d} z={zscore(wt,nt):6.2f}"
                  f" | blocks {fmt_blocks(blocks6(F, sig, warm, fwd1))}")

    # exhaustion x regime
    for rname, masks in regimes.items():
        for lab, m in masks:
            for sname in exh:
                sig = S[sname]
                nn, ww = eval_mask(F, sig, TR & m, fwd1)
                K.bump()
                if nn < MIN_N:
                    continue
                rows.append({"regime": rname, "bucket": lab, "sig": sname,
                             "n": nn, "acc": ww / nn, "z": zscore(ww, nn), "mask": m})

    # ---------------- regime persistence ----------------
    # how long has ER20 been in the "ranging" (bottom-quartile) state?
    er = F["er20"]
    q1 = np.quantile(er[~np.isnan(er) & TR], 0.25)
    rang = np.nan_to_num(er < q1, nan=False)
    pers = np.zeros(n, dtype=np.int32)
    cnt = 0
    for i in range(n):
        cnt = cnt + 1 if rang[i] else 0
        pers[i] = cnt
    F["persist"] = pers
    pers_masks = [("persist 1-2", (pers >= 1) & (pers <= 2)),
                  ("persist 3-5", (pers >= 3) & (pers <= 5)),
                  ("persist 6-15", (pers >= 6) & (pers <= 15)),
                  ("persist >=16", pers >= 16)]
    regimes["persist"] = pers_masks
    for lab, m in pers_masks:
        for sname, sig in S.items():
            nn, ww = eval_mask(F, sig, TR & m, fwd1)
            K.bump()
            if nn < MIN_N:
                continue
            rows.append({"regime": "persist", "bucket": lab, "sig": sname,
                         "n": nn, "acc": ww / nn, "z": zscore(ww, nn), "mask": m})

    # ---------------- pairwise regime combos on the strongest signals -------
    combo_keys = [("er20", 0), ("er20", 3), ("volpct", 0), ("volpct", 3),
                  ("volratio", 0), ("volratio", 3), ("adx", 0), ("adx", 3),
                  ("ac20", 0), ("ac20", 3)]
    for (k1, i1) in combo_keys:
        for (k2, i2) in combo_keys:
            if k1 >= k2:
                continue
            l1, m1 = regimes[k1][i1]
            l2, m2 = regimes[k2][i2]
            m = m1 & m2
            for sname, sig in S.items():
                nn, ww = eval_mask(F, sig, TR & m, fwd1)
                K.bump()
                if nn < MIN_N:
                    continue
                rows.append({"regime": "combo", "bucket": f"{l1} & {l2}",
                             "sig": sname, "n": nn, "acc": ww / nn,
                             "z": zscore(ww, nn), "mask": m})

    # ---------------- report ----------------
    thr = math.sqrt(2 * math.log(K.k))
    print("\n" + "=" * 100)
    print(f"K (variants evaluated on train) = {K.k};  Bonferroni |z| >= sqrt(2 ln K) = {thr:.3f}")
    print("=" * 100)

    rows.sort(key=lambda d: -abs(d["z"]))
    print("\nTOP 25 train candidates by |z| (train-only selection)")
    hdr = (f"{'regime':9s} {'bucket':34s} {'sig':13s} {'n':>7s} {'train%':>7s} "
           f"{'z':>6s} {'test%':>7s} {'nTest':>6s} {'zTest':>6s}  blocks 1..6")
    print(hdr)
    print("-" * len(hdr) + "-" * 40)
    surv = []
    for d in rows[:25]:
        nt, wt = eval_mask(F, S[d["sig"]], TE & d["mask"], fwd1)
        te = wt / nt if nt else float("nan")
        bl = blocks6(F, S[d["sig"]], warm & d["mask"], fwd1)
        star = "*" if abs(d["z"]) >= thr else " "
        print(f"{d['regime']:9s} {d['bucket']:34s} {d['sig']:13s} {d['n']:7d} "
              f"{d['acc']*100:7.2f} {d['z']:6.2f} {te*100:7.2f} {nt:6d} "
              f"{zscore(wt,nt):6.2f}{star} {fmt_blocks(bl)}")
        if abs(d["z"]) >= thr:
            surv.append(d)

    # ------------- DRIFT-IMMUNE CONTRAST: does the regime matter? ----------
    print("\n" + "=" * 100)
    print("REGIME CONTRAST (block-stratified, drift-immune): fade accuracy INSIDE")
    print("the regime minus OUTSIDE it, for the same signal, same calendar windows.")
    print("This is the only test that can say a regime filter WORKS rather than")
    print("that it happens to fire in a friendlier part of the sample.")
    print("=" * 100)
    crows = []
    for rname, masks in regimes.items():
        for lab, m in masks:
            for sname, sig in S.items():
                nn, _ = eval_mask(F, sig, TR & m, fwd1)
                if nn < MIN_N:
                    continue
                d, z, ni, no = contrast(F, sig, m, fwd1, TR)
                K.bump()
                if d != d:
                    continue
                crows.append({"regime": rname, "bucket": lab, "sig": sname,
                              "d": d, "z": z, "n": ni, "mask": m})
    crows.sort(key=lambda r: -abs(r["z"]))
    thr_c = math.sqrt(2 * math.log(max(K.k, 2)))
    hdr = (f"{'regime':9s} {'bucket':34s} {'sig':13s} {'nIn':>7s} "
           f"{'trainDiff':>9s} {'z':>6s} | {'testDiff':>8s} {'zTest':>6s} {'nInTest':>7s}")
    print(hdr)
    print("-" * len(hdr))
    csurv = []
    for r in crows[:22]:
        dt_, zt, nit, _ = contrast(F, S[r["sig"]], r["mask"], fwd1, TE)
        star = "*" if abs(r["z"]) >= thr_c else " "
        print(f"{r['regime']:9s} {r['bucket']:34s} {r['sig']:13s} {r['n']:7d} "
              f"{r['d']*100:+9.2f} {r['z']:6.2f}{star}| {dt_*100:+8.2f} {zt:6.2f} {nit:7d}")
        if abs(r["z"]) >= thr_c:
            csurv.append((r, dt_, zt))
    print(f"(contrast Bonferroni threshold at this point: |z| >= {thr_c:.3f})")
    print("\nCONTRASTS THAT SURVIVE TRAIN BONFERRONI *AND* REPLICATE ON TEST "
          "(same sign, |zTest| >= 1.96):")
    any_rep = False
    for r, dt_, zt in csurv:
        if dt_ == dt_ and math.copysign(1, dt_) == math.copysign(1, r["d"]) and abs(zt) >= 1.96:
            any_rep = True
            print(f"  {r['regime']}/{r['bucket']} + {r['sig']}: "
                  f"train {r['d']*100:+.2f}pp (z={r['z']:.2f}), "
                  f"test {dt_*100:+.2f}pp (z={zt:.2f})")
    if not any_rep:
        print("  NONE.")

    # ---------------- the requested regime x rule matrix ----------------
    print("\n" + "=" * 100)
    print("REGIME x RULE MATRIX  (fade accuracy; train | test | 6 chronological blocks)")
    print("=" * 100)
    show_regimes = ["er20", "adx", "volpct", "volratio", "ac20", "tod", "dow",
                    "runlen", "persist"]
    for rname in show_regimes:
        print(f"\n[{rname}]")
        print(f"  {'bucket':34s} {'rule':6s} {'nTrain':>7s} {'train%':>7s} {'z':>6s} "
              f"{'nTest':>6s} {'test%':>7s} {'zTest':>6s}  blocks 1..6")
        for lab, m in regimes[rname]:
            for sname in ("PREV", "A", "B", "C"):
                sig = S[sname]
                nn, ww = eval_mask(F, sig, TR & m, fwd1)
                if nn < MIN_N:
                    continue
                nt, wt = eval_mask(F, sig, TE & m, fwd1)
                bl = blocks6(F, sig, warm & m, fwd1)
                print(f"  {lab:34s} {sname:6s} {nn:7d} {ww/nn*100:7.2f} "
                      f"{zscore(ww,nn):6.2f} {nt:6d} "
                      f"{(wt/nt*100 if nt else float('nan')):7.2f} "
                      f"{zscore(wt,nt):6.2f}  {fmt_blocks(bl)}")

    # ---------------- horizon table ----------------
    print("\n" + "=" * 100)
    print("HORIZON: fade accuracy at k candles ahead (sign of c[i+k]-c[i])")
    print("=" * 100)
    print(f"  {'signal':16s} {'k':>2s} {'nTrain':>7s} {'train%':>7s} {'z':>6s} "
          f"{'nTest':>6s} {'test%':>7s} {'zTest':>6s}  blocks 1..6")
    hs = ["PREV", "A", "B", "C", "EXH_decel3", "EXH_run3big", "EXH_run4slow",
          "EXH_failext"]
    for sname in hs:
        sig = S[sname]
        for k in (1, 2, 3, 5):
            fwdk = fade_correct(F, k)
            nn, ww = eval_mask(F, sig, TR, fwdk)
            nt, wt = eval_mask(F, sig, TE, fwdk)
            K.bump()
            if nn < MIN_N:
                continue
            bl = blocks6(F, sig, warm, fwdk)
            print(f"  {sname:16s} {k:2d} {nn:7d} {ww/nn*100:7.2f} {zscore(ww,nn):6.2f} "
                  f"{nt:6d} {wt/nt*100:7.2f} {zscore(wt,nt):6.2f}  {fmt_blocks(bl)}")

    # best regime filter applied to the horizon question
    print("\n" + "=" * 100)
    print("BEST-FILTER HORIZON (top surviving filter applied to each rule)")
    print("=" * 100)
    if surv:
        best = surv[0]
        print(f"  filter = {best['regime']} / {best['bucket']}, signal {best['sig']}")
        for k in (1, 2, 3, 5):
            fwdk = fade_correct(F, k)
            nn, ww = eval_mask(F, S[best["sig"]], TR & best["mask"], fwdk)
            nt, wt = eval_mask(F, S[best["sig"]], TE & best["mask"], fwdk)
            print(f"    k={k}  train {ww/nn*100:6.2f}% n={nn:6d} z={zscore(ww,nn):6.2f}"
                  f" | test {wt/nt*100:6.2f}% n={nt:5d} z={zscore(wt,nt):6.2f}")
    else:
        print("  (no filter survived Bonferroni on train)")

    # signals/day accounting for the headline candidates
    days = (F["ts"][-1] - F["ts"][0]) / 86400.0
    print("\n" + "=" * 100)
    print(f"SIGNAL FREQUENCY (dataset spans {days:.0f} days)")
    print("=" * 100)
    for d in rows[:12]:
        m = (S[d["sig"]] != 0) & d["mask"] & warm
        print(f"  {d['regime']:9s} {d['bucket']:34s} {d['sig']:13s} "
              f"{int(m.sum()):7d} signals = {m.sum()/days:6.2f}/day")

    # ---------------- calendar claim check ----------------
    print("\n" + "=" * 100)
    print("CALENDAR CLAIM CHECK — 'weekends score higher, Friday lowest'")
    print("drift-immune contrast of each calendar bucket vs all other candles")
    print("=" * 100)
    print(f"  {'bucket':16s} {'sig':6s} {'nIn':>7s} {'trainDiff':>9s} {'z':>6s} "
          f"{'testDiff':>8s} {'zTest':>6s}")
    for lab, m in regimes["dow"] + regimes["tod"]:
        for sname in ("PREV", "A", "B", "C"):
            nn, _ = eval_mask(F, S[sname], TR & m, fwd1)
            if nn < MIN_N:
                continue
            d, z, ni, _ = contrast(F, S[sname], m, fwd1, TR)
            dte, zte, _, _ = contrast(F, S[sname], m, fwd1, TE)
            flag = "" if abs(z) < 2 else "  <-"
            print(f"  {lab:16s} {sname:6s} {ni:7d} {d*100:+9.2f} {z:6.2f} "
                  f"{dte*100:+8.2f} {zte:6.2f}{flag}")

    # ---------------- headline filter: run length ----------------
    print("\n" + "=" * 100)
    print("HEADLINE FILTER — run length of consecutive same-direction closes")
    print("  runlen[i] = number of consecutive candles with the same sign of")
    print("  close[j]-close[j-1] ending at i.  Rule: if runlen >= 4, bet AGAINST")
    print("  the run for candle i+1.")
    print("=" * 100)
    print(f"  {'variant':38s} {'nTrain':>7s} {'train%':>7s} {'z':>6s} {'nTest':>6s} "
          f"{'test%':>7s} {'zTest':>6s} {'sig/day':>8s}  blocks 1..6")
    variants = [
        ("all candles (fade last candle)", np.ones(n, dtype=bool)),
        ("runlen == 1", F["runlen"] == 1),
        ("runlen == 2", F["runlen"] == 2),
        ("runlen == 3", F["runlen"] == 3),
        ("runlen >= 4", F["runlen"] >= 4),
        ("runlen >= 5", F["runlen"] >= 5),
        ("runlen >= 6", F["runlen"] >= 6),
        ("runlen >= 4 & volpct Q4", (F["runlen"] >= 4) & (F["volpct"] >= np.quantile(F["volpct"][~np.isnan(F["volpct"]) & TR], .75))),
        ("runlen >= 4 & volpct Q1", (F["runlen"] >= 4) & (F["volpct"] < np.quantile(F["volpct"][~np.isnan(F["volpct"]) & TR], .25))),
        ("runlen >= 4 & er20 Q4", (F["runlen"] >= 4) & (F["er20"] >= np.quantile(F["er20"][~np.isnan(F["er20"]) & TR], .75))),
        ("runlen >= 4 & runcum >= 3x med", np.nan_to_num((F["runlen"] >= 4) & (np.abs(F["runcum"]) >= 3 * F["medabs100"]), nan=False)),
    ]
    for lab, m in variants:
        sig = S["PREV"]
        nn, ww = eval_mask(F, sig, TR & m, fwd1)
        nt, wt = eval_mask(F, sig, TE & m, fwd1)
        if nn < MIN_N:
            continue
        cnt = int(((sig != 0) & m & warm).sum())
        bl = blocks6(F, sig, warm & m, fwd1)
        print(f"  {lab:38s} {nn:7d} {ww/nn*100:7.2f} {zscore(ww,nn):6.2f} {nt:6d} "
              f"{wt/nt*100:7.2f} {zscore(wt,nt):6.2f} {cnt/days:8.1f}  {fmt_blocks(bl)}")

    print("\n  horizon for `runlen >= 4, fade the run`:")
    m4 = F["runlen"] >= 4
    for k in (1, 2, 3, 5):
        fwdk = fade_correct(F, k)
        nn, ww = eval_mask(F, S["PREV"], TR & m4, fwdk)
        nt, wt = eval_mask(F, S["PREV"], TE & m4, fwdk)
        d, z, _, _ = contrast(F, S["PREV"], m4, fwdk, TR)
        dte, zte, _, _ = contrast(F, S["PREV"], m4, fwdk, TE)
        print(f"    k={k}  train {ww/nn*100:6.2f}% (z={zscore(ww,nn):5.2f}) | "
              f"test {wt/nt*100:6.2f}% (z={zscore(wt,nt):5.2f}) | "
              f"contrast vs rest: train {d*100:+.2f}pp z={z:5.2f}, test {dte*100:+.2f}pp z={zte:5.2f}")
    dte, zte, _, _ = contrast(F, S["PREV"], m4, fwd1, TE)
    d, z, _, _ = contrast(F, S["PREV"], m4, fwd1, TR)
    print(f"\n  drift-immune contrast (runlen>=4 vs rest), k=1: "
          f"train {d*100:+.2f}pp z={z:.2f} | test {dte*100:+.2f}pp z={zte:.2f}")

    print(f"\nFINAL K = {K.k}, Bonferroni threshold |z| >= {math.sqrt(2*math.log(K.k)):.3f}")
    n_surv_test = 0
    for d in surv:
        nt, wt = eval_mask(F, S[d["sig"]], TE & d["mask"], fwd1)
        if nt >= 100 and abs(zscore(wt, nt)) >= 1.96 and \
           math.copysign(1, wt / nt - 0.5) == math.copysign(1, d["acc"] - 0.5):
            n_surv_test += 1
    print(f"train survivors: {len(surv)};  of those, confirmed on test at p<0.05 "
          f"same direction: {n_surv_test}")


if __name__ == "__main__":
    main()
