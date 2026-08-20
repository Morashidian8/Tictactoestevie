"""
Every combination of guard and staking, priced per year.

Two axes:

  guards    nothing · cooldown after k losses · skip oversized candles · both
  staking   flat · martingale 3 rungs · martingale 7 rungs

Priced at 50c throughout: a win pays the stake, a loss costs it.

The honest headline is the held-out final third, scaled to a year — the guard
thresholds were chosen by looking at test-set behaviour, so quoting them on the
data that suggested them would flatter them. The whole archive is printed
underneath for scale, clearly labelled as the optimistic figure.

The column that decides everything is not P&L. It is BANKROLL NEEDED: the worst
drawdown plus the largest single bet the scheme can demand. A scheme that earns
more but needs more than the account holds does not earn more, it busts.

    python annual_compare.py [--data btc5m_fresh.csv] [--stake 20]
"""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
import same_dir as S
import streak_guard as G

YEAR = 365 * 86400


# --------------------------------------------------------------------------- #
# guards — each returns the subset of signals actually bet
# --------------------------------------------------------------------------- #
def guard_none(sigs):
    return sigs


def guard_cooldown(sigs, k=4, skip=6):
    """After k losses running, sit out the next `skip` signals."""
    out, loss, wait = [], 0, 0
    for s in sigs:
        if wait > 0:
            wait -= 1
            loss = 0
            continue
        out.append(s)
        if s["won"]:
            loss = 0
        else:
            loss += 1
            if loss >= k:
                wait, loss = skip, 0
    return out


def guard_size(sigs, thr=1.8):
    """Stand aside when recent candles are oversized against the last 100."""
    return [s for s in sigs if s["expansion"] < thr]


def guard_both(sigs):
    return guard_cooldown(guard_size(sigs))


GUARDS = (("no guard", guard_none),
          ("cooldown 4/6", guard_cooldown),
          ("skip big candles (1.8x)", guard_size),
          ("both guards", guard_both))


def stake_run(sigs, stake, rungs):
    """
    Walk the taken signals and return the numbers that matter.

    rungs=0 is flat. Otherwise the stake doubles after each loss and resets
    after `rungs` of them, which is the bot's ladder.
    """
    run = peak = dip = 0.0
    rung = busts = 0
    biggest = 0.0
    streak = worst_streak = 0
    for s in sigs:
        bet = stake * 2 ** rung
        biggest = max(biggest, bet)
        if s["won"]:
            run += bet
            rung = streak = 0
        else:
            run -= bet
            streak += 1
            worst_streak = max(worst_streak, streak)
            if rungs:
                rung += 1
                if rung >= rungs:
                    rung, busts = 0, busts + 1
        peak = max(peak, run)
        dip = min(dip, run - peak)
    return {"pnl": run, "dip": dip, "busts": busts, "biggest": biggest,
            "streak": worst_streak, "n": len(sigs)}


def table(sigs, stake, title, span_days):
    scale = 365 / span_days
    print(f"\n{'=' * 88}")
    print(title)
    print("=" * 88)
    w = sum(1 for s in sigs if s["won"])
    print(f"  {len(sigs):,} signals over {span_days:.0f} days "
          f"({w / len(sigs) * 100:.2f}% won)   ->  everything below is PER YEAR\n")
    print(f"  {'guard':<26}{'staking':<16}{'bets/yr':>9}{'/day':>6}{'rate':>8}"
          f"{'P&L/yr':>11}{'worst dip':>11}{'max bet':>9}{'bankroll':>10}")
    print(f"  {'-' * 90}")
    for gname, gfn in GUARDS:
        taken = gfn(sigs)
        if not taken:
            continue
        for sname, rungs in (("flat", 0), ("martingale 3", 3),
                             ("martingale 7", 7)):
            r = stake_run(taken, stake, rungs)
            rate = sum(1 for s in taken if s["won"]) / r["n"] * 100
            # What the account must hold: the deepest hole it goes into, plus
            # the biggest single bet it must still be able to place at the
            # bottom of that hole.
            need = abs(r["dip"]) + r["biggest"]
            print(f"  {gname:<26}{sname:<16}{r['n'] * scale:>9,.0f}"
                  f"{r['n'] / span_days:>6.0f}{rate:>7.2f}%"
                  f"{r['pnl'] * scale:>+11,.0f}"
                  f"{r['dip']:>+11,.0f}{r['biggest']:>9,.0f}{need:>10,.0f}")
        print(f"  {'-' * 90}")

    # ---- the reality check ------------------------------------------------ #
    # Everything above is graded close-to-close on Bitstamp. Live, against
    # Polymarket's own settlements, this system has measured 49.86% over a
    # month; the bot's ledger paid 52.27%. Those gaps are not rounding: at a
    # 50c break-even, P&L is proportional to (rate - 50), so dropping from
    # 54.72% to 50.5% is not a 4-point haircut on the profit, it is an 88%
    # one. Holding the bet count fixed and substituting the rate shows how
    # little of the table above survives contact with the real feed.
    flat_n = len(guard_none(sigs))
    print(f"\n  {'-' * 90}")
    print("  SAME BET COUNT, DIFFERENT ACCURACY — flat, no guard")
    print(f"  {'-' * 90}")
    print(f"  {'win rate':<40}{'where it came from':<28}{'P&L/yr':>12}")
    for rate, note in ((54.72, "this backtest, close-to-close"),
                       (52.96, "bot ledger, own feed"),
                       (52.27, "bot ledger, Polymarket payout"),
                       (50.29, "last 30 days replayed"),
                       (49.86, "month replay vs Polymarket"),
                       (50.00, "break-even")):
        pnl = flat_n * scale * stake * (2 * rate / 100 - 1)
        print(f"  {f'{rate:.2f}%':<40}{note:<28}{pnl:>+12,.0f}")


def main():
    argv = sys.argv[1:]
    stake = float(argv[argv.index("--stake") + 1]) if "--stake" in argv else 20.0
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    closes = S.load_candles(data)
    print("replaying the rules over the archive …")
    sigs = G.collect(closes, 0)
    span = (sigs[-1]["t"] - sigs[0]["t"]) / 86400
    print(f"{len(sigs):,} signals  "
          f"{datetime.fromtimestamp(sigs[0]['t'], timezone.utc):%Y-%m-%d} -> "
          f"{datetime.fromtimestamp(sigs[-1]['t'], timezone.utc):%Y-%m-%d}  "
          f"({span:.0f} days)")
    print(f"base stake ${stake:,.0f}, priced at 50c")

    cut = len(sigs) * 2 // 3
    te = sigs[cut:]
    te_span = (te[-1]["t"] - te[0]["t"]) / 86400
    table(te, stake,
          "HELD-OUT FINAL THIRD — the honest number", te_span)
    table(sigs, stake,
          "WHOLE ARCHIVE — optimistic, the guards were tuned on part of this",
          span)

    print(f"\n{'=' * 88}")
    print("READ THIS BEFORE THE TABLE ABOVE")
    print("=" * 88)
    print("  · 'bankroll' is the deepest hole plus the largest bet the scheme")
    print("    must still place at the bottom of it. Fall short and the year's")
    print("    P&L never happens — the account is gone before it arrives.")
    print("  · A ladder's break-even is exactly 50%, the same as flat. It moves")
    print("    variance, not the edge. Every extra dollar it earns is rent on")
    print("    risk, and the rent comes due in one afternoon.")
    print("  · The guards cost signals. Fewer bets on the same edge is less")
    print("    profit — they are bought for the drawdown column, not the P&L.")


if __name__ == "__main__":
    main()
