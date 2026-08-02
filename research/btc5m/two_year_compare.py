"""
The same rules over two years, one year against the other.

The whole rule set was built and validated on the more recent year. Running it
on the year BEFORE that is the closest thing available to a true out-of-sample
test: none of these thresholds ever saw this data.

Needs the two-year 5-minute series produced from the Bitstamp mirror.
Run:  python3 research/btc5m/two_year_compare.py
"""
import os, pickle, sys, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '.')
import bot

TEH = timezone(timedelta(hours=3, minutes=30))
PKL = os.environ.get("TWO_YEAR_PKL", "/tmp/two_years.pkl")
BASE, RUNGS, START_CAP = 20, 3, 2000


def bets_for(kl, lo, hi):
    t = [x[0] for x in kl]
    c = [x[1] for x in kl]
    out = []
    for i in range(140, len(c) - 1):
        if not (lo <= t[i] < hi):
            continue
        h = bot.BreakoutMonitor.evaluate(c[i - 135:i + 1])
        if not h:
            continue
        s = {x[2] for x in h}
        if len(s) != 1 or c[i + 1] == c[i]:
            continue
        out.append((t[i], (s.pop() == "up") == (c[i + 1] > c[i]),
                    [x[0][0] for x in h]))
    return out


def play(bets, base=BASE, rungs=RUNGS, cap=START_CAP):
    lad = [base * 2 ** k for k in range(rungs)]
    pnl = peak = dd = low = 0.0
    k = busts = 0
    ruined = None
    day = defaultdict(float)
    runs, streak = Counter(), 0
    for ts, won, _ in bets:
        s = lad[k]
        d = datetime.fromtimestamp(ts, TEH).strftime("%Y-%m-%d")
        if won:
            pnl += s; day[d] += s; k = 0
            if streak:
                runs[streak] += 1
            streak = 0
        else:
            pnl -= s; day[d] -= s; k += 1; streak += 1
            if k >= rungs:
                busts += 1; k = 0
        peak = max(peak, pnl); dd = max(dd, peak - pnl); low = min(low, pnl)
        if ruined is None and cap + pnl <= 0:
            ruined = d
    if streak:
        runs[streak] += 1
    return {"n": len(bets), "wins": sum(1 for b in bets if b[1]),
            "pnl": pnl, "dd": dd, "low": low, "busts": busts,
            "ruined": ruined, "day": day, "runs": runs}


def main():
    kl = pickle.load(open(PKL, "rb"))
    end = kl[-1][0]
    y1 = (end - 365 * 86400, end)                 # سالِ اخیر
    y0 = (end - 730 * 86400, end - 365 * 86400)   # سالِ قبلش
    res = {}
    for name, (lo, hi) in (("سالِ قبل‌تر", y0), ("سالِ اخیر", y1)):
        b = bets_for(kl, lo, hi)
        res[name] = play(b)
        res[name]["span"] = (lo, hi)

    print(f"سرمایهٔ {START_CAP:,}$ · پایهٔ {BASE}$ · مارتینگلِ {RUNGS} پله\n")
    rows = [
        ("دوره", lambda r: f"{datetime.fromtimestamp(r['span'][0],timezone.utc):%Y-%m-%d}"
                           f" تا {datetime.fromtimestamp(r['span'][1],timezone.utc):%Y-%m-%d}"),
        ("سیگنال", lambda r: f"{r['n']:,}"),
        ("در روز", lambda r: f"{r['n']/365:.1f}"),
        ("دقت", lambda r: f"{r['wins']/r['n']*100:.2f}%"),
        ("سود/زیان", lambda r: f"{r['pnl']:+,.0f}$"),
        ("موجودیِ پایان", lambda r: f"{START_CAP+r['pnl']:,.0f}$"),
        ("بازده", lambda r: f"{r['pnl']/START_CAP*100:+.0f}%"),
        ("انفجار", lambda r: f"{r['busts']:,}"),
        ("بدترین افت", lambda r: f"{r['dd']:,.0f}$"),
        ("کف مسیر", lambda r: f"{r['low']:+,.0f}$"),
        ("کمترین موجودی", lambda r: f"{START_CAP+r['low']:,.0f}$"),
        ("صفر شد؟", lambda r: r['ruined'] or "نه ✅"),
        ("بدترین روز", lambda r: f"{min(r['day'].values()):+,.0f}$"),
        ("بهترین روز", lambda r: f"{max(r['day'].values()):+,.0f}$"),
        ("روزهای سودده", lambda r: f"{sum(1 for v in r['day'].values() if v>0)}/{len(r['day'])}"),
        ("بلندترین رشتهٔ باخت", lambda r: f"{max(r['runs'])}"),
        ("رشته‌های ۷+", lambda r: f"{sum(v for k,v in r['runs'].items() if k>=7)}"),
    ]
    print(f"  {'':22} {'سالِ قبل‌تر':>24} {'سالِ اخیر':>24}")
    for label, fn in rows:
        print(f"  {label:22} {fn(res['سالِ قبل‌تر']):>24} {fn(res['سالِ اخیر']):>24}")

    # ماه به ماه
    print("\n\nماه به ماه (سود با پایهٔ ۲۰$):\n")
    for name in ("سالِ قبل‌تر", "سالِ اخیر"):
        m = defaultdict(float)
        for d, v in res[name]["day"].items():
            m[d[:7]] += v
        line = "  ".join(f"{k[5:]}:{v:>+6,.0f}" for k, v in sorted(m.items()))
        neg = sum(1 for v in m.values() if v <= 0)
        print(f"  {name}  ({neg} ماهِ زیان‌ده از {len(m)})")
        for k in sorted(m):
            bar = "█" * min(30, int(abs(m[k]) / 250))
            print(f"     {k}  {m[k]:>+8,.0f}$  {bar}")
        print()


if __name__ == "__main__":
    main()
