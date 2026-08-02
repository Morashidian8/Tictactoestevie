#!/usr/bin/env python3
"""
Volume-only edge hunt on BTC 5-minute candles.

Target      : sign(close[i+1] - close[i])  (flat bars excluded)
Split       : chronological 70/30, every choice made on train only
Min support : 300 train occurrences
Correction  : Bonferroni over K = every condition evaluated (two-sided,
              |z| >= sqrt(2*ln K))
Direction   : each condition carries a natural directional hypothesis; a
              result significantly BELOW the null is reported inverted.
Control     : every survivor is re-run with the volume component removed.

Reproduce:  python3 research/btc5m/agent_volume.py
"""

import csv
import gzip
import math
import os
from collections import defaultdict

import numpy as np

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "btc5m.csv.gz")
MIN_N = 300
SPLIT = 0.70


# ---------------------------------------------------------------- data ----
def load():
    with gzip.open(DATA, "rt") as fh:
        rows = list(csv.DictReader(fh))
    t = np.array([int(r["t"]) for r in rows], dtype=np.int64)
    o = np.array([float(r["o"]) for r in rows])
    h = np.array([float(r["h"]) for r in rows])
    lo = np.array([float(r["l"]) for r in rows])
    c = np.array([float(r["c"]) for r in rows])
    v = np.array([float(r["v"]) for r in rows])
    return t, o, h, lo, c, v


def roll_median_prior(x, w):
    """median of the w bars STRICTLY BEFORE i (no lookahead)."""
    n = len(x)
    out = np.full(n, np.nan)
    if n <= w:
        return out
    win = np.lib.stride_tricks.sliding_window_view(x, w)  # win[j] = x[j:j+w]
    out[w:] = np.median(win[: n - w], axis=1)
    return out


def roll_mean_prior(x, w):
    n = len(x)
    out = np.full(n, np.nan)
    cs = np.concatenate([[0.0], np.cumsum(x)])
    if n <= w:
        return out
    idx = np.arange(w, n)
    out[w:] = (cs[idx] - cs[idx - w]) / w
    return out


def roll_sum_incl(x, w):
    """sum over the w bars ending at i (inclusive)."""
    n = len(x)
    out = np.full(n, np.nan)
    cs = np.concatenate([[0.0], np.cumsum(x)])
    idx = np.arange(w - 1, n)
    out[w - 1:] = cs[idx + 1] - cs[idx + 1 - w]
    return out


def roll_max_incl(x, w):
    n = len(x)
    out = np.full(n, np.nan)
    if n < w:
        return out
    win = np.lib.stride_tricks.sliding_window_view(x, w)
    out[w - 1:] = win.max(axis=1)
    return out


def roll_min_incl(x, w):
    n = len(x)
    out = np.full(n, np.nan)
    if n < w:
        return out
    win = np.lib.stride_tricks.sliding_window_view(x, w)
    out[w - 1:] = win.min(axis=1)
    return out


# ------------------------------------------------------------ features ----
t, o, h, lo, c, v = load()
N = len(c)

ret = np.concatenate([[np.nan], np.diff(c)])          # c[i]-c[i-1]
body = c - o
rng = h - lo
tp = (h + lo + c) / 3.0

# forward target
fwd = np.concatenate([np.diff(c), [np.nan]])          # c[i+1]-c[i]
y = np.sign(fwd)                                      # +1 up, -1 down, 0 flat

# scale references (volatility, volume) computed from PRIOR bars only
atr100 = roll_median_prior(rng, 100)
absmove100 = roll_median_prior(np.abs(np.nan_to_num(ret)), 100)
absmove100[absmove100 <= 0] = np.nan

vmed = {w: roll_median_prior(v, w) for w in (20, 50, 100)}
for w in vmed:
    vmed[w][vmed[w] <= 0] = np.nan
vr = {w: v / vmed[w] for w in vmed}                   # volume ratio vs median

vmean3_prior = roll_mean_prior(v, 3)
vsum3 = roll_sum_incl(v, 3)
vsum3_prev = np.concatenate([np.full(3, np.nan), vsum3[:-3]])
vtrend = vsum3 / vsum3_prev                           # rising/fading volume

