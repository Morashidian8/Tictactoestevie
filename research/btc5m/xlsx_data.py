"""Build the one-year backtest workbook."""
import gzip, csv, sys, math, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/home/user/Tictactoestevie')
from strategies import evaluate

ET = timezone(timedelta(hours=-4)); DAYS = 365
WD = ["دوشنبه","سه‌شنبه","چهارشنبه","پنج‌شنبه","جمعه","شنبه","یکشنبه"]

rows = list(csv.DictReader(gzip.open('/home/user/Tictactoestevie/research/btc5m/btc5m.csv.gz','rt')))
t = [int(r['t']) for r in rows]; c = [float(r['c']) for r in rows]
cut = t[-1] - DAYS*86400
bets = []
for i in range(140, len(c)-1):
    if t[i] < cut: continue
    o = "up" if c[i+1] > c[i] else ("down" if c[i+1] < c[i] else None)
    if o is None: continue
    for s in evaluate(c[i-135:i+1], streams=("golden","statistical")):
        bets.append((t[i], s.side, s.side == o, s.stream))

class Lad:
    def __init__(s, base, rungs):
        s.base, s.rungs, s.rung = base, rungs, 0
        s.pnl = s.peak = s.dd = 0.0; s.busts = s.cycles = 0
        s.low = 0.0
    def bet(s, won):
        stake = s.base * 2**s.rung
        if won: s.pnl += stake; s.rung = 0; s.cycles += 1
        else:
            s.pnl -= stake; s.rung += 1
            if s.rung >= s.rungs: s.busts += 1; s.cycles += 1; s.rung = 0
        s.peak = max(s.peak, s.pnl); s.dd = max(s.dd, s.peak - s.pnl)
        s.low = min(s.low, s.pnl)
        return stake if won else -stake

CONFIGS = [(r, b) for b in (20, 50) for r in (3, 4, 5)]
lads = {cfg: Lad(cfg[1], cfg[0]) for cfg in CONFIGS}

daily = defaultdict(lambda: {"n":0,"w":0,**{cfg:0.0 for cfg in CONFIGS}})
raw = []
for ts, side, won, stream in bets:
    d = datetime.fromtimestamp(ts, ET)
    key = d.strftime("%Y-%m-%d")
    rec = daily[key]; rec["n"] += 1; rec["w"] += won
    for cfg in CONFIGS:
        rec[cfg] += lads[cfg].bet(won)
    raw.append((d.strftime("%Y-%m-%d %H:%M"), d.hour, d.weekday(),
                d.strftime("%Y-%m"), key, side, stream, 1 if won else 0))

# losing runs
runs = Counter(); k = 0
for _,_,won,_ in bets:
    if won:
        if k: runs[k] += 1
        k = 0
    else: k += 1
if k: runs[k] += 1

# consecutive busts (3-rung)
consec = Counter(); streak = 0
for _,_,won,_ in bets:
    if won:
        if streak >= 3: consec[streak//3] += 1
        streak = 0
    else: streak += 1
if streak >= 3: consec[streak//3] += 1

# bankroll survival
surv = []
for bank in (1000, 1800, 3000, 5000, 10000):
    for rungs, base in CONFIGS:
        L = Lad(base, rungs); ruin = None
        for i,(ts,_,won,_) in enumerate(bets):
            L.bet(won)
            if bank + L.pnl <= 0: ruin = (i, ts); break
        surv.append((bank, base, rungs,
                     "صفر شد" if ruin else "دوام آورد",
                     datetime.fromtimestamp(ruin[1],ET).strftime("%Y-%m-%d") if ruin else "",
                     ruin[0] if ruin else len(bets), round(L.dd)))

import json
out = {
 "bets": len(bets),
 "wins": sum(1 for b in bets if b[2]),
 "span": (bets[-1][0]-bets[0][0])/86400,
 "first": datetime.fromtimestamp(bets[0][0],ET).strftime("%Y-%m-%d %H:%M"),
 "last": datetime.fromtimestamp(bets[-1][0],ET).strftime("%Y-%m-%d %H:%M"),
 "configs": [{"rungs":r,"base":b,"pnl":round(lads[(r,b)].pnl),
              "dd":round(lads[(r,b)].dd),"low":round(lads[(r,b)].low),
              "busts":lads[(r,b)].busts,"cycles":lads[(r,b)].cycles,
              "worst_cycle": b*(2**r-1)} for r,b in CONFIGS],
 "daily": [{"date":k,"weekday":datetime.strptime(k,"%Y-%m-%d").weekday(),
            "month":k[:7],"n":v["n"],"w":v["w"],
            **{f"p{r}_{b}": round(v[(r,b)]) for r,b in CONFIGS}}
           for k,v in sorted(daily.items())],
 "runs": dict(sorted(runs.items())),
 "consec": dict(sorted(consec.items())),
 "surv": surv,
 "raw": raw,
}
json.dump(out, open('/tmp/claude-0/-home-user-Tictactoestevie/8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/data.json','w'))
print("bets", out["bets"], "days", len(out["daily"]))
for cfg in out["configs"]:
    print(f"  {cfg['rungs']} پله پایه {cfg['base']}: سود {cfg['pnl']:+,} افت {cfg['dd']:,} انفجار {cfg['busts']}")
