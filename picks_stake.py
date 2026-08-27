"""
The 5+/6-hour picks over the last two months, staked flat and staked as a ladder.

Same selection as daily_picks.py — take a signal only when five or more rules
agree and nothing has been taken in the last six hours — but here the question
is only what to bet on it.

FEES SCALE WITH THE BET. The owner's terms are $1.57 on a $50 bet, which is
3.14%, and $90 back on a win. So at any stake S:

    win   =  1.8*S - S - 0.0314*S  =  +0.7686*S
    loss  =         -(S + 0.0314*S) = -1.0314*S

That asymmetry is what makes the ladder here different from the textbook one.
Doubling recovers a loss only while the payout is big enough to cover what came
before, and at $90 it stops working almost immediately:

    rung 1 ($100 after losing $51.57)   wins 76.86, covers it, +25.29 ahead
    rung 2 ($200 after losing $154.71)  wins 153.72 — SHORT by 0.99
    rung 3 ($400 after losing $361.00)  wins 307.44 — SHORT by 53.55
    rung 4 ($800 after losing $773.55)  wins 614.88 — SHORT by 158.67

From the third rung on, a winning bet no longer gets the money back. The ladder
stops being a recovery mechanism and becomes a way of losing faster in bigger
pieces, which is a property of the payout and not of the market.

    python picks_stake.py [--days 60] [--stake 50] [--start 2000]

Break-even is 57.30% for every row on this page.
"""

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
PAYOUT_MULT = 90.0 / 50.0          # $90 back on a $50 bet
FEE_RATE = 1.57 / 50.0             # $1.57 on a $50 bet
FA_DAY = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"]


def win_of(stake):
    return stake * (PAYOUT_MULT - 1.0 - FEE_RATE)


def loss_of(stake):
    return -stake * (1.0 + FEE_RATE)


BREAKEVEN = -loss_of(1.0) / (win_of(1.0) - loss_of(1.0))


def pick(sigs, depth=5, gap_h=6):
    out, last = [], -1e18
    for s in sorted(sigs, key=lambda x: x["t"]):
        if len(s["rules"]) >= depth and s["t"] - last >= gap_h * 3600:
            out.append(s)
            last = s["t"]
    return out


def ladder(rows, base, rungs):
    """
    rungs=0 is flat. Otherwise double after each loss and reset to base after a
    win or after `rungs` consecutive losses.

    Tracks the account as well as the P&L, because a ladder that needs $800 on
    its fifth rung is only available to someone who still has $800.
    """
    run = peak = dip = 0.0
    rung = busts = 0
    biggest = staked = 0.0
    streak = worst = 0
    need = 0.0                       # most the ladder ever had to have in hand
    cyc = 0.0
    for r in rows:
        bet = base * 2 ** rung
        biggest = max(biggest, bet)
        staked += bet
        cyc += bet
        if r["won"]:
            run += win_of(bet)
            rung = streak = 0
            cyc = 0.0
        else:
            run += loss_of(bet)
            streak += 1
            worst = max(worst, streak)
            need = max(need, cyc)
            if rungs:
                rung += 1
                if rung >= rungs:
                    rung, busts, cyc = 0, busts + 1, 0.0
        peak = max(peak, run)
        dip = min(dip, run - peak)
    return {"pnl": run, "dip": dip, "busts": busts, "max_bet": biggest,
            "staked": staked, "streak": worst, "cycle": need}