# rolling VWAP (inclusive of current bar)
vwap = {}
for w in (20, 50, 100):
    num = roll_sum_incl(v * tp, w)
    den = roll_sum_incl(v, w)
    vwap[w] = num / den

# session VWAP: cumulative from UTC midnight
day = t // 86400
sess_vwap = np.full(N, np.nan)
cum_pv = 0.0
cum_v = 0.0
prev_day = None
sess_bar = np.zeros(N, dtype=np.int64)
k = 0
for i in range(N):
    if day[i] != prev_day:
        cum_pv = 0.0
        cum_v = 0.0
        prev_day = day[i]
        k = 0
    cum_pv += v[i] * tp[i]
    cum_v += v[i]
    sess_vwap[i] = cum_pv / cum_v if cum_v > 0 else np.nan
    sess_bar[i] = k
    k += 1

dvwap = {w: (c - vwap[w]) / atr100 for w in vwap}
dvwap["sess"] = (c - sess_vwap) / atr100
# control twin: distance from a plain (unweighted) moving average
sma = {w: roll_mean_prior(np.concatenate([tp[1:], [np.nan]]), w) for w in ()}  # unused
sma_incl = {w: roll_sum_incl(tp, w) / w for w in (20, 50, 100)}
dsma = {w: (c - sma_incl[w]) / atr100 for w in sma_incl}

# close position inside its own range
with np.errstate(invalid="ignore", divide="ignore"):
    clpos = np.where(rng > 0, (c - lo) / rng, 0.5)

# volume point of control over a trailing window: price bin holding the most volume
def point_of_control(w, nbins=24):
    poc = np.full(N, np.nan)
    for i in range(w, N):
        s = slice(i - w, i)            # prior w bars, no lookahead
        p = tp[s]
        vv = v[s]
        pmin, pmax = p.min(), p.max()
        if pmax <= pmin:
            poc[i] = pmin
            continue
        idx = np.minimum(((p - pmin) / (pmax - pmin) * nbins).astype(int), nbins - 1)
        agg = np.bincount(idx, weights=vv, minlength=nbins)
        b = int(agg.argmax())
        poc[i] = pmin + (b + 0.5) * (pmax - pmin) / nbins
    return poc


poc = {w: point_of_control(w) for w in (50, 100)}
dpoc = {w: (c - poc[w]) / atr100 for w in poc}
# control twin: midpoint of the same window, unweighted by volume
midp = {}
for w in (50, 100):
    hi = np.concatenate([np.full(w, np.nan), roll_max_incl(h, w)[w - 1:-1]])
    lw = np.concatenate([np.full(w, np.nan), roll_min_incl(lo, w)[w - 1:-1]])
    midp[w] = (hi + lw) / 2.0
dmid = {w: (c - midp[w]) / atr100 for w in midp}

# n-bar extremes (inclusive of current close)
cmax = {w: roll_max_incl(c, w) for w in (10, 20, 50)}
cmin = {w: roll_min_incl(c, w) for w in (10, 20, 50)}

sgn_body = np.sign(body)
sgn_ret = np.nan_to_num(np.sign(ret))

# ------------------------------------------------------------- harness ----
split_i = int(N * SPLIT)
valid = np.isfinite(fwd) & (y != 0)
is_train = np.zeros(N, dtype=bool)
is_train[:split_i] = True
is_test = ~is_train

P_UP = float((y[valid & is_train] > 0).mean())
P_DN = 1.0 - P_UP

results = []
K = 0


def evaluate(name, cond, pred, family, vol_free=False):
    """cond: bool mask; pred: +1/-1 array (direction bet). Returns dict or None."""
    global K
    cond = cond & valid & np.isfinite(pred) & (pred != 0)
    tr = cond & is_train
    te = cond & is_test
    ntr = int(tr.sum())
    if ntr < MIN_N:
        return None
    K += 1

    def stat(mask):
        n = int(mask.sum())
        if n == 0:
            return 0, float("nan"), float("nan"), float("nan")
        p = pred[mask]
        yy = y[mask]
        hits = int((p == yy).sum())
        acc = hits / n
        p0 = float(np.mean(np.where(p > 0, P_UP, P_DN)))  # direction-aware null
        se = math.sqrt(p0 * (1 - p0) / n)
        z = (acc - p0) / se
        return n, acc, z, p0

    ntr, atr_, ztr, p0tr = stat(tr)
    nte, ate, zte, p0te = stat(te)
    r = dict(name=name, family=family, ntr=ntr, atr=atr_, ztr=ztr, p0tr=p0tr,
             nte=nte, ate=ate, zte=zte, p0te=p0te, vol_free=vol_free,
             cond=cond, pred=pred)
    results.append(r)
    return r


