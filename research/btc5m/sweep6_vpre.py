"""Stage 6: deep dive on vpre10 -- pre-move participation as a fade-quality filter.

vpre10 = mean volume of the 10 windows BEFORE the current one, / median volume(100).
Claim under test: a stretched move that erupts out of a QUIET tape fades better
than the same-sized move on an already-busy tape.

Must survive:
  (a) monotone gradient over quintiles, cuts from TRAIN
  (b) both directions
  (c) several different stretch bases
  (d) HORSE RACE vs the price-based analogue (pre-move price compression), which
      is a known-dead feature family -- volume must add over price
  (e) shuffled-label control through the identical pipeline
"""
from harness import *

F = load_feat()
tr, te = split(F)
n = len(F['t'])
v, c = F['v'], F['c']
run, sgn, sa = F['run'], F['sgn'], F['stretch_any']
mv100, mam100 = F['med_v100'], F['med_am100']
s1, s4 = F['stretch1'], F['stretch4']
amove = [None] + [abs(c[i] - c[i - 1]) for i in range(1, n)]

# vpre10: pre-move VOLUME
vpre = [None] * n
for i in range(11, n):
    if mv100[i] and mv100[i] > 0:
        vpre[i] = (sum(v[i - 10:i]) / 10.0) / mv100[i]

# ppre10: pre-move PRICE activity (the price analogue -- compression)
ppre = [None] * n
for i in range(11, n):
    if mam100[i] and mam100[i] > 0:
        ppre[i] = (sum(amove[i - 10:i]) / 10.0) / mam100[i]

# rpre10: pre-move high-low RANGE analogue
h, l = F['h'], F['l']
rng = [h[i] - l[i] for i in range(n)]
mrng = F['med_am100']
rpre = [None] * n
for i in range(11, n):
    if mrng[i] and mrng[i] > 0:
        rpre[i] = (sum(rng[i - 10:i]) / 10.0) / mrng[i]

BASES = [
    ('rule5 stretch4>=5.7', lambda i: s4[i] is not None and s4[i] >= 5.7),
    ('stretch_any', lambda i: sa[i]),
    ('run>=6', lambda i: run[i] >= 6),
]
s1cut = quantiles([s1[i] for i in tr if s1[i] is not None], [0.8])[0]
BASES.append(('stretch1 top quintile', lambda i: s1[i] is not None and s1[i] >= s1cut))

K = 0

def quint_table(name, x, bname, bf, blk_tr, blk_te, y=None):
    global K
    vals = [x[i] for i in blk_tr if x[i] is not None]
    if len(vals) < 1000: return None
    cuts = quantiles(vals, [.2, .4, .6, .8])
    edges = [-1e18] + cuts + [1e18]
    rows = []
    for g in range(5):
        mtr = [i for i in blk_tr if x[i] is not None and edges[g] <= x[i] < edges[g + 1]]
        mte = [i for i in blk_te if x[i] is not None and edges[g] <= x[i] < edges[g + 1]]
        ntr, oktr = acc(F, mtr, 'FADE', y); nte, okte = acc(F, mte, 'FADE', y)
        K += 1
        rows.append((ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))
    return rows, edges

print('=== (a)+(c) vpre10 quintile gradient (FADE acc) across stretch bases ===')
for bname, bf in BASES:
    btr = [i for i in tr if bf(i)]; bte = [i for i in te if bf(i)]
    out = quint_table('vpre10', vpre, bname, bf, btr, bte)
    if not out: continue
    rows, edges = out
    print('\n%s  (base: train %d / test %d)' % (bname, len(btr), len(bte)))
    print('  %-4s %8s %8s %8s %8s %7s' % ('quint', 'train n', 'tr acc', 'test n', 'te acc', 'te z'))
    for g, (ntr, atr, nte, ate, z) in enumerate(rows):
        print('  Q%-3d %8d %8.4f %8d %8.4f %7.2f' % (g + 1, ntr, atr, nte, ate, z))
    print('  TRAIN cuts: %s' % ['%.2f' % x for x in edges[1:-1]])

print('\n\n=== (d) HORSE RACE: volume-quiet vs price-quiet, base = rule5 ===')
btr = [i for i in tr if s4[i] is not None and s4[i] >= 5.7]
bte = [i for i in te if s4[i] is not None and s4[i] >= 5.7]
for nm, x in (('vpre10 (VOLUME)', vpre), ('ppre10 (PRICE |move|)', ppre), ('rpre10 (PRICE range)', rpre)):
    rows, edges = quint_table(nm, x, 'rule5', None, btr, bte)
    print('\n  %s' % nm)
    for g, (ntr, atr, nte, ate, z) in enumerate(rows):
        print('    Q%-3d train %5d %.4f | test %5d %.4f  z=%5.2f' % (g + 1, ntr, atr, nte, ate, z))
    print('    lift Q1-Q5: train %+.4f  test %+.4f' % (rows[0][1] - rows[4][1], rows[0][3] - rows[4][3]))

print('\n  --- 2D: does vpre10 still separate at FIXED price-quiet? (base rule5) ---')
def terc(vals):
    cu = quantiles(vals, [1 / 3, 2 / 3]); return [-1e18] + cu + [1e18]
