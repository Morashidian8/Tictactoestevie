"""
Can a circuit breaker survive a week like this one, and is the edge still there?

Two questions, one script.

1. Guards. After N losses in a row, sit out M hours. Also: stop for the day
   after losing X. Judged on the tail — worst day, worst 6-day window, lowest
   point of the equity curve — not on total profit, because the tail is what
   empties a small account.
2. Decay. Rolling accuracy over the most recent data, to separate "a bad week"
   from "the edge is gone".

Run:  python3 research/btc5m/guards.py
"""
import csv, gzip, os, sys, math, statistics as st
from collections import defaultdict
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '.')
import bot

TEH = timezone(timedelta(hours=3, minutes=30))
BASE, RUNGS = 20, 3
FRESH = os.environ.get("FRESH_1M", "")


def five_min_from_1m(path):
    rows = []
    with open(path) as f:
        for r in csv.reader(f):
            try:
                rows.append((int(r[0]), float(r[4])))
            except (ValueError, IndexError):
                continue
    rows.sort()
    b = {}
    for ts, c in rows:
        b[ts // 300 * 300] = c
    return sorted(b.items())


def frozen():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return [(int(r['t']), float(r['c'])) for r in rows]


def signals(kl, since=None):
    """(timestamp, won) for every unanimous signal, oldest first."""
    t = [x[0] for x in kl]
    c = [x[1] for x in kl]
    out = []
    for i in range(140, len(c) - 1):
        if since and t[i] < since:
            continue
        h = bot.BreakoutMonitor.evaluate(c[i - 135:i + 1])
        if not h:
            continue
        s = {x[2] for x in h}
        if len(s) != 1 or c[i + 1] == c[i]:
            continue
        out.append((t[i], (s.pop() == "up") == (c[i + 1] > c[i])))
    return out


def run(sig, loss_n=0, pause_h=0, day_stop=0, base=BASE):
    """
    Play the sequence with an optional guard. Returns the numbers that matter.

    loss_n / pause_h: after loss_n consecutive losses, ignore signals for
    pause_h hours. day_stop: stop for the rest of the Tehran day once the day
    is down this much.
    """
    lad = [base * 2 ** k for k in range(RUNGS)]
    pnl = peak = dd = low = 0.0
    rung = streak = busts = taken = 0
    until = 0
    day_pnl = defaultdict(float)
    cur_day = None
    for ts, won in sig:
        d = datetime.fromtimestamp(ts, TEH).strftime("%Y-%m-%d")
        if d != cur_day:
            cur_day = d
        if ts < until:
            continue
        if day_stop and day_pnl[d] <= -day_stop:
            continue
        taken += 1
        stake = lad[rung]
        if won:
            pnl += stake; day_pnl[d] += stake
            rung = 0; streak = 0
        else:
            pnl -= stake; day_pnl[d] -= stake
            rung += 1; streak += 1
            if rung >= RUNGS:
                busts += 1; rung = 0
            if loss_n and streak >= loss_n:
                until = ts + pause_h * 3600
                streak = 0
        peak = max(peak, pnl); dd = max(dd, peak - pnl); low = min(low, pnl)
    days = sorted(day_pnl)
    worst_day = min(day_pnl.values()) if day_pnl else 0
    worst6 = 0
    vals = [day_pnl[d] for d in days]
    for i in range(max(0, len(vals) - 5)):
        worst6 = min(worst6, sum(vals[i:i + 6]))
    return {"pnl": pnl, "dd": dd, "low": low, "busts": busts, "taken": taken,
            "worst_day": worst_day, "worst6": worst6}


def main():
    kl = frozen()
    year = kl[-1][0] - 365 * 86400
    sig = signals(kl, since=year)
    print(f"سالِ بک‌تست: {len(sig):,} سیگنال · پایهٔ {BASE}$ · مارتینگلِ {RUNGS} پله\n")
    base = run(sig)
    print(f"  {'محافظ':30} {'شرط':>7} {'سود':>10} {'بدترین روز':>12} "
          f"{'بدترین ۶ روز':>14} {'کف مسیر':>10}")
    print(f"  {'بدونِ محافظ':30} {base['taken']:>7,} {base['pnl']:>+9,.0f}$ "
          f"{base['worst_day']:>+11,.0f}$ {base['worst6']:>+13,.0f}$ {base['low']:>+9,.0f}$")
    best = []
    for n in (3, 4, 5, 6):
        for h in (1, 2, 3, 6, 12):
            r = run(sig, loss_n=n, pause_h=h)
            best.append((n, h, r))
    for n, h, r in best:
        if r["worst_day"] > base["worst_day"] * 0.75 or r["pnl"] > base["pnl"] * 0.7:
            print(f"  {'بعد از '+str(n)+' باخت، '+str(h)+' ساعت استراحت':30} "
                  f"{r['taken']:>7,} {r['pnl']:>+9,.0f}$ {r['worst_day']:>+11,.0f}$ "
                  f"{r['worst6']:>+13,.0f}$ {r['low']:>+9,.0f}$")
    for x in (200, 300, 400, 600):
        r = run(sig, day_stop=x)
        print(f"  {'توقفِ روزانه در '+str(x)+' دلار ضرر':30} {r['taken']:>7,} "
              f"{r['pnl']:>+9,.0f}$ {r['worst_day']:>+11,.0f}$ {r['worst6']:>+13,.0f}$ "
              f"{r['low']:>+9,.0f}$")

    if FRESH and os.path.exists(FRESH):
        kl2 = five_min_from_1m(FRESH)
        recent = signals(kl2, since=kl2[-1][0] - 7 * 86400)
        print(f"\n\nهمان محافظ‌ها روی هفتهٔ بدِ اخیر ({len(recent)} سیگنال):\n")
        b2 = run(recent)
        print(f"  {'محافظ':30} {'شرط':>7} {'سود':>10} {'بدترین روز':>12}")
        print(f"  {'بدونِ محافظ':30} {b2['taken']:>7,} {b2['pnl']:>+9,.0f}$ "
              f"{b2['worst_day']:>+11,.0f}$")
        for n in (3, 4, 5):
            for h in (2, 3, 6, 12):
                r = run(recent, loss_n=n, pause_h=h)
                print(f"  {'بعد از '+str(n)+' باخت، '+str(h)+' ساعت':30} {r['taken']:>7,} "
                      f"{r['pnl']:>+9,.0f}$ {r['worst_day']:>+11,.0f}$")
        for x in (200, 300, 400):
            r = run(recent, day_stop=x)
            print(f"  {'توقفِ روزانه در '+str(x)+' دلار':30} {r['taken']:>7,} "
                  f"{r['pnl']:>+9,.0f}$ {r['worst_day']:>+11,.0f}$")

        # decay check
        print("\n\nآیا لبه از بین رفته؟ دقتِ پنجره‌های متحرک:\n")
        allsig = signals(kl2, since=kl2[-1][0] - 120 * 86400)
        for d in (7, 14, 30, 60, 120):
            s = [w for ts, w in allsig if ts >= kl2[-1][0] - d * 86400]
            if len(s) < 50:
                continue
            a = sum(s) / len(s)
            z = (a - 0.537) / math.sqrt(0.537 * 0.463 / len(s))
            print(f"  {d:>3} روزِ اخیر: {len(s):>5,} سیگنال  دقت {a*100:>5.2f}%  "
                  f"z در برابرِ ۵۳٫۷٪ = {z:+.2f}"
                  f"{'   ⚠️' if z < -2 else ''}")


if __name__ == "__main__":
    main()