# ============================ CONDITION GRID =============================
# A. volume spike -> fade / follow the spike candle's own body
for w in (20, 50, 100):
    for T in (1.5, 2.0, 3.0, 4.0, 6.0):
        m = np.isfinite(vr[w]) & (vr[w] >= T)
        evaluate(f"A spike vr{w}>={T} : fade own body", m, -sgn_body, "A_spike")

# A2. volume spike -> fade the previous-bar direction (fade the move into it)
for w in (20, 50):
    for T in (2.0, 3.0, 5.0):
        m = np.isfinite(vr[w]) & (vr[w] >= T)
        evaluate(f"A2 spike vr{w}>={T} : fade prev ret", m, -sgn_ret, "A_spike")

# B. volume climax: big volume + big range + close near the extreme
for T in (2.0, 3.0, 4.0):
    for R in (1.5, 2.0, 3.0):
        big = np.isfinite(vr[20]) & (vr[20] >= T) & np.isfinite(atr100) & (rng >= R * atr100)
        up_ext = big & (clpos >= 0.75)
        dn_ext = big & (clpos <= 0.25)
        m = up_ext | dn_ext
        pred = np.where(up_ext, -1.0, np.where(dn_ext, 1.0, 0.0))
        evaluate(f"B climax vr20>={T} rng>={R}atr clpos extreme : fade", m, pred, "B_climax")

# B2. climax with close near the extreme but volume UNSPECIFIED is the control (later)
# B3. climax reversal bar: big volume, big range, close near the OPPOSITE extreme
for T in (2.0, 3.0):
    big = np.isfinite(vr[20]) & (vr[20] >= T) & np.isfinite(atr100) & (rng >= 1.5 * atr100)
    m = big
    evaluate(f"B3 highvol wide bar vr20>={T} : bet close-position direction",
             m, np.where(clpos >= 0.5, 1.0, -1.0), "B_climax")

# C. LOW volume moves -- unsupported, expect reversion
for w in (20, 50):
    for T in (0.5, 0.7, 0.9):
        for R in (1.0, 2.0, 3.0):
            m = (np.isfinite(vr[w]) & (vr[w] <= T)
                 & np.isfinite(absmove100) & (np.abs(ret) >= R * absmove100))
            evaluate(f"C lowvol vr{w}<={T} & |ret|>={R}med : fade ret", m, -sgn_ret, "C_lowvol")

# C2. low volume, no move-size filter
for w in (20, 50):
    for T in (0.4, 0.6, 0.8):
        m = np.isfinite(vr[w]) & (vr[w] <= T)
        evaluate(f"C2 lowvol vr{w}<={T} : fade ret", m, -sgn_ret, "C_lowvol")

# D. VWAP distance -> revert
for key in (20, 50, 100, "sess"):
    d = dvwap[key]
    for T in (0.5, 1.0, 1.5, 2.0, 3.0):
        m = np.isfinite(d) & (np.abs(d) >= T)
        if key == "sess":
            m = m & (sess_bar >= 24)
        evaluate(f"D |c-vwap{key}|>={T}atr : revert", m, -np.sign(d), "D_vwap")

# D2. VWAP distance combined with a volume spike (does volume add?)
for key in (20, 50):
    d = dvwap[key]
    for T in (1.0, 2.0):
        for VT in (1.5, 2.5):
            m = np.isfinite(d) & (np.abs(d) >= T) & np.isfinite(vr[20]) & (vr[20] >= VT)
            evaluate(f"D2 |c-vwap{key}|>={T}atr & vr20>={VT} : revert", m, -np.sign(d), "D_vwap")
    for T in (1.0, 2.0):
        for VT in (0.7, 0.5):
            m = np.isfinite(d) & (np.abs(d) >= T) & np.isfinite(vr[20]) & (vr[20] <= VT)
            evaluate(f"D3 |c-vwap{key}|>={T}atr & vr20<={VT} : revert", m, -np.sign(d), "D_vwap")

