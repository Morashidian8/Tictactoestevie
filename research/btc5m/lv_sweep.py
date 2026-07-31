"""Sweep the PRICE-LEVEL / ROUND-NUMBER family.

Method: chronological 70/30 on t. Every bucket + side chosen on TRAIN only.
K = total (condition, side) pairs evaluated; bar = sqrt(2 ln K).
Binomial z on TEST vs 50%.
"""
import math, pickle, random, sys

CACHE = "/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/lvfeat.pkl"
MIN_TEST = 400
WARM = 300   # need previous-day features + 100-bar rolling stats

F = pickle.load(open(CACHE, "rb"))
n = len(F["t"])
c, h, l, o = F["c"], F["h"], F["l"], F["o"]
y, sgn, mv = F["y"], F["sgn"], F["mv"]
med100 = F["med100"]
stretch = F["stretch"]
SCALES = F["SCALES"]
off, cell, cross, wickx = F["off"], F["cell"], F["cross"], F["wickx"]

usable = [i for i in range(WARM, n - 1) if y[i] != 0 and med100[i] > 0]
cut = int(0.70 * len(usable))
TR = usable[:cut]
TE = usable[cut:]
print(f"usable={len(usable)}  train={len(TR)}  test={len(TE)}  "
      f"split_t={F['t'][TE[0]]}")

# ---------------------------------------------------------------- direction arrays
def sign(x):
    return 1 if x > 0 else (-1 if x < 0 else 0)

DIR = {}
DIR["UP"] = [1] * n
DIR["DOWN"] = [-1] * n
DIR["FOLLOW"] = sgn
DIR["FADE"] = [-s for s in sgn]
for S in SCALES:
    DIR[f"TOWARD{S}"] = [-sign(off[S][i]) for i in range(n)]
    DIR[f"AWAY{S}"] = [sign(off[S][i]) for i in range(n)]
    DIR[f"CRDIR{S}"] = cross[S]
    DIR[f"CRANTI{S}"] = [-x for x in cross[S]]
    DIR[f"REJ{S}"] = [-x for x in wickx[S]]      # upper rejection -> predict down
    DIR[f"ANTIREJ{S}"] = wickx[S]

# breakout direction arrays are built inside their families below

def add_dir(name, arr):
    DIR[name] = arr

# ---------------------------------------------------------------- families
# family = (name, key_array, side_names)
FAMS = []

def bucket(v, edges):
    """return index of bucket, edges ascending; v<edges[0] -> 0 ... """
    for k, e in enumerate(edges):
        if v < e:
            return k
    return len(edges)

# ---- G1 round-number proximity: magnet vs barrier -------------------------
for S in SCALES:
    key = [None] * n
    ed = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45]
    for i in usable:
        a = abs(off[S][i])
        key[i] = f"|off|bin{bucket(a, ed)}"
    FAMS.append((f"G1.prox.S{S}", key, [f"TOWARD{S}", f"AWAY{S}"]))

# ---- G1b same but in ABSOLUTE dollars from the level ----------------------
for S in SCALES:
    key = [None] * n
    ed = [5, 10, 20, 35, 60, 100]
    for i in usable:
        a = abs(off[S][i]) * S
        if a < 250:
            key[i] = f"${bucket(a, ed)}"
    FAMS.append((f"G1b.proxUSD.S{S}", key, [f"TOWARD{S}", f"AWAY{S}"]))

# ---- G2 level crossing -> continuation or rejection -----------------------
for S in SCALES:
    key = [None] * n
    for i in usable:
        if cross[S][i] != 0:
            d = "up" if cross[S][i] > 0 else "dn"
            pen = abs(off[S][i]) * S if sign(off[S][i]) == cross[S][i] else 0.0
            pb = bucket(pen, [10, 30, 70])
            key[i] = f"cross{d}.pen{pb}"
    FAMS.append((f"G2.cross.S{S}", key, [f"CRDIR{S}", f"CRANTI{S}"]))

# ---- G2b crossing, ignoring depth ----------------------------------------
for S in SCALES:
    key = [None] * n
    for i in usable:
        if cross[S][i] != 0:
            key[i] = "crossany"
    FAMS.append((f"G2b.crossany.S{S}", key, [f"CRDIR{S}", f"CRANTI{S}"]))

