#!/usr/bin/env python3
"""
Classical technical indicators vs the next 5-minute BTC candle.

Protocol
--------
* target      : sign(close[i+1] - close[i]); flat candles dropped entirely.
* split       : chronological 70/30. Everything is CHOSEN on train.
* min support : 300 occurrences in train.
* correction  : Bonferroni over every variant actually evaluated,
                threshold |z| >= sqrt(2*ln K).
* direction   : each rule is scored as "predict up"; a rate significantly
                BELOW 50% is an edge too (bet the other way).  Ranking is by
                |z|, and the trading direction is fixed from TRAIN only.

Indicators are implemented from scratch (numpy is used for array plumbing
only, no TA library).

    python3 research/btc5m/agent_indicators.py
"""

import csv
import gzip
import math
import os
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as swv

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "btc5m.csv.gz")

# --------------------------------------------------------------------------
# data
# --------------------------------------------------------------------------


def load():
    o, h, l, c, v, iso = [], [], [], [], [], []
    with gzip.open(DATA, "rt") as f:
        for row in csv.DictReader(f):
            iso.append(row["iso"])
            o.append(float(row["o"]))
            h.append(float(row["h"]))
            l.append(float(row["l"]))
            c.append(float(row["c"]))
            v.append(float(row["v"]))
    return (np.array(o), np.array(h), np.array(l), np.array(c), np.array(v), iso)


O, H, L, C, V, ISO = load()
N = len(C)

# target: +1 next candle up, -1 down, 0 flat/undefined
TGT = np.zeros(N, dtype=np.int8)
TGT[:-1] = np.sign(C[1:] - C[:-1]).astype(np.int8)
VALID = TGT != 0

SPLIT = int(N * 0.70)
IS_TRAIN = np.zeros(N, dtype=bool)
IS_TRAIN[:SPLIT] = True
IS_TEST = ~IS_TRAIN
IS_TEST[-1] = False  # no label for the final candle

# --------------------------------------------------------------------------
# indicator primitives (hand-rolled)
# --------------------------------------------------------------------------

NAN = float("nan")


def _pad(vals, p):
    out = np.full(N, NAN)
    out[p - 1 :] = vals
    return out


def sma(x, p):
    cs = np.concatenate(([0.0], np.cumsum(x)))
    return _pad((cs[p:] - cs[:-p]) / p, p)


def rstd(x, p):
    cs = np.concatenate(([0.0], np.cumsum(x)))
    cs2 = np.concatenate(([0.0], np.cumsum(x * x)))
    m = (cs[p:] - cs[:-p]) / p
    m2 = (cs2[p:] - cs2[:-p]) / p
    return _pad(np.sqrt(np.maximum(m2 - m * m, 0.0)), p)


def ema(x, p, alpha=None):
    a = alpha if alpha is not None else 2.0 / (p + 1.0)
    out = np.empty(N)
    acc = x[0]
    for i in range(N):
        acc = a * x[i] + (1 - a) * acc
        out[i] = acc
    out[: p - 1] = NAN
    return out


def wilder(x, p):
    return ema(x, p, alpha=1.0 / p)


def rmax(x, p):
    return _pad(swv(x, p).max(axis=1), p)


def rmin(x, p):
    return _pad(swv(x, p).min(axis=1), p)


def rmedian(x, p):
    return _pad(np.median(swv(x, p), axis=1), p)


def shift(x, k):
    out = np.full(N, NAN)
    if k > 0:
        out[k:] = x[:-k]
    return out


# --- indicators ------------------------------------------------------------

_cache = {}


def cached(key, fn):
    if key not in _cache:
        _cache[key] = fn()
    return _cache[key]


