"""
Indicator library and honest scoring harness for the 5-minute edge hunt.

Everything a candidate must survive before it counts as a finding is enforced
here, because the alternative has already been measured on this exact dataset:
shuffling the labels and re-mining produces patterns BETTER than the real data.
A number without these guards is not weak evidence, it is no evidence.

    discovery on TRAIN only        the test half is never looked at while choosing
    minimum occurrences            nothing under MIN_N is reportable
    Bonferroni over K tried        the winner of K attempts needs sqrt(2 ln K)
    shuffled-label null            the whole sweep re-run on randomised outcomes
    within-block contrast          this dataset drifts; halves are not comparable

The library covers the families a human would reach for: oscillators, trend,
volatility channels, candlesticks, market structure, volume, statistical
extremes, and multi-timeframe context. Each is expressed as a mask over the
candle index plus a side, so adding one is a few lines and scoring it is free.
"""

import csv
import gzip
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
FROZEN = os.path.join(HERE, "btc5m.csv.gz")

MIN_N = 300          # below this a rate means nothing at this effect size
TRAIN_FRAC = 0.70


# --------------------------------------------------------------------------- #
# data
# --------------------------------------------------------------------------- #
def load(path=FROZEN, days=365):
    o, h, l, c, v, t = [], [], [], [], [], []
    opener = gzip.open if path.endswith(".gz") else open
    rows = []
    with opener(path, "rt") as f:
        for x in csv.DictReader(f):
            rows.append((int(x["t"]), float(x["o"]), float(x["h"]),
                         float(x["l"]), float(x["c"]), float(x.get("v") or 0)))
    rows.sort()
    if days:
        cut = rows[-1][0] - days * 86400
        rows = [r for r in rows if r[0] >= cut]
    for a, b, cc, d, e, f_ in rows:
        t.append(a); o.append(b); h.append(cc); l.append(d); c.append(e); v.append(f_)
    return {"t": t, "o": o, "h": h, "l": l, "c": c, "v": v, "n": len(t)}


# --------------------------------------------------------------------------- #
# primitives — all O(n), all causal (index i uses only data up to i)
# --------------------------------------------------------------------------- #
def sma(xs, n):
    out = [None] * len(xs)
    s = 0.0
    for i, x in enumerate(xs):
        s += x
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def ema(xs, n):
    out = [None] * len(xs)
    k = 2.0 / (n + 1)
    e = None
    for i, x in enumerate(xs):
        e = x if e is None else x * k + e * (1 - k)
        if i >= n - 1:
            out[i] = e
    return out


def stdev(xs, n):
    out = [None] * len(xs)
    s = s2 = 0.0
    for i, x in enumerate(xs):
        s += x; s2 += x * x
        if i >= n:
            y = xs[i - n]; s -= y; s2 -= y * y
        if i >= n - 1:
            m = s / n
            var = max(0.0, s2 / n - m * m)
            out[i] = math.sqrt(var)
    return out


def rolling_max(xs, n):
    out = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        out[i] = max(xs[i - n + 1:i + 1])
    return out


def rolling_min(xs, n):
    out = [None] * len(xs)
    for i in range(n - 1, len(xs)):
        out[i] = min(xs[i - n + 1:i + 1])
    return out


def true_range(d):
    h, l, c = d["h"], d["l"], d["c"]
    out = [h[0] - l[0]]
    for i in range(1, len(h)):
        out.append(max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])))
    return out


def wilder(xs, n):
    """Wilder's smoothing — what ATR, RSI and ADX are actually defined on."""
    out = [None] * len(xs)
    acc = None
    for i, x in enumerate(xs):
        if x is None:
            continue
        if acc is None:
            if i >= n - 1:
                seg = [y for y in xs[i - n + 1:i + 1] if y is not None]
                if len(seg) == n:
                    acc = sum(seg) / n
                    out[i] = acc
            continue
        acc = (acc * (n - 1) + x) / n
        out[i] = acc
    return out


def rsi(c, n):
    up = [0.0] * len(c)
    dn = [0.0] * len(c)
    for i in range(1, len(c)):
        ch = c[i] - c[i - 1]
        up[i] = max(ch, 0.0)
        dn[i] = max(-ch, 0.0)
    au, ad = wilder(up, n), wilder(dn, n)
    out = [None] * len(c)
    for i in range(len(c)):
        if au[i] is None or ad[i] is None:
            continue
        out[i] = 100.0 if ad[i] == 0 else 100.0 - 100.0 / (1 + au[i] / ad[i])
    return out


def stoch(d, n, smooth=3):
    hh, ll = rolling_max(d["h"], n), rolling_min(d["l"], n)
    k = [None] * d["n"]
    for i in range(d["n"]):
        if hh[i] is None or ll[i] is None or hh[i] == ll[i]:
            continue
        k[i] = 100.0 * (d["c"][i] - ll[i]) / (hh[i] - ll[i])
    ks = [None] * d["n"]
    for i in range(smooth - 1, d["n"]):
        seg = [x for x in k[i - smooth + 1:i + 1] if x is not None]
        if len(seg) == smooth:
            ks[i] = sum(seg) / smooth
    return ks


def cci(d, n):
    tp = [(d["h"][i] + d["l"][i] + d["c"][i]) / 3 for i in range(d["n"])]
    ma = sma(tp, n)
    out = [None] * d["n"]
    for i in range(n - 1, d["n"]):
        if ma[i] is None:
            continue
        md = sum(abs(tp[j] - ma[i]) for j in range(i - n + 1, i + 1)) / n
        if md > 0:
            out[i] = (tp[i] - ma[i]) / (0.015 * md)
    return out


