"""Full per-family dump (incl. the ones that did NOT top the list) + a
move-size-stratified test of whether crossing a round number ADDS to the
known fade effect."""
import math, pickle
CACHE = "/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/lvfeat.pkl"
F = pickle.load(open(CACHE, "rb"))
n = len(F["t"]); c,h,l = F["c"],F["h"],F["l"]
y,sgn,mv,med100 = F["y"],F["sgn"],F["mv"],F["med100"]
stretch=F["stretch"]; off,cross,wickx=F["off"],F["cross"],F["wickx"]
WARM=300
usable=[i for i in range(WARM,n-1) if y[i]!=0 and med100[i]>0]
cut=int(.70*len(usable)); TR,TE=usable[:cut],usable[cut:]
TRS=set(TR)
def zz(nn,ok): return (ok-.5*nn)/(.5*math.sqrt(nn)) if nn else 0.
def sign(x): return 1 if x>0 else(-1 if x<0 else 0)

print("="*100)
print("A. ROUND-NUMBER PROXIMITY -- raw P(next move is TOWARD the nearest level)")
print("   magnet => >50%, barrier/repel => <50%.  No side chosen, this is the raw rate.")
print("="*100)
for S in (100,250,500,1000):
    print(f"\n  --- ${S} grid --- (distance of close from nearest multiple, in $)")
    print(f"  {'dist $':>12s} {'train n':>8s} {'train tw':>9s} {'test n':>8s} {'test tw':>8s} {'z':>7s}")
    eds=[5,10,20,35,60,100,175,1e9]
    for b in range(len(eds)):
        lo = 0 if b==0 else eds[b-1]; hi = eds[b]
        if lo >= S/2: break
        tn=to=en=eo=0
        for i in usable:
            a=abs(off[S][i])*S
            if not (lo<=a<hi): continue
            p=-sign(off[S][i])
            if p==0: continue
            if i in TRS: tn+=1; to+=(p==y[i])
            else: en+=1; eo+=(p==y[i])
        if en<100: continue
        print(f"  {f'{lo:.0f}-{min(hi,S/2):.0f}':>12s} {tn:8d} {100*to/tn:8.2f}% {en:8d} "
              f"{100*eo/en:7.2f}% {zz(en,eo):+7.2f}")

print()
print("="*100)
print("B. REJECTION CANDLES AT ROUND LEVELS (wick pierces level, close comes back)")
print("   side = REJ (upper rejection -> predict down).  >50% = rejection continues.")
print("="*100)
print(f"  {'grid':>8s} {'dir':>7s} {'train n':>8s} {'train':>8s} {'test n':>8s} {'test':>8s} {'z':>7s}")
for S in (100,250,500,1000):
    for d in (1,-1):
        tn=to=en=eo=0
        for i in usable:
            if wickx[S][i]!=d: continue
            p=-wickx[S][i]
            if i in TRS: tn+=1; to+=(p==y[i])
            else: en+=1; eo+=(p==y[i])
        if en<100: continue
        print(f"  {S:8d} {'up' if d>0 else 'dn':>7s} {tn:8d} {100*to/tn:7.2f}% {en:8d} "
              f"{100*eo/en:7.2f}% {zz(en,eo):+7.2f}")

print()
print("="*100)
print("C. DISTANCE FROM PREVIOUS DAY'S CLOSE -- raw P(next move is TOWARD prev close)")
print("="*100)
for tz in ("utc","est"):
    pdc=F[tz]["pdc"]
    print(f"\n  --- {tz.upper()} ---")
    print(f"  {'(c-pdc)/med100':>16s} {'train n':>8s} {'train tw':>9s} {'test n':>8s} {'test tw':>8s} {'z':>7s}")
    eds=[-30,-15,-6,-2,2,6,15,30,1e9]
    for b in range(len(eds)):
        lo=-1e9 if b==0 else eds[b-1]; hi=eds[b]
        tn=to=en=eo=0
        for i in usable:
            if pdc[i]!=pdc[i]: continue
            d=(c[i]-pdc[i])/med100[i]
            if not(lo<=d<hi): continue
            p=-sign(d)
            if p==0: continue
            if i in TRS: tn+=1; to+=(p==y[i])
            else: en+=1; eo+=(p==y[i])
        if en<100: continue
        print(f"  {f'{lo:.0f}..{hi:.0f}':>16s} {tn:8d} {100*to/tn:8.2f}% {en:8d} "
              f"{100*eo/en:7.2f}% {zz(en,eo):+7.2f}")