def rsi(p):
    def build():
        d = np.zeros(N)
        d[1:] = C[1:] - C[:-1]
        up = wilder(np.maximum(d, 0.0), p)
        dn = wilder(np.maximum(-d, 0.0), p)
        with np.errstate(divide="ignore", invalid="ignore"):
            rs = up / dn
        r = 100.0 - 100.0 / (1.0 + rs)
        r[np.isnan(r)] = 50.0
        r[: 2 * p] = NAN
        return r

    return cached(("rsi", p), build)


def true_range():
    def build():
        pc = shift(C, 1)
        tr = np.maximum(H - L, np.maximum(np.abs(H - pc), np.abs(L - pc)))
        tr[0] = H[0] - L[0]
        return tr

    return cached(("tr",), build)


def atr(p):
    return cached(("atr", p), lambda: wilder(true_range(), p))


def stoch_k(p):
    def build():
        hh, ll = rmax(H, p), rmin(L, p)
        rng = hh - ll
        k = np.where(rng > 0, (C - ll) / np.where(rng > 0, rng, 1.0) * 100.0, 50.0)
        k[: p - 1] = NAN
        return k

    return cached(("stochk", p), build)


def cci(p):
    def build():
        tp = (H + L + C) / 3.0
        m = sma(tp, p)
        w = swv(tp, p)
        md = _pad(np.abs(w - w.mean(axis=1, keepdims=True)).mean(axis=1), p)
        with np.errstate(divide="ignore", invalid="ignore"):
            out = (tp - m) / (0.015 * md)
        out[~np.isfinite(out)] = 0.0
        out[: p - 1] = NAN
        return out

    return cached(("cci", p), build)


def willr(p):
    def build():
        hh, ll = rmax(H, p), rmin(L, p)
        rng = hh - ll
        w = np.where(rng > 0, -100.0 * (hh - C) / np.where(rng > 0, rng, 1.0), -50.0)
        w[: p - 1] = NAN
        return w

    return cached(("willr", p), build)


def roc(p):
    return cached(("roc", p), lambda: (C - shift(C, p)) / shift(C, p) * 100.0)


def rocz(p):
    """ROC normalised by its own rolling 100-bar stdev -> comparable units."""

    def build():
        r = roc(p)
        s = rstd(np.nan_to_num(r), 100)
        with np.errstate(divide="ignore", invalid="ignore"):
            z = r / s
        z[~np.isfinite(z)] = NAN
        return z

    return cached(("rocz", p), build)


def macd(f, s, sg):
    def build():
        line = ema(C, f) - ema(C, s)
        sig = ema(np.nan_to_num(line), sg)
        line[: s + sg] = NAN
        sig[: s + sg] = NAN
        return line, sig, line - sig

    return cached(("macd", f, s, sg), build)


def bb(p, k):
    def build():
        m, sd = sma(C, p), rstd(C, p)
        up, lo = m + k * sd, m - k * sd
        width = np.where(m > 0, (up - lo) / m, NAN)
        with np.errstate(divide="ignore", invalid="ignore"):
            pctb = (C - lo) / (up - lo)
        pctb[~np.isfinite(pctb)] = NAN
        return m, up, lo, width, pctb

    return cached(("bb", p, k), build)


def cross_up(a, b):
    """a crosses above b on this bar."""
    prev_a, prev_b = shift(a, 1), shift(b, 1)
    return (a > b) & (prev_a <= prev_b)


def cross_dn(a, b):
    prev_a, prev_b = shift(a, 1), shift(b, 1)
    return (a < b) & (prev_a >= prev_b)


def ok(*arrs):
    """finite-everywhere mask"""
    m = np.ones(N, dtype=bool)
    for a in arrs:
        m &= np.isfinite(a)
    return m


def train_q(x, q):
    """quantile of an indicator computed on TRAIN ONLY (no look-ahead)."""
    v = x[IS_TRAIN & np.isfinite(x)]
    return float(np.quantile(v, q))


# --------------------------------------------------------------------------
# rule generation.  every rule is a signed signal array in {-1,0,+1}
# meaning "predicted direction of the next candle".  One-sided masks are
# emitted as +1 (predict up); a train rate below 50% simply flips them.
# --------------------------------------------------------------------------


