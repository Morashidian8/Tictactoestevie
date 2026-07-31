"""Stage 3: decompose the vimb3 order-flow signal.
Is it (a) a body-colour pattern (known dead), (b) the known stretch/run effect,
or (c) genuinely the VOLUME weighting?

Design: hold the colour count constant (k red bodies out of the last 3) and ask
whether vimb3 -- which then varies ONLY because of the volume weights -- still
separates. That isolates volume's marginal contribution."""
from harness import *

F = load_feat()
tr, te = split(F)
n = len(F['t'])
o, c, v = F['o'], F['c'], F['v']

# body colour: +1 green, -1 red, 0 doji
col = [0] * n
for i in range(n):
    col[i] = 1 if c[i] > o[i] else (-1 if c[i] < o[i] else 0)

# number of GREEN bodies in last 3 (i-2..i)
ngreen = [None] * n
for i in range(2, n):
    ngreen[i] = sum(1 for j in (i - 2, i - 1, i) if col[j] > 0)

vimb3 = F['vimb3']

def rep(tag, mtr, mte, side_forced=None):
    if side_forced:
        ntr, oktr = acc(F, mtr, side_forced)
        nte, okte = acc(F, mte, side_forced)
        return dict(side=side_forced, ntr=ntr, atr=oktr / ntr if ntr else 0,
                    nte=nte, ate=okte / nte if nte else 0, z=z_of(nte, okte))
    return evaluate(F, tr, te, mtr, mte)

print('=== A. pure body-colour pattern of length 3, side picked on TRAIN ===')
print('%-26s %-6s %8s %7s %8s %7s %7s' % ('condition', 'side', 'train n', 'tr acc', 'test n', 'te acc', 'te z'))
for k in range(4):
    mtr = [i for i in tr if ngreen[i] == k]
    mte = [i for i in te if ngreen[i] == k]
    r = rep('', mtr, mte)
    if r:
        print('%-26s %-6s %8d %7.4f %8d %7.4f %7.2f' % ('ngreen3==%d' % k, r['side'], r['ntr'], r['atr'], r['nte'], r['ate'], r['z']))

print('\n=== B. does the VOLUME weighting add anything WITHIN a fixed colour count? ===')
print('within each ngreen bucket, split vimb3 at the TRAIN median of that bucket')
print('%-30s %8s %7s %8s %7s %7s' % ('condition (side=UP)', 'train n', 'tr acc', 'test n', 'te acc', 'te z'))
for k in range(4):
    sub_tr = [i for i in tr if ngreen[i] == k and vimb3[i] is not None]
    sub_te = [i for i in te if ngreen[i] == k and vimb3[i] is not None]
    if len(sub_tr) < 500: continue
    med = quantiles([vimb3[i] for i in sub_tr], [0.5])[0]
    for lab, f in (('vimb3<=med (red-heavy vol)', lambda z: z <= med),
                   ('vimb3> med (grn-heavy vol)', lambda z: z > med)):
        mtr = [i for i in sub_tr if f(vimb3[i])]
        mte = [i for i in sub_te if f(vimb3[i])]
        ntr, oktr = acc(F, mtr, 'UP'); nte, okte = acc(F, mte, 'UP')
        print('ngreen=%d %-21s %8d %7.4f %8d %7.4f %7.2f' % (
            k, lab, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

print('\n=== C. is ngreen3 just the known stretch/run effect? ===')
print('accuracy of ngreen3==0 -> UP  and  ngreen3==3 -> DOWN, split by stretch_any')
sa = F['stretch_any']
for k, side in ((0, 'UP'), (3, 'DOWN')):
    for lab, want in (('stretch signal PRESENT', True), ('NO stretch signal', False)):
        mtr = [i for i in tr if ngreen[i] == k and sa[i] == want]
        mte = [i for i in te if ngreen[i] == k and sa[i] == want]
        ntr, oktr = acc(F, mtr, side); nte, okte = acc(F, mte, side)
        print('  ngreen=%d->%-5s %-24s tr %6d %.4f | te %6d %.4f  z=%5.2f' % (
            k, side, lab, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

print('\n=== D. also strip out the close-to-close run (rule 2/3 territory) ===')
run = F['run']; sgn = F['sgn']
for k, side in ((0, 'UP'), (3, 'DOWN')):
    for lab, f in (('run>=3 same dir c2c', lambda i: run[i] >= 3),
                   ('run<=2 c2c (clean)', lambda i: run[i] <= 2)):
        mtr = [i for i in tr if ngreen[i] == k and f(i)]
        mte = [i for i in te if ngreen[i] == k and f(i)]
        ntr, oktr = acc(F, mtr, side); nte, okte = acc(F, mte, side)
        print('  ngreen=%d->%-5s %-22s tr %6d %.4f | te %6d %.4f  z=%5.2f' % (
            k, side, lab, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

print('\n=== E. fully clean subset: no stretch AND run<=2 ===')
for k, side in ((0, 'UP'), (3, 'DOWN')):
    mtr = [i for i in tr if ngreen[i] == k and not sa[i] and run[i] <= 2]
    mte = [i for i in te if ngreen[i] == k and not sa[i] and run[i] <= 2]
    ntr, oktr = acc(F, mtr, side); nte, okte = acc(F, mte, side)
    print('  ngreen=%d->%-5s tr %6d %.4f | te %6d %.4f  z=%5.2f' % (
        k, side, ntr, oktr / ntr if ntr else 0, nte, okte / nte if nte else 0, z_of(nte, okte)))

print('\n=== F. baseline drift: unconditional UP rate ===')
for lab, blk in (('TRAIN', tr), ('TEST', te)):
    nn, ok = acc(F, blk, 'UP')
    print('  %s  n=%d  P(up)=%.4f  z=%.2f' % (lab, nn, ok / nn, z_of(nn, ok)))
