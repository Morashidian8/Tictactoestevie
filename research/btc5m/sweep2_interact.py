"""Stage 2: is the volume gradient just the known stretch effect?
2D grid stretch-bucket x volume-bucket, FADE accuracy, TRAIN and TEST."""
from harness import *

F = load_feat()
tr, te = split(F)

def qbuckets(x, idx, nb):
    v = [x[i] for i in idx if x[i] is not None]
    cuts = quantiles(v, [k / nb for k in range(1, nb)])
    return [-1e18] + cuts + [1e18]

def bidx(edges, val):
    for b in range(len(edges) - 1):
        if edges[b] <= val < edges[b + 1]:
            return b
    return None

STRETCH = 'stretch1'
VOLF = ['vr20', 'vz100', 'vrank100', 'dvr100', 'mpv', 'impact', 'vtrend']

sx = F[STRETCH]
sedges = qbuckets(sx, tr, 5)
print('stretch1 TRAIN quintile cuts: %s' % ['%.2f' % c for c in sedges[1:-1]])

for vf in VOLF:
    vx = F[vf]
    vedges = qbuckets(vx, tr, 5)
    print('\n=== %s (rows=stretch1 quintile, cols=%s quintile) FADE acc ===' % (vf, vf))
    for split_name, blk in (('TRAIN', tr), ('TEST', te)):
        grid = [[[0, 0] for _ in range(5)] for _ in range(5)]
        for i in blk:
            if sx[i] is None or vx[i] is None: continue
            a = bidx(sedges, sx[i]); b = bidx(vedges, vx[i])
            if a is None or b is None: continue
            n, ok = acc(F, [i], 'FADE')
            grid[a][b][0] += n; grid[a][b][1] += ok
        print('  %s' % split_name)
        for a in range(5):
            cells = []
            for b in range(5):
                n, ok = grid[a][b]
                cells.append('%.3f(%5d)' % (ok / n, n) if n else '   --      ')
            rn = sum(grid[a][b][0] for b in range(5))
            rok = sum(grid[a][b][1] for b in range(5))
            print('    S%d %s | row %.3f' % (a + 1, ' '.join(cells), rok / rn if rn else 0))
        cells = []
        for b in range(5):
            n = sum(grid[a][b][0] for a in range(5)); ok = sum(grid[a][b][1] for a in range(5))
            cells.append('%.3f' % (ok / n) if n else ' -- ')
        print('    col marginal: %s' % ' '.join(cells))