def one(mask):
    s = np.zeros(N, dtype=np.int8)
    s[mask] = 1
    return s


def sym(bull_mask, bear_mask):
    """bull_mask = stretched to the upside.  Emitted as *follow* (+1 on bull,
    -1 on bear); if train says <50% it becomes the fade."""
    s = np.zeros(N, dtype=np.int8)
    s[bull_mask] = 1
    s[bear_mask] = -1
    return s


BB_P = [10, 20, 30, 50]
BB_K = [1.5, 2.0, 2.5, 3.0]
RSI_P = [2, 3, 5, 7, 9, 14, 21, 28]
RSI_HI = [60, 65, 70, 75, 80, 85, 90]
ST_P = [5, 9, 14, 21]
MACD_P = [(12, 26, 9), (5, 35, 5), (8, 17, 9), (3, 10, 16), (19, 39, 9)]
MA_PAIRS = [(5, 10), (5, 20), (9, 21), (10, 20), (10, 50), (20, 50),
            (20, 100), (50, 100), (50, 200), (12, 26)]
DIST_MA = [10, 20, 50, 100, 200]
DIST_T = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0]
CCI_P = [10, 14, 20, 50]
CCI_T = [100, 150, 200, 250, 300]
WR_P = [7, 14, 21, 50]
WR_T = [5, 10, 15, 20]
ROC_P = [1, 2, 3, 5, 10, 20]
ROC_T = [1.5, 2.0, 2.5, 3.0, 4.0]


