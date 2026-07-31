"""Volume / participation feature engine for BTC 5m next-window direction.

Pure stdlib. Builds a feature matrix once, caches to a pickle so the
search scripts start fast.
"""
import gzip, csv, math, statistics, pickle, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'btc5m.csv.gz')
CACHE = '/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/feat.pkl'


def load():
    t, o, h, l, c, v = [], [], [], [], [], []
    with gzip.open(DATA, 'rt') as f:
        for row in csv.DictReader(f):
            t.append(int(row['t'])); o.append(float(row['o'])); h.append(float(row['h']))
            l.append(float(row['l'])); c.append(float(row['c'])); v.append(float(row['v']))
    return t, o, h, l, c, v


def roll_median(x, w):
    """median of x[i-w+1..i], None until enough history"""
    out = [None] * len(x)
    for i in range(w - 1, len(x)):
        s = sorted(x[i - w + 1:i + 1])
        m = w // 2
        out[i] = s[m] if w % 2 else 0.5 * (s[m - 1] + s[m])
    return out


def roll_mean_std(x, w):
    mu = [None] * len(x); sd = [None] * len(x)
    s = 0.0; s2 = 0.0
    for i in range(len(x)):
        s += x[i]; s2 += x[i] * x[i]
        if i >= w:
            s -= x[i - w]; s2 -= x[i - w] * x[i - w]
        if i >= w - 1:
            m = s / w
            var = max(0.0, s2 / w - m * m)
            mu[i] = m; sd[i] = math.sqrt(var)
    return mu, sd


def roll_rank(x, w):
    """percentile rank of x[i] within trailing window (0..1), strict-less + half ties"""
    out = [None] * len(x)
    for i in range(w - 1, len(x)):
        cur = x[i]; win = x[i - w + 1:i + 1]
        lt = 0; eq = 0
        for y in win:
            if y < cur: lt += 1
            elif y == cur: eq += 1
        out[i] = (lt + 0.5 * eq) / w
    return out


def roll_max(x, w):
    out = [None] * len(x)
    for i in range(w - 1, len(x)):
        out[i] = max(x[i - w + 1:i + 1])
    return out


def roll_min(x, w):
    out = [None] * len(x)
    for i in range(w - 1, len(x)):
        out[i] = min(x[i - w + 1:i + 1])
    return out


