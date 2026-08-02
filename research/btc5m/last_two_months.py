"""
Every signal of the last two months, one row each, plus a day-by-day roll-up.

Written because a yearly total hides the thing that actually matters to a small
account: what a single day can do to it. The per-signal file lets any of these
numbers be checked by hand; the daily file is what to read first.

Run:  TWO_YEAR_PKL=... python3 research/btc5m/last_two_months.py
"""
import csv, os, pickle, sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '.')
import bot

TEH = timezone(timedelta(hours=3, minutes=30))
ET = timezone(timedelta(hours=-4))
PKL = os.environ.get("TWO_YEAR_PKL", "/tmp/two_years.pkl")
OUT = os.environ.get("OUT_DIR", "docs/research/csv")
BASE, RUNGS, CAP, DAYS = 20, 3, 2000, 60


def main():
    kl = pickle.load(open(PKL, "rb"))
    t = [x[0] for x in kl]
    c = [x[1] for x in kl]
    cut = t[-1] - DAYS * 86400
    lad = [BASE * 2 ** k for k in range(RUNGS)]

    bal = CAP
    rung = 0
    rows = []
    day = defaultdict(lambda: {"n": 0, "w": 0, "l": 0, "busts": 0, "cycles": 0,
                               "pnl": 0.0, "low": None, "mx": 0, "k": 0})
    for i in range(140, len(c) - 1):
        if t[i] < cut:
            continue
        h = bot.BreakoutMonitor.evaluate(c[i - 135:i + 1])
        if not h:
            continue
        s = {x[2] for x in h}
        if len(s) != 1 or c[i + 1] == c[i]:
            continue
        side = s.pop()
        won = (side == "up") == (c[i + 1] > c[i])
        d = datetime.fromtimestamp(t[i], TEH)
        key = d.strftime("%Y-%m-%d")
        r = day[key]
        stake = lad[rung]
        bust = ""
        if won:
            bal += stake; r["pnl"] += stake; r["w"] += 1
            rung = 0; r["cycles"] += 1; r["k"] = 0
        else:
            bal -= stake; r["pnl"] -= stake; r["l"] += 1
            rung += 1; r["k"] += 1; r["mx"] = max(r["mx"], r["k"])
            if rung >= RUNGS:
                rung = 0; r["busts"] += 1; r["cycles"] += 1; bust = "انفجار"
        r["n"] += 1
        r["low"] = bal if r["low"] is None else min(r["low"], bal)
        rows.append({
            "تاریخ تهران": d.strftime("%Y-%m-%d"),
            "ساعت تهران": d.strftime("%H:%M"),
            "پنجره ET": datetime.fromtimestamp(t[i], ET).strftime("%I:%M%p"),
            "جهت": "بالا" if side == "up" else "پایین",
            "قانون‌ها": "،".join(x[0].split(")")[0] for x in h),
            "پله": lad.index(stake) + 1,
            "مبلغ": stake,
            "نتیجه": "برد" if won else "باخت",
            "سود/زیان": stake if won else -stake,
            "انفجار": bust,
            "موجودی": round(bal, 2),
            "قیمت شروع": c[i],
            "قیمت پایان": c[i + 1],
        })

    os.makedirs(OUT, exist_ok=True)
    p1 = f"{OUT}/8-last2months-signals.csv"
    with open(p1, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    p2 = f"{OUT}/9-last2months-daily.csv"
    bal2 = CAP
    daily = []
    for k in sorted(day):
        r = day[k]
        bal2 += r["pnl"]
        daily.append({
            "تاریخ تهران": k,
            "سیگنال": r["n"], "برد": r["w"], "باخت": r["l"],
            "درصد برد": round(r["w"] / r["n"] * 100, 1),
            "چرخه": r["cycles"], "انفجار": r["busts"],
            "بلندترین رشتهٔ باخت": r["mx"],
            "سود/زیان روز": round(r["pnl"]),
            "موجودی پایان روز": round(bal2),
            "کمترین موجودی در روز": round(r["low"]),
        })
    with open(p2, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(daily[0].keys()))
        w.writeheader(); w.writerows(daily)

    tot = sum(d["سود/زیان روز"] for d in daily)
    print(f"دو ماهِ گذشته · سرمایهٔ {CAP:,}$ · پایهٔ {BASE}$ · مارتینگلِ {RUNGS} پله\n")
    print(f"  {'تاریخ':>11} {'سیگ':>5} {'برد':>4} {'باخت':>5} {'درصد':>6} "
          f"{'چرخه':>5} {'انفجار':>7} {'رشته':>5} {'سود روز':>9} {'موجودی':>9} {'کف روز':>9}")
    for d in daily:
        flag = " ⚠️" if d["بلندترین رشتهٔ باخت"] >= 7 else ""
        print(f"  {d['تاریخ تهران']:>11} {d['سیگنال']:>5} {d['برد']:>4} {d['باخت']:>5} "
              f"{d['درصد برد']:>5.1f}% {d['چرخه']:>5} {d['انفجار']:>7} "
              f"{d['بلندترین رشتهٔ باخت']:>4}{flag} {d['سود/زیان روز']:>+8,}$ "
              f"{d['موجودی پایان روز']:>8,}$ {d['کمترین موجودی در روز']:>8,}$")
    n = sum(d["سیگنال"] for d in daily); w_ = sum(d["برد"] for d in daily)
    print(f"\n  جمع: {n:,} سیگنال · {w_:,} برد ({w_/n*100:.2f}%) · "
          f"{sum(d['انفجار'] for d in daily):,} انفجار · {tot:+,}$")
    print(f"  موجودی: {CAP:,}$ → {CAP+tot:,}$  ({tot/CAP*100:+.0f}%)")
    print(f"  کمترین موجودی در کلِ دوره: {min(d['کمترین موجودی در روز'] for d in daily):,}$")
    print(f"\n  فایل‌ها: {p1}  ·  {p2}")


if __name__ == "__main__":
    main()