def rules():
    # ---- A. Bollinger Bands ----------------------------------------------
    for p in BB_P:
        for k in BB_K:
            m, up, lo, width, pctb = bb(p, k)
            g = ok(up, lo, pctb)
            above, below = g & (C > up), g & (C < lo)
            yield f"BB({p},{k}) close>upper", "BB", one(above)
            yield f"BB({p},{k}) close<lower", "BB", one(below)
            yield f"BB({p},{k}) high>=upper", "BB", one(g & (H >= up))
            yield f"BB({p},{k}) low<=lower", "BB", one(g & (L <= lo))
            yield f"BB({p},{k}) pierce sym", "BB", sym(above, below)
            wq = train_q(width, 0.5)
            yield f"BB({p},{k}) pierce sym & width<med", "BB", sym(
                above & (width < wq), below & (width < wq))
            yield f"BB({p},{k}) pierce sym & width>med", "BB", sym(
                above & (width > wq), below & (width > wq))
            for t in (0.9, 1.0, 1.1):
                yield f"BB({p},{k}) %B>={t}", "BB", one(g & (pctb >= t))
                yield f"BB({p},{k}) %B<={round(1-t,2)}", "BB", one(g & (pctb <= 1 - t))

    # ---- B. RSI -----------------------------------------------------------
    for p in RSI_P:
        r = rsi(p)
        g = ok(r)
        pr = shift(r, 1)
        for t in RSI_HI:
            lo_t = 100 - t
            hi_m, lo_m = g & (r >= t), g & (r <= lo_t)
            yield f"RSI({p})>={t}", "RSI", one(hi_m)
            yield f"RSI({p})<={lo_t}", "RSI", one(lo_m)
            yield f"RSI({p}) sym {t}/{lo_t}", "RSI", sym(hi_m, lo_m)
            # exit from the extreme zone
            xhi = g & (r < t) & (pr >= t)
            xlo = g & (r > lo_t) & (pr <= lo_t)
            yield f"RSI({p}) exits >={t}", "RSI", one(xhi)
            yield f"RSI({p}) exits <={lo_t}", "RSI", one(xlo)

    # ---- C. Stochastic ----------------------------------------------------
    for p in ST_P:
        kf = stoch_k(p)                    # fast %K
        df = sma(np.nan_to_num(kf), 3)     # fast %D == slow %K
        ds = sma(np.nan_to_num(df), 3)     # slow %D
        df[: p + 2] = NAN
        ds[: p + 5] = NAN
        for label, kk, dd in (("fast", kf, df), ("slow", df, ds)):
            g = ok(kk, dd)
            for t in (80, 85, 90, 95):
                hi_m, lo_m = g & (kk >= t), g & (kk <= 100 - t)
                yield f"Stoch{label}({p}) %K>={t}", "STOCH", one(hi_m)
                yield f"Stoch{label}({p}) %K<={100-t}", "STOCH", one(lo_m)
                yield f"Stoch{label}({p}) sym {t}", "STOCH", sym(hi_m, lo_m)
            cu, cd = g & cross_up(kk, dd), g & cross_dn(kk, dd)
            yield f"Stoch{label}({p}) %K x-up %D", "STOCH", one(cu)
            yield f"Stoch{label}({p}) %K x-dn %D", "STOCH", one(cd)
            yield f"Stoch{label}({p}) x sym", "STOCH", sym(cu, cd)
            yield f"Stoch{label}({p}) x-dn in OB", "STOCH", one(cd & (kk >= 80))
            yield f"Stoch{label}({p}) x-up in OS", "STOCH", one(cu & (kk <= 20))
            yield f"Stoch{label}({p}) x-in-zone sym", "STOCH", sym(
                cd & (kk >= 80), cu & (kk <= 20))

    # ---- D. MACD ----------------------------------------------------------
    for (f, s, sg) in MACD_P:
        line, sig, hist = macd(f, s, sg)
        g = ok(line, sig, hist)
        ph, ph2 = shift(hist, 1), shift(hist, 2)
        yield f"MACD({f},{s},{sg}) hist>0", "MACD", one(g & (hist > 0))
        yield f"MACD({f},{s},{sg}) hist<0", "MACD", one(g & (hist < 0))
        yield f"MACD({f},{s},{sg}) line>0", "MACD", one(g & (line > 0))
        cu, cd = g & cross_up(line, sig), g & cross_dn(line, sig)
        yield f"MACD({f},{s},{sg}) x-up", "MACD", one(cu)
        yield f"MACD({f},{s},{sg}) x-dn", "MACD", one(cd)
        yield f"MACD({f},{s},{sg}) x sym", "MACD", sym(cu, cd)
        tu = g & (hist > ph) & (ph <= ph2) & (hist < 0)
        td = g & (hist < ph) & (ph >= ph2) & (hist > 0)
        yield f"MACD({f},{s},{sg}) hist turns up (neg)", "MACD", one(tu)
        yield f"MACD({f},{s},{sg}) hist turns dn (pos)", "MACD", one(td)
        yield f"MACD({f},{s},{sg}) hist turn sym", "MACD", sym(td, tu)
        yield f"MACD({f},{s},{sg}) hist rising", "MACD", one(g & (hist > ph))

    # ---- E. moving-average crossovers ------------------------------------
    for kind, fn in (("SMA", lambda p: sma(C, p)), ("EMA", lambda p: ema(C, p))):
        for (f, s) in MA_PAIRS:
            a, b = fn(f), fn(s)
            g = ok(a, b)
            cu, cd = g & cross_up(a, b), g & cross_dn(a, b)
            yield f"{kind} {f}x{s} cross-up", "MACROSS", one(cu)
            yield f"{kind} {f}x{s} cross-dn", "MACROSS", one(cd)
            yield f"{kind} {f}x{s} cross sym", "MACROSS", sym(cu, cd)
            yield f"{kind} {f}>{s} state", "MACROSS", one(g & (a > b))

    # ---- F. ATR- / sigma-normalised distance from a moving average --------
    a14 = atr(14)
    s20 = rstd(C, 20)
    for p in DIST_MA:
        m = sma(C, p)
        for nname, nrm in (("ATR14", a14), ("sd20", s20)):
            with np.errstate(divide="ignore", invalid="ignore"):
                d = (C - m) / nrm
            d[~np.isfinite(d)] = NAN
            g = ok(d)
            for t in DIST_T:
                hi_m, lo_m = g & (d >= t), g & (d <= -t)
                yield f"(C-SMA{p})/{nname}>={t}", "DIST", one(hi_m)
                yield f"(C-SMA{p})/{nname}<=-{t}", "DIST", one(lo_m)
                yield f"(C-SMA{p})/{nname} sym {t}", "DIST", sym(hi_m, lo_m)

    # ---- G. CCI -----------------------------------------------------------
    for p in CCI_P:
        x = cci(p)
        g = ok(x)
        for t in CCI_T:
            hi_m, lo_m = g & (x >= t), g & (x <= -t)
            yield f"CCI({p})>={t}", "CCI", one(hi_m)
            yield f"CCI({p})<=-{t}", "CCI", one(lo_m)
            yield f"CCI({p}) sym {t}", "CCI", sym(hi_m, lo_m)

    # ---- H. Williams %R ---------------------------------------------------
    for p in WR_P:
        x = willr(p)
        g = ok(x)
        for t in WR_T:
            hi_m, lo_m = g & (x >= -t), g & (x <= -(100 - t))
            yield f"W%R({p})>=-{t}", "WILLR", one(hi_m)
            yield f"W%R({p})<=-{100-t}", "WILLR", one(lo_m)
            yield f"W%R({p}) sym {t}", "WILLR", sym(hi_m, lo_m)

    # ---- I. momentum / ROC ------------------------------------------------
    for p in ROC_P:
        z = rocz(p)
        g = ok(z)
        for t in ROC_T:
            hi_m, lo_m = g & (z >= t), g & (z <= -t)
            yield f"ROCz({p})>={t}", "ROC", one(hi_m)
            yield f"ROCz({p})<=-{t}", "ROC", one(lo_m)
            yield f"ROCz({p}) sym {t}", "ROC", sym(hi_m, lo_m)

    # ---- J. two indicators agreeing at their extremes ---------------------
    prims = primitives()
    names = sorted(prims)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            bu = prims[a][0] & prims[b][0]
            be = prims[a][1] & prims[b][1]
            yield f"COMBO {a} + {b}", "COMBO", sym(bu, be)


