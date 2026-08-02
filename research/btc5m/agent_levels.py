#!/usr/bin/env python3
"""
Support & resistance research on BTC 5m candles.

Target: sign(close[i+1] - close[i]).  Chronological 70/30 split.
Everything chosen on TRAIN; TEST reported separately.  Bonferroni over K = every
variant evaluated.  Controls strip the level component out of each survivor.

Reproduce:  python3 research/btc5m/agent_levels.py
"""
import csv
import gzip
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "btc5m.csv.gz")
BIG = 1e18


# ---------------------------------------------------------------- data ------
def load():
    ts, o, h, l, c, v = [], [], [], [], [], []
    with gzip.open(CSV, "rt") as f:
        r = csv.reader(f)
        next(r)
        for row in r:
            ts.append(int(row[0]))
            o.append(float(row[2]))
            h.append(float(row[3]))
            l.append(float(row[4]))
            c.append(float(row[5]))
            v.append(float(row[6]))
    return (np.array(ts, dtype=np.int64),
            np.array(o), np.array(h), np.array(l), np.array(c), np.array(v))


def roll_median(x, w):
    """median of the w values ending at index i-1, aligned to output index i."""
    out = np.full(len(x) + 1, np.nan)
    if len(x) < w:
        return out
    sw = np.lib.stride_tricks.sliding_window_view(x, w)
    res = np.empty(sw.shape[0])
    step = 20000
    for a in range(0, sw.shape[0], step):
        res[a:a + step] = np.median(sw[a:a + step], axis=1)
    out[w:w + len(res)] = res
    return out


def roll_mean(x, w):
    cs = np.concatenate([[0.0], np.cumsum(x)])
    out = np.full(len(x), np.nan)
    out[w:] = (cs[w:-1] - cs[:-w - 1]) / w   # mean of x[i-w:i], excl. bar i
    return out


def roll_max_prev(x, w):
    """max of x[i-w:i] (excludes bar i)."""
    out = np.full(len(x), np.nan)
    if len(x) <= w:
        return out
    sw = np.lib.stride_tricks.sliding_window_view(x, w)
    out[w:] = sw[:len(x) - w].max(axis=1)
    return out


def roll_min_prev(x, w):
    out = np.full(len(x), np.nan)
    if len(x) <= w:
        return out
    sw = np.lib.stride_tricks.sliding_window_view(x, w)
    out[w:] = sw[:len(x) - w].min(axis=1)
    return out


# ------------------------------------------------------------- pivots -------
def pivots(h, l, N):
    """pivot high/low at p if h[p] is the max of h[p-N..p+N]. Confirmed at p+N."""
    n = len(h)
    sw_h = np.lib.stride_tricks.sliding_window_view(h, 2 * N + 1)
    sw_l = np.lib.stride_tricks.sliding_window_view(l, 2 * N + 1)
    ph = np.zeros(n, dtype=bool)
    pl = np.zeros(n, dtype=bool)
    ph[N:n - N] = sw_h.max(axis=1) == h[N:n - N]
    pl[N:n - N] = sw_l.min(axis=1) == l[N:n - N]
    return np.flatnonzero(ph), np.flatnonzero(pl)