def williams_r(d, n):
    hh, ll = rolling_max(d["h"], n), rolling_min(d["l"], n)
    out = [None] * d["n"]
    for i in range(d["n"]):
        if hh[i] is None or ll[i] is None or hh[i] == ll[i]:
            continue
        out[i] = -100.0 * (hh[i] - d["c"][i]) / (hh[i] - ll[i])
    return out


def mfi(d, n):
    tp = [(d["h"][i] + d["l"][i] + d["c"][i]) / 3 for i in range(d["n"])]
    pos = [0.0] * d["n"]
    neg = [0.0] * d["n"]
    for i in range(1, d["n"]):
        flow = tp[i] * d["v"][i]
        if tp[i] > tp[i - 1]:
            pos[i] = flow
        elif tp[i] < tp[i - 1]:
            neg[i] = flow
    out = [None] * d["n"]
    for i in range(n, d["n"]):
        p = sum(pos[i - n + 1:i + 1])
        q = sum(neg[i - n + 1:i + 1])
        out[i] = 100.0 if q == 0 else 100.0 - 100.0 / (1 + p / q)
    return out


def adx_di(d, n):
    h, l = d["h"], d["l"]
    pdm = [0.0] * d["n"]
    ndm = [0.0] * d["n"]
    for i in range(1, d["n"]):
        up, dn = h[i] - h[i - 1], l[i - 1] - l[i]
        pdm[i] = up if (up > dn and up > 0) else 0.0
        ndm[i] = dn if (dn > up and dn > 0) else 0.0
    tr = wilder(true_range(d), n)
    sp, sn = wilder(pdm, n), wilder(ndm, n)
    pdi = [None] * d["n"]; ndi = [None] * d["n"]; dx = [None] * d["n"]
    for i in range(d["n"]):
        if tr[i] in (None, 0) or sp[i] is None or sn[i] is None:
            continue
        pdi[i] = 100 * sp[i] / tr[i]
        ndi[i] = 100 * sn[i] / tr[i]
        s = pdi[i] + ndi[i]
        if s > 0:
            dx[i] = 100 * abs(pdi[i] - ndi[i]) / s
    return wilder(dx, n), pdi, ndi


def macd(c, fast=12, slow=26, sig=9):
    ef, es = ema(c, fast), ema(c, slow)
    line = [None if (ef[i] is None or es[i] is None) else ef[i] - es[i]
            for i in range(len(c))]
    vals = [x for x in line if x is not None]
    sl = ema(vals, sig)
    signal = [None] * len(c)
    j = 0
    for i in range(len(c)):
        if line[i] is None:
            continue
        signal[i] = sl[j]
        j += 1
    hist = [None if (line[i] is None or signal[i] is None) else line[i] - signal[i]
            for i in range(len(c))]
    return line, signal, hist


def vwap_session(d, span=288):
    """Rolling VWAP over `span` candles — a 24h anchor at 5-minute bars."""
    tp = [(d["h"][i] + d["l"][i] + d["c"][i]) / 3 for i in range(d["n"])]
    pv = [tp[i] * d["v"][i] for i in range(d["n"])]
    out = [None] * d["n"]
    spv = sv = 0.0
    for i in range(d["n"]):
        spv += pv[i]; sv += d["v"][i]
        if i >= span:
            spv -= pv[i - span]; sv -= d["v"][i - span]
        if i >= span - 1 and sv > 0:
            out[i] = spv / sv
    return out


# --------------------------------------------------------------------------- #
# scoring
# --------------------------------------------------------------------------- #
def wilson(w, n, z=1.96):
    if not n:
        return (float("nan"), float("nan"))
    p = w / n
    den = 1 + z * z / n
    ctr = p + z * z / (2 * n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((ctr - half) / den * 100, (ctr + half) / den * 100)


def zscore(w, n):
    return (w / n - 0.5) / (0.5 / math.sqrt(n)) if n else float("nan")


def bonferroni_z(k):
    return math.sqrt(2 * math.log(k)) if k > 1 else 1.96


def outcomes(d):
    """Next-candle direction: +1 up, -1 down, 0 unchanged (excluded)."""
    c = d["c"]
    out = [0] * d["n"]
    for i in range(d["n"] - 1):
        out[i] = 1 if c[i + 1] > c[i] else (-1 if c[i + 1] < c[i] else 0)
    return out


def score(mask_sides, res, lo, hi):
    """mask_sides: list of (index, side) with side +1/-1. Scored on [lo, hi)."""
    n = w = 0
    for i, side in mask_sides:
        if not (lo <= i < hi):
            continue
        r = res[i]
        if r == 0:
            continue
        n += 1
        w += (r == side)
    return n, w


def shuffled_outcomes(res, rng):
    """
    Randomise the outcomes while keeping the signal indices fixed.

    Shuffling the per-signal win/loss list cannot change its mean and would
    report the real accuracy back as its own null — a mistake made on this
    project before. The candle labels are what gets shuffled.
    """
    vals = [r for r in res if r != 0]
    rng.shuffle(vals)
    out = []
    j = 0
    for r in res:
        if r == 0:
            out.append(0)
        else:
            out.append(vals[j]); j += 1
    return out