# ---- G3 rejection candle at a round level --------------------------------
for S in SCALES:
    key = [None] * n
    for i in usable:
        if wickx[S][i] != 0:
            key[i] = "rej" + ("up" if wickx[S][i] > 0 else "dn")
    FAMS.append((f"G3.reject.S{S}", key, [f"REJ{S}", f"ANTIREJ{S}"]))

# ---- G9 approaching a level from below / above ---------------------------
for S in SCALES:
    key = [None] * n
    for i in usable:
        a = abs(off[S][i]) * S
        if a > 60 or sgn[i] == 0:
            continue
        toward = (sign(off[S][i]) != sgn[i])   # moving toward nearest level
        key[i] = ("approach" if toward else "leaving") + f".d{bucket(a,[15,35])}"
    FAMS.append((f"G9.approach.S{S}", key, [f"TOWARD{S}", f"AWAY{S}", "FOLLOW", "FADE"]))

# ---- day-based families ---------------------------------------------------
for tz in ("utc", "est"):
    D = F[tz]
    dhi, dlo, pdh, pdl, pdc = D["dhi"], D["dlo"], D["pdh"], D["pdl"], D["pdc"]
    dayid = D["dayid"]

    # G4 position within the day's range so far (deciles)
    key = [None] * n
    for i in usable:
        rng = dhi[i] - dlo[i]
        if rng <= 0 or rng < 2 * med100[i]:
            continue
        p = (c[i] - dlo[i]) / rng
        key[i] = f"pos{min(9, int(p * 10))}"
    FAMS.append((f"G4.daypos.{tz}", key, ["UP", "DOWN"]))

    # G5 distance from previous day's close, in med100 units
    key = [None] * n
    pdcdir = [0] * n
    for i in usable:
        if pdc[i] != pdc[i]:
            continue
        d = (c[i] - pdc[i]) / med100[i]
        pdcdir[i] = -sign(d)          # TOWARD prev close
        ed = [-30, -15, -6, -2, 2, 6, 15, 30]
        key[i] = f"pdc{bucket(d, ed)}"
    add_dir(f"TOPDC.{tz}", pdcdir)
    add_dir(f"AWAYPDC.{tz}", [-x for x in pdcdir])
    FAMS.append((f"G5.prevclose.{tz}", key, [f"TOPDC.{tz}", f"AWAYPDC.{tz}", "UP", "DOWN"]))

    # G6 prior-day extreme taken out this window (first time today)
    runhi = [0.0] * n; runlo = [0.0] * n
    ph = pl = None; last = None
    for i in range(n):
        if dayid[i] != last:
            ph = h[i]; pl = l[i]; last = dayid[i]
            runhi[i] = -1e18; runlo[i] = 1e18   # nothing before it today
        else:
            runhi[i] = ph; runlo[i] = pl
            ph = max(ph, h[i]); pl = min(pl, l[i])
    bdir = [0] * n
    key = [None] * n
    for i in usable:
        if pdh[i] != pdh[i]:
            continue
        tookhi = h[i] > pdh[i] and runhi[i] <= pdh[i]
        tooklo = l[i] < pdl[i] and runlo[i] >= pdl[i]
        if tookhi and not tooklo:
            bdir[i] = 1
            key[i] = "pdh." + ("hold" if c[i] > pdh[i] else "back")
        elif tooklo and not tookhi:
            bdir[i] = -1
            key[i] = "pdl." + ("hold" if c[i] < pdl[i] else "back")
    add_dir(f"BRK.{tz}", bdir)
    add_dir(f"ANTIBRK.{tz}", [-x for x in bdir])
    FAMS.append((f"G6.prevdayext.{tz}", key, [f"BRK.{tz}", f"ANTIBRK.{tz}"]))

    # G7 intraday extreme extended this window (new day high/low, prior-day
    #    level NOT involved)
    idir = [0] * n
    key = [None] * n
    for i in usable:
        if pdh[i] != pdh[i] or runhi[i] < -1e17:
            continue
        newhi = h[i] > runhi[i]
        newlo = l[i] < runlo[i]
        if newhi and not newlo and h[i] < pdh[i]:
            idir[i] = 1
            key[i] = "newdayhi"
        elif newlo and not newhi and l[i] > pdl[i]:
            idir[i] = -1
            key[i] = "newdaylo"
    add_dir(f"IEXT.{tz}", idir)
    add_dir(f"ANTIIEXT.{tz}", [-x for x in idir])
    FAMS.append((f"G7.intradayext.{tz}", key, [f"IEXT.{tz}", f"ANTIIEXT.{tz}"]))

    # G8 distance below the day high / above the day low, in med100 units
    for which in ("hi", "lo"):
        key = [None] * n
        for i in usable:
            if dhi[i] - dlo[i] < 2 * med100[i]:
                continue
            d = (dhi[i] - c[i]) / med100[i] if which == "hi" else (c[i] - dlo[i]) / med100[i]
            key[i] = f"{which}{bucket(d, [0.5, 2, 5, 10, 20, 40])}"
        FAMS.append((f"G8.dist{which}.{tz}", key, ["UP", "DOWN"]))

