"""
Does the bot's own scorecard agree with what Polymarket actually paid?

Two numbers now disagree and only one of them is money.

The live ledger says 55.3% over 499 signals. A month replayed against
Polymarket's own settlements says 49.9%. Before believing either, there is a
cheaper question: for the windows where BOTH records exist, does the bot's
WIN/LOSS match the venue's payout?

It grades itself by comparing two of its own Chainlink samples. Polymarket
settles on a 60-second Chainlink TWAP. Those are not the same measurement, and
on a five-minute window that turns on a few dollars they can disagree — in which
case the bot's scorecard is answering "did my feed move the way I said", not
"did I get paid".

    python verify_ledger.py

Reads signals_ledger.csv and polymarket_chart.csv. Changes nothing.
"""

import csv
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

LEDGER = os.environ.get("LEDGER_FILE", "signals_ledger.csv")
CHART = os.environ.get("CHART_FILE", "polymarket_chart.csv")


def wilson(w, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = w / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - m) / d), min(1.0, (c + m) / d)


def load_chart():
    out = {}
    if not os.path.exists(CHART):
        return out
    with open(CHART, newline="") as f:
        for cells in csv.reader(f):
            if not cells or not cells[0].strip().isdigit():
                continue
            w = next((c.strip().lower() for c in cells[1:]
                      if c.strip().lower() in ("up", "down")), None)
            if w:
                out[int(cells[0])] = w
    return out


def load_ledger():
    """Last row per window wins — the settled one supersedes the issued one."""
    out = {}
    if not os.path.exists(LEDGER):
        return out
    with open(LEDGER, newline="") as f:
        for r in csv.DictReader(f):
            try:
                t = int(r["window_epoch"])
            except (KeyError, TypeError, ValueError):
                continue
            if (r.get("status") or "") in ("win", "loss"):
                out[t] = r
    return out


def main():
    chart, led = load_chart(), load_ledger()
    print(f"ledger : {len(led):,} settled signals")
    print(f"chart  : {len(chart):,} settled windows")
    both = sorted(set(led) & set(chart))
    print(f"overlap: {len(both):,} windows in both\n")
    if len(both) < 30:
        print("too few overlapping windows to judge. Let the collector run, or")
        print("widen the chart with: python chart_pull.py 30")
        return

    agree = disagree = 0
    bot_win = pm_win = 0
    breakdown = Counter()
    delta_when_wrong = []
    for t in both:
        r = led[t]
        bet = (r.get("bet") or "").strip().lower()
        if bet not in ("up", "down"):
            continue
        bot_said_win = r["status"] == "win"
        pm_said_win = bet == chart[t]
        bot_win += bot_said_win
        pm_win += pm_said_win
        if bot_said_win == pm_said_win:
            agree += 1
        else:
            disagree += 1
            breakdown[("bot WIN, market LOSS" if bot_said_win
                       else "bot LOSS, market WIN")] += 1
            try:
                delta_when_wrong.append(abs(float(r.get("delta") or 0)))
            except (TypeError, ValueError):
                pass

    n = agree + disagree
    lo, hi = wilson(agree, n)
    print("=" * 66)
    print("DO THE TWO RECORDS AGREE?")
    print("=" * 66)
    print(f"  agree    {agree:>6,}  ({agree/n*100:.2f}%)   95% CI "
          f"[{lo*100:.1f}–{hi*100:.1f}]")
    print(f"  disagree {disagree:>6,}  ({disagree/n*100:.2f}%)")
    for k, v in breakdown.most_common():
        print(f"      {k}: {v:,}")

    if delta_when_wrong:
        delta_when_wrong.sort()
        mid = delta_when_wrong[len(delta_when_wrong) // 2]
        print(f"\n  when they disagree, the bot's own move was "
              f"${mid:,.2f} (median)")
        print(f"  — small moves are where a point sample and a 60-second")
        print(f"    average part company, which is the expected shape.")

    a1, b1 = wilson(bot_win, n)
    a2, b2 = wilson(pm_win, n)
    print(f"\n{'=' * 66}")
    print("THE SAME SIGNALS, SCORED TWO WAYS")
    print("=" * 66)
    print(f"  by the bot's own feed : {bot_win:>5,}/{n:,} = "
          f"{bot_win/n*100:.2f}%   [{a1*100:.1f}–{b1*100:.1f}]")
    print(f"  by Polymarket's payout: {pm_win:>5,}/{n:,} = "
          f"{pm_win/n*100:.2f}%   [{a2*100:.1f}–{b2*100:.1f}]")
    gap = (bot_win - pm_win) / n * 100
    print(f"  difference: {gap:+.2f} points")
    print()
    if abs(gap) < 1:
        print("  The two agree. Whatever the edge is, it is not an artefact of")
        print("  how the bot grades itself.")
    else:
        print("  They do NOT agree. The bot's scorecard is measuring its own")
        print("  feed, not the payout — so the live win rate is not the number")
        print("  to trade on. Polymarket's column is.")


if __name__ == "__main__":
    main()
