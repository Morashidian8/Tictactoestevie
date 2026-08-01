"""Stage 7: does a LOCALLY-normalised stretch absorb the pre-quiet effect entirely?

Hypothesis: stretch4 = |c-c[-4]| / med|move|(100) uses a 100-window denominator.
If the last 10 windows were quiet, the SAME stretch4 corresponds to a much more
extreme move relative to the CURRENT regime. So 'quiet before' may just be a
better-normalised stretch -- i.e. a re-parameterisation of the known effect.

Test: build lstretch = |c-c[-4]| / mean|move|(prior 10). If conditioning on
lstretch kills the vpre10/ppre10 gradients, the effect is known, not new.
Final question: does VOLUME add anything on top of lstretch?"""
from harness import *

F = load_feat()
tr, te = split(F)
n = len(F['t'])
v, c = F['v'], F['c']
mv100, mam100 = F['med_v100'], F['med_am100']
s4 = F['stretch4']
amove = [None] + [abs(c[i] - c[i - 1]) for i in range(1, n)]

vpre = [None] * n; ppre = [None] * n; lstr = [None] * n
for i in range(11, n):
    pv = sum(v[i - 10:i]) / 10.0
    pa = sum(amove[i - 10:i]) / 10.0
    if mv100[i] and mv100[i] > 0: vpre[i] = pv / mv100[i]
    if mam100[i] and mam100[i] > 0: ppre[i] = pa / mam100[i]
    if pa > 0 and i >= 4: lstr[i] = abs(c[i] - c[i - 4]) / pa

btr = [i for i in tr if s4[i] is not None and s4[i] >= 5.7]
bte = [i for i in te if s4[i] is not None and s4[i] >= 5.7]
print('base rule5: train %d test %d' % (len(btr), len(bte)))

def terc(vals, k=3):
    cu = quantiles(vals, [j / k for j in range(1, k)])
    return [-1e18] + cu + [1e18]
def bi(e, x):
    for k in range(len(e) - 1):
        if e[k] <= x < e[k + 1]: return k
    return None

print('\n=== 1. lstretch alone (quintiles, TRAIN cuts), base rule5, FADE ===')
el = terc([lstr[i] for i in btr if lstr[i] is not None], 5)
print('  TRAIN cuts: %s' % ['%.2f' % x for x in el[1:-1]])
for g in range(5):
    mtr = [i for i in btr if lstr[i] is not None and bi(el, lstr[i]) == g]
    mte = [i for i in bte if lstr[i] is not None and bi(el, lstr[i]) == g]
    ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
    print('  Q%d train %5d %.4f | test %5d %.4f z=%5.2f' % (
        g + 1, ntr, oktr / ntr, nte, okte / nte, z_of(nte, okte)))

print('\n=== 2. pooled within-lstretch-stratum effect of ppre10 and vpre10 ===')
el3 = terc([lstr[i] for i in btr if lstr[i] is not None], 3)
for nm, x in (('ppre10 (price quiet)', ppre), ('vpre10 (VOLUME quiet)', vpre)):
    cellv = {}
    for i in btr:
        if lstr[i] is None or x[i] is None: continue
        cellv.setdefault(bi(el3, lstr[i]), []).append(x[i])
    ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 90}
    print('  %s' % nm)
    for lab, blk in (('TRAIN', btr), ('TEST', bte)):
        pool = [[0, 0] for _ in range(3)]
        for i in blk:
            if lstr[i] is None or x[i] is None: continue
            a = bi(el3, lstr[i])
            if a not in ce: continue
            g = bi(ce[a], x[i])
            nn, ok = acc(F, [i], 'FADE')
            pool[g][0] += nn; pool[g][1] += ok
        s = ' | '.join('%s n=%5d %.4f' % (['QUIET', 'MID  ', 'BUSY '][g], pool[g][0],
                       pool[g][1] / pool[g][0] if pool[g][0] else 0) for g in range(3))
        d = pool[0][1] / pool[0][0] - pool[2][1] / pool[2][0]
        print('    %-5s %s   QUIET-BUSY %+.4f' % (lab, s, d))

