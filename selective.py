"""
Which few signals a person who sleeps at night could actually take.

The owner cannot bet 120 signals a day. They sleep, they work, they are not
holding the phone at 04:00. So the question is not "does the bot have an edge"
but a much harder one: is there a SMALL, RECOGNISABLE subset of signals that
clears the real break-even, and does it stay clear on data that was not used
to find it?

The bar is set by the owner's own terms, not by 50%: a $50 bet costs $1.57 and
pays $90, so break-even is 57.30%. Every candidate here is judged against that
number.

The trap this script exists to avoid is the one that has eaten every previous
hunt in this project. If you try 60 filters on 20 months of data and report the
best one, you will find something above 57.30% whether or not anything is
there — the best of 60 coins looks gifted. So:

  * TRAIN is everything up to two months ago. Candidates are chosen here and
    only here.
  * TEST is the last two months, untouched until the choice is made. A
    candidate that was picked on train and then measured on test cannot have
    been fitted to test, because test did not exist when it was picked.
  * Bonferroni over the full number of candidates TRIED, not the number
    reported. Looking at 60 and quoting one is how a coin gets a reputation.
  * A minimum count, because a 62% subset of 40 signals is a rumour.

Also reported for each survivor: signals per day. A filter that clears the bar
and fires 90 times a day is not a solution to this particular problem.

    python selective.py [--test-days 60] [--min-n 300] [--data F]
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from statistics import NormalDist

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
PLANB = "۸) پلن بی"
STAKE, PAYOUT, FEE = 50.0, 90.0, 1.57
WIN_NET, LOSS_NET = PAYOUT - STAKE - FEE, STAKE + FEE
BREAKEVEN = LOSS_NET / (WIN_NET + LOSS_NET)
FA_DAY = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"]


def tag(sigs):
    """Everything a filter might want to look at, computed once."""
    for s in sigs:
        d = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
        s["hour"] = d.hour
        s["wd"] = d.weekday()
        s["depth"] = len(s["rules"])
        s["solo8"] = s["rules"] == [PLANB]
        s["date"] = d
    return sigs


def rate(sel):
    n = len(sel)
    w = sum(1 for s in sel if s["won"])
    return w, n, (w / n if n else 0.0)


def z_vs(w, n, target):
    se = (target * (1 - target) / n) ** 0.5 if n else 0
    return (w / n - target) / se if se else 0.0


def span_days(sigs):
    return max(1, (sigs[-1]["date"] - sigs[0]["date"]).days)


# --------------------------------------------------------------------------- #
#  the candidates — built once, applied to train and test identically
# --------------------------------------------------------------------------- #
def candidates():
    """
    Every filter a person could actually apply while looking at their phone.
    Nothing here needs a computation the alert does not already show.
    """
    out = []

    # how many rules agree
    for k in range(2, 7):
        out.append((f"{k}+ قانون هم‌نظر", lambda s, k=k: s["depth"] >= k))
    for k in range(2, 7):
        out.append((f"دقیقاً {k} قانون", lambda s, k=k: s["depth"] == k))

    # the golden entry, alone and with depth
    out.append(("ورودِ طلایی", lambda s: s["golden"]))
    for k in (2, 3, 4):
        out.append((f"طلایی + {k}+ قانون",
                    lambda s, k=k: s["golden"] and s["depth"] >= k))

    # rules 1-7 only, i.e. never Plan B
    out.append(("هفت قانون (بدون پلن بی)", lambda s: not s["solo8"]))
    for k in (2, 3, 4, 5):
        out.append((f"هفت قانون + {k}+ هم‌نظر",
                    lambda s, k=k: not s["solo8"] and s["depth"] >= k))

    # waking windows, Tehran
    windows = [("۸ صبح تا ۱۲ شب", 8, 24), ("۹ صبح تا ۱۱ شب", 9, 23),
               ("۱۰ صبح تا ۱۰ شب", 10, 22), ("۱۲ ظهر تا ۱۲ شب", 12, 24),
               ("۴ عصر تا ۱۲ شب", 16, 24), ("۸ صبح تا ۴ عصر", 8, 16)]
    for nm, a, b in windows:
        out.append((nm, lambda s, a=a, b=b: a <= s["hour"] < b))
        for k in (2, 3, 4):
            out.append((f"{nm} + {k}+ هم‌نظر",
                        lambda s, a=a, b=b, k=k: a <= s["hour"] < b
                        and s["depth"] >= k))

    # single hours, three-hour blocks
    for h in range(0, 24, 3):
        out.append((f"ساعت {h:02d}–{h + 3:02d}",
                    lambda s, h=h: h <= s["hour"] < h + 3))

    # calendar
    out.append(("شنبه و یکشنبه", lambda s: s["wd"] in (5, 6)))
    out.append(("وسط هفته", lambda s: s["wd"] not in (5, 6)))
    out.append(("آخر هفته + ۳+ هم‌نظر",
                lambda s: s["wd"] in (5, 6) and s["depth"] >= 3))

    # direction
    out.append(("فقط سیگنالِ بالا", lambda s: s["bet"] == "up"))
    out.append(("فقط سیگنالِ پایین", lambda s: s["bet"] == "down"))

    # against the previous candle, which is where the settled research says
    # the edge lives
    out.append(("خلافِ کندلِ قبل", lambda s: not s["aligned"]))
    out.append(("هم‌جهتِ کندلِ قبل", lambda s: s["aligned"]))
    for k in (3, 4):
        out.append((f"خلافِ کندلِ قبل + {k}+ هم‌نظر",
                    lambda s, k=k: not s["aligned"] and s["depth"] >= k))
    return out


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    test_days = g("--test-days", 60)
    min_n = g("--min-n", 300)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print(f"replaying {data} …")
    closes = S.load_candles(data)
    ts = sorted(closes)
    cut = ts[-1] - test_days * 86400
    sigs = tag(S.replay(closes))
    train = [s for s in sigs if s["t"] < cut]
    test = [s for s in sigs if s["t"] >= cut]
    if not train or not test:
        print("not enough data to split.")
        return

    cands = candidates()
    bar = NormalDist().inv_cdf(1 - 0.05 / (2 * len(cands)))

    print("=" * 78)
    print(f"  TERMS  ${STAKE:,.0f} bet · fee ${FEE:.2f} · pays ${PAYOUT:,.0f}"
          f"  ->  BREAK-EVEN {BREAKEVEN * 100:.2f}%")
    print(f"  TRAIN  {train[0]['date']:%Y-%m-%d} -> {train[-1]['date']:%Y-%m-%d}"
          f"   {len(train):,} signals")
    print(f"  TEST   {test[0]['date']:%Y-%m-%d} -> {test[-1]['date']:%Y-%m-%d}"
          f"   {len(test):,} signals   (never looked at until chosen)")
    print(f"  {len(cands)} candidates tried · Bonferroni bar |z| >= {bar:.2f}"
          f" · minimum {min_n:,} signals")
    print("=" * 78)

    w, n, p = rate(train)
    print(f"\n  everything, train: {w:,}/{n:,} = {p * 100:.2f}%"
          f"   ({(p - BREAKEVEN) * 100:+.2f} vs break-even)")
    w, n, p = rate(test)
    print(f"  everything, test:  {w:,}/{n:,} = {p * 100:.2f}%"
          f"   ({(p - BREAKEVEN) * 100:+.2f} vs break-even)")

    # ---- step 1: choose on train, and only train ---------------------------- #
    picked = []
    for nm, f in cands:
        sel = [s for s in train if f(s)]
        w, n, p = rate(sel)
        if n < min_n:
            continue
        z = z_vs(w, n, BREAKEVEN)
        picked.append((nm, f, w, n, p, z))
    picked.sort(key=lambda r: -r[4])

    print(f"\n{'=' * 78}")
    print("  STEP 1 — the ten best on TRAIN (chosen here, proved nowhere yet)")
    print("=" * 78)
    print(f"  {'filter':<34}{'n':>8}{'rate':>9}{'vs 57.30':>10}{'z':>8}")
    for nm, _, w, n, p, z in picked[:10]:
        print(f"  {nm:<34}{n:>8,}{p * 100:>8.2f}%"
              f"{(p - BREAKEVEN) * 100:>+9.2f}{z:>+8.2f}")

    # ---- step 2: the honest part -------------------------------------------- #
    winners = [r for r in picked if r[4] > BREAKEVEN and r[5] >= bar]
    print(f"\n{'=' * 78}")
    print(f"  STEP 2 — of {len(picked)} candidates, {len(winners)} clear"
          f" {BREAKEVEN * 100:.2f}% on TRAIN with |z| >= {bar:.2f}")
    print("=" * 78)
    if not winners:
        print("  Nothing clears the bar on train, so there is nothing to test.")
        print("  Every filter above is either below break-even or within the")
        print("  noise of it once the number of filters tried is accounted for.")
    else:
        print(f"  {'filter':<30}{'train':>16}{'TEST':>18}{'per day':>10}")
        td = span_days(test)
        for nm, f, w, n, p, z in winners:
            sel = [s for s in test if f(s)]
            w2, n2, p2 = rate(sel)
            if not n2:
                continue
            lo, hi = S.wilson(w2, n2)
            ok = "PASS" if p2 > BREAKEVEN else "FAIL"
            print(f"  {nm:<30}{p * 100:>10.2f}% n={n:<6,}"
                  f"{p2 * 100:>9.2f}% n={n2:<5,}{n2 / td:>9.1f}  {ok}")
            print(f"  {'':<30}{'':>16}   [{lo * 100:.2f}–{hi * 100:.2f}]")

    # ---- what the best of them would actually pay --------------------------- #
    print(f"\n{'=' * 78}")
    print("  STEP 3 — what the most selective filters pay on TEST, either way")
    print("=" * 78)
    td = span_days(test)
    print(f"  {'filter':<34}{'n':>7}{'/day':>7}{'rate':>9}{'P&L':>11}")
    # names built with an int format to an ASCII digit, so match that exactly
    show = ["3+ قانون هم‌نظر", "4+ قانون هم‌نظر", "5+ قانون هم‌نظر",
            "ورودِ طلایی", "هفت قانون + 3+ هم‌نظر", "هفت قانون (بدون پلن بی)",
            "خلافِ کندلِ قبل + 3+ هم‌نظر"]
    by_name = dict((nm, f) for nm, f in cands)
    for nm in show:
        f = by_name.get(nm)
        if not f:
            continue
        sel = [s for s in test if f(s)]
        w2, n2, p2 = rate(sel)
        if not n2:
            continue
        pnl = w2 * (PAYOUT - STAKE - FEE) - (n2 - w2) * (STAKE + FEE)
        print(f"  {nm:<34}{n2:>7,}{n2 / td:>7.1f}{p2 * 100:>8.2f}%"
              f"${pnl:>+10,.0f}")

    print(f"\n{'=' * 78}")
    print(f"  A filter has to beat {BREAKEVEN * 100:.2f}%, not 50%. Trading")
    print("  fewer signals does not raise the rate — it only reduces how much")
    print("  a losing rate costs. The only thing that helps is a subset that is")
    print("  genuinely better, and it has to prove that on data it never saw.")
    print("=" * 78)


if __name__ == "__main__":
    main()