def primitives():
    """(bullish-extreme, bearish-extreme) masks used for the combination grid."""
    out = {}
    r14 = rsi(14)
    out["RSI14x70"] = (np.isfinite(r14) & (r14 >= 70), np.isfinite(r14) & (r14 <= 30))
    r7 = rsi(7)
    out["RSI7x80"] = (np.isfinite(r7) & (r7 >= 80), np.isfinite(r7) & (r7 <= 20))
    _, up, lo, _, pctb = bb(20, 2.0)
    out["BB20/2"] = (np.isfinite(pctb) & (C > up), np.isfinite(pctb) & (C < lo))
    kf = stoch_k(14)
    ds = sma(np.nan_to_num(kf), 3)
    ds[:17] = NAN
    out["Stoch14s"] = (np.isfinite(ds) & (ds >= 80), np.isfinite(ds) & (ds <= 20))
    c20 = cci(20)
    out["CCI20x100"] = (np.isfinite(c20) & (c20 >= 100), np.isfinite(c20) & (c20 <= -100))
    w14 = willr(14)
    out["WR14x10"] = (np.isfinite(w14) & (w14 >= -10), np.isfinite(w14) & (w14 <= -90))
    d = (C - sma(C, 20)) / atr(14)
    out["Dist20/ATR2"] = (np.isfinite(d) & (d >= 2), np.isfinite(d) & (d <= -2))
    z5 = rocz(5)
    out["ROCz5x2"] = (np.isfinite(z5) & (z5 >= 2), np.isfinite(z5) & (z5 <= -2))
    return out


# --------------------------------------------------------------------------
# known rules (for overlap reporting)
# --------------------------------------------------------------------------


