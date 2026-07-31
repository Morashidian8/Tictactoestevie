"""Controls for the price-level candidates.

1. period baselines (drift check)
2. full monotone gradient for day-range position
3. does the CALENDAR DAY matter, or is it just a rolling k-bar range?
4. stretch-free subset
5. split by last-move sign (is it just 'fade the last candle'?)
6. round-number crossing vs same-sized move without a crossing
"""
import math, pickle

CACHE = "/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/lvfeat.pkl"
F = pickle.load(open(CACHE, "rb"))
n = len(F["t"])
c, h, l = F["c"], F["h"], F["l"]
y, sgn, mv, med100 = F["y"], F["sgn"], F["mv"], F["med100"]
stretch = F["stretch"]
cross = F["cross"]
WARM = 300
usable = [i for i in range(WARM, n - 1) if y[i] != 0 and med100[i] > 0]
cut = int(0.70 * len(usable))
TR, TE = usable[:cut], usable[cut:]
TRS, TES = set(TR), set(TE)

def z(nn, ok):
    return (ok - .5*nn)/(.5*math.sqrt(nn)) if nn else 0.0

def rate(idx, pred):
    nn = ok = 0
    for i in idx:
        p = pred(i)
        if p == 0:
            continue
        nn += 1
        ok += (p == y[i])
    return nn, ok

def line(lbl, idx_tr, idx_te, pred):
    a, b = rate(idx_tr, pred); cc, d = rate(idx_te, pred)
    print(f"  {lbl:34s} train n={a:6d} {100*b/a if a else 0:6.2f}%   "
          f"test n={cc:6d} {100*d/cc if cc else 0:6.2f}%  z={z(cc,d):+6.2f}")

print("=" * 96)
print("1. PERIOD BASELINES (drift / regime check)")
print("=" * 96)
line("unconditional UP", TR, TE, lambda i: 1)
line("unconditional FADE last move", TR, TE, lambda i: -sgn[i])
line("FADE | stretch signal present", [i for i in TR if stretch[i]],
     [i for i in TE if stretch[i]], lambda i: -sgn[i])
line("FADE | NO stretch signal", [i for i in TR if not stretch[i]],
     [i for i in TE if not stretch[i]], lambda i: -sgn[i])

# ---------------------------------------------------------------------------
print()
print("=" * 96)
print("2. POSITION WITHIN THE DAY'S RANGE SO FAR -- full decile gradient")
print("   (shows raw P(next candle up); NOT a chosen side)")
print("=" * 96)
for tz in ("utc", "est"):
    D = F[tz]; dhi, dlo = D["dhi"], D["dlo"]
    print(f"\n  --- {tz.upper()} day ---")
    print(f"  {'decile':8s} {'train n':>9s} {'train P(up)':>12s} {'test n':>8s} {'test P(up)':>11s} {'z(up)':>7s}")
    for k in range(10):
        tr = te = 0; tru = teu = 0
        for i in usable:
            rng = dhi[i]-dlo[i]
            if rng <= 0 or rng < 2*med100[i]:
                continue
            p = (c[i]-dlo[i])/rng
            if min(9, int(p*10)) != k:
                continue
            if i in TRS:
                tr += 1; tru += (y[i] == 1)
            else:
                te += 1; teu += (y[i] == 1)
        print(f"  pos{k:<5d} {tr:9d} {100*tru/tr if tr else 0:11.2f}% {te:8d} "
              f"{100*teu/te if te else 0:10.2f}% {z(te,teu):+7.2f}")

# ---------------------------------------------------------------------------
print()
print("=" * 96)
print("3. IS THE CALENDAR DAY LOAD-BEARING?  same decile rule, but the range is")
print("   a ROLLING k-bar high/low instead of the day so far")
print("=" * 96)
def rolling_pos(k):
    pos = [None]*n
    for i in range(k, n):
        hh = max(h[i-k+1:i+1]); ll = min(l[i-k+1:i+1])
        if hh-ll <= 0 or hh-ll < 2*med100[i]:
            continue
        pos[i] = (c[i]-ll)/(hh-ll)
    return pos

print(f"  {'lookback':>10s} {'rule':>16s} {'train n':>9s} {'train':>8s} {'test n':>8s} {'test':>8s} {'z':>7s}")
for k in (20, 48, 96, 144, 288, 576):
    pos = rolling_pos(k)
    idx_tr = [i for i in TR if pos[i] is not None and (pos[i] >= .9 or pos[i] <= .1)]
    idx_te = [i for i in TE if pos[i] is not None and (pos[i] >= .9 or pos[i] <= .1)]
    pred = lambda i: (-1 if pos[i] >= .9 else 1)
    a,b = rate(idx_tr,pred); cc,d = rate(idx_te,pred)
    print(f"  {k:10d} {'fade extreme':>16s} {a:9d} {100*b/a:7.2f}% {cc:8d} "
          f"{100*d/cc:7.2f}% {z(cc,d):+7.2f}")