def level_features(price, hi, lo, c, scale, N, maxage, track_flip=False):
    """
    For every bar i compute distance to the nearest active pivot-high above and
    nearest active pivot-low below.  A level born at p is usable from p+N
    (confirmation lag) and expires maxage bars after birth.

    Returns dict of arrays.  Optionally also the flip levels (broken resistance
    -> support and vice versa).
    """
    n = len(c)
    p_hi, p_lo = pivots(hi, lo, N)
    hi_price = hi[p_hi]
    lo_price = lo[p_lo]
    hi_conf = p_hi + N
    lo_conf = p_lo + N

    dres = np.full(n, BIG)
    dsup = np.full(n, BIG)
    kres = np.zeros(n, dtype=np.int32)   # levels within 2*scale above
    ksup = np.zeros(n, dtype=np.int32)
    fres = np.full(n, BIG)               # flipped support/resistance
    fsup = np.full(n, BIG)

    ah = al = 0          # append pointers into hi_conf / lo_conf
    lh = ll = 0          # expiry pointers
    # flip books: broken resistance becomes support, broken support resistance
    flip_sup_p, flip_sup_t = [], []
    flip_res_p, flip_res_t = [], []
    broken_h = np.zeros(len(hi_price), dtype=bool)
    broken_l = np.zeros(len(lo_price), dtype=bool)

    for i in range(n):
        while ah < len(hi_conf) and hi_conf[ah] <= i:
            ah += 1
        while al < len(lo_conf) and lo_conf[al] <= i:
            al += 1
        while lh < ah and p_hi[lh] < i - maxage:
            lh += 1
        while ll < al and p_lo[ll] < i - maxage:
            ll += 1
        ci = c[i]
        s = scale[i]
        if lh < ah:
            pr = hi_price[lh:ah]
            above = pr[pr > ci]
            if above.size:
                dres[i] = above.min() - ci
                if s == s:
                    kres[i] = int((above <= ci + 2.0 * s).sum())
        if ll < al:
            pr = lo_price[ll:al]
            below = pr[pr < ci]
            if below.size:
                dsup[i] = ci - below.max()
                if s == s:
                    ksup[i] = int((below >= ci - 2.0 * s).sum())

        if track_flip and s == s:
            # detect breaks of currently active, not-yet-broken levels
            if lh < ah:
                seg = slice(lh, ah)
                newly = (~broken_h[seg]) & (hi_price[seg] < ci - 0.3 * s)
                if newly.any():
                    broken_h[seg] = broken_h[seg] | newly
                    for p in hi_price[seg][newly]:
                        flip_sup_p.append(float(p))
                        flip_sup_t.append(i)
            if ll < al:
                seg = slice(ll, al)
                newly = (~broken_l[seg]) & (lo_price[seg] > ci + 0.3 * s)
                if newly.any():
                    broken_l[seg] = broken_l[seg] | newly
                    for p in lo_price[seg][newly]:
                        flip_res_p.append(float(p))
                        flip_res_t.append(i)
            if flip_sup_p:
                fp = np.array(flip_sup_p[-400:])
                ft = np.array(flip_sup_t[-400:])
                m = (ft >= i - maxage) & (fp < ci)
                if m.any():
                    fsup[i] = ci - fp[m].max()
            if flip_res_p:
                fp = np.array(flip_res_p[-400:])
                ft = np.array(flip_res_t[-400:])
                m = (ft >= i - maxage) & (fp > ci)
                if m.any():
                    fres[i] = fp[m].min() - ci

    return dict(dres=dres, dsup=dsup, kres=kres, ksup=ksup,
                fres=fres, fsup=fsup)


# --------------------------------------------------------- evaluation -------
class Bench:
    def __init__(self, y, split, days_train, days_test):
        self.y = y                      # +1 up, -1 down, 0 tie
        self.split = split
        self.days_train = days_train
        self.days_test = days_test
        self.ok = y != 0
        tr = self.ok[:split]
        self.p_up_tr = float((y[:split][tr] > 0).mean())
        self.results = []
        self.K = 0

    def _leg(self, mask, pred, lo, hi):
        m = mask.copy()
        m[:lo] = False
        m[hi:] = False
        m &= self.ok
        n = int(m.sum())
        if n == 0:
            return 0, float("nan"), float("nan")
        hit = int((pred[m] == self.y[m]).sum())
        acc = hit / n
        n_up = int((pred[m] > 0).sum())
        p0 = (n_up * self.p_up_tr + (n - n_up) * (1 - self.p_up_tr)) / n
        return n, acc, p0

    def run(self, name, mask, pred, count=True):
        if count:
            self.K += 1
        end = len(self.y) - 1
        ntr, atr, p0tr = self._leg(mask, pred, 0, self.split)
        nte, ate, p0te = self._leg(mask, pred, self.split, end)
        if ntr < 300:
            return None
        ztr = (atr - p0tr) / math.sqrt(p0tr * (1 - p0tr) / ntr)
        zte = ((ate - p0te) / math.sqrt(p0te * (1 - p0te) / nte)) if nte > 0 else float("nan")
        rec = dict(name=name, ntr=ntr, atr=atr, ztr=ztr, nte=nte, ate=ate, zte=zte,
                   mask=mask, pred=pred,
                   sig_per_day_tr=ntr / self.days_train,
                   sig_per_day_te=nte / self.days_test if self.days_test else 0.0)
        self.results.append(rec)
        return rec


