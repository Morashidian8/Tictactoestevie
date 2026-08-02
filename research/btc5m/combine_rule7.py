"""
What happens if the Bollinger/RSI rule is taken alongside everything else?

Rule 7 overlaps the existing rules on 85% of its signals, so "add it to the
pool" and "run it as a second book" are different questions with different
answers. Both are measured here, against the same year, plus the confluence
variant where only agreement counts.

Run:  python3 research/btc5m/combine_rule7.py
"""
import gzip, csv, math, sys, statistics as st
sys.path.insert(0, '.')
from strategies import rule1, rule2, rule3, rule5, golden

DAYS = 365


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return [int(r['t']) for r in rows], [float(r['c']) for r in rows]


def rsi_series(c, n=7):
    out = [None] * len(c)
    ag = al = 0.0
    for i in range(1, len(c)):
        d = c[i] - c[i - 1]
        g, l = max(d, 0.0), max(-d, 0.0)
        if i <= n:
            ag += g; al += l
            if i == n:
                ag, al = ag / n, al / n
                out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
        else:
            ag = (ag * (n - 1) + g) / n
            al = (al * (n - 1) + l) / n
            out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
    return out


def rule7(c, i, r7):
    """Close outside the 20/2 Bollinger band with RSI(7) at an extreme -> fade."""
    w = c[i - 19:i + 1]
    m = sum(w) / 20
    sd = st.pstdev(w)
    if sd <= 0 or r7[i] is None:
        return None
    if c[i] > m + 2 * sd and r7[i] >= 80:
        return "down"
    if c[i] < m - 2 * sd and r7[i] <= 20:
        return "up"
    return None


def statistical(cl):
    sides = {r["side"] for r in (rule1(cl), rule2(cl), rule3(cl), rule5(cl)) if r}
    return sides.pop() if len(sides) == 1 else None


class Ladder:
    def __init__(self, base, rungs=3):
        self.base, self.rungs, self.rung = base, rungs, 0
        self.pnl = self.peak = self.dd = 0.0
        self.busts = 0

    def bet(self, won):
        s = self.base * 2 ** self.rung
        if won:
            self.pnl += s; self.rung = 0
        else:
            self.pnl -= s; self.rung += 1
            if self.rung >= self.rungs:
                self.busts += 1; self.rung = 0
        self.peak = max(self.peak, self.pnl)
        self.dd = max(self.dd, self.peak - self.pnl)
        return s if won else -s


def flat(bets, stake):
    pnl = peak = dd = 0.0
    for w in bets:
        pnl += stake if w else -stake
        peak = max(peak, pnl); dd = max(dd, peak - pnl)
    return pnl, dd


def main():
    t, c = load()
    r7 = rsi_series(c)
    cut = t[-1] - DAYS * 86400
    rows = []
    for i in range(140, len(c) - 1):
        if t[i] < cut:
            continue
        o = "up" if c[i + 1] > c[i] else ("down" if c[i + 1] < c[i] else None)
        if o is None:
            continue
        cl = c[i - 135:i + 1]
        rows.append({"t": t[i], "o": o, "g": (golden(cl) or {}).get("side"),
                     "s": statistical(cl), "r7": rule7(c, i, r7)})

    def show(name, bets):
        if not bets:
            print(f"  {name:34} —"); return
        n = len(bets); w = sum(bets)
        line = f"  {name:34} {n:>6,} ({n/DAYS:>5.1f}/روز) {w/n*100:>6.2f}%"
        for base in (20, 50):
            L = Ladder(base)
            for x in bets: L.bet(x)
            line += f" {L.pnl:>+9,.0f}$/{L.dd:>6,.0f}$"
        p, d = flat(bets, 20)
        line += f" {p:>+8,.0f}$/{d:>5,.0f}$"
        print(line)

    print(f"دورهٔ {DAYS} روزه · مارتینگلِ ۳ پله · «سود/بدترین‌افت»\n")
    print(f"  {'ترکیب':34} {'شرط':>6} {'':>13} {'دقت':>6} "
          f"{'مارتینگل ۲۰$':>19} {'مارتینگل ۵۰$':>19} {'ثابت ۲۰$':>15}")

    # A) امروز: طلایی + آماری، یک شرط در هر پنجره
    A = [(r["g"] or r["s"]) == r["o"] for r in rows if (r["g"] or r["s"])]
    show("A) امروز (طلایی + آماری)", A)

    # B) قانون ۷ به همان استخر اضافه شود، با اولویت بالاتر از آماری
    B = [(r["g"] or r["r7"] or r["s"]) == r["o"]
         for r in rows if (r["g"] or r["r7"] or r["s"])]
    show("B) + قانون ۷ در همان استخر", B)

    # C) قانون ۷ بالاترین اولویت
    C = [(r["r7"] or r["g"] or r["s"]) == r["o"]
         for r in rows if (r["r7"] or r["g"] or r["s"])]
    show("C) قانون ۷ با بالاترین اولویت", C)

    # D) فقط قانون ۷، دفترِ جدا
    D = [r["r7"] == r["o"] for r in rows if r["r7"]]
    show("D) فقط قانون ۷", D)

    # E) هم‌رأیی: قانون ۷ و استخر هر دو و هم‌جهت
    E = [r["r7"] == r["o"] for r in rows
         if r["r7"] and (r["g"] or r["s"]) == r["r7"]]
    show("E) هم‌رأیی قانون ۷ با استخر", E)

    # F) استخر منهای پنجره‌هایی که قانون ۷ مخالف است
    F = [(r["g"] or r["s"]) == r["o"] for r in rows
         if (r["g"] or r["s"]) and not (r["r7"] and r["r7"] != (r["g"] or r["s"]))]
    show("F) استخر، منهای تضاد با ۷", F)

    # دو دفترِ جدا: قانون ۷ پنجره‌های خودش را می‌گیرد، استخر بقیه را
    print()
    sep7 = [r["r7"] == r["o"] for r in rows if r["r7"]]
    seppool = [(r["g"] or r["s"]) == r["o"] for r in rows
               if not r["r7"] and (r["g"] or r["s"])]
    for base in (20, 50):
        L7, LP = Ladder(base), Ladder(base)
        peak = dd = 0.0
        i7 = ip = 0
        merged = []
        for r in rows:
            if r["r7"]:
                merged.append(("7", r["r7"] == r["o"]))
            elif (r["g"] or r["s"]):
                merged.append(("p", (r["g"] or r["s"]) == r["o"]))
        for who, won in merged:
            (L7 if who == "7" else LP).bet(won)
            tot = L7.pnl + LP.pnl
            peak = max(peak, tot); dd = max(dd, peak - tot)
        print(f"  G) دو دفترِ جدا، پایهٔ {base:>2}$: سود {L7.pnl+LP.pnl:>+9,.0f}$  "
              f"بدترین افتِ مجموع {dd:>6,.0f}$  "
              f"(قانون ۷: {L7.pnl:+,.0f}$ · استخر: {LP.pnl:+,.0f}$)")

    # تضادها
    conflict = sum(1 for r in rows if r["r7"] and (r["g"] or r["s"])
                   and r["r7"] != (r["g"] or r["s"]))
    both = sum(1 for r in rows if r["r7"] and (r["g"] or r["s"]))
    only7 = sum(1 for r in rows if r["r7"] and not (r["g"] or r["s"]))
    print(f"\n  قانون ۷ روی {both + only7:,} پنجره فعال شد: "
          f"{both:,} همراهِ استخر ({conflict:,} تای آن در جهتِ مخالف)، "
          f"{only7:,} تنها.")


if __name__ == "__main__":
    main()