# E. VWAP cross this bar
for w in (20, 50, 100):
    d = dvwap[w]
    dprev = np.concatenate([[np.nan], d[:-1]])
    up_cross = np.isfinite(d) & np.isfinite(dprev) & (dprev <= 0) & (d > 0)
    dn_cross = np.isfinite(d) & np.isfinite(dprev) & (dprev >= 0) & (d < 0)
    m = up_cross | dn_cross
    pred_follow = np.where(up_cross, 1.0, np.where(dn_cross, -1.0, 0.0))
    evaluate(f"E cross vwap{w} : follow the cross", m, pred_follow, "E_cross")
    for VT in (1.5, 2.5):
        mv = m & np.isfinite(vr[20]) & (vr[20] >= VT)
        evaluate(f"E cross vwap{w} & vr20>={VT} : follow", mv, pred_follow, "E_cross")
    for VT in (0.7,):
        mv = m & np.isfinite(vr[20]) & (vr[20] <= VT)
        evaluate(f"E cross vwap{w} & vr20<={VT} : follow", mv, pred_follow, "E_cross")

# F. volume point of control (crude volume profile)
for w in (50, 100):
    d = dpoc[w]
    for T in (0.5, 1.0, 2.0, 3.0):
        m = np.isfinite(d) & (np.abs(d) >= T)
        evaluate(f"F |c-POC{w}|>={T}atr : revert to POC", m, -np.sign(d), "F_poc")
    # near the POC: does price stall / continue?
    for T in (0.25, 0.5):
        m = np.isfinite(d) & (np.abs(d) <= T)
        evaluate(f"F near POC{w} |d|<={T}atr : fade prev ret", m, -sgn_ret, "F_poc")

# G. volume trend: rising vs fading volume into a move
for T in (1.5, 2.0, 3.0):
    m = np.isfinite(vtrend) & (vtrend >= T) & np.isfinite(sgn_ret) & (sgn_ret != 0)
    evaluate(f"G rising vol vtrend>={T} : fade ret", m, -sgn_ret, "G_vtrend")
for T in (0.4, 0.6, 0.8):
    m = np.isfinite(vtrend) & (vtrend <= T) & (sgn_ret != 0)
    evaluate(f"G fading vol vtrend<={T} : fade ret", m, -sgn_ret, "G_vtrend")
# G2. rising volume + 3-bar directional move
r3 = c - np.concatenate([np.full(3, np.nan), c[:-3]])
for T in (1.5, 2.5):
    for R in (1.0, 2.0):
        m = (np.isfinite(vtrend) & (vtrend >= T) & np.isfinite(r3)
             & np.isfinite(absmove100) & (np.abs(r3) >= R * absmove100))
        evaluate(f"G2 vtrend>={T} & |r3|>={R}med : fade r3", m, -np.sign(r3), "G_vtrend")
for T in (0.6, 0.4):
    for R in (1.0, 2.0):
        m = (np.isfinite(vtrend) & (vtrend <= T) & np.isfinite(r3)
             & np.isfinite(absmove100) & (np.abs(r3) >= R * absmove100))
        evaluate(f"G3 vtrend<={T} & |r3|>={R}med : fade r3", m, -np.sign(r3), "G_vtrend")

# H. divergence: new n-bar extreme on WEAK volume
for w in (10, 20, 50):
    newhi = (c >= cmax[w]) & np.isfinite(cmax[w])
    newlo = (c <= cmin[w]) & np.isfinite(cmin[w])
    for T in (0.8, 1.0, 1.2):
        m = (newhi | newlo) & np.isfinite(vr[20]) & (vr[20] <= T)
        pred = np.where(newhi, -1.0, np.where(newlo, 1.0, 0.0))
        evaluate(f"H {w}-bar extreme & vr20<={T} (weak) : fade extreme", m, pred, "H_diverg")
    # strong-volume breakout, for contrast
    for T in (1.5, 2.5):
        m = (newhi | newlo) & np.isfinite(vr[20]) & (vr[20] >= T)
        pred = np.where(newhi, -1.0, np.where(newlo, 1.0, 0.0))
        evaluate(f"H {w}-bar extreme & vr20>={T} (strong) : fade extreme", m, pred, "H_diverg")

