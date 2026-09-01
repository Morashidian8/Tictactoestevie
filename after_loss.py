"""
Is "the signal right after a loss" really better, or did I find it by looking?

The claim came out of stopgo.py's conditional table: on weekend Plan B signals
over the last year, the one immediately following a loss won 57.84% against
54.16% for every weekend signal. That is a claim about SERIAL DEPENDENCE — that
the outcome of one signal says something about the next — and this project has
killed a dozen findings that looked exactly this good.

It also has an obvious mechanism, which is a reason to test it harder rather
than a reason to believe it. Every rule in this bot fades: it bets against the
move that just happened. A losing signal means the market kept going, and a
market that has kept going is the one those rules are built to bet against. So
the story fits — and a story that fits is the most dangerous kind of evidence.

Five tests, and the finding has to survive all of them:

  1.  TRAIN / TEST. Chosen on everything up to two months ago, measured on the
      two months that were not looked at while choosing.
  2.  SHUFFLE. The decisive one for a serial-dependence claim: shuffle the same
      outcomes, keeping the win rate identical, and the lift must vanish. If it
      survives a shuffle it was never about order and the whole idea is void.
  3.  BLOCK-STRATIFIED. Each month against its own baseline, so a drift across
      the year cannot manufacture it.
  4.  BONFERRONI. Four conditional rows on four books is sixteen looks, and the
      best of sixteen beats its baseline most of the time by chance alone.
  5.  BOOK BY BOOK. Weekend Plan B was where it was found. If it is a real
      property of fade rules it should show up, weaker, everywhere else too. If
      it appears ONLY in the book it was found in, that is what selection looks
      like.

    python after_loss.py [--test-days 60] [--data btc5m_now.csv]

Reported at both prices: 50-50, the convention Plan B is quoted at, and the
owner's real terms of $1.57 on a $50 bet paying $90.
"""

import os
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import NormalDist

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
PLANB = ["۸) پلن بی"]
STAKE = 50.0
FAIR_WIN, FAIR_LOSS = STAKE, -STAKE
REAL_WIN, REAL_LOSS = STAKE * 1.8 - STAKE - STAKE * 0.0314, -(STAKE * 1.0314)
REAL_BE = -REAL_LOSS / (REAL_WIN - REAL_LOSS)
SHUFFLES = 2000
SEED = 20260827
LOOKS = 16                      # 4 conditional rows x 4 books


def prev_streak(rows):
    """
    Tag each signal with the number of losses immediately before it.

    Strictly causal: the tag on signal i uses only signals before i, which is
    what makes "bet the one after a loss" something a person could actually do
    while watching the alerts arrive.
    """
    streak, started = 0, False
    for s in rows:
        s["prev"] = streak if started else None
        started = True
        streak = 0 if s["won"] else streak + 1
    return rows


def rate(sel):
    n = len(sel)
    if not n:
        return 0, 0, 0.0
    w = sum(1 for s in sel if s["won"])
    return w, n, w / n


def lift(rows, k=1):
    """(rate after exactly k losses, baseline rate, gap, n) for one book."""
    sel = [s for s in rows if s["prev"] == k]
    base = [s for s in rows if s["prev"] is not None]
    w, n, p = rate(sel)
    _, nb, pb = rate(base)
    return w, n, p, pb, p - pb


def shuffle_lift(rows, k, rng):
    """
    The same measurement on the same outcomes in a random order.

    Shuffling preserves the win rate exactly and destroys the ordering, so any
    lift that survives it is an artifact of conditioning rather than a fact
    about sequence. This is the test the claim most needs to fail.
    """
    outs = [s["won"] for s in rows]
    gaps = []
    for _ in range(SHUFFLES):
        rng.shuffle(outs)
        fake = [{"won": w} for w in outs]
        prev_streak(fake)
        gaps.append(lift(fake, k)[4])
    m = sum(gaps) / len(gaps)
    sd = (sum((g - m) ** 2 for g in gaps) / (len(gaps) - 1)) ** 0.5
    return m, sd


def blocks(rows, k=1):
    by = defaultdict(list)
    for s in rows:
        if s["prev"] is not None:
            by[f"{s['d']:%Y-%m}"].append(s)
    out = []
    for blk in sorted(by):
        sel = [s for s in by[blk] if s["prev"] == k]
        if len(sel) < 25:
            continue
        _, n, p = rate(sel)
        _, _, pb = rate(by[blk])
        out.append((blk, p, pb, p - pb, n))
    if len(out) < 3:
        return out, 0.0, 0.0, 0
    gaps = [x[3] for x in out]
    m = sum(gaps) / len(gaps)
    sd = (sum((g - m) ** 2 for g in gaps) / (len(gaps) - 1)) ** 0.5
    se = sd / len(gaps) ** 0.5
    return out, m, (m / se if se else 0.0), sum(1 for g in gaps if g > 0)