def bi(e, x):
    for k in range(len(e) - 1):
        if e[k] <= x < e[k + 1]: return k
    return None
ep = terc([ppre[i] for i in btr if ppre[i] is not None])
ev = terc([vpre[i] for i in btr if vpre[i] is not None])
for lab, blk in (('TRAIN', btr), ('TEST', bte)):
    print('  %s  rows=ppre10 terc, cols=vpre10 terc' % lab)
    for a in range(3):
        cells = []
        for b in range(3):
            m = [i for i in blk if ppre[i] is not None and vpre[i] is not None
                 and bi(ep, ppre[i]) == a and bi(ev, vpre[i]) == b]
            nn, ok = acc(F, m, 'FADE')
            cells.append('%.4f(%4d)' % (ok / nn, nn) if nn else '    --     ')
        print('    P%d %s' % (a + 1, ' '.join(cells)))

print('\n  --- pooled within-price-stratum vpre10 effect (controls for compression) ---')
for lab, blk in (('TRAIN', btr), ('TEST', bte)):
    pool = [[0, 0] for _ in range(3)]
    cellv = {}
    for i in btr:
        if ppre[i] is None or vpre[i] is None: continue
        cellv.setdefault(bi(ep, ppre[i]), []).append(vpre[i])
    ce = {k: terc(vv) for k, vv in cellv.items() if len(vv) >= 90}
    for i in blk:
        if ppre[i] is None or vpre[i] is None: continue
        a = bi(ep, ppre[i])
        if a not in ce: continue
        g = bi(ce[a], vpre[i])
        nn, ok = acc(F, [i], 'FADE')
        pool[g][0] += nn; pool[g][1] += ok
    s = ' | '.join('%s n=%5d acc=%.4f' % (['LOWvol ', 'MIDvol ', 'HIGHvol'][g], pool[g][0],
                   pool[g][1] / pool[g][0] if pool[g][0] else 0) for g in range(3))
    print('    %-5s %s   lift LOW-HIGH %+.4f' % (lab, s,
          pool[0][1] / pool[0][0] - pool[2][1] / pool[2][0]))

print('\n\n=== (b) both directions, final rule: rule5 AND vpre10 <= TRAIN 40th pctile ===')
vcut = quantiles([vpre[i] for i in btr if vpre[i] is not None], [0.4])[0]
print('  TRAIN 40th-pctile cut on vpre10 = %.4f' % vcut)
RULE = lambda i: s4[i] is not None and s4[i] >= 5.7 and vpre[i] is not None and vpre[i] <= vcut
for dlab, want in (('last move DOWN -> bet UP', -1), ('last move UP -> bet DOWN', 1), ('both', 0)):
    mtr = [i for i in tr if RULE(i) and (want == 0 or sgn[i] == want)]
    mte = [i for i in te if RULE(i) and (want == 0 or sgn[i] == want)]
    ntr, oktr = acc(F, mtr, 'FADE'); nte, okte = acc(F, mte, 'FADE')
    print('  %-26s train %5d %.4f | test %5d %.4f  z=%5.2f' % (
        dlab, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

print('\n  yearly / segment stability of the final rule (TEST split into 4 blocks):')
mte = [i for i in te if RULE(i)]
b = len(mte) // 4
for k in range(4):
    seg = mte[k * b:(k + 1) * b] if k < 3 else mte[3 * b:]
    nn, ok = acc(F, seg, 'FADE')
    import datetime
    d0 = datetime.datetime.utcfromtimestamp(F['t'][seg[0]]).strftime('%Y-%m-%d')
    d1 = datetime.datetime.utcfromtimestamp(F['t'][seg[-1]]).strftime('%Y-%m-%d')
    print('    block %d %s..%s  n=%4d acc=%.4f z=%5.2f' % (k + 1, d0, d1, nn, ok / nn, z_of(nn, ok)))

print('\n\n=== (e) SHUFFLED-LABEL CONTROL through the identical pipeline ===')
print('  same bases, same features, same TRAIN-side selection, labels permuted')
best_real = None
trials = []
for seed in range(12):
    ysh = shuffled_y(F, tr, te, seed)
    bestz = -9; besta = 0; K0 = K
    for bname, bf in BASES:
        btr2 = [i for i in tr if bf(i)]; bte2 = [i for i in te if bf(i)]
        for nm, x in (('vpre10', vpre), ('ppre10', ppre), ('rpre10', rpre),
                      ('vr20', F['vr20']), ('vz100', F['vz100']), ('vtrend', F['vtrend'])):
            out = quint_table(nm, x, bname, bf, btr2, bte2, ysh)
            if not out: continue
            rows, _ = out
            for g, (ntr, atr, nte, ate, z) in enumerate(rows):
                if nte >= 400 and ate > besta:
                    besta = ate; bestz = z
    trials.append((besta, bestz))
    print('  seed %2d: best TEST acc found by noise = %.4f (z=%.2f)' % (seed, besta, bestz))
accs = sorted(t[0] for t in trials)
print('  --> shuffled control: median best-of-search TEST acc = %.4f, max = %.4f' % (
    accs[len(accs) // 2], accs[-1]))

print('\nK evaluated in stage 6 (incl. shuffle trials) = %d' % K)