# I. volume decile buckets -> fade previous return
for w in (20, 100):
    x = vr[w]
    fin = np.isfinite(x) & is_train
    qs = np.quantile(x[fin], np.linspace(0, 1, 11))
    for b in range(10):
        m = np.isfinite(x) & (x >= qs[b]) & (x < qs[b + 1] if b < 9 else x >= qs[b])
        evaluate(f"I vr{w} decile {b+1} : fade ret", m, -sgn_ret, "I_decile")

# J. absolute volume level (BTC traded), not relative
qa = np.quantile(v[is_train], np.linspace(0, 1, 11))
for b in range(10):
    m = (v >= qa[b]) & ((v < qa[b + 1]) if b < 9 else (v >= qa[b]))
    evaluate(f"J abs vol decile {b+1} : fade ret", m, -sgn_ret, "J_absvol")

# K. volume-per-range (effort vs result): high volume, little movement = absorption
eff = np.where(rng > 0, v / rng, np.nan)
eff_med = roll_median_prior(np.nan_to_num(eff, nan=0.0), 100)
eff_med[eff_med <= 0] = np.nan
effr = eff / eff_med
for T in (2.0, 3.0, 5.0):
    m = np.isfinite(effr) & (effr >= T) & (sgn_body != 0)
    evaluate(f"K absorption vol/rng>={T}med : fade own body", m, -sgn_body, "K_effort")
for T in (0.3, 0.5):
    m = np.isfinite(effr) & (effr <= T) & (sgn_body != 0)
    evaluate(f"K thin vol/rng<={T}med : fade own body", m, -sgn_body, "K_effort")

# L. two-bar volume expansion with directional agreement
vexp = v / np.concatenate([[np.nan], v[:-1]])
for T in (3.0, 5.0, 8.0):
    m = np.isfinite(vexp) & (vexp >= T) & (sgn_body != 0)
    evaluate(f"L vol vs prev bar >={T}x : fade own body", m, -sgn_body, "L_expand")

# M. spike + stretch (volume spike ON an already-extended move)
for VT in (2.0, 3.0):
    for R in (2.0, 3.0, 4.0):
        m = (np.isfinite(vr[20]) & (vr[20] >= VT) & np.isfinite(r3)
             & np.isfinite(absmove100) & (np.abs(r3) >= R * absmove100))
        evaluate(f"M vr20>={VT} & |r3|>={R}med : fade r3", m, -np.sign(r3), "M_spike_stretch")

# N. session VWAP with volume confirmation
d = dvwap["sess"]
for T in (1.0, 2.0):
    for VT in (2.0, 3.0):
        m = np.isfinite(d) & (np.abs(d) >= T) & (sess_bar >= 24) & np.isfinite(vr[20]) & (vr[20] >= VT)
        evaluate(f"N |c-sessVWAP|>={T}atr & vr20>={VT} : revert", m, -np.sign(d), "N_sess")

# ============================== REPORTING ================================
BONF = math.sqrt(2 * math.log(K))

print("=" * 96)
print(f"BTC 5m VOLUME study | bars={N} | train={split_i} test={N-split_i} "
      f"| flat bars excluded | P(up|train)={P_UP:.4f}")
print(f"K = {K} conditions evaluated  ->  Bonferroni threshold |z| >= sqrt(2*lnK) = {BONF:.3f}")
print("=" * 96)

ranked = sorted(results, key=lambda r: -abs(r["ztr"]))

hdr = f"{'rule':<58}{'trAcc':>8}{'trN':>8}{'teAcc':>8}{'teN':>8}{'z_tr':>8}{'z_te':>8}  bonf"
print("\nTOP 25 BY |z| ON TRAIN")
print(hdr)
print("-" * len(hdr))
for r in ranked[:25]:
    inv = "" if r["atr"] >= r["p0tr"] else "  [INVERT]"
    print(f"{r['name'][:57]:<58}{r['atr']*100:>7.2f}%{r['ntr']:>8}"
          f"{r['ate']*100:>7.2f}%{r['nte']:>8}{r['ztr']:>8.2f}{r['zte']:>8.2f}"
          f"  {'YES' if abs(r['ztr'])>=BONF else 'no'}{inv}")