def money(w, n):
    return (w * FAIR_WIN + (n - w) * FAIR_LOSS,
            w * REAL_WIN + (n - w) * REAL_LOSS)


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    test_days = g("--test-days", 60)
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

    def book(name, f):
        rows = prev_streak([s for s in sigs if f(s)])
        return name, rows

    books = [
        book("پلن بی — آخر هفته",
             lambda s: s["rules"] == PLANB and s["d"].weekday() in (5, 6)),
        book("پلن بی — همهٔ هفته", lambda s: s["rules"] == PLANB),
        book("هفت قانون", lambda s: s["rules"] != PLANB),
        book("همهٔ سیگنال‌ها", lambda s: True),
    ]
    bar = NormalDist().inv_cdf(1 - 0.05 / (2 * LOOKS))
    rng = random.Random(SEED)

    print("=" * 92)
    print(f"  Does the signal right after a loss win more?")
    print(f"  Bonferroni over {LOOKS} looks -> a gap needs |z| >= {bar:.2f}")
    print("=" * 92)

    # ---- 5. every book, so we can see whether it is only where I found it -- #
    print("\n  TEST 5 — THE SAME QUESTION IN EVERY BOOK (whole archive)")
    print("  " + "-" * 84)
    print(f"  {'book':<24}{'after 1 loss':>18}{'baseline':>11}{'gap':>9}"
          f"{'z':>8}{'passes':>9}")
    for name, rows in books:
        w, n, p, pb, gp = lift(rows)
        base = [s for s in rows if s["prev"] is not None]
        wb_, nb, _ = rate(base)
        z = S.two_prop_z(w, n, wb_ - w, nb - n)
        print(f"  {name:<24}{w:>7,}/{n:<7,}{p * 100:>7.2f}%{pb * 100:>10.2f}%"
              f"{gp * 100:>+9.2f}{z:>+8.2f}{'YES' if z >= bar else 'no':>9}")

    # ---- the book the claim came from, put through everything -------------- #
    name, rows = books[0]
    print(f"\n{'=' * 92}")
    print(f"  {name} — the book the claim came from, tested properly")
    print("=" * 92)

    tr = [s for s in rows if s["t"] < cut]
    te = [s for s in rows if s["t"] >= cut]
    print(f"\n  TEST 1 — TRAIN / TEST")
    print("  " + "-" * 84)
    print(f"  {'split':<12}{'span':<26}{'after 1 loss':>18}{'baseline':>11}"
          f"{'gap':>9}")
    for lbl, sel in (("TRAIN", tr), ("TEST", te)):
        if not sel:
            continue
        w, n, p, pb, gp = lift(sel)
        lo, hi = S.wilson(w, n)
        print(f"  {lbl:<12}{sel[0]['d']:%Y-%m-%d} → {sel[-1]['d']:%Y-%m-%d}   "
              f"{w:>6,}/{n:<6,}{p * 100:>7.2f}%{pb * 100:>10.2f}%"
              f"{gp * 100:>+9.2f}")
        print(f"  {'':<12}{'':<26}   [{lo * 100:.2f}–{hi * 100:.2f}]")

    print(f"\n  TEST 2 — SHUFFLE (the decisive one: order destroyed, "
          f"win rate kept)")
    print("  " + "-" * 84)
    w, n, p, pb, gp = lift(rows)
    m, sd = shuffle_lift(rows, 1, rng)
    z = (gp - m) / sd if sd else 0.0
    print(f"  real gap        {gp * 100:+.2f} points")
    print(f"  shuffled gap    {m * 100:+.2f} ± {sd * 100:.2f} points")
    print(f"  z               {z:+.2f}"
          f"   -> {'the order carries it' if abs(z) >= 2 else 'INSIDE CHANCE — the lift is not about order'}")

    print(f"\n  TEST 3 — BLOCK-STRATIFIED (each month against its own baseline)")
    print("  " + "-" * 84)
    bl, bm, bt, bpos = blocks(rows)
    for blk, p_, pb_, gp_, n_ in bl:
        print(f"    {blk}   {p_ * 100:>6.2f}%  (n={n_:>4,})   baseline "
              f"{pb_ * 100:>6.2f}%   {gp_ * 100:>+6.2f}")
    if bl:
        print(f"\n  months better: {bpos} of {len(bl)}   ·   mean gap "
              f"{bm * 100:+.2f}   ·   t = {bt:+.2f}"
              f"   -> {'survives' if abs(bt) >= 2 else 'does not survive'}")

    print(f"\n  TEST 4 — WHAT IT WOULD HAVE PAID (whole archive, flat $50)")
    print("  " + "-" * 84)
    sel = [s for s in rows if s["prev"] == 1]
    w2, n2, p2 = rate(sel)
    days = max(1, (rows[-1]["d"] - rows[0]["d"]).days)
    fair, real = money(w2, n2)
    allw, alln, _ = rate([s for s in rows if s["prev"] is not None])
    afair, areal = money(allw, alln)
    print(f"  {'selection':<28}{'n':>8}{'/day':>8}{'rate':>9}"
          f"{'at 50-50':>13}{'at $90':>13}")
    print(f"  {'بعد از یک باخت':<28}{n2:>8,}{n2 / days:>8.2f}"
          f"{p2 * 100:>8.2f}%${fair:>+12,.0f}${real:>+12,.0f}")
    print(f"  {'همهٔ سیگنال‌های آخر هفته':<28}{alln:>8,}{alln / days:>8.2f}"
          f"{allw / alln * 100:>8.2f}%${afair:>+12,.0f}${areal:>+12,.0f}")
    print(f"\n  break-even is 50.00% at 50-50 and {REAL_BE * 100:.2f}% at $90.")

    print(f"\n{'=' * 92}")
    print("  A finding has to clear all five. The shuffle is the one that")
    print("  matters most here, because the whole claim is that ORDER carries")
    print("  information — if a random order shows the same lift, it does not.")
    print("=" * 92)


if __name__ == "__main__":
    main()
