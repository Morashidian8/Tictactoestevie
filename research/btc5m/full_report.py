"""
One year, signal by signal, in order: what the combined stream actually did.

The combined stream is what has been traded in practice — golden entry plus the
statistical rules, one bet per window, taken whenever any of them fires. This
walks it chronologically from the first signal, applies a three-rung martingale
at two base sizes, and then cuts the record every way that could matter: by
hour, by weekday, by month, by losing run, by drawdown, by bankroll survival.

Nothing here is fitted. Every rule and threshold was fixed before this ran; the
only thing being measured is what those fixed rules produced.

Run:  python3 research/btc5m/full_report.py
"""
import gzip, csv, sys, math, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta

sys.path.insert(0, '.')
from strategies import evaluate

ET = timezone(timedelta(hours=-4))
DAYS = 365
WEEKDAYS = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه",
            "جمعه", "شنبه", "یکشنبه"]      # Monday-first, as datetime numbers them


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return [int(r['t']) for r in rows], [float(r['c']) for r in rows]


def build(t, c, streams=("golden", "statistical")):
    """Every bet, oldest first: (time, side, won)."""
    cut = t[-1] - DAYS * 86400
    out = []
    for i in range(140, len(c) - 1):
        if t[i] < cut:
            continue
        o = "up" if c[i + 1] > c[i] else ("down" if c[i + 1] < c[i] else None)
        if o is None:
            continue
        for s in evaluate(c[i - 135:i + 1], streams=streams):
            out.append((t[i], s.side, s.side == o, s.stream, s.rule))
    return out


class Ladder:
    """Three rungs: base, 2x, 4x. A win ends the cycle; three losses is a bust."""

    def __init__(self, base, rungs=3):
        self.base, self.rungs = base, rungs
        self.rung = self.busts = self.cycles = 0
        self.pnl = self.peak = self.dd = 0.0
        self.equity = []            # running P&L after every bet
        self.bust_at = []           # timestamps of busts, to find clusters
        self.worst_cycle = 0.0
        self._cycle = 0.0

    def bet(self, ts, won):
        stake = self.base * 2 ** self.rung
        if won:
            self.pnl += stake
            self._cycle += stake
            self.rung = 0
            self.cycles += 1
            self._cycle = 0.0
        else:
            self.pnl -= stake
            self._cycle -= stake
            self.rung += 1
            if self.rung >= self.rungs:
                self.busts += 1
                self.cycles += 1
                self.rung = 0
                self.worst_cycle = min(self.worst_cycle, self._cycle)
                self.bust_at.append(ts)
                self._cycle = 0.0
        self.peak = max(self.peak, self.pnl)
        self.dd = max(self.dd, self.peak - self.pnl)
        self.equity.append(self.pnl)
        return stake if won else -stake


def runs(bets):
    """Length -> how many losing runs of that length."""
    out, k = Counter(), 0
    for _, _, won, *_ in bets:
        if won:
            if k:
                out[k] += 1
            k = 0
        else:
            k += 1
    if k:
        out[k] += 1
    return out


def head(title):
    print(f"\n{'='*66}\n{title}\n{'='*66}")