def build():
    t, o, h, l, c, v = load()
    n = len(t)
    F = {}
    F['t'] = t; F['o'] = o; F['h'] = h; F['l'] = l; F['c'] = c; F['v'] = v

    # ---- price primitives ----
    move = [None] * n            # c[i] - c[i-1]
    for i in range(1, n):
        move[i] = c[i] - c[i - 1]
    F['move'] = move
    amove = [None if m is None else abs(m) for m in move]

    # target: direction of NEXT window close-to-close. +1 up, -1 down, 0 flat(skip)
    y = [0] * n
    for i in range(n - 1):
        d = c[i + 1] - c[i]
        y[i] = 1 if d > 0 else (-1 if d < 0 else 0)
    y[n - 1] = 0
    F['y'] = y

    # sign of current move (the "last move" used for fade/follow)
    sgn = [0] * n
    for i in range(1, n):
        sgn[i] = 1 if move[i] > 0 else (-1 if move[i] < 0 else 0)
    F['sgn'] = sgn

    # median |move| over 100 -> the known stretch denominator
    am_fill = [0.0 if x is None else x for x in amove]
    med_am100 = roll_median(am_fill, 100)
    F['med_am100'] = med_am100

    # stretch over spans 1..8 : |c[i]-c[i-k]| / med_am100
    for k in (1, 2, 3, 4, 6, 8):
        s = [None] * n
        for i in range(n):
            if i - k < 0 or med_am100[i] is None or med_am100[i] <= 0: continue
            s[i] = abs(c[i] - c[i - k]) / med_am100[i]
        F['stretch%d' % k] = s

    # run length of same-direction moves ending at i
    run = [0] * n
    for i in range(1, n):
        if sgn[i] == 0:
            run[i] = 0
        elif sgn[i] == sgn[i - 1]:
            run[i] = run[i - 1] + 1
        else:
            run[i] = 1
    F['run'] = run

    # rolling realised vol of moves (std over 100) for later
    mu_m, sd_m = roll_mean_std([0.0 if x is None else x for x in move], 100)
    F['sd_move100'] = sd_m

    # ---- VOLUME FEATURES ----
    med_v20 = roll_median(v, 20)
    med_v50 = roll_median(v, 50)
    med_v100 = roll_median(v, 100)
    mu_v100, sd_v100 = roll_mean_std(v, 100)
    mu_v20, sd_v20 = roll_mean_std(v, 20)
    F['med_v20'] = med_v20; F['med_v100'] = med_v100

    def ratio(num, den):
        out = [None] * n
        for i in range(n):
            if den[i] is None or den[i] <= 0: continue
            out[i] = num[i] / den[i]
        return out

    F['vr20'] = ratio(v, med_v20)      # volume vs own 20-median
    F['vr50'] = ratio(v, med_v50)
    F['vr100'] = ratio(v, med_v100)
    F['vz100'] = [None if (sd_v100[i] is None or sd_v100[i] <= 0) else (v[i] - mu_v100[i]) / sd_v100[i] for i in range(n)]
    F['vz20'] = [None if (sd_v20[i] is None or sd_v20[i] <= 0) else (v[i] - mu_v20[i]) / sd_v20[i] for i in range(n)]

    # percentile rank of volume in trailing 100 (spike / drought detector, robust)
    F['vrank100'] = roll_rank(v, 100)

    # volume trend: mean(v last 3) / mean(v last 4..13)
    vt = [None] * n
    for i in range(13, n):
        a = sum(v[i - 2:i + 1]) / 3.0
        b = sum(v[i - 12:i - 2]) / 10.0
        if b > 0: vt[i] = a / b
    F['vtrend'] = vt

    # volume trend 5 vs 20
    vt2 = [None] * n
    for i in range(25, n):
        a = sum(v[i - 4:i + 1]) / 5.0
        b = sum(v[i - 24:i + 1]) / 25.0
        if b > 0: vt2[i] = a / b
    F['vtrend520'] = vt2

    # crude liquidity proxy: volume per unit price range, normalised by own median
    rng = [max(1e-9, h[i] - l[i]) for i in range(n)]
    vpr = [v[i] / rng[i] for i in range(n)]
    F['vpr'] = ratio(vpr, roll_median(vpr, 100))

    # inverse: price range achieved per unit of volume = "impact" / thinness
    imp = [rng[i] / v[i] if v[i] > 0 else None for i in range(n)]
    imp_f = [0.0 if x is None else x for x in imp]
    med_imp = roll_median(imp_f, 100)
    F['impact'] = ratio(imp_f, med_imp)

    # dollar volume relative
    dv = [v[i] * c[i] for i in range(n)]
    F['dvr100'] = ratio(dv, roll_median(dv, 100))

    # move per unit volume (signed magnitude of close-to-close per volume)
    mpv = [None] * n
    for i in range(1, n):
        if v[i] > 0: mpv[i] = abs(move[i]) / v[i]
    mpv_f = [0.0 if x is None else x for x in mpv]
    F['mpv'] = ratio(mpv_f, roll_median(mpv_f, 100))

    # cumulative volume over last 3 / last 12 relative to median
    v3 = [None] * n
    for i in range(2, n):
        v3[i] = v[i] + v[i - 1] + v[i - 2]
    v3f = [0.0 if x is None else x for x in v3]
    F['vr3_100'] = ratio(v3f, roll_median(v3f, 100))

    # signed volume: volume attributed to direction of the candle body, 10-window imbalance
    sv = [0.0] * n
    for i in range(n):
        s = 1.0 if c[i] > o[i] else (-1.0 if c[i] < o[i] else 0.0)
        sv[i] = s * v[i]
    ob = [None] * n
    for i in range(9, n):
        tot = sum(v[i - 9:i + 1])
        if tot > 0: ob[i] = sum(sv[i - 9:i + 1]) / tot
    F['vimb10'] = ob

    ob3 = [None] * n
    for i in range(2, n):
        tot = sum(v[i - 2:i + 1])
        if tot > 0: ob3[i] = sum(sv[i - 2:i + 1]) / tot
    F['vimb3'] = ob3

    # ---- known-stretch flags (rules 1,2,3,5) so we can carve a stretch-free subset ----
    hi20 = roll_max(c, 20); lo20 = roll_min(c, 20)
    vol20_arr, _ = roll_mean_std([0.0 if x is None else x for x in amove], 20)
    vol100_arr, _ = roll_mean_std([0.0 if x is None else x for x in amove], 100)
    r1 = [False] * n; r2 = [False] * n; r3 = [False] * n; r5 = [False] * n
    for i in range(n):
        # rule 1: close breaks 20-candle high/low and vol20/vol100 >= 0.8884
        if i >= 100 and hi20[i - 1] is not None and vol100_arr[i] and vol100_arr[i] > 0:
            brk = c[i] > hi20[i - 1] or c[i] < lo20[i - 1]
            if brk and vol20_arr[i] / vol100_arr[i] >= 0.8884:
                r1[i] = True
        # rule 2: 3 same-direction moves + last move > 2x med|move|100
        if run[i] >= 3 and med_am100[i] and amove[i] and amove[i] > 2.0 * med_am100[i]:
            r2[i] = True
        # rule 3: run >= 6
        if run[i] >= 6:
            r3[i] = True
        # rule 5: |c[i]-c[i-4]| >= 5.7 x med|move|100
        s4 = F['stretch4'][i]
        if s4 is not None and s4 >= 5.7:
            r5[i] = True
    F['r1'] = r1; F['r2'] = r2; F['r3'] = r3; F['r5'] = r5
    F['stretch_any'] = [r1[i] or r2[i] or r3[i] or r5[i] for i in range(n)]

    return F


if __name__ == '__main__':
    F = build()
    with open(CACHE, 'wb') as f:
        pickle.dump(F, f)
    n = len(F['t'])
    print('rows', n)
    print('stretch_any fires', sum(F['stretch_any']), '(%.1f%%)' % (100.0 * sum(F['stretch_any']) / n))
    for k in ('vr20', 'vz100', 'vrank100', 'vtrend', 'vpr', 'impact', 'vimb10'):
        vals = [x for x in F[k] if x is not None]
        vals.sort()
        print('%-10s n=%d  p5=%.3f p50=%.3f p95=%.3f p99=%.3f' % (
            k, len(vals), vals[int(.05 * len(vals))], vals[int(.5 * len(vals))],
            vals[int(.95 * len(vals))], vals[int(.99 * len(vals))]))