survivors = [r for r in ranked if abs(r["ztr"]) >= BONF]
print(f"\nTrain-Bonferroni survivors: {len(survivors)}")

# a survivor must ALSO hold up out of sample, in the SAME direction
def held(r):
    if abs(r["ztr"]) < BONF:
        return False
    tr_side = 1 if r["atr"] >= r["p0tr"] else -1
    te_side = 1 if r["ate"] >= r["p0te"] else -1
    return tr_side == te_side and abs(r["zte"]) >= 1.96


confirmed = [r for r in survivors if held(r)]
print(f"Of those, confirmed out-of-sample (same side, |z_test| >= 1.96): {len(confirmed)}")
for r in confirmed:
    print(f"   * {r['name']}  train {r['atr']*100:.2f}% (n={r['ntr']}) "
          f"test {r['ate']*100:.2f}% (n={r['nte']}, z={r['zte']:+.2f})")

# ------------------------------------------------------------ CONTROLS ---
print("\n" + "=" * 96)
print("CONTROLS -- same condition with the VOLUME component removed")
print("=" * 96)

DAYS = (t[-1] - t[0]) / 86400.0


def control(name, cond, pred):
    cond = cond & valid & np.isfinite(pred) & (pred != 0)
    out = {}
    for lbl, mask in (("train", is_train), ("test", is_test)):
        m = cond & mask
        n = int(m.sum())
        if n == 0:
            out[lbl] = (0, float("nan"), float("nan"))
            continue
        p = pred[m]
        acc = float((p == y[m]).mean())
        p0 = float(np.mean(np.where(p > 0, P_UP, P_DN)))
        z = (acc - p0) / math.sqrt(p0 * (1 - p0) / n)
        out[lbl] = (n, acc, z)
    print(f"  {name:<62} train {out['train'][1]*100:6.2f}% n={out['train'][0]:<7} "
          f"test {out['test'][1]*100:6.2f}% n={out['test'][0]:<7} z_tr={out['train'][2]:+.2f}")
    return out


CONTROLS = []

# D-family controls: distance from VWAP vs distance from an UNWEIGHTED SMA
for w in (20, 50, 100):
    for T in (1.0, 2.0):
        d = dvwap[w]
        m = np.isfinite(d) & (np.abs(d) >= T)
        CONTROLS.append((f"[vol] |c-VWAP{w}|>={T}atr revert", m, -np.sign(d)))
        ds = dsma[w]
        ms = np.isfinite(ds) & (np.abs(ds) >= T)
        CONTROLS.append((f"[ctrl] |c-SMA{w}|>={T}atr  revert", ms, -np.sign(ds)))

# F-family control: POC vs plain window midpoint
for w in (50, 100):
    for T in (1.0, 2.0):
        d = dpoc[w]
        m = np.isfinite(d) & (np.abs(d) >= T)
        CONTROLS.append((f"[vol] |c-POC{w}|>={T}atr revert", m, -np.sign(d)))
        dm = dmid[w]
        mm = np.isfinite(dm) & (np.abs(dm) >= T)
        CONTROLS.append((f"[ctrl] |c-MID{w}|>={T}atr revert", mm, -np.sign(dm)))

# spike/climax controls: drop the volume clause entirely
for R in (1.5, 2.0, 3.0):
    big = np.isfinite(atr100) & (rng >= R * atr100)
    up_ext = big & (clpos >= 0.75)
    dn_ext = big & (clpos <= 0.25)
    pred = np.where(up_ext, -1.0, np.where(dn_ext, 1.0, 0.0))
    CONTROLS.append((f"[ctrl] rng>={R}atr & clpos extreme (NO volume) : fade",
                     up_ext | dn_ext, pred))

for R in (1.0, 2.0, 3.0):
    m = np.isfinite(absmove100) & (np.abs(ret) >= R * absmove100)
    CONTROLS.append((f"[ctrl] |ret|>={R}med (NO volume) : fade ret", m, -sgn_ret))
for R in (2.0, 3.0, 4.0):
    m = np.isfinite(r3) & np.isfinite(absmove100) & (np.abs(r3) >= R * absmove100)
    CONTROLS.append((f"[ctrl] |r3|>={R}med (NO volume) : fade r3", m, -np.sign(r3)))