def combine(dres, dsup, tol_res, tol_sup, extra_res=None, extra_sup=None):
    """symmetric near-level signal; when both sides qualify take the closer."""
    r = dres <= tol_res
    s = dsup <= tol_sup
    if extra_res is not None:
        r = r & extra_res
    if extra_sup is not None:
        s = s & extra_sup
    both = r & s
    r = r & ~(both & (dsup < dres))
    s = s & ~(both & (dres <= dsup))
    mask = r | s
    pred = np.zeros(len(dres), dtype=np.int8)
    pred[r] = -1   # at resistance -> fade -> bet DOWN
    pred[s] = 1    # at support    -> fade -> bet UP
    return mask, pred


def main():
    ts, o, h, l, c, v = load()
    n = len(c)
    split = int(n * 0.70)
    y = np.sign(c[1:] - c[:-1]).astype(np.int8)
    y = np.concatenate([y, [0]])          # last bar has no future

    days_train = (ts[split - 1] - ts[0]) / 86400.0
    days_test = (ts[-1] - ts[split]) / 86400.0

    dmove = np.abs(np.diff(c))
    scale = roll_median(dmove, 100)[:n]   # median |5m move| of last 100 bars
    atr = roll_mean(h - l, 100)
    vol20 = roll_mean(v, 20)
    vol100 = roll_mean(v, 100)
    volr = vol20 / vol100

    warm = np.zeros(n, dtype=bool)
    warm[2100:] = True                    # after all warmups
    warm[n - 1] = False
    good = warm & np.isfinite(scale) & (scale > 0)

    print(f"bars={n}  split={split}  train_days={days_train:.0f}  test_days={days_test:.0f}")
    print(f"base up-rate (train, ties excluded) = "
          f"{float((y[:split][y[:split]!=0]>0).mean()):.4f}")

    B = Bench(y, split, days_train, days_test)

    # ---------------- level sources -----------------------------------------
    src = {}

    for N, maxage, flip in ((5, 2016, False), (10, 2016, True), (20, 4032, False)):
        f = level_features(c, h, l, c, scale, N, maxage, track_flip=flip)
        src[f"pivot{N}"] = (f["dres"], f["dsup"], f["kres"], f["ksup"])
        if flip:
            src["flip"] = (f["fres"], f["fsup"], None, None)
        sys.stderr.write(f"  pivots N={N} done\n")

    for step in (100, 250, 500, 1000):
        up = np.ceil(c / step) * step
        dn = np.floor(c / step) * step
        dr = up - c
        ds = c - dn
        dr = np.where(dr <= 0, step, dr)
        ds = np.where(ds <= 0, step, ds)
        src[f"round{step}"] = (dr, ds, None, None)

    day = ts // 86400
    dchg = np.concatenate([[True], day[1:] != day[:-1]])
    day_id = np.cumsum(dchg) - 1
    nd = day_id[-1] + 1
    dhi = np.full(nd, -BIG)
    dlo = np.full(nd, BIG)
    np.maximum.at(dhi, day_id, h)
    np.minimum.at(dlo, day_id, l)
    prev_hi = np.where(day_id > 0, dhi[np.maximum(day_id - 1, 0)], np.nan)
    prev_lo = np.where(day_id > 0, dlo[np.maximum(day_id - 1, 0)], np.nan)
    src["pdhl"] = (np.where(prev_hi > c, prev_hi - c, BIG),
                   np.where(prev_lo < c, c - prev_lo, BIG), None, None)

    # opening range: first 12 bars (1h) of each UTC day
    bar_of_day = np.arange(n) - np.searchsorted(day_id, day_id, side="left")
    orh = np.full(nd, -BIG)
    orl = np.full(nd, BIG)
    m12 = bar_of_day < 12
    np.maximum.at(orh, day_id[m12], h[m12])
    np.minimum.at(orl, day_id[m12], l[m12])
    ORH = np.where(bar_of_day >= 12, orh[day_id], np.nan)
    ORL = np.where(bar_of_day >= 12, orl[day_id], np.nan)
    src["openrange"] = (np.where(ORH > c, ORH - c, BIG),
                        np.where(ORL < c, c - ORL, BIG), None, None)

    r24h = roll_max_prev(h, 288)
    r24l = roll_min_prev(l, 288)
    src["roll24h"] = (np.where(r24h > c, r24h - c, BIG),
                      np.where(r24l < c, c - r24l, BIG), None, None)

    for k in src:
        a, b = src[k][0], src[k][1]
        np.nan_to_num(a, copy=False, nan=BIG)
        np.nan_to_num(b, copy=False, nan=BIG)

    # ---------------- approach filters --------------------------------------
    up1 = np.concatenate([[False], c[1:] > c[:-1]])
    dn1 = np.concatenate([[False], c[1:] < c[:-1]])
    up3 = np.concatenate([[False] * 3, c[3:] > c[:-3]])
    dn3 = np.concatenate([[False] * 3, c[3:] < c[:-3]])
    approaches = {"any": (None, None), "mom1": (up1, dn1), "mom3": (up3, dn3)}

    # ---------------- family 1: proximity ("test of level") -----------------
    for sname, (dr, ds, kr, ks) in src.items():
        for tol in (0.25, 0.5, 1.0, 2.0):
            for aname, (er, es) in approaches.items():
                mr = good if er is None else (good & er)
                ms = good if es is None else (good & es)
                mask, pred = combine(dr, ds, tol * scale, tol * scale, mr, ms)
                B.run(f"near[{sname}] tol={tol} {aname} FADE", mask & good, pred)

    # ---------------- family 2: wick rejection ------------------------------
    for sname, (dr, ds, kr, ks) in src.items():
        pierce_r = (h >= c + dr) & (dr < BIG / 2)      # wick reached resistance
        pierce_s = (l <= c - ds) & (ds < BIG / 2)
        for aname, (er, es) in approaches.items():
            mr = pierce_r & good
            ms = pierce_s & good
            if er is not None:
                mr = mr & er
                ms = ms & es
            mask, pred = combine(dr, ds, np.full(n, BIG / 2), np.full(n, BIG / 2), mr, ms)
            B.run(f"wickrej[{sname}] {aname} FADE", mask & good, pred)

    # ---------------- family 3: close-through (break) -----------------------
    cprev = np.concatenate([[c[0]], c[:-1]])
    for sname, (dr, ds, kr, ks) in src.items():
        drp = np.concatenate([[BIG], dr[:-1]])     # dist to resistance at i-1
        dsp = np.concatenate([[BIG], ds[:-1]])
        # bar i closed through a level that was resistance/support at i-1
        brk_up = (drp < BIG / 2) & ((c - cprev) > drp)
        brk_dn = (dsp < BIG / 2) & ((cprev - c) > dsp)
        for aname, (er, es) in approaches.items():
            mr = brk_up & good
            ms = brk_dn & good
            if er is not None:
                mr = mr & er
                ms = ms & es
            mask = mr | ms
            pred = np.zeros(n, dtype=np.int8)
            pred[mr & ~ms] = -1     # broke resistance -> FADE -> bet down
            pred[ms & ~mr] = 1
            mask = mask & (pred != 0)
            B.run(f"break[{sname}] {aname} FADE", mask & good, pred)

    # ---------------- family 4: confluence ----------------------------------
    conf_keys = ["pivot10", "pivot20", "round500", "pdhl", "roll24h", "flip"]
    for i1 in range(len(conf_keys)):
        for i2 in range(i1 + 1, len(conf_keys)):
            a, b = conf_keys[i1], conf_keys[i2]
            dr = np.minimum(src[a][0], src[b][0])
            ds = np.minimum(src[a][1], src[b][1])
            agree_r = (src[a][0] <= 1.0 * scale) & (src[b][0] <= 1.0 * scale)
            agree_s = (src[a][1] <= 1.0 * scale) & (src[b][1] <= 1.0 * scale)
            for aname, (er, es) in (("any", (None, None)), ("mom1", (up1, dn1))):
                mr = agree_r & good
                ms = agree_s & good
                if er is not None:
                    mr = mr & er
                    ms = ms & es
                mask, pred = combine(dr, ds, np.full(n, BIG / 2), np.full(n, BIG / 2), mr, ms)
                B.run(f"confluence[{a}+{b}] {aname} FADE", mask & good, pred)

    # ---------------- family 5: proximity + volume expansion ----------------
    volf = np.nan_to_num(volr, nan=0.0) >= 0.8884
    for sname, (dr, ds, kr, ks) in src.items():
        for aname, (er, es) in (("any", (None, None)), ("mom1", (up1, dn1))):
            mr = good & volf
            ms = good & volf
            if er is not None:
                mr = mr & er
                ms = ms & es
            mask, pred = combine(dr, ds, 1.0 * scale, 1.0 * scale, mr, ms)
            B.run(f"near[{sname}] tol=1.0 {aname} vol>=.8884 FADE", mask & good, pred)

    # ---------------- family 6: level strength (touch/cluster count) --------
    for sname in ("pivot5", "pivot10", "pivot20"):
        dr, ds, kr, ks = src[sname]
        for tol in (0.5, 1.0):
            for kmin in (2, 3):
                mr = good & (kr >= kmin)
                ms = good & (ks >= kmin)
                mask, pred = combine(dr, ds, tol * scale, tol * scale, mr, ms)
                B.run(f"near[{sname}] tol={tol} touches>={kmin} FADE", mask & good, pred)

    # ---------------- report ------------------------------------------------
    K = B.K
    thr = math.sqrt(2 * math.log(K))
    print(f"\nK = {K} variants evaluated -> Bonferroni |z| >= sqrt(2*ln K) = {thr:.2f}\n")

    res = sorted(B.results, key=lambda r: -abs(r["ztr"]))
    print(f"{'rule':<52}{'tr_acc':>8}{'tr_n':>8}{'te_acc':>8}{'te_n':>8}{'z_tr':>7}{'z_te':>7}{'surv':>6}")
    for r in res[:30]:
        surv = "YES" if abs(r["ztr"]) >= thr else "no"
        print(f"{r['name'][:51]:<52}{r['atr']*100:>7.2f}%{r['ntr']:>8}"
              f"{r['ate']*100:>7.2f}%{r['nte']:>8}{r['ztr']:>7.2f}{r['zte']:>7.2f}{surv:>6}")

    survivors = [r for r in res if abs(r["ztr"]) >= thr]
    print(f"\nsurvivors on train: {len(survivors)}")
    conf = [r for r in survivors if abs(r["zte"]) >= 2.0 and
            math.copysign(1, r["zte"]) == math.copysign(1, r["ztr"])]
    print(f"of those, confirmed on test (|z_te|>=2, same sign): {len(conf)}")
    for r in conf:
        print(f"   {r['name']}  test {r['ate']*100:.2f}% n={r['nte']} z={r['zte']:.2f}  "
              f"{r['sig_per_day_te']:.1f} sig/day")

    # ---------------- UNIVERSE BASELINES ------------------------------------
    # The level rules must be judged against the plain fade baseline, not 50%.
    print("\n=== UNIVERSE BASELINES (no level anywhere in the rule) ===")

    def leg(mask, pred, lo, hi):
        m = mask & good & (y != 0)
        m[:lo] = False
        m[hi:] = False
        nn = int(m.sum())
        if nn == 0:
            return 0, float("nan")
        return nn, float((pred[m] == y[m]).mean())

    end = n - 1
    universes = {}
    for uname, (cond, upc) in (("mom1", (up1 | dn1, up1)),
                               ("mom3", (up3 | dn3, up3))):
        pu = np.where(upc, -1, 1).astype(np.int8)
        universes[uname] = (cond & good, pu)
        ntr, atr_ = leg(cond, pu, 0, split)
        nte, ate_ = leg(cond, pu, split, end)
        print(f"  fade {uname} (NO LEVEL)      train {atr_*100:.2f}% n={ntr}   "
              f"test {ate_*100:.2f}% n={nte}")
    # unconditional
    ntr, a = leg(np.ones(n, bool), np.ones(n, np.int8), 0, split)
    nte, a2 = leg(np.ones(n, bool), np.ones(n, np.int8), split, end)
    print(f"  always UP (unconditional)   train {a*100:.2f}% n={ntr}   test {a2*100:.2f}% n={nte}")

    # ---------------- DIFFERENTIAL CONTROL ----------------------------------
    # Within the SAME universe (same approach filter, same fade direction),
    # compare signal bars against the complement.  If they match, the level
    # contributes nothing.
    print("\n=== DIFFERENTIAL CONTROL: signal vs. rest-of-universe ===")
    print(f"{'rule':<46}{'sig_tr':>8}{'ctl_tr':>8}{'zdiff_tr':>9}"
          f"{'sig_te':>8}{'ctl_te':>8}{'zdiff_te':>9}")

    def zdiff(m1, m2, pred, lo, hi):
        a = m1 & good & (y != 0)
        b = m2 & good & (y != 0)
        a[:lo] = False; a[hi:] = False
        b[:lo] = False; b[hi:] = False
        n1, n2 = int(a.sum()), int(b.sum())
        if n1 < 30 or n2 < 30:
            return n1, float("nan"), n2, float("nan"), float("nan")
        p1 = float((pred[a] == y[a]).mean())
        p2 = float((pred[b] == y[b]).mean())
        p = (p1 * n1 + p2 * n2) / (n1 + n2)
        se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
        return n1, p1, n2, p2, (p1 - p2) / se if se > 0 else float("nan")

    diffrows = []
    for r in survivors:
        uname = "mom3" if " mom3 " in r["name"] else ("mom1" if " mom1 " in r["name"] else None)
        if uname is None:
            continue
        ucond, upred = universes[uname]
        # only bars where the rule's own prediction equals the universe fade
        # prediction, so the comparison isolates the level, not the direction
        m1 = r["mask"] & ucond & (r["pred"] == upred)
        m2 = ucond & ~r["mask"]
        n1, p1, n2, p2, z1 = zdiff(m1, m2, upred, 0, split)
        n1t, p1t, n2t, p2t, z2 = zdiff(m1, m2, upred, split, end)
        diffrows.append((abs(z1) if z1 == z1 else 0, r["name"], p1, p2, z1, p1t, p2t, z2, n1, n1t))

    for _, nm, p1, p2, z1, p1t, p2t, z2, n1, n1t in sorted(diffrows, reverse=True):
        print(f"{nm[:45]:<46}{p1*100:>7.2f}%{p2*100:>7.2f}%{z1:>9.2f}"
              f"{p1t*100:>7.2f}%{p2t*100:>7.2f}%{z2:>9.2f}")

    best_diff = [d for d in diffrows if abs(d[4]) >= 3.34]
    print(f"\nrules whose LEVEL component itself clears Bonferroni "
          f"(|z_diff_train| >= 3.34): {len(best_diff)}")

    # ---------------- PLACEBO GRID ------------------------------------------
    # Same geometry, wrong prices: shift the round-number grid by $137.
    print("\n=== PLACEBO: round-number grid shifted by $137 (not round at all) ===")
    for step in (250, 500, 1000):
        up_ = np.ceil((c - 137) / step) * step + 137
        dn_ = np.floor((c - 137) / step) * step + 137
        dr = np.where(up_ - c <= 0, step, up_ - c)
        ds = np.where(c - dn_ <= 0, step, c - dn_)
        drp = np.concatenate([[BIG], dr[:-1]])
        dsp = np.concatenate([[BIG], ds[:-1]])
        brk_up = (drp < BIG / 2) & ((c - cprev) > drp) & up3 & good
        brk_dn = (dsp < BIG / 2) & ((cprev - c) > dsp) & dn3 & good
        mask = brk_up | brk_dn
        pred = np.zeros(n, np.int8)
        pred[brk_up] = -1
        pred[brk_dn] = 1
        ntr, atr_ = leg(mask, pred, 0, split)
        nte, ate_ = leg(mask, pred, split, end)
        ucond, upred = universes["mom3"]
        _, q1, _, q2, zz = zdiff(mask & ucond & (pred == upred), ucond & ~mask, upred, 0, split)
        print(f"  PLACEBO break[${step} grid +137] mom3 FADE  train {atr_*100:.2f}% "
              f"n={ntr}  test {ate_*100:.2f}% n={nte}   z_diff_train={zz:.2f}")
        # the real one, same format
        dr2, ds2 = src[f"round{step}"][0], src[f"round{step}"][1]
        drp = np.concatenate([[BIG], dr2[:-1]])
        dsp = np.concatenate([[BIG], ds2[:-1]])
        bu = (drp < BIG / 2) & ((c - cprev) > drp) & up3 & good
        bd = (dsp < BIG / 2) & ((cprev - c) > dsp) & dn3 & good
        m = bu | bd
        p = np.zeros(n, np.int8); p[bu] = -1; p[bd] = 1
        ntr, atr_ = leg(m, p, 0, split)
        nte, ate_ = leg(m, p, split, end)
        _, q1, _, q2, zz = zdiff(m & ucond & (p == upred), ucond & ~m, upred, 0, split)
        print(f"  REAL    break[${step} grid      ] mom3 FADE  train {atr_*100:.2f}% "
              f"n={ntr}  test {ate_*100:.2f}% n={nte}   z_diff_train={zz:.2f}")

    # ---------------- move-size confound ------------------------------------
    # Breaking a level requires a big bar.  Does bar size alone explain it?
    print("\n=== CONFOUND: does raw move size explain the 'break' rules? ===")
    body = np.abs(c - cprev)
    ucond, upred = universes["mom3"]
    for thr_ in (1.0, 2.0, 3.0, 4.0):
        m = ucond & (body >= thr_ * scale)
        ntr, atr_ = leg(m, upred, 0, split)
        nte, ate_ = leg(m, upred, split, end)
        _, p1, _, p2, zz = zdiff(m, ucond & ~m, upred, 0, split)
        print(f"  fade mom3 & |c-c[-1]| >= {thr_}*scale (NO LEVEL)  train {atr_*100:.2f}% "
              f"n={ntr}  test {ate_*100:.2f}% n={nte}  z_diff_train={zz:.2f}")

    print("\ndone.")


if __name__ == "__main__":
    main()