def walk(rows, base, rungs, start):
    """The same ladder with a real account: it cannot bet what it does not have."""
    bal, low = start, start
    rung = 0
    placed = 0
    for r in rows:
        bet = base * 2 ** rung
        if bal < bet * (1.0 + FEE_RATE):
            return {"end": bal, "low": low, "stopped": placed, "short": bet}
        bal += win_of(bet) if r["won"] else loss_of(bet)
        placed += 1
        low = min(low, bal)
        if r["won"]:
            rung = 0
        elif rungs:
            rung = 0 if rung + 1 >= rungs else rung + 1
    return {"end": bal, "low": low, "stopped": None, "short": 0}


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    days = g("--days", 60)
    base = g("--stake", 50.0)
    start = g("--start", 2000.0)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print(f"replaying {days} days from {data} …")
    closes = S.load_candles(data)
    sigs = S.replay(closes)
    for s in sigs:
        s["d"] = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
    ts = sorted(closes)
    cut = ts[-1] - days * 86400
    rows = pick([s for s in sigs if s["t"] >= cut])
    if not rows:
        print("no picks in this span.")
        return

    n = len(rows)
    w = sum(1 for r in rows if r["won"])
    lo, hi = S.wilson(w, n)
    span = max(1, (rows[-1]["d"] - rows[0]["d"]).days)

    print("=" * 88)
    print(f"  RULE: 5+ rules agree · nothing taken in the last 6 hours")
    print(f"  TERMS: ${base:,.0f} base · fee {FEE_RATE * 100:.2f}% · "
          f"pays {PAYOUT_MULT:.1f}x  ->  BREAK-EVEN {BREAKEVEN * 100:.2f}%")
    print("=" * 88)
    print(f"  {rows[0]['d']:%Y-%m-%d} -> {rows[-1]['d']:%Y-%m-%d}  ({span} days)")
    print(f"  {n} picks · {n / span:.2f} a day · {w} won, {n - w} lost · "
          f"{w / n * 100:.2f}%  [{lo * 100:.2f}–{hi * 100:.2f}]")

    print(f"\n  {'staking':<22}{'P&L':>11}{'per day':>10}{'worst dip':>12}"
          f"{'max bet':>10}{'need/cycle':>12}{'busts':>7}")
    out = []
    for lbl, rungs in (("حجم ثابت", 0), ("مارتینگل ۲ پله", 2),
                       ("مارتینگل ۳ پله", 3), ("مارتینگل ۴ پله", 4),
                       ("مارتینگل ۵ پله", 5)):
        L = ladder(rows, base, rungs)
        out.append((lbl, rungs, L))
        print(f"  {lbl:<22}${L['pnl']:>+10,.0f}${L['pnl'] / span:>+9,.0f}"
              f"${L['dip']:>11,.0f}${L['max_bet']:>9,.0f}"
              f"${L['cycle']:>11,.0f}{L['busts']:>7}")

    print(f"\n  worst losing streak in these picks: "
          f"{out[0][2]['streak']} in a row")

    print(f"\n{'-' * 88}")
    print(f"  A REAL ${start:,.0f} ACCOUNT")
    print("-" * 88)
    for lbl, rungs, _ in out:
        r = walk(rows, base, rungs, start)
        if r["stopped"] is not None:
            print(f"  {lbl:<22}stopped after {r['stopped']} bets — needed "
                  f"${r['short']:,.0f}, had ${r['end']:,.0f}")
        else:
            print(f"  {lbl:<22}${r['end']:>9,.0f}   "
                  f"({r['end'] - start:+,.0f})   lowest ${r['low']:,.0f}")

    print(f"\n{'-' * 88}")
    print("  WHY THE LADDER DOES NOT RECOVER HERE")
    print("-" * 88)
    print(f"  {'rung':<8}{'bet':>9}{'lost so far':>14}{'a win pays':>13}"
          f"{'covers it?':>13}")
    behind = 0.0
    for k in range(5):
        bet = base * 2 ** k
        pays = win_of(bet)
        mark = f"+{pays - behind:,.2f}" if pays >= behind else f"SHORT {behind - pays:,.2f}"
        print(f"  {k + 1:<8}${bet:>8,.0f}${behind:>13,.2f}${pays:>12,.2f}"
              f"{mark:>13}")
        behind += -loss_of(bet)

    print(f"\n{'-' * 88}")
    print("  MONTH BY MONTH, FLAT")
    print("-" * 88)
    per = defaultdict(lambda: [0, 0])
    for r in rows:
        k = f"{r['d']:%Y-%m}"
        per[k][0] += 1
        per[k][1] += 1 if r["won"] else 0
    for k in sorted(per):
        t, kw = per[k]
        pnl = kw * win_of(base) + (t - kw) * loss_of(base)
        print(f"  {k}   {kw:>3}/{t:<3} = {kw / t * 100:>6.2f}%"
              f"   ${pnl:>+9,.0f}")

    print(f"\n{'=' * 88}")
    print(f"  Break-even is {BREAKEVEN * 100:.2f}% for every row above. The")
    print("  ladder changes the size of the swings, never their direction.")
    print("=" * 88)


if __name__ == "__main__":
    main()