print('\n=== 3. LAST CHANCE: does any VOLUME feature add on top of lstretch? ===')
print('    stratify on lstretch terciles, pool volume terciles, base rule5')
VOLF = ['vr20', 'vz100', 'vrank100', 'vtrend', 'vtrend520', 'mpv', 'impact',
        'dvr100', 'vr3_100', 'vpr']
# rebuild vconc/vslope
run = F['run']
vconc = [None] * n; vslope = [None] * n
for i in range(9, n):
    tot = sum(v[i - 9:i + 1])
    if tot > 0: vconc[i] = v[i] / tot
for i in range(1, n):
    r = max(1, min(run[i], 10))
    if i - r < 0: continue
    b = sum(v[i - r:i]) / r
    if b > 0: vslope[i] = v[i] / b
F['vconc10'] = vconc; F['vslope'] = vslope
VOLF += ['vconc10', 'vslope']
F['vpre10'] = vpre

K = 0
print('  %-11s %-20s %-20s %s' % ('feature', 'TRAIN LOW/MID/HIGH', 'TEST LOW/MID/HIGH', 'lift tr / te'))
for m in VOLF + ['vpre10']:
    x = F[m]
    cellv = {}
    for i in btr:
        if lstr[i] is None or x[i] is None: continue
        cellv.setdefault(bi(el3, lstr[i]), []).append(x[i])
    ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 90}
    res = {}
    for lab, blk in (('TRAIN', btr), ('TEST', bte)):
        pool = [[0, 0] for _ in range(3)]
        for i in blk:
            if lstr[i] is None or x[i] is None: continue
            a = bi(el3, lstr[i])
            if a not in ce: continue
            g = bi(ce[a], x[i])
            nn, ok = acc(F, [i], 'FADE')
            pool[g][0] += nn; pool[g][1] += ok
        K += 3
        res[lab] = [pool[g][1] / pool[g][0] if pool[g][0] else 0 for g in range(3)]
        res[lab + 'n'] = [pool[g][0] for g in range(3)]
    dtr = res['TRAIN'][2] - res['TRAIN'][0]
    dte = res['TEST'][2] - res['TEST'][0]
    flag = 'CONSISTENT' if dtr * dte > 0 and abs(dtr) > 0.01 else ''
    print('  %-11s %s  %s  %+.4f / %+.4f %s' % (
        m,
        '/'.join('%.4f' % q for q in res['TRAIN']),
        '/'.join('%.4f' % q for q in res['TEST']),
        dtr, dte, flag))
print('  K here = %d' % K)

print('\n=== 4. head-to-head best rules, TRAIN-selected, TEST-reported ===')
lcut = quantiles([lstr[i] for i in btr if lstr[i] is not None], [0.6])[0]
vcut = quantiles([vpre[i] for i in btr if vpre[i] is not None], [0.4])[0]
RULES = [
    ('rule5 alone', lambda i: s4[i] is not None and s4[i] >= 5.7),
    ('rule5 + vpre10 low (VOLUME)', lambda i: s4[i] is not None and s4[i] >= 5.7 and vpre[i] is not None and vpre[i] <= vcut),
    ('rule5 + lstretch high (PRICE)', lambda i: s4[i] is not None and s4[i] >= 5.7 and lstr[i] is not None and lstr[i] >= lcut),
    ('rule5 + lstretch high + vpre low', lambda i: s4[i] is not None and s4[i] >= 5.7 and lstr[i] is not None and lstr[i] >= lcut and vpre[i] is not None and vpre[i] <= vcut),
]
print('  %-34s %8s %7s %8s %7s %7s' % ('rule', 'train n', 'tr acc', 'test n', 'te acc', 'te z'))
for nm, f in RULES:
    mtr = [i for i in tr if f(i)]; mte = [i for i in te if f(i)]
    ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
    print('  %-34s %8d %7.4f %8d %7.4f %7.2f' % (
        nm, ntr, oktr / ntr, nte, okte / nte, z_of(nte, okte)))
