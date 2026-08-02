"""
The user's AABA pattern, played as a three-rung ladder.

The rule, as specified:
  * AABA completes — moves A, A, B, A — at candle 4.
  * Rung 1 ($20) bets candle 5 goes the way candle 4 went.
  * On a loss, rung 2 ($40) bets candle 6 goes the way candle 5 just went —
    the direction FLIPS to follow whichever candle beat us.
  * On another loss, rung 3 ($80) does the same for candle 7.
  * Three losses ends the cycle at -$140; any win ends it at +$20.
  * One position at a time: AABA patterns completing mid-cycle are ignored.

Run:  python3 research/btc5m/aaba_ladder.py
"""
import csv, gzip, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta

TEH = timezone(timedelta(hours=3, minutes=30))
BASE, RUNGS, DAYS = 20, 3, 365


def load():
    rows = list(csv.DictReader(gzip.open('research/btc5m/btc5m.csv.gz', 'rt')))
    return [int(r['t']) for r in rows], [float(r['c']) for r in rows]


def is_aaba(c, i):
    """Moves ending at candle i form A A B A. Returns the direction of A."""
    m = [c[i - 3] - c[i - 4], c[i - 2] - c[i - 3],
         c[i - 1] - c[i - 2], c[i] - c[i - 1]]
    if any(x == 0 for x in m):
        return None
    a = m[0] > 0
    if (m[1] > 0) == a and (m[2] > 0) != a and (m[3] > 0) == a:
        return "up" if a else "down"
    return None


def main():
    t, c = load()
    cut = t[-1] - DAYS * 86400
    lad = [BASE * 2 ** k for k in range(RUNGS)]

    cycles = []          # (start_ts, rungs_used, won, pnl)
    rung_stats = [[0, 0] for _ in range(RUNGS)]   # [n, wins] per rung
    i = 5
    while i < len(c) - RUNGS - 1:
        if t[i] < cut or is_aaba(c, i) is None:
            i += 1
            continue
        start = t[i]
        pnl = 0.0
        won_at = None
        k = i                     # k is the candle whose direction we follow
        for r in range(RUNGS):
            nxt = k + 1
            if nxt >= len(c):
                break
            if c[nxt] == c[k]:    # a flat candle decides nothing; treat as loss
                pass
            side_up = c[k] > c[k - 1]
            hit = (c[nxt] > c[k]) if side_up else (c[nxt] < c[k])
            rung_stats[r][0] += 1
            rung_stats[r][1] += hit
            if hit:
                pnl += lad[r]
                won_at = r + 1
                k = nxt
                break
            pnl -= lad[r]
            k = nxt
        cycles.append((start, won_at, pnl))
        i = k + 1                 # one position at a time

    n = len(cycles)
    wins = sum(1 for x in cycles if x[1])
    busts = n - wins
    total = sum(x[2] for x in cycles)
    print(f"الگوی AABA + نردبانِ ۳ پله (۲۰/۴۰/۸۰) — {DAYS} روزِ گذشته\n")
    print(f"  چرخه‌ها      : {n:,}  ({n/DAYS:.1f} در روز)")
    print(f"  برنده       : {wins:,} ({wins/n*100:.1f}%)")
    print(f"  منفجر       : {busts:,} ({busts/n*100:.1f}%)")
    print(f"  سود/زیانِ کل : {total:+,.0f}$")
    print(f"  در ماه      : {total/DAYS*30:+,.0f}$")
    print()
    for r in range(RUNGS):
        nn, ww = rung_stats[r]
        print(f"  پلهٔ {r+1} ({lad[r]:>2}$): {ww:>5,}/{nn:>5,} = {ww/nn*100:.2f}%  "
              f"{'← شرط روی جهتِ کندلِ آخر' if r==0 else '← جهت برگشته'}")
    print(f"\n  برد در پلهٔ ۱: {sum(1 for x in cycles if x[1]==1):,}  ·  "
          f"پلهٔ ۲: {sum(1 for x in cycles if x[1]==2):,}  ·  "
          f"پلهٔ ۳: {sum(1 for x in cycles if x[1]==3):,}")

    # مسیرِ حساب
    pnl = peak = dd = low = 0.0
    for _, _, p in cycles:
        pnl += p
        peak = max(peak, pnl); dd = max(dd, peak - pnl); low = min(low, pnl)
    print(f"\n  بدترین افت   : {dd:,.0f}$")
    print(f"  کف مسیر      : {low:+,.0f}$")
    print(f"  با ۲٬۰۰۰$    : کمترین موجودی {2000+low:,.0f}$  "
          f"{'✅ زنده' if 2000+low>0 else '☠️ صفر'}")

    # روزانه
    day = defaultdict(float)
    for ts, _, p in cycles:
        day[datetime.fromtimestamp(ts, TEH).strftime("%Y-%m-%d")] += p
    vals = sorted(day.values())
    pos = sum(1 for v in day.values() if v > 0)
    print(f"\n  روزهای سودده : {pos}/{len(day)} ({pos/len(day)*100:.0f}%)")
    print(f"  بدترین روز   : {vals[0]:+,.0f}$   ·   بهترین روز: {vals[-1]:+,.0f}$")
    print(f"  میانگین روزانه: {st.mean(day.values()):+,.1f}$")

    # مقایسه: بدونِ نردبان
    flat_n = rung_stats[0][0]
    flat_w = rung_stats[0][1]
    print(f"\n  برای مقایسه — همان AABA بدونِ نردبان، هر شرط ۲۰$:")
    print(f"    {flat_w:,}/{flat_n:,} = {flat_w/flat_n*100:.2f}%  →  "
          f"{(2*flat_w-flat_n)*BASE:+,.0f}$")


if __name__ == "__main__":
    main()
