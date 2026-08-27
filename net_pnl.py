"""
The same signals, priced with the fee and the payout the owner actually faces.

Every earlier script in this project settles a $50 bet for $100 and charges
nothing, so break-even sits at exactly 50%. The owner's real terms are
different and were given directly: a $50 bet costs $1.57 in fees and pays back
$90, not $100. That single change moves the target a long way, and it moves it
before any strategy gets a say:

    win   ->  +90 - 50 - 1.57  =  +$38.43
    loss  ->     - 50 - 1.57   =  -$51.57
    break-even  =  51.57 / (38.43 + 51.57)  =  57.30%

Doubling, skipping, waiting, laddering — none of them touch that number, for
the same reason recorded in standaside.py: expected value is linear in stake,
so every scheme's break-even is the break-even of one bet. 57.30% is the bar
for all of them.

Two things are measured here, both requested:

  1.  flat stake on every signal, per book, with a real $2,000 account walked
      forward and stopped if it runs out;
  2.  the owner's scheme WITHOUT the martingale — flat stake throughout, keep
      betting while winning, stop after two losses in a row, sit out until a
      signal wins, then start again.

Plus the payout each book would need to break even, which is the one number
here that points at something actionable.

    python net_pnl.py [--stake 50] [--payout 90] [--fee 1.57]
                      [--start 2000] [--days 60] [--data F]
"""

import os
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
PLANB = ["۸) پلن بی"]
SHUFFLES = 2000
SEED = 20260827


class Terms:
    """What one bet is worth, won or lost."""

    def __init__(self, stake, payout, fee):
        self.stake, self.payout, self.fee = stake, payout, fee
        self.win = payout - stake - fee
        self.loss = -(stake + fee)
        self.breakeven = -self.loss / (self.win - self.loss)

    def outlay(self, mult=1.0):
        return (self.stake + self.fee) * mult


def flat_all(wins, T):
    """Bet every signal, one unit each."""
    return sum(T.win if w else T.loss for w in wins)


def scheme(wins, T, martingale=False, start_out=True):
    """
    Keep betting while it wins. Two losses in a row and we stand aside, betting
    nothing, until a signal wins; then start again from the one after it.

    With martingale=False the stake never changes, which is what was asked for
    here: the stand-aside without the doubling.
    """
    state = "out" if start_out else "base"
    run = peak = dip = 0.0
    placed = won = skipped = 0
    staked = 0.0
    for w in wins:
        if state == "out":
            skipped += 1
            if w:
                state = "base"
            continue
        mult = 2.0 if (martingale and state == "second") else 1.0
        staked += T.outlay(mult)
        placed += 1
        if w:
            run += T.win * mult
            won += 1
            state = "base"
        else:
            run += T.loss * mult
            state = "second" if state == "base" else "out"
        peak = max(peak, run)
        dip = min(dip, run - peak)
    return {"pnl": run, "dip": dip, "placed": placed, "won": won,
            "skipped": skipped, "staked": staked,
            "rate": won / placed * 100 if placed else 0.0}


def walk(wins, T, start, use_scheme):
    """
    The same thing with a real account behind it. An account that cannot cover
    the next stake plus its fee stops betting, and the rest never happens.
    """
    bal, low = start, start
    state = "out" if use_scheme else "base"
    placed = 0
    for i, w in enumerate(wins):
        if use_scheme and state == "out":
            if w:
                state = "base"
            continue
        if bal < T.stake + T.fee:
            return {"end": bal, "low": low, "bust_at": i, "placed": placed}
        bal += T.win if w else T.loss
        placed += 1
        low = min(low, bal)
        if use_scheme:
            state = "base" if w else ("second" if state == "base" else "out")
    return {"end": bal, "low": low, "bust_at": None, "placed": placed}


def needed_payout(p, T):
    """E = p*X - (stake+fee) = 0, so the payout that makes this book break even."""
    return (T.stake + T.fee) / p if p else float("inf")


def z_below(w, n, target):
    """How far below the required rate this book sits, in standard errors."""
    se = (target * (1 - target) / n) ** 0.5
    return (w / n - target) / se if se else 0.0


