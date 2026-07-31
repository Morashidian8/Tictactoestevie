"""Stage 1: volume features ALONE. Decile buckets (cuts from TRAIN only),
plus tail buckets (top/bottom 1%, 5%). Side chosen on TRAIN."""
import sys
from harness import *

F = load_feat()
tr, te = split(F)
print('TRAIN n=%d  TEST n=%d' % (len(tr), len(te)))
print('TRAIN date %s .. %s' % (F['t'][tr[0]], F['t'][tr[-1]]))

VOL_FEATS = ['vr20', 'vr50', 'vr100', 'vz100', 'vz20', 'vrank100', 'vtrend',
             'vtrend520', 'vpr', 'impact', 'dvr100', 'mpv', 'vr3_100',
             'vimb10', 'vimb3']

K = 0
rows = []

for name in VOL_FEATS:
    x = F[name]
    trv = [x[i] for i in tr if x[i] is not None]
    if len(trv) < 1000:
        continue
    # decile cuts from TRAIN
    cuts = quantiles(trv, [0.1 * k for k in range(1, 10)])
    edges = [-1e18] + cuts + [1e18]
    for b in range(10):
        lo, hi = edges[b], edges[b + 1]
        mtr = [i for i in tr if x[i] is not None and lo <= x[i] < hi]
        mte = [i for i in te if x[i] is not None and lo <= x[i] < hi]
        r = evaluate(F, tr, te, mtr, mte)
        K += 4
        if r and r['nte'] >= 400:
            rows.append((('%s d%d' % (name, b + 1)), r))
    # tails
    for q, lab in ((0.99, 'top1'), (0.95, 'top5'), (0.05, 'bot5'), (0.01, 'bot1')):
        cut = quantiles(trv, [q])[0]
        if lab.startswith('top'):
            mtr = [i for i in tr if x[i] is not None and x[i] >= cut]
            mte = [i for i in te if x[i] is not None and x[i] >= cut]
        else:
            mtr = [i for i in tr if x[i] is not None and x[i] <= cut]
            mte = [i for i in te if x[i] is not None and x[i] <= cut]
        r = evaluate(F, tr, te, mtr, mte)
        K += 4
        if r and r['nte'] >= 400:
            rows.append((('%s %s' % (name, lab)), r))

print('\nK evaluated = %d   bar sqrt(2 ln K) = %.2f' % (K, bar(K)))

rows.sort(key=lambda r: -r[1]['z'])
print('\n%-22s %-6s %8s %7s %8s %7s %7s' % ('condition', 'side', 'train n', 'tr acc', 'test n', 'te acc', 'te z'))
for name, r in rows[:25]:
    print('%-22s %-6s %8d %7.4f %8d %7.4f %7.2f' % (name, r['side'], r['ntr'], r['atr'], r['nte'], r['ate'], r['z']))
print('  ... worst 10 ...')
for name, r in rows[-10:]:
    print('%-22s %-6s %8d %7.4f %8d %7.4f %7.2f' % (name, r['side'], r['ntr'], r['atr'], r['nte'], r['ate'], r['z']))

# monotone gradient view for the headline features
print('\n=== decile gradients (side forced to FADE, so >0.5 = fade works) ===')
for name in VOL_FEATS:
    x = F[name]
    trv = [x[i] for i in tr if x[i] is not None]
    if len(trv) < 1000: continue
    cuts = quantiles(trv, [0.1 * k for k in range(1, 10)])
    edges = [-1e18] + cuts + [1e18]
    line = []
    for b in range(10):
        lo, hi = edges[b], edges[b + 1]
        mte = [i for i in te if x[i] is not None and lo <= x[i] < hi]
        n, ok = acc(F, mte, 'FADE')
        line.append('%.3f' % (ok / n) if n else ' -- ')
    print('%-10s TEST fade: %s' % (name, ' '.join(line)))