# day version for comparison
for tz in ("utc","est"):
    D = F[tz]; dhi, dlo = D["dhi"], D["dlo"]
    dp = [None]*n
    for i in usable:
        rng = dhi[i]-dlo[i]
        if rng > 0 and rng >= 2*med100[i]:
            dp[i] = (c[i]-dlo[i])/rng
    idx_tr=[i for i in TR if dp[i] is not None and (dp[i]>=.9 or dp[i]<=.1)]
    idx_te=[i for i in TE if dp[i] is not None and (dp[i]>=.9 or dp[i]<=.1)]
    pred = lambda i: (-1 if dp[i]>=.9 else 1)
    a,b=rate(idx_tr,pred); cc,d=rate(idx_te,pred)
    print(f"  {tz.upper():>10s} {'fade extreme':>16s} {a:9d} {100*b/a:7.2f}% {cc:8d} "
          f"{100*d/cc:7.2f}% {z(cc,d):+7.2f}")
    globals()['dp_'+tz] = dp

# ---------------------------------------------------------------------------
print()
print("=" * 96)
print("4/5. STRETCH-FREE and LAST-MOVE-SIGN CONTROLS for day-range extreme fade")
print("=" * 96)
for tz in ("utc","est"):
    dp = globals()['dp_'+tz]
    base_tr=[i for i in TR if dp[i] is not None and (dp[i]>=.9 or dp[i]<=.1)]
    base_te=[i for i in TE if dp[i] is not None and (dp[i]>=.9 or dp[i]<=.1)]
    pred = lambda i: (-1 if dp[i]>=.9 else 1)
    print(f"\n  --- {tz.upper()} ---")
    line("all rows", base_tr, base_te, pred)
    line("NO stretch signal", [i for i in base_tr if not stretch[i]],
         [i for i in base_te if not stretch[i]], pred)
    line("stretch signal present", [i for i in base_tr if stretch[i]],
         [i for i in base_te if stretch[i]], pred)
    line("last move UP  (sgn=+1)", [i for i in base_tr if sgn[i]>0],
         [i for i in base_te if sgn[i]>0], pred)
    line("last move DOWN (sgn=-1)", [i for i in base_tr if sgn[i]<0],
         [i for i in base_te if sgn[i]<0], pred)
    line("agrees w/ FADE (fade==pred)", [i for i in base_tr if -sgn[i]==pred(i)],
         [i for i in base_te if -sgn[i]==pred(i)], pred)
    line("DISAGREES w/ FADE", [i for i in base_tr if -sgn[i]==-pred(i)],
         [i for i in base_te if -sgn[i]==-pred(i)], pred)
    # top only / bottom only
    line("TOP decile only -> DOWN", [i for i in base_tr if dp[i]>=.9],
         [i for i in base_te if dp[i]>=.9], pred)
    line("BOTTOM decile only -> UP", [i for i in base_tr if dp[i]<=.1],
         [i for i in base_te if dp[i]<=.1], pred)
    # no-stretch AND disagrees with fade = the cleanest orthogonal slice
    s = [i for i in base_tr if not stretch[i] and -sgn[i]==-pred(i)]
    q = [i for i in base_te if not stretch[i] and -sgn[i]==-pred(i)]
    line("NO stretch AND disagrees w/FADE", s, q, pred)

# ---------------------------------------------------------------------------
print()
print("=" * 96)
print("6. ROUND-NUMBER CROSSING vs A MOVE OF THE SAME SIZE THAT DOESN'T CROSS")
print("=" * 96)
for S in (100, 250):
    print(f"\n  --- ${S} grid, side = FADE the crossing direction (~= FADE) ---")
    cr_tr=[i for i in TR if cross[S][i]!=0]; cr_te=[i for i in TE if cross[S][i]!=0]
    line(f"crossed a ${S} level", cr_tr, cr_te, lambda i: -cross[S][i])
    line("all rows, FADE last move", TR, TE, lambda i: -sgn[i])
    # matched on |move| size: compare crossers vs non-crossers inside |mv| buckets
    print(f"  {'|move| bucket':>16s} {'crossed?':>9s} {'test n':>8s} {'test FADE acc':>14s}")
    eds = [0, 25, 50, 75, 100, 150, 250, 1e9]
    for b in range(len(eds)-1):
        for want in (1, 0):
            idx=[i for i in TE if eds[b] <= abs(mv[i]) < eds[b+1]
                 and (cross[S][i]!=0) == bool(want)]
            if len(idx) < 200:
                continue
            nn, ok = rate(idx, lambda i: -sgn[i])
            print(f"  {f'{eds[b]:.0f}-{eds[b+1]:.0f}':>16s} {'yes' if want else 'no':>9s} "
                  f"{nn:8d} {100*ok/nn:13.2f}%")
