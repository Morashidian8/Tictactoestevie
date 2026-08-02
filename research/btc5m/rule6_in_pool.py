"""
Rule 6 on its own, and inside the pool that now includes rule 7.

Rule 6: AABA completes while RSI(7) >= 70 -> bet DOWN. It is the one thing the
AABA pattern ever produced, and it says the opposite of what the pattern's owner
expected — the completion marks exhaustion, not continuation.

Measured here against the pool as it stands today (golden + rules 1/2/3/5/7),
because the answer to "does it help?" changes as the pool changes.

Run:  python3 research/btc5m/rule6_in_pool.py
"""
import csv, gzip, sys, statistics as st
from collections import defaultdict
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '.')
import bot

TEH = timezone(timedelta(hours=3, minutes=30))
DAYS = 365


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return [int(r['t']) for r in rows], [float(r['c']) for r in rows]


def rule6(closes):
    """AABA completed and RSI(7) is overbought -> down."""
    if bot.rule4_signal(closes) is None:
        return None
    r = bot.rsi(closes)
    return "down" if r is not None and r >= 70 else None


def pool_side(closes):
    """What the bot would bet today: golden + rules 1/2/3/5/7, unanimous only."""
    hits = bot.BreakoutMonitor.evaluate(closes)
    if not hits:
        return None
    s = {h[2] for h in hits}
    return s.pop() if len(s) == 1 else None


class Lad:
    def __init__(self, base, rungs=3):
        self.base, self.rungs, self.k = base, rungs, 0
        self.pnl = self.peak = self.dd = self.low = 0.0
        self.busts = 0

    def bet(self, won):
        s = self.base * 2 ** self.k
        if won:
            self.pnl += s; self.k = 0
        else:
            self.pnl -= s; self.k += 1
            if self.k >= self.rungs:
                self.busts += 1; self.k = 0
        self.peak = max(self.peak, self.pnl)
        self.dd = max(self.dd, self.peak - self.pnl)
        self.low = min(self.low, self.pnl)
        return s if won else -s


def flat(bets, stake=20):
    pnl = peak = dd = low = 0.0
    for won in bets:
        pnl += stake if won else -stake
        peak = max(peak, pnl); dd = max(dd, peak - pnl); low = min(low, pnl)
    return pnl, dd, low


def main():
    t, c = load()
    cut = t[-1] - DAYS * 86400
    rows = []
    for i in range(140, len(c) - 1):
        if t[i] < cut:
            continue
        o = "up" if c[i + 1] > c[i] else ("down" if c[i + 1] < c[i] else None)
        if o is None:
            continue
        cl = c[i - 135:i + 1]
        rows.append({"t": t[i], "o": o, "p": pool_side(cl), "r6": rule6(cl)})

    def show(name, bets, base=20):
        if not bets:
            print(f"  {name:34} —"); return None
        n = len(bets); w = sum(bets)
        L = Lad(base)
        for x in bets: L.bet(x)
        fp, fd, fl = flat(bets, base)
        print(f"  {name:34} {n:>6,} ({n/DAYS:>4.1f}) {w/n*100:>6.2f}% "
              f"{L.pnl:>+9,.0f}$ {L.dd:>7,.0f}$ {L.low:>+8,.0f}$ {fp:>+9,.0f}$")
        return L

    print(f"سالِ {DAYS} روزه · پایهٔ ۲۰$ · «مارتینگلِ ۳ پله» و «حجمِ ثابت»\n")
    print(f"  {'جریان':34} {'شرط':>6} {'/روز':>6} {'دقت':>7} "
          f"{'مارتینگل':>10} {'افت':>8} {'کف':>9} {'ثابت':>10}")

    P = [r["p"] == r["o"] for r in rows if r["p"]]
    show("استخرِ فعلی (۱،۲،۳،۵،۷ + طلایی)", P)

    R6 = [r["r6"] == r["o"] for r in rows if r["r6"]]
    show("قانون ۶ تنها", R6)

    # داخلِ استخر، با اولویتِ استخر (چون تضاد تقریباً صفر است فرقی نمی‌کند)
    B = [(r["p"] or r["r6"]) == r["o"] for r in rows if (r["p"] or r["r6"])]
    show("استخر + قانون ۶", B)

    # فقط سیگنال‌هایی از قانون ۶ که استخر نمی‌بیند
    solo = [r["r6"] == r["o"] for r in rows if r["r6"] and not r["p"]]
    show("قانون ۶، فقط جایی که استخر ساکت است", solo)

    # دو دفترِ جدا
    l6, lp = Lad(20), Lad(20)
    peak = dd = 0.0
    for r in rows:
        if r["r6"]:
            l6.bet(r["r6"] == r["o"])
        elif r["p"]:
            lp.bet(r["p"] == r["o"])
        tot = l6.pnl + lp.pnl
        peak = max(peak, tot); dd = max(dd, peak - tot)
    print(f"\n  دو دفترِ جدا: سود {l6.pnl+lp.pnl:+,.0f}$  بدترین افتِ مجموع {dd:,.0f}$"
          f"   (قانون ۶: {l6.pnl:+,.0f}$ · استخر: {lp.pnl:+,.0f}$)")

    both = sum(1 for r in rows if r["r6"] and r["p"])
    conf = sum(1 for r in rows if r["r6"] and r["p"] and r["r6"] != r["p"])
    only = sum(1 for r in rows if r["r6"] and not r["p"])
    print(f"\n  قانون ۶ روی {both+only:,} پنجره فعال شد: {both:,} همراهِ استخر "
          f"({conf} تضاد)، {only:,} تنها.")

    # اثر روی دُم
    day_p = defaultdict(float); day_b = defaultdict(float)
    lp2, lb2 = Lad(20), Lad(20)
    for r in rows:
        d = datetime.fromtimestamp(r["t"], TEH).strftime("%Y-%m-%d")
        if r["p"]:
            day_p[d] += lp2.bet(r["p"] == r["o"])
        s = r["p"] or r["r6"]
        if s:
            day_b[d] += lb2.bet(s == r["o"])
    print(f"\n  بدترین روز — بدونِ قانون ۶: {min(day_p.values()):+,.0f}$  ·  "
          f"با آن: {min(day_b.values()):+,.0f}$")


if __name__ == "__main__":
    main()
