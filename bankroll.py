"""
Start with a real bankroll, bet a flat stake, and see whether it survives.

A P&L total is not an answer to "what would have happened to my $2,000",
because a total assumes every bet got paid for. An account that runs out of
money stops betting, and everything after that point never happens — so the
same 60 days can end at +$4,650 on paper and at zero in fact. This walks the
account forward one signal at a time and stops it dead if it cannot cover the
next stake.

Reported per book, since Plan B and rules 1-7 are kept separate everywhere:

  * where the account ends, and the profit as a percentage of what was risked
  * the LOWEST it ever got, which is the number that decides whether you could
    have sat through it
  * whether it went bust, and on which signal
  * the deepest losing run measured in BETS, not dollars, which is the only
    part of this that transfers to a different stake or a different month

The last one matters more than it looks. "The largest stake this bankroll
would have survived" is a tempting number and a dishonest one: with flat
staking the balance is start + stake * (running net), so surviving depends
entirely on whether the bad run happened before or after the account had
grown. Here the worst run lands in week eight, by which time almost any stake
is safe — and the identical run in week one would have emptied the account.
So this reports the drawdown in bets and sizes against it arriving on day one,
which is the assumption that does not depend on luck.

    python bankroll.py [--start 2000] [--stake 50] [--days 60] [--data F]

Flat staking only: no ladder, no doubling. Every entry priced at 50c.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
PLANB = ["۸) پلن بی"]


def walk(sigs, start, stake):
    """
    One pass down the signals with a real account behind them.

    Returns where it ended, the worst it ever was, and — if the money ran out —
    which signal it ran out on. `low` is measured against the account, not
    against a running peak: what matters to someone watching a balance is how
    close to zero it came, not how far it fell from its best day.
    """
    bal = start
    low = start
    low_at = None
    bust_at = None
    placed = won = 0
    for i, s in enumerate(sigs):
        if bal < stake:
            bust_at = i
            break
        bal += stake if s["won"] else -stake
        placed += 1
        won += 1 if s["won"] else 0
        if bal < low:
            low, low_at = bal, s["t"] + GRAN
    return {"end": bal, "low": low, "low_at": low_at, "bust_at": bust_at,
            "placed": placed, "won": won, "n": len(sigs), "stake": stake}


def worst_run(sigs):
    """
    The deepest peak-to-trough stretch, counted in bets rather than dollars.

    Stake-free and month-free, so it is the piece that carries over: at $50 a
    bet a 65-bet hole is $3,250, at $20 it is $1,300, and the hole itself is a
    property of the signals.
    """
    net = peak = deep = 0
    for s in sigs:
        net += 1 if s["won"] else -1
        peak = max(peak, net)
        deep = min(deep, net - peak)
    return -deep


def report(name, sigs, start, stake):
    first = datetime.fromtimestamp(sigs[0]["t"] + GRAN, TEHRAN)
    last = datetime.fromtimestamp(sigs[-1]["t"] + GRAN, TEHRAN)
    days = max(1, (last - first).days)
    w = sum(1 for s in sigs if s["won"])
    n = len(sigs)

    print("\n" + "=" * 74)
    print(f"  {name}")
    print("=" * 74)
    print(f"  {n:,} signals  {first:%Y-%m-%d} -> {last:%Y-%m-%d}  "
          f"({days} days, {n / days:.0f} a day)")
    print(f"  win rate {w:,}/{n:,} = {w / n * 100:.2f}%")

    r = walk(sigs, start, stake)
    print(f"\n  --- ${start:,.0f} start, ${stake:,.0f} flat per bet " + "-" * 22)
    if r["bust_at"] is not None:
        d = datetime.fromtimestamp(sigs[r["bust_at"]]["t"] + GRAN, TEHRAN)
        print(f"  THE ACCOUNT WENT BUST")
        print(f"  ran out on signal {r['bust_at'] + 1:,} of {n:,}  ->  "
              f"{d:%Y-%m-%d %H:%M} (Tehran)")
        print(f"  that is {(d - first).days} days in; the remaining "
              f"{n - r['bust_at']:,} signals never got bet")
        print(f"  final balance ${r['end']:,.0f}")
    else:
        prof = r["end"] - start
        print(f"  final balance                  ${r['end']:,.0f}")
        print(f"  profit                         ${prof:+,.0f}"
              f"   ({prof / start * 100:+.0f}% on the ${start:,.0f})")
        print(f"  bets placed                    {r['placed']:,}"
              f"  ({r['won']:,} won, {r['placed'] - r['won']:,} lost)")
        print(f"  average per day                ${prof / days:+,.0f}")
        print(f"  lowest the account ever got    ${r['low']:,.0f}", end="")
        if r["low_at"]:
            print(f"   on {datetime.fromtimestamp(r['low_at'], TEHRAN):%Y-%m-%d}")
        else:
            print("   (never below the start)")
        print(f"  closest call                   ${r['low'] - stake:,.0f} of room"
              f" left above the next bet")

    # Sizing, done the way that survives being wrong about the calendar.
    dd = worst_run(sigs)
    print(f"\n  --- if that bad run had come FIRST " + "-" * 24)
    print(f"  deepest losing stretch         {dd} bets"
          f"   (${dd * stake:,.0f} at ${stake:,.0f} a bet)")
    print(f"  it actually happened when the account was well above ${start:,.0f},")
    print(f"  which is luck, not safety. Sized for it landing on day one:")
    for frac, lbl in ((1.0, "survives it bare"), (2.0, "half the account left")):
        sz = start / (dd * frac) if dd else 0
        print(f"    ${sz:,.0f} a bet  ->  {lbl}")
    r["dd"] = dd
    return r


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    start = g("--start", 2000.0)
    stake = g("--stake", 50.0)
    days = g("--days", 60)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print(f"replaying {days} days from {data} …")
    closes = S.load_candles(data)
    ts = sorted(closes)
    cut = ts[-1] - days * 86400
    sigs = [s for s in S.replay(closes) if s["t"] >= cut]
    if not sigs:
        print("no signals in this span.")
        return

    books = [("پلن بی — rule 8 alone", [s for s in sigs if s["rules"] == PLANB]),
             ("the seven rules — 1 to 7",
              [s for s in sigs if s["rules"] != PLANB])]
    out = []
    for nm, sel in books:
        if len(sel) >= 50:
            out.append((nm, report(nm, sel, start, stake)))

    print("\n" + "=" * 74)
    print(f"  ${start:,.0f} start · ${stake:,.0f} flat · no martingale")
    print("=" * 74)
    for nm, r in out:
        if r["bust_at"] is not None:
            print(f"  {nm:<28}BUST on signal {r['bust_at'] + 1:,}")
        else:
            print(f"  {nm:<28}${r['end']:>9,.0f}"
                  f"   ({r['end'] - start:+,.0f})   lowest ${r['low']:,.0f}")
    print("\n  A total assumes every bet was affordable. The 'lowest' column is")
    print("  the one that says whether it was.")


if __name__ == "__main__":
    main()
