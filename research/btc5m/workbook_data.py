import gzip, csv, sys, json, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
sys.path.insert(0,'/home/user/Tictactoestevie')
from strategies import rule1, rule2, rule3, rule5, GOLDEN_MULT, GOLDEN_RULES
sys.path.insert(0,'/home/user/Tictactoestevie/research/btc5m')
from rule7_as_voter import rsi_series, r7_side

ET=timezone(timedelta(hours=-4)); DAYS=365
rows=list(csv.DictReader(gzip.open('/home/user/Tictactoestevie/research/btc5m/btc5m.csv.gz','rt')))
t=[int(r['t']) for r in rows]; c=[float(r['c']) for r in rows]
r7=rsi_series(c); cut=t[-1]-DAYS*86400
OLD,NEW={1,2,3,5},{1,2,3,5,7}

def side_of(f, mem):
    s={v for k,v in f.items() if k in mem}
    return s.pop() if len(s)==1 else None
def golden_of(f, mem, stretch9):
    if not stretch9: return None
    v=[k for k in f if k in mem]
    return side_of(f,mem) if len(v)>=GOLDEN_RULES else None

ev=[]
for i in range(140,len(c)-1):
    if t[i]<cut: continue
    o="up" if c[i+1]>c[i] else ("down" if c[i+1]<c[i] else None)
    if o is None: continue
    cl=c[i-135:i+1]
    f={}
    for num,fn in ((1,rule1),(2,rule2),(3,rule3),(5,rule5)):
        s=fn(cl)
        if s: f[num]=s["side"]
    s7=r7_side(c,i,r7)
    if s7: f[7]=s7
    st9=bool(rule5(cl, mult=GOLDEN_MULT))
    d=datetime.fromtimestamp(t[i],ET)
    ev.append({"t":t[i],"d":d,"o":o,"f":f,"st9":st9,
               "old": golden_of(f,OLD,st9) or side_of(f,OLD),
               "new": golden_of(f,NEW,st9) or side_of(f,NEW)})

class L:
    def __init__(s,base,rungs): s.b,s.r,s.k=base,rungs,0; s.pnl=s.peak=s.dd=0.0; s.busts=0; s.low=0.0
    def bet(s,won):
        x=s.b*2**s.k
        if won: s.pnl+=x; s.k=0
        else:
            s.pnl-=x; s.k+=1
            if s.k>=s.r: s.busts+=1; s.k=0
        s.peak=max(s.peak,s.pnl); s.dd=max(s.dd,s.peak-s.pnl); s.low=min(s.low,s.pnl)
        return x if won else -x

CFG=[(r,b) for b in (20,50) for r in (3,4,5)]
VAR=["old","new"]
lads={(v,cfg):L(cfg[1],cfg[0]) for v in VAR for cfg in CFG}
daily=defaultdict(lambda: {v:{"n":0,"w":0,**{cfg:0.0 for cfg in CFG}} for v in VAR})
hourly=defaultdict(lambda: {v:[0,0] for v in VAR})
for e in ev:
    key=e["d"].strftime("%Y-%m-%d")
    for v in VAR:
        s=e[v]
        if not s: continue
        won = s==e["o"]
        rec=daily[key][v]; rec["n"]+=1; rec["w"]+=won
        hourly[e["d"].hour][v][0]+=1; hourly[e["d"].hour][v][1]+=won
        for cfg in CFG: rec[cfg]+=lads[(v,cfg)].bet(won)

def runs_of(v):
    r=Counter(); k=0
    for e in ev:
        s=e[v]
        if not s: continue
        if s==e["o"]:
            if k: r[k]+=1
            k=0
        else: k+=1
    if k: r[k]+=1
    return dict(sorted(r.items()))

surv=[]
for bank in (1000,1800,2500,3000,5000):
    for v in VAR:
        for rungs,base in CFG:
            lad=[base*2**k for k in range(rungs)]; pnl=0; kk=0; ruin=None; peak=dd=0
            for e in ev:
                s=e[v]
                if not s: continue
                x=lad[kk]
                if s==e["o"]: pnl+=x; kk=0
                else:
                    pnl-=x; kk+=1
                    if kk>=rungs: kk=0
                peak=max(peak,pnl); dd=max(dd,peak-pnl)
                if bank+pnl<=0: ruin=e["d"].strftime("%Y-%m-%d"); break
            surv.append([bank,v,base,rungs,"صفر شد" if ruin else "دوام آورد",ruin or "",round(dd)])

out={"span":DAYS,
 "totals":{v:{"n":sum(1 for e in ev if e[v]),
              "w":sum(1 for e in ev if e[v] and e[v]==e["o"])} for v in VAR},
 "configs":[{"var":v,"rungs":r,"base":b,"pnl":round(lads[(v,(r,b))].pnl),
             "dd":round(lads[(v,(r,b))].dd),"low":round(lads[(v,(r,b))].low),
             "busts":lads[(v,(r,b))].busts} for v in VAR for r,b in CFG],
 "daily":[{"date":k,"weekday":datetime.strptime(k,"%Y-%m-%d").weekday(),"month":k[:7],
           **{f"{v}_n":d[v]["n"] for v in VAR},
           **{f"{v}_w":d[v]["w"] for v in VAR},
           **{f"{v}_p{r}_{b}":round(d[v][(r,b)]) for v in VAR for r,b in CFG}}
          for k,d in sorted(daily.items())],
 "hourly":{str(h):{v:hourly[h][v] for v in VAR} for h in sorted(hourly)},
 "runs":{v:runs_of(v) for v in VAR},
 "surv":surv,
 "solo7":sum(1 for e in ev if 7 in e["f"] and not any(k in e["f"] for k in OLD)),
 "veto7":sum(1 for e in ev if e["old"] and 7 in e["f"] and e["f"][7]!=e["old"]),
}
json.dump(out,open('/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/data2.json','w'))
for v in VAR:
    tt=out["totals"][v]; print(v, tt["n"], f'{tt["w"]/tt["n"]*100:.2f}%')