def known_rules():
    out = {}
    hh, ll = rmax(shift(C, 1), 20), rmin(shift(C, 1), 20)
    v20, v100 = sma(V, 20), sma(V, 100)
    with np.errstate(divide="ignore", invalid="ignore"):
        vr = v20 / v100
    brk = np.isfinite(hh) & np.isfinite(vr) & ((C > hh) | (C < ll)) & (vr >= 0.8884)
    out["rule1 20-bar break + vol"] = brk

    mv = np.abs(np.concatenate(([0.0], np.diff(C))))
    med = rmedian(mv, 100)
    net = np.abs(C - shift(C, 4))
    out["rule5 4-bar stretch"] = np.isfinite(med) & np.isfinite(net) & (net >= 5.7 * med)

    col = np.sign(C - O)
    run3 = np.ones(N, dtype=bool)
    for k in range(3):
        run3 &= shift(col, k) == shift(col, 0)
    run3 &= col != 0
    run3[:4] = False
    out["rule3 run>=3 same colour"] = run3
    return out


KNOWN = known_rules()

# --------------------------------------------------------------------------
# evaluation
# --------------------------------------------------------------------------


def evaluate(sig):
    fire = (sig != 0) & VALID
    tr = fire & IS_TRAIN
    te = fire & IS_TEST
    ntr = int(tr.sum())
    if ntr < 300:
        return None
    hit_tr = int((TGT[tr] == sig[tr]).sum())
    p_tr = hit_tr / ntr
    z = (p_tr - 0.5) * 2.0 * math.sqrt(ntr)
    direction = 1 if p_tr >= 0.5 else -1  # +1 = keep as emitted, -1 = flip
    acc_tr = p_tr if direction == 1 else 1 - p_tr
    nte = int(te.sum())
    if nte:
        hit_te = int((TGT[te] == direction * sig[te]).sum())
        acc_te = hit_te / nte
    else:
        acc_te = float("nan")
    return dict(n_tr=ntr, acc_tr=acc_tr, z=z, n_te=nte, acc_te=acc_te,
                direction=direction, n_all=int(fire.sum()))


