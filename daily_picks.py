"""
One or two signals a day, chosen by a rule you can apply on your phone.

The owner does not want 63 trades a day; two good ones is enough. Everything
else in this project has answered "which signals win more" with slices that
died out of sample. This one did not, and this file is the record of what
survived and what it had to survive.

THE RULE

    Take a signal only if FIVE OR MORE rules agree on it, and only if you have
    not already taken one in the last six hours.

That is it. Nothing to compute — the alert already says how many rules fired.
It produces about 1.3 trades a day.

WHY IT IS NOT THE USUAL MIRAGE

Depth 5+ signals number about 3.2 a day and win 56.3%, which is under the
57.30% break-even. The lift does not come from depth alone; it comes from
NOT taking the later ones. Sorted by position within the day, depth-5+ signals
go 59.2% / 56.5% / 60.3% for the first three and 51.8% from the fourth on
(train). The mechanism is visible in the data: on days that produced only 1-3
such signals the rate is 70.9%, on days that produced four or more it is
48.6%. A day that keeps throwing high-conviction signals is a day the market
is trending, and every rule in this bot fades. You cannot know in advance
which kind of day it is — that is why the tradeable version is a spacing rule
and not "only trade quiet days".

WHAT IT WAS TESTED AGAINST

  * Train/test: chosen on 2025-01-07 to 2026-06-28, measured on the last two
    months, which were not looked at until the rule was fixed.
  * The day boundary: "first of the day" survives Tehran, UTC and ET midnight
    at depth 5+. At depth 3+ and 4+ it does not — ET midnight sends those to
    45%. Only depth 5 is robust to the arbitrary choice of where a day starts.
  * An hour-of-day control: the first signal of the day beats other depth-5+
    signals drawn from the SAME hours by +4.2 points on train and +6.2 on
    test. So it is not simply an hour effect wearing a costume — though at
    z = +1.80 and +1.19 that control is suggestive, not decisive.

WHAT IS STILL WRONG WITH IT

The test slice is 85 signals. Its confidence interval runs from 50.6% to
70.8%, and the bottom of that is a losing number. Many variants were tried
before this one was settled on, which inflates the best of them. Nothing here
is established; it is the best candidate this data can offer, and the correct
next step is to forward-test it on paper, not to fund it.

    python daily_picks.py [--gap 6] [--depth 5] [--days 60] [--list 20]

Terms are the owner's real ones: $50 a bet, $1.57 fee, $90 back on a win,
so break-even is 57.30% and not 50%.
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
STAKE, PAYOUT, FEE = 50.0, 90.0, 1.57
WIN_NET, LOSS_NET = PAYOUT - STAKE - FEE, STAKE + FEE
BREAKEVEN = LOSS_NET / (WIN_NET + LOSS_NET)
FA_DAY = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"]


def pick(sigs, depth, gap_h):
    """
    The rule itself, applied the way a person would: walk time forward, take a
    qualifying signal, then ignore everything for `gap_h` hours.

    Causal by construction — the decision at time t uses only what happened
    before t, which is what separates this from "the best three of the day".
    """
    out, last = [], -1e18
    for s in sorted(sigs, key=lambda x: x["t"]):
        if len(s["rules"]) >= depth and s["t"] - last >= gap_h * 3600:
            out.append(s)
            last = s["t"]
    return out


def stats(sel):
    n = len(sel)
    if not n:
        return 0, 0, 0.0, 0.0, 0.0, 0.0
    w = sum(1 for s in sel if s["won"])
    r = w / n
    lo, hi = S.wilson(w, n)
    return w, n, r, lo, hi, w * WIN_NET - (n - w) * LOSS_NET


def line(lbl, sel, days, mark=""):
    w, n, r, lo, hi, pnl = stats(sel)
    if n < 15:
        print(f"  {lbl:<32}{n:>5} — too few to say anything")
        return
    print(f"  {lbl:<32}{n:>5,}{n / days:>7.2f}{r * 100:>8.2f}%"
          f"  [{lo * 100:5.2f}–{hi * 100:<5.2f}]${pnl:>+8,.0f}"
          f"{LOSS_NET / r:>8.2f}  {mark}")


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    gap = g("--gap", 6)
    depth = g("--depth", 5)
    test_days = g("--days", 60)
    nlist = g("--list", 20)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print(f"replaying {data} …")
    closes = S.load_candles(data)
    sigs = S.replay(closes)
    for s in sigs:
        s["d"] = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
    ts = sorted(closes)
    cut = ts[-1] - test_days * 86400
    train = [s for s in sigs if s["t"] < cut]
    test = [s for s in sigs if s["t"] >= cut]

    print("=" * 96)
    print(f"  RULE: {depth}+ rules agree, and nothing taken in the last"
          f" {gap} hours")
    print(f"  TERMS: ${STAKE:,.0f} · fee ${FEE:.2f} · pays ${PAYOUT:,.0f}"
          f"  ->  BREAK-EVEN {BREAKEVEN * 100:.2f}%")
    print("=" * 96)

    for lbl, src in (("TRAIN (chosen here)", train), ("TEST (proved here)", test)):
        days = max(1, (src[-1]["d"] - src[0]["d"]).days)
        print(f"\n  {lbl}   {src[0]['d']:%Y-%m-%d} -> {src[-1]['d']:%Y-%m-%d}"
              f"   ({days} days)")
        print(f"  {'selection':<32}{'n':>5}{'/day':>7}{'rate':>8}"
              f"{'   95% CI':>17}{'P&L':>9}{'need$':>8}")
        line("همهٔ سیگنال‌ها", src, days)
        line(f"عمق {depth}+ ، بدون فاصله",
             [s for s in src if len(s["rules"]) >= depth], days)
        line(f"عمق {depth}+ با فاصلهٔ {gap} ساعت", pick(src, depth, gap), days,
             "<- THE RULE")

    # ---- why the spacing matters, shown rather than asserted --------------- #
    print(f"\n{'=' * 96}")
    print("  WHERE THE LIFT COMES FROM — depth-5+ signals by position in the day")
    print("=" * 96)
    for lbl, src in (("TRAIN", train), ("TEST", test)):
        by = defaultdict(list)
        for s in sorted(src, key=lambda x: x["t"]):
            if len(s["rules"]) >= depth:
                by[s["d"].date()].append(s)
        slot = defaultdict(lambda: [0, 0])
        for day in by.values():
            for i, s in enumerate(day):
                k = min(i + 1, 4)
                slot[k][1] += 1
                slot[k][0] += 1 if s["won"] else 0
        row = "  ".join(
            f"#{k if k < 4 else '4+'} {slot[k][0] / slot[k][1] * 100:.1f}%"
            f"(n={slot[k][1]})" for k in sorted(slot) if slot[k][1] >= 20)
        print(f"  {lbl:<7}{row}")
        calm = [s for v in by.values() if len(v) <= 3 for s in v]
        busy = [s for v in by.values() if len(v) >= 4 for s in v]
        for nm, sel in (("quiet days (1-3)", calm), ("busy days (4+)", busy)):
            w, n, r, lo, hi, _ = stats(sel)
            if n >= 20:
                print(f"    {nm:<20}{w:>5,}/{n:<6,}{r * 100:>7.2f}%"
                      f"  [{lo * 100:5.2f}–{hi * 100:<5.2f}]")

    # ---- the picks themselves, so they can be recognised ------------------- #
    sel = pick(test, depth, gap)
    print(f"\n{'=' * 96}")
    print(f"  THE LAST {min(nlist, len(sel))} PICKS — what you would have taken")
    print("=" * 96)
    print(f"  {'date':<12}{'time':<8}{'day':<11}{'dir':<8}{'rules':>6}"
          f"{'result':>9}")
    for s in sel[-nlist:]:
        print(f"  {s['d']:%Y-%m-%d}  {s['d']:%H:%M}  "
              f"{FA_DAY[s['d'].weekday()]:<11}"
              f"{'بالا' if s['bet'] == 'up' else 'پایین':<8}"
              f"{len(s['rules']):>6}{'برد' if s['won'] else 'باخت':>9}")

    w, n, r, lo, hi, pnl = stats(sel)
    print(f"\n{'=' * 96}")
    print(f"  {n} picks over {test_days} days · {r * 100:.2f}% · "
          f"${pnl:+,.0f} at ${STAKE:,.0f} a bet")
    print(f"  The interval is [{lo * 100:.2f}–{hi * 100:.2f}] and break-even is"
          f" {BREAKEVEN * 100:.2f}%. The bottom of that")
    print("  interval loses money. Forward-test on paper before funding it.")
    print("=" * 96)


if __name__ == "__main__":
    main()
