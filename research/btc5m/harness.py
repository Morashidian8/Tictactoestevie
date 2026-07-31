"""Shared evaluation harness: chronological split, side selection on TRAIN only,
binomial z on TEST, multiple-testing bar sqrt(2 ln K)."""
import math, pickle, random

CACHE = '/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/feat.pkl'

SIDES = ('FADE', 'FOLLOW', 'UP', 'DOWN')


def load_feat():
    with open(CACHE, 'rb') as f:
        return pickle.load(f)


def split(F, warmup=110):
    """chronological 70/30 on t. Returns (train_idx, test_idx).
    warmup drops rows without full rolling history; last row has no target."""
    n = len(F['t'])
    usable = [i for i in range(warmup, n - 1) if F['y'][i] != 0]
    cut = int(0.70 * len(usable))
    return usable[:cut], usable[cut:]


def acc(F, idx, side, y=None):
    """accuracy of `side` over row indices idx. Returns (n, correct)."""
    if y is None:
        y = F['y']
    sgn = F['sgn']
    n = 0; ok = 0
    for i in idx:
        if side == 'FADE':
            p = -sgn[i]
        elif side == 'FOLLOW':
            p = sgn[i]
        elif side == 'UP':
            p = 1
        else:
            p = -1
        if p == 0:
            continue
        n += 1
        if p == y[i]:
            ok += 1
    return n, ok


def z_of(n, ok):
    if n == 0:
        return 0.0
    return (ok - 0.5 * n) / (0.5 * math.sqrt(n))


def quantiles(vals, qs):
    v = sorted(vals)
    out = []
    for q in qs:
        k = int(q * (len(v) - 1))
        out.append(v[k])
    return out


def evaluate(F, tr, te, mask_tr, mask_te, sides=SIDES, y=None):
    """Pick best side on TRAIN, report TEST. Returns dict or None if empty."""
    best = None
    for s in sides:
        n, ok = acc(F, mask_tr, s, y)
        if n == 0:
            continue
        a = ok / n
        if best is None or a > best[2]:
            best = (s, n, a, ok)
    if best is None:
        return None
    s, ntr, atr, oktr = best
    nte, okte = acc(F, mask_te, s, y)
    ate = okte / nte if nte else 0.0
    return dict(side=s, ntr=ntr, atr=atr, nte=nte, ate=ate, z=z_of(nte, okte), okte=okte)


def bar(K):
    return math.sqrt(2.0 * math.log(K)) if K > 1 else 0.0


def shuffled_y(F, tr, te, seed):
    """Permute the target labels within train and within test separately, keeping
    the same marginal up/down balance. Features untouched -> pure noise pipeline."""
    rnd = random.Random(seed)
    y = list(F['y'])
    for block in (tr, te):
        labs = [y[i] for i in block]
        rnd.shuffle(labs)
        for j, i in enumerate(block):
            y[i] = labs[j]
    return y