def main():
    global TGT
    flat = int((TGT == 0).sum()) - 1
    print(f"candles={N}  flat(dropped)={flat}  "
          f"train={int((IS_TRAIN & VALID).sum())}  test={int((IS_TEST & VALID).sum())}")
    base = (TGT[IS_TRAIN & VALID] == 1).mean()
    print(f"train base rate up = {base*100:.2f}%   "
          f"test base rate up = {(TGT[IS_TEST & VALID] == 1).mean()*100:.2f}%")

    results, generated, tested = [], 0, 0
    for name, fam, sig in rules():
        generated += 1
        r = evaluate(sig)
        if r is None:
            continue
        tested += 1
        r["name"], r["family"] = name, fam
        results.append(r)

    K = tested
    thr = math.sqrt(2 * math.log(K))
    print(f"\nvariants generated={generated}  evaluated (n_train>=300) K={K}  "
          f"Bonferroni |z| >= {thr:.3f}")

    results.sort(key=lambda r: -abs(r["z"]))

    hdr = (f"{'rule':<42}{'trainAcc':>9}{'trainN':>9}{'testAcc':>9}"
           f"{'testN':>8}{'z':>8}  Bonf")
    print("\n=== TOP 20 by |z| on TRAIN ===")
    print(hdr)
    for r in results[:20]:
        print(f"{r['name']:<42}{r['acc_tr']*100:>8.2f}%{r['n_tr']:>9}"
              f"{r['acc_te']*100:>8.2f}%{r['n_te']:>8}{r['z']:>8.2f}"
              f"  {'YES' if abs(r['z']) >= thr else 'no'}")

    print("\n=== best variant per family ===")
    print(hdr)
    seen = set()
    for r in results:
        if r["family"] in seen:
            continue
        seen.add(r["family"])
        print(f"{r['name']:<42}{r['acc_tr']*100:>8.2f}%{r['n_tr']:>9}"
              f"{r['acc_te']*100:>8.2f}%{r['n_te']:>8}{r['z']:>8.2f}"
              f"  {'YES' if abs(r['z']) >= thr else 'no'}")

    # ---- survivors: overlap with known rules + signals/day ----------------
    survivors = [r for r in results if abs(r["z"]) >= thr]
    print(f"\n{len(survivors)} variants pass Bonferroni on train.")
    if not survivors:
        print("NOTHING SURVIVED.")
        return

    # re-generate to recover masks for the survivors we want to detail
    want = {r["name"] for r in survivors[:12]}
    masks = {}
    for name, fam, sig in rules():
        if name in want:
            masks[name] = sig
    days = N / 288.0
    print("\n=== survivor detail (top 12 by |z|) ===")
    print(f"{'rule':<42}{'sig/day':>9}" +
          "".join(f"{k.split()[0]:>10}" for k in KNOWN))
    for r in survivors[:12]:
        sig = masks[r["name"]]
        fire = (sig != 0) & VALID
        ov = []
        for k, km in KNOWN.items():
            ov.append((fire & km).sum() / max(fire.sum(), 1))
        print(f"{r['name']:<42}{fire.sum()/days:>9.2f}" +
              "".join(f"{o*100:>9.1f}%" for o in ov))

    # test-side sanity of every survivor
    held = [r for r in survivors if not math.isnan(r["acc_te"]) and r["acc_te"] > 0.5]
    print(f"\nsurvivors with test accuracy above 50%: {len(held)}/{len(survivors)}")
    best = max(survivors, key=lambda r: abs(r["z"]))
    print(f"\nbest by |z|: {best['name']} dir={best['direction']:+d} "
          f"train {best['acc_tr']*100:.2f}% (n={best['n_tr']}) "
          f"test {best['acc_te']*100:.2f}% (n={best['n_te']})")

    # best by test accuracy among survivors, with a decent test sample
    cand = [r for r in survivors if r["n_te"] >= 300]
    cand.sort(key=lambda r: -r["acc_te"])
    print("\n=== survivors ranked by TEST accuracy (test n>=300) ===")
    print(hdr)
    for r in cand[:15]:
        print(f"{r['name']:<42}{r['acc_tr']*100:>8.2f}%{r['n_tr']:>9}"
              f"{r['acc_te']*100:>8.2f}%{r['n_te']:>8}{r['z']:>8.2f}  YES")

    # ---- SELECTION ON TRAIN ONLY: highest train accuracy, usable size -----
    picks = [r for r in survivors if r["n_tr"] >= 1500]
    picks.sort(key=lambda r: -r["acc_tr"])
    print("\n=== survivors ranked by TRAIN accuracy (train n>=1500) "
          "-- selection is train-only, test column is out-of-sample ===")
    print(hdr)
    for r in picks[:15]:
        print(f"{r['name']:<42}{r['acc_tr']*100:>8.2f}%{r['n_tr']:>9}"
              f"{r['acc_te']*100:>8.2f}%{r['n_te']:>8}{r['z']:>8.2f}  YES")

    # ---- incremental value of the train-chosen best rule ------------------
    chosen = picks[0]
    want2 = {chosen["name"]} | {r["name"] for r in picks[:5]}
    m2 = {}
    for name, fam, sig in rules():
        if name in want2:
            m2[name] = sig
    known_any = np.zeros(N, dtype=bool)
    for km in KNOWN.values():
        known_any |= km
    print(f"\n=== incremental value of train-pick: {chosen['name']} ===")
    for name in sorted(want2):
        sig = m2[name] * chosen["direction"] if name == chosen["name"] else m2[name]
        r = [x for x in picks if x["name"] == name][0]
        s = m2[name] * r["direction"]
        fire = (s != 0) & VALID
        for label, sel in (("all", fire), ("NOT covered by rule1/3/5", fire & ~known_any)):
            for split_name, sp in (("train", IS_TRAIN), ("test", IS_TEST)):
                f = sel & sp
                n = int(f.sum())
                if n == 0:
                    continue
                acc = (TGT[f] == s[f]).mean()
                zz = (acc - 0.5) * 2 * math.sqrt(n)
                print(f"  {name:<38} {label:<26} {split_name:<6} "
                      f"{acc*100:6.2f}%  n={n:<7} z={zz:+.2f}")
        print()

    # ---- shuffled-label control ------------------------------------------
    print("=== shuffled-label control (train labels permuted, same sweep) ===")
    rng = np.random.default_rng(12345)
    real = TGT.copy()
    perm = TGT.copy()
    tr_idx = np.flatnonzero(IS_TRAIN & VALID)
    perm[tr_idx] = real[rng.permutation(tr_idx)]
    TGT = perm
    zs = []
    for name, fam, sig in rules():
        r = evaluate(sig)
        if r:
            zs.append(abs(r["z"]))
    TGT = real
    zs.sort(reverse=True)
    n_pass = sum(1 for z in zs if z >= thr)
    print(f"  max |z| under shuffled labels = {zs[0]:.2f} "
          f"(real max {abs(results[0]['z']):.2f});  "
          f"variants passing Bonferroni = {n_pass} (real {len(survivors)})")

    # ---- detailed diagnostics for the nominated candidates ---------------
    nominees = [
        "BB(20,2.5) pierce sym",
        "BB(20,2.5) pierce sym & width>med",
        "BB(30,3.0) pierce sym",
        "COMBO BB20/2 + RSI7x80",
        "RSI(7) sym 65/35",
        "(C-SMA10)/ATR14 sym 1.5",
    ]
    nm = {}
    for name, fam, sig in rules():
        if name in nm or name not in nominees:
            continue
        nm[name] = sig
    by_name = {r["name"]: r for r in results}
    print("\n=== nominated candidates: full diagnostics ===")
    for name in nominees:
        r = by_name[name]
        s = nm[name] * r["direction"]
        fire = (s != 0) & VALID
        hit = TGT == s
        print(f"\n-- {name}   (direction: "
              f"{'FADE the extreme' if r['direction'] < 0 else 'FOLLOW the extreme'})")
        print(f"   train {r['acc_tr']*100:.2f}% n={r['n_tr']}   "
              f"test {r['acc_te']*100:.2f}% n={r['n_te']}   z={r['z']:+.2f}   "
              f"{fire.sum()/days:.2f} signals/day")
        ovs = " ".join(f"{k.split()[0]}={((fire & km).sum()/fire.sum())*100:.1f}%"
                       for k, km in KNOWN.items())
        print(f"   overlap with known rules: {ovs}")
        nc = fire & ~known_any
        if nc.sum():
            for split_name, sp in (("train", IS_TRAIN), ("test", IS_TEST)):
                f = nc & sp
                if f.sum() > 30:
                    a = hit[f].mean()
                    print(f"   novel signals ({split_name}): {a*100:.2f}% "
                          f"n={int(f.sum())} z={(a-0.5)*2*math.sqrt(f.sum()):+.2f}")
        # month-by-month on the test split
        months = {}
        for i in np.flatnonzero(fire & IS_TEST):
            mo = ISO[i][:7]
            w, t = months.get(mo, (0, 0))
            months[mo] = (w + int(hit[i]), t + 1)
        good = sum(1 for w, t in months.values() if t >= 20 and w / t > 0.5)
        tot = sum(1 for w, t in months.values() if t >= 20)
        print(f"   test months above 50%: {good}/{tot}  "
              + " ".join(f"{m}:{w/t*100:.0f}%" for m, (w, t) in sorted(months.items())
                         if t >= 20))


if __name__ == "__main__":
    main()