def report(name, sigs, T, start, rng):
    wins = [s["won"] for s in sigs]
    n, w = len(wins), sum(1 for s in sigs if s["won"])
    p = w / n
    lo, hi = S.wilson(w, n)
    first = datetime.fromtimestamp(sigs[0]["t"] + GRAN, TEHRAN)
    last = datetime.fromtimestamp(sigs[-1]["t"] + GRAN, TEHRAN)
    days = max(1, (last - first).days)

    print("\n" + "=" * 76)
    print(f"  {name}")
    print("=" * 76)
    print(f"  {n:,} signals  {first:%Y-%m-%d} -> {last:%Y-%m-%d}  ({days} days)")
    print(f"  win rate {w:,}/{n:,} = {p * 100:.2f}%  "
          f"[{lo * 100:.2f}–{hi * 100:.2f}]")
    print(f"  needed   {T.breakeven * 100:.2f}%   ->  short by "
          f"{(T.breakeven - p) * 100:+.2f} points "
          f"({z_below(w, n, T.breakeven):+.1f} sigma)")

    print(f"\n  {'strategy':<30}{'P&L':>13}{'bets':>8}{'per day':>11}")
    a = flat_all(wins, T)
    print(f"  {'حجم ثابت روی همهٔ سیگنال‌ها':<30}${a:>+12,.0f}{n:>8,}"
          f"${a / days:>+10,.0f}")
    sc = scheme(wins, T)
    print(f"  {'طرح شما، حجم ثابت':<30}${sc['pnl']:>+12,.0f}{sc['placed']:>8,}"
          f"${sc['pnl'] / days:>+10,.0f}")
    mg = scheme(wins, T, martingale=True)
    print(f"  {'طرح شما، با مارتینگل':<30}${mg['pnl']:>+12,.0f}{mg['placed']:>8,}"
          f"${mg['pnl'] / days:>+10,.0f}")

    print(f"\n  --- the scheme in detail (flat stake) " + "-" * 30)
    print(f"  bets placed                    {sc['placed']:,} of {n:,}"
          f"  ({sc['placed'] / n * 100:.1f}%)")
    print(f"  won while betting              {sc['won']:,}/{sc['placed']:,}"
          f" = {sc['rate']:.2f}%   (needs {T.breakeven * 100:.2f}%)")
    print(f"  signals watched, not bet       {sc['skipped']:,}")
    print(f"  money put up                   ${sc['staked']:,.0f}")
    print(f"  worst drawdown                 ${sc['dip']:,.0f}")
    print(f"  -> standing aside cuts the loss by "
          f"{(1 - sc['pnl'] / a) * 100 if a else 0:.0f}% because it makes "
          f"{(1 - sc['placed'] / n) * 100:.0f}% fewer bets,")
    print(f"     not because the bets it makes are better "
          f"({sc['rate']:.2f}% vs {p * 100:.2f}% overall).")

    print(f"\n  --- a real ${start:,.0f} account " + "-" * 36)
    for lbl, use in (("حجم ثابت روی همه", False), ("طرح شما، حجم ثابت", True)):
        r = walk(wins, T, start, use)
        if r["bust_at"] is not None:
            d = datetime.fromtimestamp(sigs[r["bust_at"]]["t"] + GRAN, TEHRAN)
            print(f"  {lbl:<22}BUST after {r['placed']:,} bets, "
                  f"{(d - first).days} days in ({d:%Y-%m-%d})")
        else:
            print(f"  {lbl:<22}${r['end']:>9,.0f}  "
                  f"({r['end'] - start:+,.0f}), lowest ${r['low']:,.0f}")

    need = needed_payout(p, T)
    print(f"\n  --- what would make this book break even " + "-" * 27)
    print(f"  payout needed on a ${T.stake:,.0f} bet   ${need:,.2f}"
          f"   (you get ${T.payout:,.0f})")
    print(f"  i.e. an entry price of         "
          f"{T.stake / need * 100:.2f}c   (you pay "
          f"{T.stake / T.payout * 100:.2f}c)")

    m, sd = shuffle(wins, T, rng)
    print(f"\n  --- shuffle control, {SHUFFLES:,} orders " + "-" * 27)
    print(f"  real ${sc['pnl']:+,.0f}   shuffled ${m:+,.0f} ± ${sd:,.0f}"
          f"   z = {(sc['pnl'] - m) / sd if sd else 0:+.2f}")
    return sc


def shuffle(wins, T, rng):
    seq = list(wins)
    out = []
    for _ in range(SHUFFLES):
        rng.shuffle(seq)
        out.append(scheme(seq, T)["pnl"])
    m = sum(out) / len(out)
    sd = (sum((x - m) ** 2 for x in out) / (len(out) - 1)) ** 0.5
    return m, sd


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    T = Terms(g("--stake", 50.0), g("--payout", 90.0), g("--fee", 1.57))
    start = g("--start", 2000.0)
    days = g("--days", 60)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print("=" * 76)
    print(f"  TERMS: ${T.stake:,.0f} a bet · fee ${T.fee:.2f} · "
          f"pays ${T.payout:,.0f}")
    print(f"  win  {T.win:+.2f}      loss {T.loss:+.2f}      "
          f"BREAK-EVEN {T.breakeven * 100:.2f}%")
    print("=" * 76)
    print(f"replaying {days} days from {data} …")

    closes = S.load_candles(data)
    ts = sorted(closes)
    cut = ts[-1] - days * 86400
    sigs = [s for s in S.replay(closes) if s["t"] >= cut]
    if not sigs:
        print("no signals in this span.")
        return

    rng = random.Random(SEED)
    for nm, sel in (("the seven rules — 1 to 7",
                     [s for s in sigs if s["rules"] != PLANB]),
                    ("پلن بی — rule 8 alone",
                     [s for s in sigs if s["rules"] == PLANB])):
        if len(sel) >= 50:
            report(nm, sel, T, start, rng)

    print("\n" + "=" * 76)
    print(f"  Break-even is {T.breakeven * 100:.2f}% for every strategy on this")
    print("  page. Stopping after two losses makes fewer bets, and fewer bets")
    print("  at a losing price lose less — that is subtraction, not an edge.")
    print("=" * 76)


if __name__ == "__main__":
    main()
