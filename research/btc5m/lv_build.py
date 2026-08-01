"""Build PRICE-LEVEL / ROUND-NUMBER features. Family: levels."""
import gzip, csv, math, pickle, os, datetime
try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:
    ET = None

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "btc5m.csv.gz")
OUT = "/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/lvfeat.pkl"

SCALES = (100, 250, 500, 1000)

def main():
    t, o, h, l, c, v = [], [], [], [], [], []
    with gzip.open(SRC, "rt") as f:
        for x in csv.DictReader(f):
            t.append(int(x["t"])); o.append(float(x["o"])); h.append(float(x["h"]))
            l.append(float(x["l"])); c.append(float(x["c"])); v.append(float(x["v"]))
    n = len(t)
    print("rows", n, "span", datetime.datetime.utcfromtimestamp(t[0]), datetime.datetime.utcfromtimestamp(t[-1]))
    assert all(t[i+1]-t[i] == 300 for i in range(n-1)), "gaps!"

    # ---- target & basic move stats -----------------------------------------
    y = [0]*n            # next-window close-to-close direction
    for i in range(n-1):
        d = c[i+1]-c[i]
        y[i] = 1 if d > 0 else (-1 if d < 0 else 0)
    mv = [0.0]*n         # this window's close-to-close move
    for i in range(1, n):
        mv[i] = c[i]-c[i-1]
    sgn = [1 if mv[i] > 0 else (-1 if mv[i] < 0 else 0) for i in range(n)]

    # rolling median |move| over 100
    med100 = [0.0]*n
    W = 100
    for i in range(W, n):
        w = sorted(abs(mv[j]) for j in range(i-W+1, i+1))
        med100[i] = w[W//2]
    # rolling stdev of moves 20/100 (for the known vol filter)
    def roll_sd(k):
        out = [0.0]*n
        s = 0.0; s2 = 0.0
        for i in range(1, n):
            s += mv[i]; s2 += mv[i]*mv[i]
            if i > k:
                s -= mv[i-k]; s2 -= mv[i-k]*mv[i-k]
            if i >= k:
                m = s/k
                out[i] = math.sqrt(max(0.0, s2/k - m*m))
        return out
    sd20 = roll_sd(20); sd100 = roll_sd(100)
    volr = [sd20[i]/sd100[i] if sd100[i] > 0 else 0.0 for i in range(n)]

    # ---- KNOWN stretch signals (to control against) -------------------------
    hi20 = [0.0]*n; lo20 = [0.0]*n
    for i in range(20, n):
        hi20[i] = max(c[i-20:i]); lo20[i] = min(c[i-20:i])
    run = [0]*n          # signed run length of same-direction moves ending at i
    for i in range(1, n):
        if sgn[i] == 0:
            run[i] = 0
        elif sgn[i] == sgn[i-1]:
            run[i] = run[i-1] + sgn[i] if abs(run[i-1]) >= 1 else 2*sgn[i]
        else:
            run[i] = sgn[i]
    # simpler: recompute run length properly
    run = [0]*n
    for i in range(1, n):
        if sgn[i] == 0:
            run[i] = 0
        elif sgn[i-1] == sgn[i]:
            run[i] = run[i-1] + sgn[i] if run[i-1] != 0 else 2*sgn[i]
        else:
            run[i] = sgn[i]
    runlen = [abs(r) for r in run]

    stretch4 = [0.0]*n   # |c - c[-4]| / med100  (rule 5 family)
    for i in range(4, n):
        if med100[i] > 0:
            stretch4[i] = abs(c[i]-c[i-4])/med100[i]
    bodyx = [0.0]*n
    for i in range(n):
        if med100[i] > 0:
            bodyx[i] = abs(mv[i])/med100[i]

    VOL_TH = 0.8884
    st = [False]*n
    for i in range(110, n):
        r1 = (c[i] > hi20[i] or c[i] < lo20[i]) and volr[i] >= VOL_TH
        r2 = runlen[i] >= 3 and bodyx[i] > 2.0
        r3 = runlen[i] >= 6
        r5 = stretch4[i] >= 5.7
        st[i] = r1 or r2 or r3 or r5
    print("stretch-signal fraction", sum(st)/n)

    # ---- ROUND NUMBER features ---------------------------------------------
    # off[S][i]   signed distance from nearest multiple of S, in units of S, in [-0.5,0.5)
    # cell[S][i]  position inside the cell (c mod S)/S in [0,1)
    # cross[S][i] +1 if this window's close crossed a multiple of S upward, -1 down, 0 none
    # wickx[S][i] +1 if high pierced a level above but close fell back below it (upper rejection)
    #             -1 if low pierced a level below but close came back above (lower rejection)
    off, cell, cross, wickx = {}, {}, {}, {}
    for S in SCALES:
        a = [0.0]*n; b = [0.0]*n; cr = [0]*n; wk = [0]*n
        for i in range(n):
            m = c[i] % S
            b[i] = m/S
            a[i] = (m/S) if m/S < 0.5 else (m/S - 1.0)
        for i in range(1, n):
            k0 = math.floor(c[i-1]/S); k1 = math.floor(c[i]/S)
            cr[i] = 1 if k1 > k0 else (-1 if k1 < k0 else 0)
            # rejection: within this window the high reached a level strictly above
            # both the open-side close[i-1] and the final close, i.e. level pierced
            # and given back.
            khi = math.floor(h[i]/S)*S
            klo = math.ceil(l[i]/S)*S
            up_rej = (h[i] >= khi > c[i]) and (khi > c[i-1])
            dn_rej = (l[i] <= klo < c[i]) and (klo < c[i-1])
            if up_rej and not dn_rej:
                wk[i] = 1
            elif dn_rej and not up_rej:
                wk[i] = -1
        off[S] = a; cell[S] = b; cross[S] = cr; wickx[S] = wk

    # ---- DAY features (UTC and US-Eastern) ----------------------------------
    def day_feats(tzoff_fn, label):
        dayid = [0]*n
        for i in range(n):
            dayid[i] = tzoff_fn(t[i])
        dhi = [0.0]*n; dlo = [0.0]*n     # running high/low of the day up to & incl i
        dopen = [0.0]*n
        pdh = [0.0]*n; pdl = [0.0]*n; pdc = [0.0]*n   # previous day high/low/close
        prev_h = prev_l = prev_c = None
        cur_h = cur_l = None; cur_o = None
        last = None
        for i in range(n):
            if dayid[i] != last:
                if last is not None:
                    prev_h, prev_l, prev_c = cur_h, cur_l, c[i-1]
                cur_h = h[i]; cur_l = l[i]; cur_o = o[i]
                last = dayid[i]
            else:
                cur_h = max(cur_h, h[i]); cur_l = min(cur_l, l[i])
            dhi[i] = cur_h; dlo[i] = cur_l; dopen[i] = cur_o
            pdh[i] = prev_h if prev_h is not None else float('nan')
            pdl[i] = prev_l if prev_l is not None else float('nan')
            pdc[i] = prev_c if prev_c is not None else float('nan')
        return dict(dayid=dayid, dhi=dhi, dlo=dlo, dopen=dopen, pdh=pdh, pdl=pdl, pdc=pdc)

    utc = day_feats(lambda ts: ts // 86400, "UTC")
    if ET is not None:
        def et_day(ts):
            d = datetime.datetime.fromtimestamp(ts, ET)
            return d.toordinal()
    else:
        def et_day(ts):
            return (ts - 5*3600) // 86400
    est = day_feats(et_day, "ET")

    F = dict(t=t, o=o, h=h, l=l, c=c, v=v, y=y, mv=mv, sgn=sgn, med100=med100,
             volr=volr, hi20=hi20, lo20=lo20, runlen=runlen, stretch4=stretch4,
             bodyx=bodyx, stretch=st, off=off, cell=cell, cross=cross,
             wickx=wickx, utc=utc, est=est, SCALES=SCALES)
    with open(OUT, "wb") as f:
        pickle.dump(F, f)
    print("wrote", OUT)

if __name__ == "__main__":
    main()
