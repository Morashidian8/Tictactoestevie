"""Independent check of the agent's Bollinger+RSI rule, written from scratch."""
import gzip, csv, math, statistics as st, random, sys
sys.path.insert(0,'/home/user/Tictactoestevie')
from strategies import rule1, rule2, rule3, rule5, golden

rows=list(csv.DictReader(gzip.open('/home/user/Tictactoestevie/research/btc5m/btc5m.csv.gz','rt')))
c=[float(r['c']) for r in rows]; t=[int(r['t']) for r in rows]

def rsi_all(c, n):
    out=[None]*len(c); ag=al=0.0
    for i in range(1,len(c)):
        d=c[i]-c[i-1]; g,l=max(d,0.0),max(-d,0.0)
        if i<=n:
            ag+=g; al+=l
            if i==n:
                ag,al=ag/n,al/n
                out[i]=100-100/(1+ag/al) if al else 100.0
        else:
            ag=(ag*(n-1)+g)/n; al=(al*(n-1)+l)/n
            out[i]=100-100/(1+ag/al) if al else 100.0
    return out
R7=rsi_all(c,7)

def signal(i):
    """BB(20,2) pierce + RSI(7) extreme -> fade."""
    w=c[i-19:i+1]
    m=sum(w)/20; sd=st.pstdev(w)
    if sd<=0 or R7[i] is None: return None
    if c[i] > m+2*sd and R7[i] >= 80: return "down"
    if c[i] < m-2*sd and R7[i] <= 20: return "up"
    return None

sig=[]
for i in range(140,len(c)-1):
    s=signal(i)
    if not s or c[i+1]==c[i]: continue
    o="up" if c[i+1]>c[i] else "down"
    sig.append((i,t[i],s,s==o))

split=int(len(sig)*0.7)
def acc(rows):
    n=len(rows); w=sum(1 for r in rows if r[3])
    z=((w/n)-0.5)/(0.5/math.sqrt(n))
    return n,w/n*100,z
days=(t[-1]-t[140])/86400
for lab,rows in (("train",sig[:split]),("test",sig[split:]),("کل",sig)):
    n,a,z=acc(rows); print(f"  {lab:6} n={n:>6}  دقت {a:5.2f}%  z={z:+5.2f}")
print(f"  سیگنال در روز: {len(sig)/days:.1f}")

# بلوک‌های زمانی
print("\n  ۶ بلوکِ زمانی:", end=" ")
sz=len(sig)//6
for b in range(6):
    part=sig[b*sz:(b+1)*sz] if b<5 else sig[5*sz:]
    print(f"{sum(1 for r in part if r[3])/len(part)*100:.1f}%", end="  ")
print()

# همپوشانی با قانون‌های موجود
novel=[]; overlap=0
for i,ts,s,won in sig:
    cl=c[i-135:i+1]
    other = rule1(cl) or rule2(cl) or rule3(cl) or rule5(cl)
    if other: overlap+=1
    else: novel.append((i,ts,s,won))
print(f"\n  همپوشانی با قانون‌های ۱/۲/۳/۵: {overlap}/{len(sig)} = {100*overlap/len(sig):.0f}%")
n,a,z=acc(novel); print(f"  سیگنال‌های کاملاً جدید: n={n}  دقت {a:.2f}%  z={z:+.2f}")

# کنترلِ برچسبِ تصادفی
labels=[r[3] for r in sig]; random.seed(2); best=0
for _ in range(300):
    random.shuffle(labels)
    best=max(best, sum(labels)/len(labels))
print(f"  ۳۰۰ برچسبِ تصادفی: بهترین {best*100:.2f}%  (واقعی {sum(1 for r in sig if r[3])/len(sig)*100:.2f}%)")

# اقتصاد
def flat(rows, stake=20):
    pnl=peak=dd=0
    for r in rows:
        pnl += stake if r[3] else -stake
        peak=max(peak,pnl); dd=max(dd,peak-pnl)
    return pnl,dd
def mart(rows, base=20, rungs=3):
    lad=[base*2**k for k in range(rungs)]; pnl=peak=dd=0; rr=0; b=0
    for r in rows:
        s=lad[rr]
        if r[3]: pnl+=s; rr=0
        else:
            pnl-=s; rr+=1
            if rr>=rungs: b+=1; rr=0
        peak=max(peak,pnl); dd=max(dd,peak-pnl)
    return pnl,dd,b
cut=t[-1]-365*86400
yr=[r for r in sig if r[1]>=cut]
print(f"\n  ۱۲ ماهِ اخیر: {len(yr)} سیگنال، دقت {sum(1 for r in yr if r[3])/len(yr)*100:.2f}%")
p,d=flat(yr,20); print(f"    حجمِ ثابت ۲۰$ : سود {p:+,}$  بدترین افت {d:,}$")
p,d,b=mart(yr,20,3); print(f"    مارتینگل ۳/۲۰$: سود {p:+,}$  افت {d:,}$  انفجار {b}")
p,d,b=mart(yr,50,3); print(f"    مارتینگل ۳/۵۰$: سود {p:+,}$  افت {d:,}$  انفجار {b}")
k=mx=0
for r in yr:
    k=0 if r[3] else k+1; mx=max(mx,k)
print(f"    بلندترین رشتهٔ باخت: {mx}")