def main():
    t, c = load()
    bets = build(t, c)
    n = len(bets)
    w = sum(1 for b in bets if b[2])
    span = (bets[-1][0] - bets[0][0]) / 86400
    first = datetime.fromtimestamp(bets[0][0], ET)
    last = datetime.fromtimestamp(bets[-1][0], ET)

    head("۱. کلیات — جریانِ ترکیبی (طلایی + آماری)")
    print(f"از      : {first:%Y-%m-%d %H:%M} ET")
    print(f"تا      : {last:%Y-%m-%d %H:%M} ET")
    print(f"بازه    : {span:.0f} روز")
    print(f"سیگنال  : {n:,}  ({n/span:.1f} در روز، {n/span/24:.1f} در ساعت)")
    print(f"برد     : {w:,}/{n:,} = {w/n*100:.2f}%")
    se = math.sqrt(w / n * (1 - w / n) / n) * 100
    print(f"بازهٔ اطمینان ۹۵٪: {w/n*100 - 1.96*se:.2f}% تا {w/n*100 + 1.96*se:.2f}%")
    z = (w / n - 0.5) / (0.5 / math.sqrt(n))
    print(f"z در برابرِ سکه  : {z:+.2f}")

    # ---- martingale at both bases
    head("۲. مارتینگلِ ۳ پله — پایهٔ ۲۰ و ۵۰ دلار")
    lads = {}
    print(f"{'':22} {'پایه ۲۰$':>16} {'پایه ۵۰$':>16}")
    for base in (20, 50):
        L = Ladder(base)
        for ts, side, won, *_ in bets:
            L.bet(ts, won)
        lads[base] = L
    rows = [
        ("سود/زیانِ کل", lambda L: f"{L.pnl:+,.0f}$"),
        ("سود در سال", lambda L: f"{L.pnl*365/span:+,.0f}$"),
        ("سود در ماه", lambda L: f"{L.pnl*30/span:+,.0f}$"),
        ("چرخه‌ها", lambda L: f"{L.cycles:,}"),
        ("انفجارها", lambda L: f"{L.busts:,}"),
        ("نرخِ انفجار", lambda L: f"{L.busts/L.cycles*100:.1f}%"),
        ("انفجار در هفته", lambda L: f"{L.busts/span*7:.1f}"),
        ("هزینهٔ هر انفجار", lambda L: f"{L.base*7:,.0f}$"),
        ("بدترین چرخه", lambda L: f"{L.worst_cycle:+,.0f}$"),
        ("بدترین افت", lambda L: f"{L.dd:,.0f}$"),
        ("کفِ مسیر", lambda L: f"{min(L.equity):+,.0f}$"),
        ("نسبتِ سود به افت", lambda L: f"{L.pnl/L.dd:.1f}"),
    ]
    for label, fn in rows:
        print(f"  {label:20} {fn(lads[20]):>16} {fn(lads[50]):>16}")

    # ---- consecutive busts
    head("۳. انفجارهای پشتِ سرِ هم")
    L = lads[20]
    seq, cur = [], 0
    rung = 0
    streak = 0
    consec = Counter()
    for _, _, won, *_ in bets:
        if won:
            if streak >= 3:
                consec[streak // 3] += 1
            streak = 0
        else:
            streak += 1
    if streak >= 3:
        consec[streak // 3] += 1
    tot_b = sum(k * v for k, v in consec.items())
    print(f"  {'انفجارِ پیاپی':>16} {'دفعات':>8} {'ضرر با پایهٔ ۲۰':>18} {'با پایهٔ ۵۰':>14}")
    for k in sorted(consec):
        print(f"  {k:>16} {consec[k]:>8} {-140*k:>17,}$ {-350*k:>13,}$")
    print(f"\n  مجموعِ انفجارها: {tot_b}  ·  در {span:.0f} روز  ·  "
          f"{tot_b/span*7:.1f} در هفته")

    # ---- losing runs
    head("۴. رشته‌های باخت")
    r = runs(bets)
    total_runs = sum(r.values())
    print(f"  {'طول':>6} {'تعداد':>8} {'٪ رشته‌ها':>11}   نمودار")
    for k in sorted(r):
        if k > 12:
            continue
        print(f"  {k:>6} {r[k]:>8} {r[k]/total_runs*100:>10.1f}%   "
              + "█" * min(40, round(r[k] / max(r.values()) * 40)))
    long = {k: v for k, v in r.items() if k > 12}
    if long:
        print(f"  بلندتر از ۱۲: {sum(long.values())} بار (بلندترین {max(r)})")
    print(f"\n  بلندترین رشتهٔ باخت در کلِ سال: {max(r)}")
    print(f"  رشته‌های ۵+ : {sum(v for k,v in r.items() if k>=5)} بار "
          f"({sum(v for k,v in r.items() if k>=5)/span*7:.1f} در هفته)")

    # ---- by hour
    head("۵. به تفکیکِ ساعتِ ET — تعداد و دقت")
    by_h = defaultdict(lambda: [0, 0])
    for ts, _, won, *_ in bets:
        h = datetime.fromtimestamp(ts, ET).hour
        by_h[h][0] += 1
        by_h[h][1] += won
    best = max(by_h.items(), key=lambda kv: kv[1][1] / kv[1][0])
    worst = min(by_h.items(), key=lambda kv: kv[1][1] / kv[1][0])
    busy = max(by_h.items(), key=lambda kv: kv[1][0])
    quiet = min(by_h.items(), key=lambda kv: kv[1][0])
    print(f"  {'ساعت':>6} {'سیگنال':>8} {'در روز':>8} {'دقت':>8}   نمودارِ تعداد")
    mx = max(v[0] for v in by_h.values())
    for h in sorted(by_h):
        cnt, wins = by_h[h]
        print(f"  {h:>4}:00 {cnt:>8} {cnt/span:>8.1f} {wins/cnt*100:>7.1f}%   "
              + "█" * round(cnt / mx * 28))
    print(f"\n  شلوغ‌ترین : ساعتِ {busy[0]}:00 با {busy[1][0]/span:.1f} سیگنال در روز")
    print(f"  خلوت‌ترین : ساعتِ {quiet[0]}:00 با {quiet[1][0]/span:.1f} سیگنال در روز")
    print(f"  بهترین دقت: ساعتِ {best[0]}:00 = {best[1][1]/best[1][0]*100:.1f}% "
          f"(n={best[1][0]})")
    print(f"  بدترین دقت: ساعتِ {worst[0]}:00 = {worst[1][1]/worst[1][0]*100:.1f}% "
          f"(n={worst[1][0]})")

    # ---- by weekday
    head("۶. به تفکیکِ روزِ هفته")
    by_d = defaultdict(lambda: [0, 0, 0.0])
    L2 = Ladder(20)
    for ts, side, won, *_ in bets:
        d = datetime.fromtimestamp(ts, ET).weekday()
        delta = L2.bet(ts, won)
        by_d[d][0] += 1
        by_d[d][1] += won
        by_d[d][2] += delta
    print(f"  {'روز':>10} {'سیگنال':>8} {'دقت':>8} {'سود با پایهٔ ۲۰':>17}")
    for d in sorted(by_d):
        cnt, wins, pnl = by_d[d]
        print(f"  {WEEKDAYS[d]:>10} {cnt:>8} {wins/cnt*100:>7.1f}% {pnl:>16,.0f}$")

    # ---- by month
    head("۷. ماه به ماه (پایهٔ ۲۰)")
    by_m = defaultdict(lambda: [0, 0, 0.0])
    L3 = Ladder(20)
    for ts, side, won, *_ in bets:
        key = datetime.fromtimestamp(ts, ET).strftime("%Y-%m")
        delta = L3.bet(ts, won)
        by_m[key][0] += 1
        by_m[key][1] += won
        by_m[key][2] += delta
    print(f"  {'ماه':>9} {'سیگنال':>8} {'دقت':>8} {'سود':>12}   ")
    for k in sorted(by_m):
        cnt, wins, pnl = by_m[k]
        flag = "✅" if pnl > 0 else "❌"
        print(f"  {k:>9} {cnt:>8} {wins/cnt*100:>7.1f}% {pnl:>11,.0f}$  {flag}")
    losing = sum(1 for v in by_m.values() if v[2] <= 0)
    print(f"\n  ماه‌های زیان‌ده: {losing} از {len(by_m)}")

    # ---- bankroll survival
    head("۸. آیا سرمایه دوام می‌آورد؟")
    for bank in (1000, 1800, 3000, 5000):
        for base in (20, 50):
            L = Ladder(base)
            ruined = None
            for i, (ts, side, won, *_) in enumerate(bets):
                L.bet(ts, won)
                if bank + L.pnl <= 0:
                    ruined = (i, ts)
                    break
            if ruined:
                d = datetime.fromtimestamp(ruined[1], ET)
                print(f"  سرمایهٔ {bank:>5,}$ با پایهٔ {base:>2}$ → "
                      f"☠️ صفر شد در {d:%Y-%m-%d}، بعد از {ruined[0]:,} شرط")
            else:
                print(f"  سرمایهٔ {bank:>5,}$ با پایهٔ {base:>2}$ → ✅ دوام آورد "
                      f"(بدترین کسری {L.dd:,.0f}$ = {L.dd/bank*100:.0f}٪ سرمایه)")

    # ---- stream split
    head("۹. سهمِ هر جریان")
    by_s = defaultdict(lambda: [0, 0])
    for ts, side, won, stream, rule in bets:
        by_s[stream][0] += 1
        by_s[stream][1] += won
    for s in sorted(by_s):
        cnt, wins = by_s[s]
        print(f"  {s:>14}: {cnt:>6,} سیگنال ({cnt/n*100:>4.1f}%)  "
              f"دقت {wins/cnt*100:.2f}%")

    # ---- direction
    head("۱۰. جهت")
    by_side = defaultdict(lambda: [0, 0])
    for ts, side, won, *_ in bets:
        by_side[side][0] += 1
        by_side[side][1] += won
    for s in sorted(by_side):
        cnt, wins = by_side[s]
        lab = "🟢 بالا" if s == "up" else "🔴 پایین"
        print(f"  {lab}: {cnt:>6,} ({cnt/n*100:.1f}%)  دقت {wins/cnt*100:.2f}%")

    # ---- best and worst days
    head("۱۱. بهترین و بدترین روزها (پایهٔ ۲۰)")
    by_day = defaultdict(float)
    cnt_day = Counter()
    L4 = Ladder(20)
    for ts, side, won, *_ in bets:
        key = datetime.fromtimestamp(ts, ET).strftime("%Y-%m-%d")
        by_day[key] += L4.bet(ts, won)
        cnt_day[key] += 1
    days_sorted = sorted(by_day.items(), key=lambda kv: kv[1])
    print("  بدترین ۵ روز:")
    for k, v in days_sorted[:5]:
        print(f"    {k}  {v:>+8,.0f}$  ({cnt_day[k]} سیگنال)")
    print("  بهترین ۵ روز:")
    for k, v in days_sorted[-5:][::-1]:
        print(f"    {k}  {v:>+8,.0f}$  ({cnt_day[k]} سیگنال)")
    pos = sum(1 for v in by_day.values() if v > 0)
    print(f"\n  روزهای سودده: {pos}/{len(by_day)} = {pos/len(by_day)*100:.0f}%")
    print(f"  میانگینِ روزانه: {st.mean(by_day.values()):+,.0f}$  ·  "
          f"میانه: {st.median(by_day.values()):+,.0f}$")


if __name__ == "__main__":
    main()