# ---------------------------------------------------------------- evaluation
def evaluate(yv, verbose=True):
    """Returns (results, K). results = list of dicts."""
    results = []
    K = 0
    for fname, key, sides in FAMS:
        # group indices by key
        gtr, gte = {}, {}
        for i in TR:
            k = key[i]
            if k is not None:
                gtr.setdefault(k, []).append(i)
        for i in TE:
            k = key[i]
            if k is not None:
                gte.setdefault(k, []).append(i)
        for k in sorted(gtr):
            K += len(sides)
            best = None
            for s in sides:
                d = DIR[s]
                idx = gtr[k]
                nn = 0; ok = 0
                for i in idx:
                    p = d[i]
                    if p == 0:
                        continue
                    nn += 1
                    if p == yv[i]:
                        ok += 1
                if nn == 0:
                    continue
                a = ok / nn
                if best is None or a > best[0]:
                    best = (a, s, nn, ok)
            if best is None:
                continue
            tra, side, trn, trok = best
            d = DIR[side]
            idx = gte.get(k, [])
            nn = 0; ok = 0
            for i in idx:
                p = d[i]
                if p == 0:
                    continue
                nn += 1
                if p == yv[i]:
                    ok += 1
            z = (ok - 0.5 * nn) / (0.5 * math.sqrt(nn)) if nn else 0.0
            results.append(dict(fam=fname, key=k, side=side, trn=trn, tra=tra,
                                ten=nn, tea=(ok / nn if nn else 0.0), z=z,
                                teok=ok))
    return results, K

res, K = evaluate(y)
BAR = math.sqrt(2 * math.log(K))
print(f"\nK = {K} (condition x side pairs)   bar sqrt(2 ln K) = {BAR:.3f}\n")

elig = [r for r in res if r["ten"] >= MIN_TEST]
print(f"conditions with test n >= {MIN_TEST}: {len(elig)}")
elig.sort(key=lambda r: -r["z"])
print("\n--- TOP 25 by TEST z ---")
print(f"{'family':26s} {'bucket':18s} {'side':14s} {'trn':>7s} {'tracc':>7s} {'ten':>7s} {'teacc':>7s} {'z':>6s}")
for r in elig[:25]:
    print(f"{r['fam']:26s} {r['key']:18s} {r['side']:14s} {r['trn']:7d} "
          f"{r['tra']*100:6.2f}% {r['ten']:7d} {r['tea']*100:6.2f}% {r['z']:+6.2f}")
print("\n--- BOTTOM 10 by TEST z (train-strong / test-dead = overfit) ---")
for r in elig[-10:]:
    print(f"{r['fam']:26s} {r['key']:18s} {r['side']:14s} {r['trn']:7d} "
          f"{r['tra']*100:6.2f}% {r['ten']:7d} {r['tea']*100:6.2f}% {r['z']:+6.2f}")

pickle.dump((res, K, TR, TE), open("/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/lv_res.pkl", "wb"))

# ---------------------------------------------------------------- shuffled control
print("\n=== SHUFFLED-LABEL CONTROL (identical pipeline) ===")
rng = random.Random(12345)
for trial in range(3):
    ys = list(y)
    vals = [y[i] for i in usable]
    rng.shuffle(vals)
    for j, i in enumerate(usable):
        ys[i] = vals[j]
    r2, K2 = evaluate(ys)
    e2 = [r for r in r2 if r["ten"] >= MIN_TEST]
    e2.sort(key=lambda r: -r["z"])
    top = e2[0]
    print(f"  trial {trial}: best test z = {top['z']:+.2f}  acc={top['tea']*100:.2f}% "
          f"(n={top['ten']}, {top['fam']}/{top['key']}) | "
          f"max|z|={max(abs(r['z']) for r in e2):.2f} | "
          f"#|z|>2 = {sum(1 for r in e2 if abs(r['z'])>2)}/{len(e2)}")
