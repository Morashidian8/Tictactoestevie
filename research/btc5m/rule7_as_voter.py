"""
Rule 7 inside the vote, not beside it.

Yesterday's run gave rule 7 its own priority tier: it only spoke on windows the
pool ignored. The question here is different — make it a fifth member of the
group that has to agree, so it can also VETO by disagreeing, and let it count
towards the golden-entry threshold.

Baseline is the workbook's headline: golden + statistical, base $20, 3 rungs,
+$56,060 over the year.

Run:  python3 research/btc5m/rule7_as_voter.py
"""
import gzip, csv, sys, statistics as st
sys.path.insert(0, '.')
from strategies import rule1, rule2, rule3, rule5, GOLDEN_MULT, GOLDEN_RULES

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


def r7_side(c, i, r7):
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
        fired = {}
        for num, fn in ((1, rule1), (2, rule2), (3, rule3), (5, rule5)):
            s = fn(cl)
            if s:
                fired[num] = s["side"]
        s7 = r7_side(c, i, r7)
        if s7:
            fired[7] = s7
        stretch9 = bool(rule5(cl, mult=GOLDEN_MULT))
        rows.append({"o": o, "fired": fired, "stretch9": stretch9})

    def side_of(f, members):
        sides = {v for k, v in f.items() if k in members}
        return sides.pop() if len(sides) == 1 else None

    def golden_of(f, members):
        voters = [k for k in f if k in members]
        return side_of(f, members) if len(voters) >= GOLDEN_RULES else None

    def show(name, bets):
        n = len(bets)
        if not n:
            print(f"  {name:38} —"); return
        w = sum(bets)
        out = f"  {name:38} {n:>6,} ({n/DAYS:>4.1f}) {w/n*100:>6.2f}%"
        for base in (20, 50):
            L = Ladder(base)
            for x in bets: L.bet(x)
            out += f" {L.pnl:>+9,.0f}$/{L.dd:>6,.0f}$"
        print(out)

    OLD, NEW = {1, 2, 3, 5}, {1, 2, 3, 5, 7}
    print(f"سالِ {DAYS} روزه · مارتینگلِ ۳ پله · «سود/بدترین‌افت»\n")
    print(f"  {'آرایش':38} {'شرط':>6} {'/روز':>6} {'دقت':>6} "
          f"{'پایهٔ ۲۰$':>18} {'پایهٔ ۵۰$':>18}")

    # 1) اکسل: طلایی(۱۲۳۵) + آماری(۱۲۳۵)
    base_bets = []
    for r in rows:
        s = golden_of(r["fired"], OLD) if r["stretch9"] else None
        s = s or side_of(r["fired"], OLD)
        if s:
            base_bets.append(s == r["o"])
    show("۱) اکسلِ فعلی (بدونِ قانون ۷)", base_bets)

    # 2) قانون ۷ رأی‌دهندهٔ پنجم — می‌تواند وتو کند
    v = []
    for r in rows:
        s = side_of(r["fired"], NEW)
        if s:
            v.append(s == r["o"])
    show("۲) قانون ۷ رأی‌دهندهٔ پنجم (با حقِ وتو)", v)

    # 3) همان، و طلایی هم پنج‌نفره می‌شود
    v = []
    for r in rows:
        s = golden_of(r["fired"], NEW) if r["stretch9"] else None
        s = s or side_of(r["fired"], NEW)
        if s:
            v.append(s == r["o"])
    show("۳) + طلایی هم پنج‌نفره", v)

    # 4) قانون ۷ فقط تأییدکننده: بدونِ آن شرط نبند
    v = [side_of(r["fired"], OLD) == r["o"] for r in rows
         if side_of(r["fired"], OLD) and 7 in r["fired"]
         and r["fired"][7] == side_of(r["fired"], OLD)]
    show("۴) فقط وقتی قانون ۷ هم تأیید کند", v)

    # 5) دستِ‌کم دو قانون هم‌نظر (با ۷ در جمع)
    for k in (2, 3):
        v = []
        for r in rows:
            voters = [x for x in r["fired"] if x in NEW]
            s = side_of(r["fired"], NEW)
            if s and len(voters) >= k:
                v.append(s == r["o"])
        show(f"۵) دستِ‌کم {k} قانونِ هم‌نظر از ۵ تا", v)

    # وتوها
    veto = sum(1 for r in rows
               if side_of(r["fired"], OLD) and 7 in r["fired"]
               and r["fired"][7] != side_of(r["fired"], OLD))
    solo = sum(1 for r in rows if 7 in r["fired"]
               and not any(k in r["fired"] for k in OLD))
    print(f"\n  قانون ۷ در {solo:,} پنجره تنها بود و در {veto:,} پنجره وتو کرد.")


if __name__ == "__main__":
    main()
