"""
The تناوب app's window picker, traded forward for a month.

The strategy, as specified:
  * 5-minute candles, 2-hour non-overlapping windows, Tehran clock (12 a day).
  * A month ago, rank the 12 slots by their all-time MAXIMUM alternation and
    take the two lowest ("کمترین بیشینه"). Never re-rank afterwards — the whole
    point is to see whether a slot that looked safe then stayed safe.
  * Inside those two windows, every candle: bet the same direction as the
    candle that just closed. A loss is exactly an alternation.
  * Martingale 7 rungs: 10, 20, 40, 80, 160, 320, 640. Seven straight losses
    empties the account ($1,270) and a fresh one starts.

"Alternation" follows the app: the longest uninterrupted run of colour changes,
counted in changes, and a run that is still going at the window's edge is
followed to its true end and credited in full to the window it started in.

Run:  ALT_PKL=... python3 research/btc5m/alternation_backtest.py
"""
import os, pickle, statistics as st
from collections import defaultdict
from datetime import datetime, timezone, timedelta

TEH = timezone(timedelta(hours=3, minutes=30))
WIN_MIN = 120                      # window length
SLOTS = 24 * 60 // WIN_MIN         # 12 per day
LADDER = [10 * 2 ** k for k in range(7)]
ACCOUNT = sum(LADDER)              # 1,270
TEST_DAYS = 30
PKL = os.environ.get("ALT_PKL", "/tmp/two_years.pkl")


def colours(kl):
    """Colour of each candle: True = up. Index i aligns with kl[i]."""
    out = [None]
    for a, b in zip(kl, kl[1:]):
        out.append(b[1] > a[1] if b[1] != a[1] else None)
    return out


def runs_from(col, i):
    """Length of the alternation run starting at candle i, in colour changes."""
    n = 0
    j = i
    while j + 1 < len(col):
        if col[j] is None or col[j + 1] is None or col[j + 1] == col[j]:
            break
        n += 1
        j += 1
    return n


def slot_of(ts):
    d = datetime.fromtimestamp(ts, TEH)
    return (d.hour * 60 + d.minute) // WIN_MIN


def main():
    kl = pickle.load(open(PKL, "rb"))
    col = colours(kl)
    end = kl[-1][0]
    split = end - TEST_DAYS * 86400

    # --- 1. rank slots on everything BEFORE the test month --------------------
    hist_max = defaultdict(int)
    hist_runs = defaultdict(list)
    for i, (ts, _) in enumerate(kl):
        if ts >= split or col[i] is None:
            continue
        # only count a run where it STARTS
        if i > 0 and col[i - 1] is not None and col[i] != col[i - 1]:
            continue                      # mid-run, already counted
        r = runs_from(i, 0) if False else runs_from(col, i)
        if r:
            s = slot_of(ts)
            hist_max[s] = max(hist_max[s], r)
            hist_runs[s].append(r)

    def label(s):
        a = s * WIN_MIN
        return f"{a//60:02d}:{a%60:02d}–{(a+WIN_MIN)//60%24:02d}:{(a+WIN_MIN)%60:02d}"

    ranked = sorted(range(SLOTS), key=lambda s: (hist_max[s], st.mean(hist_runs[s])))
    print(f"رتبه‌بندی بر اساس دادهٔ قبل از "
          f"{datetime.fromtimestamp(split, TEH):%Y-%m-%d} (تهران)\n")
    print(f"  {'بازه':>14} {'بیشینهٔ تاریخی':>15} {'میانگین':>9} {'تعداد رخداد':>12}")
    for s in ranked:
        star = "  ⭐" if s in ranked[:2] else ""
        print(f"  {label(s):>14} {hist_max[s]:>15} {st.mean(hist_runs[s]):>9.2f} "
              f"{len(hist_runs[s]):>12,}{star}")
    chosen = set(ranked[:2])
    print(f"\n  انتخاب‌شده: {'  و  '.join(label(s) for s in sorted(chosen))}")

    # --- 2. trade the month ---------------------------------------------------
    rung = 0
    accounts = 1
    pnl = 0.0
    wins = busts = bets = 0
    day = defaultdict(lambda: {"bets": 0, "w": 0, "busts": 0, "pnl": 0.0})
    bust_log = []
    live_max = defaultdict(int)
    for i, (ts, _) in enumerate(kl):
        if ts < split or col[i] is None or col[i - 1] is None:
            continue
        if slot_of(ts) not in chosen:
            continue
        d = datetime.fromtimestamp(ts, TEH)
        key = d.strftime("%Y-%m-%d")
        stake = LADDER[rung]
        won = col[i] == col[i - 1]          # same colour as the last candle
        bets += 1
        day[key]["bets"] += 1
        if won:
            pnl += stake; day[key]["pnl"] += stake
            wins += 1; day[key]["w"] += 1
            rung = 0
        else:
            pnl -= stake; day[key]["pnl"] -= stake
            rung += 1
            if rung >= len(LADDER):
                busts += 1; day[key]["busts"] += 1
                accounts += 1
                rung = 0
                bust_log.append(d)
        # track how bad the alternation actually got in the traded windows
        if not won:
            live_max[slot_of(ts)] = max(live_max[slot_of(ts)], 1)

    # true live max per chosen slot
    for s in chosen:
        m = 0
        for i, (ts, _) in enumerate(kl):
            if ts < split or slot_of(ts) != s or col[i] is None:
                continue
            if i > 0 and col[i - 1] is not None and col[i] != col[i - 1]:
                continue
            m = max(m, runs_from(col, i))
        live_max[s] = m

    print(f"\n\nمعامله از {datetime.fromtimestamp(split, TEH):%Y-%m-%d} "
          f"تا {datetime.fromtimestamp(end, TEH):%Y-%m-%d} (تهران)\n")
    print(f"  {'روز':>11} {'شرط':>5} {'برد':>5} {'باخت':>6} {'انفجار':>8} {'سود روز':>10}")
    bal = 0.0
    for k in sorted(day):
        r = day[k]; bal += r["pnl"]
        flag = " 💥" if r["busts"] else ""
        print(f"  {k:>11} {r['bets']:>5} {r['w']:>5} {r['bets']-r['w']:>6} "
              f"{r['busts']:>8}{flag} {r['pnl']:>+9,.0f}$")
    print(f"\n  شرط‌ها: {bets:,}  ·  برد: {wins:,} ({wins/bets*100:.1f}%)  ·  "
          f"انفجار: {busts}")
    print(f"  سود/زیانِ خالص: {pnl:+,.0f}$")
    print(f"  حساب‌های سوخته: {busts}  ×  {ACCOUNT:,}$ = {busts*ACCOUNT:,}$")
    print(f"  کلِ سرمایه‌ای که لازم شد: {accounts:,} × {ACCOUNT:,}$ = "
          f"{accounts*ACCOUNT:,}$")
    print(f"  موجودیِ پایان: {accounts*ACCOUNT + pnl:,.0f}$ از {accounts*ACCOUNT:,}$ "
          f"ریخته‌شده  →  خالص {pnl:+,.0f}$")

    print(f"\n\n  بیشینهٔ تناوب: قبل از تست  →  در همین ماه")
    for s in sorted(chosen):
        arrow = "⚠️ بیشتر شد" if live_max[s] > hist_max[s] else "✅"
        print(f"    {label(s):>14}  {hist_max[s]:>3}  →  {live_max[s]:>3}   {arrow}")
    if bust_log:
        print(f"\n  لحظهٔ هر انفجار:")
        for d in bust_log:
            print(f"    {d:%Y-%m-%d %H:%M} تهران")


if __name__ == "__main__":
    main()
