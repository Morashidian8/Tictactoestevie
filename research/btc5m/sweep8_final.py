"""Stage 8: final adjudication of vslope, the one volume feature still standing.

vslope = v[i] / mean(v over the preceding `run` candles)  -- how much the volume
of the terminal candle of an extended move exceeds the volume that built the move.

Two ways it could still be fake:
  (A) it re-measures the size of the current candle's move (bigger candle -> more
      volume). Control: stratify jointly on stretch1 AND lstretch.
  (B) it is a PRICE phenomenon: the terminal candle's RANGE expands vs the run.
      Control: horse race against rslope, the identical statistic built on
      high-low range instead of volume, and a 2D cross.

Also: difference-of-proportions z for HIGH vs LOW in TEST, and the shuffled
control run on this exact statistic."""
from harness import *
import math

F = load_feat()
tr, te = split(F)
n = len(F['t'])
v, c, h, l = F['v'], F['c'], F['h'], F['l']
run = F['run']
mam100 = F['med_am100']
s1, s4 = F['stretch1'], F['stretch4']
amove = [0.0] + [abs(c[i] - c[i - 1]) for i in range(1, n)]

lstr = [None] * n
for i in range(11, n):
    pa = sum(amove[i - 10:i]) / 10.0
    if pa > 0 and i >= 4: lstr[i] = abs(c[i] - c[i - 4]) / pa

rngv = [h[i] - l[i] for i in range(n)]
vslope = [None] * n; rslope = [None] * n; mslope = [None] * n
for i in range(1, n):
    r = max(1, min(run[i], 10))
    if i - r < 0: continue
    bv = sum(v[i - r:i]) / r
    br = sum(rngv[i - r:i]) / r
    bm = sum(amove[i - r:i]) / r
    if bv > 0: vslope[i] = v[i] / bv
    if br > 0: rslope[i] = rngv[i] / br
    if bm > 0: mslope[i] = amove[i] / bm

btr = [i for i in tr if s4[i] is not None and s4[i] >= 5.7]
bte = [i for i in te if s4[i] is not None and s4[i] >= 5.7]
print('base rule5 (stretch4>=5.7): train %d test %d' % (len(btr), len(bte)))

def terc(vals, k=3):
    cu = quantiles(vals, [j / k for j in range(1, k)])
    return [-1e18] + cu + [1e18]
def bi(e, x):
    for k in range(len(e) - 1):
        if e[k] <= x < e[k + 1]: return k
    return None

def diff_z(n1, k1, n2, k2):
    """two-proportion z for (HIGH acc) - (LOW acc)"""
    if not n1 or not n2: return 0.0
    p1 = k1 / n1; p2 = k2 / n2
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return (p1 - p2) / se if se > 0 else 0.0

e1 = terc([s1[i] for i in btr if s1[i] is not None])
el = terc([lstr[i] for i in btr if lstr[i] is not None])

def joint_stratum(i):
    if s1[i] is None or lstr[i] is None: return None
    a, b = bi(e1, s1[i]), bi(el, lstr[i])
    return None if a is None or b is None else (a, b)

print('\n=== (A) joint control: stratify on stretch1 terc x lstretch terc (9 cells) ===')
for nm, x in (('vslope (VOLUME)', vslope), ('rslope (PRICE range)', rslope), ('mslope (PRICE move)', mslope)):
    cellv = {}
    for i in btr:
        st = joint_stratum(i)
        if st is None or x[i] is None: continue
        cellv.setdefault(st, []).append(x[i])
    ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 60}
    print('  %s' % nm)
    store = {}
    for lab, blk in (('TRAIN', btr), ('TEST', bte)):
        pool = [[0, 0] for _ in range(3)]
        for i in blk:
            st = joint_stratum(i)
            if st is None or x[i] is None or st not in ce: continue
            g = bi(ce[st], x[i])
            nn, ok = acc(F, [i], 'FADE')
            pool[g][0] += nn; pool[g][1] += ok
        store[lab] = pool
        s = ' | '.join('%s n=%5d %.4f' % (['LOW ', 'MID ', 'HIGH'][g], pool[g][0],
                       pool[g][1] / pool[g][0] if pool[g][0] else 0) for g in range(3))
        d = pool[2][1] / pool[2][0] - pool[0][1] / pool[0][0]
        dz = diff_z(pool[2][0], pool[2][1], pool[0][0], pool[0][1])
        print('    %-5s %s   HIGH-LOW %+.4f  diff-z %5.2f' % (lab, s, d, dz))

print('\n=== (B) horse race 2D: vslope vs rslope, base rule5 ===')
ev = terc([vslope[i] for i in btr if vslope[i] is not None])
er = terc([rslope[i] for i in btr if rslope[i] is not None])
for lab, blk in (('TRAIN', btr), ('TEST', bte)):
    print('  %s  rows=rslope terc (price), cols=vslope terc (volume)' % lab)
    for a in range(3):
        cells = []
        for b in range(3):
            m = [i for i in blk if rslope[i] is not None and vslope[i] is not None
                 and bi(er, rslope[i]) == a and bi(ev, vslope[i]) == b]
            nn, ok = acc(F, m, 'FADE')
            cells.append('%.4f(%4d)' % (ok / nn, nn) if nn >= 30 else '    --     ')
        print('    R%d %s' % (a + 1, ' '.join(cells)))