print()
print("="*100)
print("D. PRIOR-DAY EXTREME TAKEN OUT vs INTRADAY EXTREME EXTENDED")
print("   side = ANTI-breakout (fade). >50% = rejection, <50% = continuation.")
print("="*100)
for tz in ("utc","est"):
    D=F[tz]; dhi,dlo,pdh,pdl,dayid=D["dhi"],D["dlo"],D["pdh"],D["pdl"],D["dayid"]
    runhi=[0.]*n; runlo=[0.]*n; ph=pl=None; last=None
    for i in range(n):
        if dayid[i]!=last:
            ph=h[i]; pl=l[i]; last=dayid[i]; runhi[i]=-1e18; runlo[i]=1e18
        else:
            runhi[i]=ph; runlo[i]=pl; ph=max(ph,h[i]); pl=min(pl,l[i])
    cats={}
    for i in usable:
        if pdh[i]!=pdh[i] or runhi[i]<-1e17: continue
        tookhi = h[i]>pdh[i] and runhi[i]<=pdh[i]
        tooklo = l[i]<pdl[i] and runlo[i]>=pdl[i]
        newhi = h[i]>runhi[i] and h[i]<pdh[i]
        newlo = l[i]<runlo[i] and l[i]>pdl[i]
        k=None; d=0
        if tookhi and not tooklo: k,d=("PDH taken out",-1)
        elif tooklo and not tookhi: k,d=("PDL taken out",1)
        elif newhi and not newlo: k,d=("new intraday high",-1)
        elif newlo and not newhi: k,d=("new intraday low",1)
        if k is None: continue
        st=cats.setdefault(k,[0,0,0,0])
        if i in TRS: st[0]+=1; st[1]+=(d==y[i])
        else: st[2]+=1; st[3]+=(d==y[i])
    print(f"\n  --- {tz.upper()} ---   (side = fade the breakout)")
    print(f"  {'event':22s} {'train n':>8s} {'train':>8s} {'test n':>8s} {'test':>8s} {'z':>7s}")
    for k in ("PDH taken out","PDL taken out","new intraday high","new intraday low"):
        if k not in cats: continue
        a,b,cc,d=cats[k]
        print(f"  {k:22s} {a:8d} {100*b/a:7.2f}% {cc:8d} {100*d/cc:7.2f}% {zz(cc,d):+7.2f}")

print()
print("="*100)
print("E. DOES CROSSING A $100 LEVEL ADD TO FADE, AT MATCHED MOVE SIZE?")
print("   Stratified by |move|; within each stratum compare FADE acc crossed vs not.")
print("   Pooled Mantel-Haenszel-style z on the difference (TEST), plus TRAIN.")
print("="*100)
for S in (100,250):
    for lbl,IDX in (("TRAIN",TR),("TEST",TE)):
        eds=[0,15,30,45,60,80,100,130,170,1e9]
        num=0.0; var=0.0
        rows=[]
        for b in range(len(eds)-1):
            g={}
            for i in IDX:
                if not(eds[b]<=abs(mv[i])<eds[b+1]): continue
                w = 1 if cross[S][i]!=0 else 0
                p=-sgn[i]
                if p==0: continue
                st=g.setdefault(w,[0,0]); st[0]+=1; st[1]+=(p==y[i])
            if 0 not in g or 1 not in g: continue
            n1,k1=g[1]; n0,k0=g[0]
            if n1<100 or n0<100: continue
            d=k1/n1-k0/n0
            v=0.25/n1+0.25/n0
            num+=d/v; var+=1/v
            rows.append((eds[b],eds[b+1],n1,100*k1/n1,n0,100*k0/n0,100*d))
        print(f"\n  --- ${S} grid, {lbl} ---")
        print(f"  {'|move|':>12s} {'n cross':>8s} {'fade%':>7s} {'n nocross':>10s} {'fade%':>7s} {'diff pp':>8s}")
        for r in rows:
            print(f"  {f'{r[0]:.0f}-{r[1]:.0f}':>12s} {r[2]:8d} {r[3]:6.2f}% {r[4]:10d} {r[5]:6.2f}% {r[6]:+7.2f}")
        if var>0:
            print(f"  pooled diff = {num/var*100:+.2f} pp   z = {num/math.sqrt(var):+.2f}")
