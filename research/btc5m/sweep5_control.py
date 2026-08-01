"""Stage 5: THE decisive control.

The stage-4 lift could simply be re-measuring how big the move was (bigger move
-> more volume -> better fade), in which case it is the known stretch effect in a
volume costume. So: STRATIFY on move magnitude (stretch1 x stretch4 terciles,
cuts from TRAIN) and ask whether the volume modifier still separates WITHIN a
stratum, where move size is held ~constant.

Also: both-directions check, and the same test on the NO-stretch subset."""
from harness import *

F = load_feat()
tr, te = split(F)
n = len(F['t'])
v, c, h, l = F['v'], F['c'], F['h'], F['l']
run, sgn, sa = F['run'], F['sgn'], F['stretch_any']
mv100 = F['med_v100']

# rebuild the stage-4 new features (kept identical)
vslope = [None] * n
for i in range(1, n):
    r = max(1, min(run[i], 10))
    if i - r < 0: continue
    base = sum(v[i - r:i]) / r
    if base > 0: vslope[i] = v[i] / base
vconc = [None] * n
for i in range(9, n):
    tot = sum(v[i - 9:i + 1])
    if tot > 0: vconc[i] = v[i] / tot
vpre = [None] * n
for i in range(11, n):
    if mv100[i] and mv100[i] > 0: vpre[i] = (sum(v[i - 10:i]) / 10.0) / mv100[i]
F['vslope'] = vslope; F['vconc10'] = vconc; F['vpre10'] = vpre

s1, s4 = F['stretch1'], F['stretch4']
BASE = lambda i: s4[i] is not None and s4[i] >= 5.7
btr = [i for i in tr if BASE(i)]
bte = [i for i in te if BASE(i)]
print('base rule5 (stretch4>=5.7): train %d  test %d' % (len(btr), len(bte)))

def terc_edges(vals):
    cuts = quantiles(vals, [1 / 3, 2 / 3])
    return [-1e18] + cuts + [1e18]

def bi(edges, x):
    for k in range(len(edges) - 1):
        if edges[k] <= x < edges[k + 1]:
            return k
    return None

# ---- strata on move magnitude, cuts from TRAIN ----
e1 = terc_edges([s1[i] for i in btr if s1[i] is not None])
e4 = terc_edges([s4[i] for i in btr if s4[i] is not None])
print('stretch1 TRAIN terc cuts within base: %s' % ['%.2f' % x for x in e1[1:-1]])
print('stretch4 TRAIN terc cuts within base: %s' % ['%.2f' % x for x in e4[1:-1]])

def stratum(i):
    if s1[i] is None or s4[i] is None: return None
    a, b = bi(e1, s1[i]), bi(e4, s4[i])
    return None if a is None or b is None else (a, b)

for MOD in ('vconc10', 'vslope', 'vr20', 'vpre10'):
    x = F[MOD]
    # per-stratum tercile cuts of the modifier, from TRAIN only
    cell_tr = {}
    for i in btr:
        st = stratum(i)
        if st is None or x[i] is None: continue
        cell_tr.setdefault(st, []).append(x[i])
    cell_edges = {st: terc_edges(vals) for st, vals in cell_tr.items() if len(vals) >= 90}

    print('\n=== %s, STRATIFIED on (stretch1 terc x stretch4 terc) ===' % MOD)
    print('  pooling the within-stratum LOW / MID / HIGH %s groups' % MOD)
    for lab, blk in (('TRAIN', btr), ('TEST', bte)):
        pool = [[0, 0] for _ in range(3)]
        for i in blk:
            st = stratum(i)
            if st is None or x[i] is None or st not in cell_edges: continue
            g = bi(cell_edges[st], x[i])
            if g is None: continue
            nn, ok = acc(F, [i], 'FADE')
            pool[g][0] += nn; pool[g][1] += ok
        out = []
        for g in range(3):
            nn, ok = pool[g]
            out.append('%s n=%5d acc=%.4f z=%5.2f' % (['LOW ', 'MID ', 'HIGH'][g], nn, ok / nn if nn else 0, z_of(nn, ok)))
        print('  %-5s %s' % (lab, ' | '.join(out)))
        if pool[0][0] and pool[2][0]:
            d = pool[2][1] / pool[2][0] - pool[0][1] / pool[0][0]
            print('        within-stratum HIGH-LOW lift = %+.4f' % d)

# ---- both-directions check on the headline combo ----
print('\n=== both-directions check: rule5 + vconc10 high (TRAIN tercile cut) ===')
vc_cut = quantiles([vconc[i] for i in btr if vconc[i] is not None], [2 / 3])[0]
print('  vconc10 TRAIN top-tercile cut = %.4f' % vc_cut)
COMBO = lambda i: BASE(i) and vconc[i] is not None and vconc[i] >= vc_cut
for dlab, want in (('last move DOWN -> bet UP', -1), ('last move UP -> bet DOWN', 1)):
    mtr = [i for i in tr if COMBO(i) and sgn[i] == want]
    mte = [i for i in te if COMBO(i) and sgn[i] == want]
    ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
    print('  %-26s train %5d %.4f | test %5d %.4f  z=%5.2f' % (
        dlab, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

# ---- does the volume modifier do ANYTHING where there is no stretch at all? ----
print('\n=== vconc10 / vslope on the NO-stretch subset (stretch_any == False) ===')
clean_tr = [i for i in tr if not sa[i]]
clean_te = [i for i in te if not sa[i]]
print('  clean subset: train %d  test %d' % (len(clean_tr), len(clean_te)))
for MOD in ('vconc10', 'vslope', 'vr20', 'vz100'):
    x = F[MOD]
    cuts = quantiles([x[i] for i in clean_tr if x[i] is not None], [1 / 3, 2 / 3])
    edges = [-1e18] + cuts + [1e18]
    row = []
    for g in range(3):
        mtr = [i for i in clean_tr if x[i] is not None and edges[g] <= x[i] < edges[g + 1]]
        mte = [i for i in clean_te if x[i] is not None and edges[g] <= x[i] < edges[g + 1]]
        ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
        row.append('%s tr %.4f te %.4f(n=%d,z=%.2f)' % (['LOW', 'MID', 'HI '][g],
                   oktr / ntr if ntr else 0, okte / nte if nte else 0, nte, z_of(nte, okte)))
    print('  %-9s %s' % (MOD, ' | '.join(row)))
