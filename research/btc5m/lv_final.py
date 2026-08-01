"""Loose ends.
F. Does day-range position add ANYTHING over a rolling-range position?
G. Prior-day high/low interaction, with a looser definition to get n up.
H. Position relative to the day's OPEN (not range).
"""
import math, pickle
CACHE="/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/lvfeat.pkl"
F=pickle.load(open(CACHE,"rb"))
n=len(F["t"]); c,h,l=F["c"],F["h"],F["l"]
y,sgn,mv,med100=F["y"],F["sgn"],F["mv"],F["med100"]
stretch=F["stretch"]
WARM=300
usable=[i for i in range(WARM,n-1) if y[i]!=0 and med100[i]>0]
cut=int(.70*len(usable)); TR,TE=usable[:cut],usable[cut:]
TRS=set(TR)
def zz(nn,ok): return (ok-.5*nn)/(.5*math.sqrt(nn)) if nn else 0.
def sign(x): return 1 if x>0 else(-1 if x<0 else 0)

def roll_pos(k):
    p=[None]*n
    for i in range(k,n):
        hh=max(h[i-k+1:i+1]); ll=min(l[i-k+1:i+1])
        if hh-ll>0 and hh-ll>=2*med100[i]: p[i]=(c[i]-ll)/(hh-ll)
    return p
r20=roll_pos(20); r96=roll_pos(96)
D=F["utc"]; dhi,dlo=D["dhi"],D["dlo"]
dp=[None]*n
for i in usable:
    r=dhi[i]-dlo[i]
    if r>0 and r>=2*med100[i]: dp[i]=(c[i]-dlo[i])/r

def rep(lbl, sel, pred):
    tn=to=en=eo=0
    for i in usable:
        if not sel(i): continue
        p=pred(i)
        if p==0: continue
        if i in TRS: tn+=1; to+=(p==y[i])
        else: en+=1; eo+=(p==y[i])
    print(f"  {lbl:44s} train n={tn:6d} {100*to/tn if tn else 0:6.2f}%   "
          f"test n={en:6d} {100*eo/en if en else 0:6.2f}%  z={zz(en,eo):+6.2f}")

ext=lambda p: p is not None and (p>=.9 or p<=.1)
side=lambda p: -1 if p>=.9 else 1

print("="*104)
print("F. INCREMENTAL VALUE OF THE CALENDAR-DAY RANGE OVER A ROLLING RANGE")
print("   (side = fade the extreme)")
print("="*104)
rep("DAY extreme, all", lambda i: ext(dp[i]), lambda i: side(dp[i]))
rep("DAY extreme & ROLL20 also extreme(same side)",
    lambda i: ext(dp[i]) and ext(r20[i]) and side(dp[i])==side(r20[i]),
    lambda i: side(dp[i]))
rep("DAY extreme & ROLL20 NOT extreme",
    lambda i: ext(dp[i]) and not ext(r20[i]), lambda i: side(dp[i]))
rep("DAY extreme & ROLL96 NOT extreme",
    lambda i: ext(dp[i]) and not ext(r96[i]), lambda i: side(dp[i]))
rep("DAY extreme & ROLL96 NOT ext & NO stretch",
    lambda i: ext(dp[i]) and not ext(r96[i]) and not stretch[i], lambda i: side(dp[i]))
print()
rep("ROLL96 extreme, all", lambda i: ext(r96[i]), lambda i: side(r96[i]))
rep("ROLL96 extreme & DAY NOT extreme",
    lambda i: ext(r96[i]) and not ext(dp[i]), lambda i: side(r96[i]))
rep("ROLL96 ext & DAY NOT ext & NO stretch",
    lambda i: ext(r96[i]) and not ext(dp[i]) and not stretch[i], lambda i: side(r96[i]))

print()
print("="*104)
print("G. PRIOR-DAY HIGH / LOW  (looser: any window whose close crosses the level)")
print("   side = FADE the crossing.  Compared with crossing an INTRADAY extreme.")
print("="*104)
for tz in ("utc","est"):
    DD=F[tz]; pdh,pdl,dayid=DD["pdh"],DD["pdl"],DD["dayid"]
    ddhi,ddlo=DD["dhi"],DD["dlo"]
    runhi=[0.]*n; runlo=[0.]*n; ph=pl=None; last=None
    for i in range(n):
        if dayid[i]!=last:
            ph=h[i]; pl=l[i]; last=dayid[i]; runhi[i]=-1e18; runlo[i]=1e18
        else:
            runhi[i]=ph; runlo[i]=pl; ph=max(ph,h[i]); pl=min(pl,l[i])
    print(f"\n  --- {tz.upper()} ---")
    def sel_pdh(i): return pdh[i]==pdh[i] and c[i-1]<=pdh[i]<c[i]
    def sel_pdl(i): return pdl[i]==pdl[i] and c[i-1]>=pdl[i]>c[i]
    def sel_ndh(i): return runhi[i]>-1e17 and c[i-1]<=runhi[i]<c[i] and pdh[i]==pdh[i] and c[i]<pdh[i]
    def sel_ndl(i): return runlo[i]<1e17 and c[i-1]>=runlo[i]>c[i] and pdl[i]==pdl[i] and c[i]>pdl[i]
    rep("close crosses PREV-DAY HIGH  -> fade(down)", sel_pdh, lambda i:-1)
    rep("close crosses PREV-DAY LOW   -> fade(up)",   sel_pdl, lambda i: 1)
    rep("close crosses INTRADAY HIGH  -> fade(down)", sel_ndh, lambda i:-1)
    rep("close crosses INTRADAY LOW   -> fade(up)",   sel_ndl, lambda i: 1)
    rep("PREV-DAY HIGH cross, NO stretch", lambda i: sel_pdh(i) and not stretch[i], lambda i:-1)
    rep("PREV-DAY LOW  cross, NO stretch", lambda i: sel_pdl(i) and not stretch[i], lambda i: 1)

print()
print("="*104)
print("H. POSITION RELATIVE TO THE DAY'S OPEN, in med100 units (side = toward open)")
print("="*104)
for tz in ("utc",):
    DD=F[tz]; dop=DD["dopen"]
    print(f"  {'(c-open)/med100':>18s} {'train n':>8s} {'train':>8s} {'test n':>8s} {'test':>8s} {'z':>7s}")
    eds=[-25,-12,-5,-1.5,1.5,5,12,25,1e9]
    for b in range(len(eds)):
        lo=-1e9 if b==0 else eds[b-1]; hi=eds[b]
        tn=to=en=eo=0
        for i in usable:
            d=(c[i]-dop[i])/med100[i]
            if not(lo<=d<hi): continue
            p=-sign(d)
            if p==0: continue
            if i in TRS: tn+=1; to+=(p==y[i])
            else: en+=1; eo+=(p==y[i])
        if en<200: continue
        print(f"  {f'{lo:.0f}..{hi:.0f}':>18s} {tn:8d} {100*to/tn:7.2f}% {en:8d} "
              f"{100*eo/en:7.2f}% {zz(en,eo):+7.2f}")