print('\n  pooled within-PRICE-stratum vslope effect (price held constant):')
cellv = {}
for i in btr:
    if rslope[i] is None or vslope[i] is None: continue
    cellv.setdefault(bi(er, rslope[i]), []).append(vslope[i])
ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 90}
for lab, blk in (('TRAIN', btr), ('TEST', bte)):
    pool = [[0, 0] for _ in range(3)]
    for i in blk:
        if rslope[i] is None or vslope[i] is None: continue
        a = bi(er, rslope[i])
        if a not in ce: continue
        g = bi(ce[a], vslope[i])
        nn, ok = acc(F, [i], 'FADE')
        pool[g][0] += nn; pool[g][1] += ok
    d = pool[2][1] / pool[2][0] - pool[0][1] / pool[0][0]
    dz = diff_z(pool[2][0], pool[2][1], pool[0][0], pool[0][1])
    s = ' | '.join('%s n=%5d %.4f' % (['LOW ', 'MID ', 'HIGH'][g], pool[g][0],
                   pool[g][1] / pool[g][0] if pool[g][0] else 0) for g in range(3))
    print('    %-5s %s   HIGH-LOW %+.4f  diff-z %5.2f' % (lab, s, d, dz))

print('\n  pooled within-VOLUME-stratum rslope effect (volume held constant):')
cellv = {}
for i in btr:
    if rslope[i] is None or vslope[i] is None: continue
    cellv.setdefault(bi(ev, vslope[i]), []).append(rslope[i])
ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 90}
for lab, blk in (('TRAIN', btr), ('TEST', bte)):
    pool = [[0, 0] for _ in range(3)]
    for i in blk:
        if rslope[i] is None or vslope[i] is None: continue
        a = bi(ev, vslope[i])
        if a not in ce: continue
        g = bi(ce[a], rslope[i])
        nn, ok = acc(F, [i], 'FADE')
        pool[g][0] += nn; pool[g][1] += ok
    d = pool[2][1] / pool[2][0] - pool[0][1] / pool[0][0]
    dz = diff_z(pool[2][0], pool[2][1], pool[0][0], pool[0][1])
    s = ' | '.join('%s n=%5d %.4f' % (['LOW ', 'MID ', 'HIGH'][g], pool[g][0],
                   pool[g][1] / pool[g][0] if pool[g][0] else 0) for g in range(3))
    print('    %-5s %s   HIGH-LOW %+.4f  diff-z %5.2f' % (lab, s, d, dz))

print('\n=== (C) final candidate rules, side FADE, TRAIN-selected cuts ===')
vs_cut = quantiles([vslope[i] for i in btr if vslope[i] is not None], [2 / 3])[0]
rs_cut = quantiles([rslope[i] for i in btr if rslope[i] is not None], [2 / 3])[0]
print('  TRAIN cuts: vslope>=%.3f  rslope>=%.3f' % (vs_cut, rs_cut))
R5 = lambda i: s4[i] is not None and s4[i] >= 5.7
RULES = [
    ('rule5 alone (known baseline)', R5),
    ('rule5 + vslope high (VOLUME)', lambda i: R5(i) and vslope[i] is not None and vslope[i] >= vs_cut),
    ('rule5 + rslope high (PRICE)', lambda i: R5(i) and rslope[i] is not None and rslope[i] >= rs_cut),
    ('rule5 + both high', lambda i: R5(i) and vslope[i] is not None and vslope[i] >= vs_cut and rslope[i] is not None and rslope[i] >= rs_cut),
    ('rule5 + vslope high, rslope LOW', lambda i: R5(i) and vslope[i] is not None and vslope[i] >= vs_cut and rslope[i] is not None and rslope[i] < rs_cut),
]
print('  %-34s %8s %7s %8s %7s %7s' % ('rule', 'train n', 'tr acc', 'test n', 'te acc', 'te z'))
for nm, f in RULES:
    mtr = [i for i in tr if f(i)]; mte = [i for i in te if f(i)]
    ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
    print('  %-34s %8d %7.4f %8d %7.4f %7.2f' % (
        nm, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

print('\n  both-directions for rule5 + vslope high:')
sgn = F['sgn']
f = RULES[1][1]
for dlab, want in (('down move -> bet UP', -1), ('up move -> bet DOWN', 1)):
    mtr = [i for i in tr if f(i) and sgn[i] == want]
    mte = [i for i in te if f(i) and sgn[i] == want]
    ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
    print('    %-22s train %5d %.4f | test %5d %.4f z=%5.2f' % (
        dlab, ntr, oktr / ntr, nte, okte / nte, z_of(nte, okte)))

print('\n=== (D) shuffled-label control on THIS statistic (within-stratum HIGH-LOW lift) ===')
cellv = {}
for i in btr:
    st = joint_stratum(i)
    if st is None or vslope[i] is None: continue
    cellv.setdefault(st, []).append(vslope[i])
ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 60}
lifts = []
for seed in range(30):
    ysh = shuffled_y(F, tr, te, seed)
    pool = [[0, 0] for _ in range(3)]
    for i in bte:
        st = joint_stratum(i)
        if st is None or vslope[i] is None or st not in ce: continue
        g = bi(ce[st], vslope[i])
        nn, ok = acc(F, [i], 'FADE', ysh)
        pool[g][0] += nn; pool[g][1] += ok
    lifts.append(pool[2][1] / pool[2][0] - pool[0][1] / pool[0][0])
lifts.sort()
print('  noise TEST HIGH-LOW lift: p50 %+.4f  p95 %+.4f  max %+.4f' % (
    lifts[15], lifts[int(.95 * 30)], lifts[-1]))
