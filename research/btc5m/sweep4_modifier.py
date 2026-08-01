"""Stage 4: volume as a MODIFIER on the known stretch/fade edge.
For each base stretch set x each volume modifier, split into TRAIN terciles and
measure FADE accuracy. A real finding = monotone gradient present in BOTH splits,
i.e. volume separates good fades from bad ones.

Also builds several genuinely new participation features (exhaustion divergence,
volume slope through the run, drought-then-move) and tests them the same way."""
from harness import *

F = load_feat()
tr, te = split(F)
n = len(F['t'])
h, l, c, v, o = F['h'], F['l'], F['c'], F['v'], F['o']
run, sgn, sa = F['run'], F['sgn'], F['stretch_any']

# ---------- NEW participation features ----------
# 1. vslope_run: volume of the last candle of the move vs mean volume over the
#    preceding (run) candles -> is participation building or fading into the extreme?
vslope = [None] * n
for i in range(1, n):
    r = max(1, min(run[i], 10))
    if i - r < 0: continue
    base = sum(v[i - r:i]) / r if r > 0 else 0
    if base > 0:
        vslope[i] = v[i] / base
F['vslope'] = vslope

# 2. exhaustion divergence: current close is a new 20-window extreme, and the
#    volume now is LOWER than the volume at the previous 20-window extreme.
div = [None] * n
for i in range(21, n):
    win = list(range(i - 20, i))
    if c[i] > max(c[j] for j in win):
        pj = max(win, key=lambda j: c[j])
        div[i] = v[i] / v[pj] if v[pj] > 0 else None
    elif c[i] < min(c[j] for j in win):
        pj = min(win, key=lambda j: c[j])
        div[i] = v[i] / v[pj] if v[pj] > 0 else None
F['vdiv20'] = div

# 3. drought-then-move: mean volume of the 10 windows BEFORE the current one,
#    relative to the 100-median -> was the move launched out of quiet?
pre = [None] * n
mv100 = F['med_v100']
for i in range(11, n):
    if mv100[i] and mv100[i] > 0:
        pre[i] = (sum(v[i - 10:i]) / 10.0) / mv100[i]
F['vpre10'] = pre

# 4. volume concentration: share of the last 10 windows' volume that landed in
#    the single current window -> one-print move vs distributed flow
conc = [None] * n
for i in range(9, n):
    tot = sum(v[i - 9:i + 1])
    if tot > 0: conc[i] = v[i] / tot
F['vconc10'] = conc

BASES = [
    ('stretch_any (r1|r2|r3|r5)', lambda i: sa[i]),
    ('rule5 stretch4>=5.7', lambda i: F['stretch4'][i] is not None and F['stretch4'][i] >= 5.7),
    ('run>=6 (rule3)', lambda i: run[i] >= 6),
    ('stretch1 top quintile', None),  # filled below
]
s1 = F['stretch1']
s1cut = quantiles([s1[i] for i in tr if s1[i] is not None], [0.8])[0]
BASES[3] = ('stretch1 top quintile', lambda i: s1[i] is not None and s1[i] >= s1cut)

MODS = ['vr20', 'vz100', 'vrank100', 'vtrend', 'vtrend520', 'mpv', 'impact',
        'dvr100', 'vr3_100', 'vslope', 'vdiv20', 'vpre10', 'vconc10']

K = 0
hits = []
print('%-26s %-10s %-4s %8s %7s %8s %7s %7s' % (
    'base', 'modifier', 'terc', 'train n', 'tr fade', 'test n', 'te fade', 'te z'))
for bname, bf in BASES:
    btr = [i for i in tr if bf(i)]
    bte = [i for i in te if bf(i)]
    n_b, ok_b = acc(F, btr, 'FADE'); n_bt, ok_bt = acc(F, bte, 'FADE')
    print('-' * 96)
    print('%-26s %-10s %-4s %8d %7.4f %8d %7.4f %7.2f   <-- BASE, no volume filter' % (
        bname, '(all)', '-', n_b, ok_b / n_b, n_bt, ok_bt / n_bt, z_of(n_bt, ok_bt)))
    base_te = ok_bt / n_bt
    base_tr = ok_b / n_b
    for m in MODS:
        x = F[m]
        vals = [x[i] for i in btr if x[i] is not None]
        if len(vals) < 900: continue
        cuts = quantiles(vals, [1 / 3, 2 / 3])
        edges = [-1e18] + cuts + [1e18]
        line = []
        for t3 in range(3):
            lo, hi = edges[t3], edges[t3 + 1]
            mtr = [i for i in btr if x[i] is not None and lo <= x[i] < hi]
            mte = [i for i in bte if x[i] is not None and lo <= x[i] < hi]
            ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
            K += 1
            atr = oktr / ntr if ntr else 0; ate = okte / nte if nte else 0
            line.append((t3, ntr, atr, nte, ate, z_of(nte, okte)))
        for t3, ntr, atr, nte, ate, z in line:
            print('%-26s %-10s T%-3d %8d %7.4f %8d %7.4f %7.2f' % (
                bname if t3 == 0 else '', m, t3 + 1, ntr, atr, nte, ate, z))
        # lift = top tercile minus bottom tercile, must agree in sign across splits
        d_tr = line[2][2] - line[0][2]
        d_te = line[2][4] - line[0][4]
        if abs(d_tr) > 0.015 and d_tr * d_te > 0 and min(line[0][3], line[2][3]) >= 400:
            hits.append((bname, m, d_tr, d_te, line))
        print('%-26s %-10s LIFT T3-T1: train %+.4f  test %+.4f  %s' % (
            '', m, d_tr, d_te, 'CONSISTENT' if d_tr * d_te > 0 else 'sign flip'))

print('\nK (base x modifier x tercile) = %d   bar sqrt(2 ln K) = %.2f' % (K, bar(K)))
print('\n=== modifier gradients consistent in sign across train AND test, |train lift|>1.5pp ===')
for bname, m, dtr, dte, line in hits:
    print('  %-26s %-10s train %+.4f  test %+.4f' % (bname, m, dtr, dte))
if not hits:
    print('  (none)')