CONTROLS.append(("[ctrl] all bars : fade prev ret", np.isfinite(sgn_ret) & (sgn_ret != 0), -sgn_ret))
CONTROLS.append(("[ctrl] all bars : fade own body", sgn_body != 0, -sgn_body))

for nm, m, p in CONTROLS:
    control(nm, m, p)

# --------------------------------------------------- family best table ---
print("\n" + "=" * 96)
print("BEST CONDITION PER FAMILY (chosen on train)")
print("=" * 96)
print(hdr)
print("-" * len(hdr))
best = {}
for r in results:
    f = r["family"]
    if f not in best or abs(r["ztr"]) > abs(best[f]["ztr"]):
        best[f] = r
for f in sorted(best, key=lambda k: -abs(best[k]["ztr"])):
    r = best[f]
    sig = f"{r['ntr']/ (DAYS*SPLIT):.1f}/day"
    print(f"{r['name'][:57]:<58}{r['atr']*100:>7.2f}%{r['ntr']:>8}"
          f"{r['ate']*100:>7.2f}%{r['nte']:>8}{r['ztr']:>8.2f}{r['zte']:>8.2f}"
          f"  {'YES' if abs(r['ztr'])>=BONF else 'no'}  {sig}")

# ------------------------------------------------ signals/day for top ----
print("\nsignals/day (train span) for the top 10 by |z_train|:")
for r in ranked[:10]:
    print(f"  {r['name'][:60]:<62} {r['ntr']/(DAYS*SPLIT):6.2f}/day")

print(f"\nTotal conditions evaluated K = {K}; Bonferroni |z| >= {BONF:.3f}")

# ================= DIFFERENTIAL CONTROL: does volume ADD anything? =======
# For each price-only base condition, split the SAME signals by volume and
# test high-volume vs low-volume with a two-proportion z-test. If the two
# halves score the same, volume carries no information beyond the price.
print("\n" + "=" * 110)
print("DIFFERENTIAL CONTROL -- identical price signal, split by volume "
      "(2-proportion z on the DIFFERENCE)")
print("=" * 110)


def acc_of(mask, pred, span):
    m = mask & valid & span & np.isfinite(pred) & (pred != 0)
    n = int(m.sum())
    if n == 0:
        return 0, float("nan")
    return n, float((pred[m] == y[m]).mean())


def two_prop(n1, a1, n2, a2):
    if n1 == 0 or n2 == 0:
        return float("nan")
    p = (a1 * n1 + a2 * n2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return (a1 - a2) / se if se > 0 else float("nan")


newhi20 = (c >= cmax[20]) & np.isfinite(cmax[20])
newlo20 = (c <= cmin[20]) & np.isfinite(cmin[20])
ext_pred = np.where(newhi20, -1.0, np.where(newlo20, 1.0, 0.0))
wide = np.isfinite(atr100) & (rng >= 1.5 * atr100)
cl_hi = wide & (clpos >= 0.75)
cl_lo = wide & (clpos <= 0.25)
clim_pred = np.where(cl_hi, -1.0, np.where(cl_lo, 1.0, 0.0))
d20 = dvwap[20]

BASES = [
    ("|r3|>=2med fade r3", np.isfinite(r3) & np.isfinite(absmove100)
     & (np.abs(r3) >= 2 * absmove100), -np.sign(r3)),
    ("|r3|>=4med fade r3", np.isfinite(r3) & np.isfinite(absmove100)
     & (np.abs(r3) >= 4 * absmove100), -np.sign(r3)),
    ("|ret|>=2med fade ret", np.isfinite(absmove100)
     & (np.abs(ret) >= 2 * absmove100), -sgn_ret),
    ("20-bar extreme fade", newhi20 | newlo20, ext_pred),
    ("wide bar + extreme close fade", cl_hi | cl_lo, clim_pred),
    ("|c-vwap20|>=2atr revert", np.isfinite(d20) & (np.abs(d20) >= 2), -np.sign(d20)),
    ("|c-SMA20|>=2atr revert", np.isfinite(dsma[20]) & (np.abs(dsma[20]) >= 2),
     -np.sign(dsma[20])),
]

print(f"{'base price signal':<32}{'vol bucket':<16}"
      f"{'trAcc':>8}{'trN':>8}{'teAcc':>8}{'teN':>8}   z(hi-lo) train / test")
print("-" * 110)
for bname, bmask, bpred in BASES:
    x = vr[20]
    fin = bmask & valid & np.isfinite(x) & is_train
    if fin.sum() < 3 * MIN_N:
        continue
    q33, q67 = np.quantile(x[fin], [1 / 3, 2 / 3])
    buckets = [("low  vol (<q33)", np.isfinite(x) & (x < q33)),
               ("mid  vol", np.isfinite(x) & (x >= q33) & (x < q67)),
               ("high vol (>q67)", np.isfinite(x) & (x >= q67))]
    rowvals = {}
    for lbl, vm in buckets:
        ntr_, atr_ = acc_of(bmask & vm, bpred, is_train)
        nte_, ate_ = acc_of(bmask & vm, bpred, is_test)
        rowvals[lbl] = (ntr_, atr_, nte_, ate_)
        print(f"{bname:<32}{lbl:<16}{atr_*100:>7.2f}%{ntr_:>8}{ate_*100:>7.2f}%{nte_:>8}")
    hi = rowvals["high vol (>q67)"]
    lorow = rowvals["low  vol (<q33)"]
    ztr_d = two_prop(hi[0], hi[1], lorow[0], lorow[1])
    zte_d = two_prop(hi[2], hi[3], lorow[2], lorow[3])
    verdict = "volume ADDS" if abs(ztr_d) >= 3.244 and abs(zte_d) >= 1.96 \
        else "volume adds nothing"
    print(f"{'':<48}{'':<32}z_hi-lo train {ztr_d:+.2f} | test {zte_d:+.2f}"
          f"   -> {verdict}\n")

# Same test using the volume-per-range (effort) measure and the volume trend,
# so the conclusion is not an artifact of one volume definition.
print("-" * 110)
for vname, vx in (("vr100", vr[100]), ("vtrend(3v3)", vtrend), ("vol/range", effr)):
    bmask = np.isfinite(r3) & np.isfinite(absmove100) & (np.abs(r3) >= 3 * absmove100)
    bpred = -np.sign(r3)
    fin = bmask & valid & np.isfinite(vx) & is_train
    q33, q67 = np.quantile(vx[fin], [1 / 3, 2 / 3])
    ntr_h, atr_h = acc_of(bmask & (vx >= q67), bpred, is_train)
    nte_h, ate_h = acc_of(bmask & (vx >= q67), bpred, is_test)
    ntr_l, atr_l = acc_of(bmask & (vx < q33), bpred, is_train)
    nte_l, ate_l = acc_of(bmask & (vx < q33), bpred, is_test)
    print(f"|r3|>=3med split by {vname:<12} high {atr_h*100:6.2f}%/{ate_h*100:6.2f}%  "
          f"low {atr_l*100:6.2f}%/{ate_l*100:6.2f}%  "
          f"z_hi-lo train {two_prop(ntr_h, atr_h, ntr_l, atr_l):+.2f} "
          f"test {two_prop(nte_h, ate_h, nte_l, ate_l):+.2f}")

# Full decile profile on the strongest price base -- would expose a tail-only
# volume effect that terciles could hide.
print("\nvr20 decile profile inside |r3|>=3med (fade r3):")
bmask = np.isfinite(r3) & np.isfinite(absmove100) & (np.abs(r3) >= 3 * absmove100)
bpred = -np.sign(r3)
x = vr[20]
fin = bmask & valid & np.isfinite(x) & is_train
qd = np.quantile(x[fin], np.linspace(0, 1, 11))
print(f"  {'decile':<8}{'vr20 range':<20}{'trAcc':>8}{'trN':>8}{'teAcc':>8}{'teN':>8}")
for b in range(10):
    vm = np.isfinite(x) & (x >= qd[b]) & ((x < qd[b + 1]) if b < 9 else (x >= qd[b]))
    ntr_, atr_ = acc_of(bmask & vm, bpred, is_train)
    nte_, ate_ = acc_of(bmask & vm, bpred, is_test)
    print(f"  {b+1:<8}{f'{qd[b]:.2f}-{qd[b+1]:.2f}':<20}"
          f"{atr_*100:>7.2f}%{ntr_:>8}{ate_*100:>7.2f}%{nte_:>8}")

