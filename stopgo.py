"""
Stop on a loss, wait for a win, start again — flat stake throughout.

The owner's scheme, stated exactly: enter at the base stake; while it keeps
winning, keep going; the moment one loses, STOP and bet nothing; watch the
signals go by until one of them wins; then start again from the signal after
it. No doubling anywhere.

    IN   bet the base stake.   win -> IN.   lose -> OUT.
    OUT  bet nothing, watch.   a signal wins -> IN, from the next one.

This is a stricter cousin of standaside.py, which allowed one doubled bet and
only stepped aside after the SECOND loss. Here a single loss is enough.
`--after N` runs the general form, so both live in one place.

WHAT IT CAN AND CANNOT DO

It cannot change the sign of the expected value. Skipping bets removes terms
from E = SUM(stake * (2p-1)) and every remaining term keeps its sign, so a
losing price stays losing and a winning one stays winning — the schedule only
decides how much money rides on it. The one thing it could genuinely do is
SELECT: if losses cluster, the signals it declines are worse than average and
the ones it takes are better, and then it is betting on a different p. That is
a claim about the data, so the script tests it three ways — the win rate of
bets placed against bets skipped, a conditional table of what follows a win
versus what follows a loss, and 2,000 shuffles of the same outcomes.

TWO PRICES, BOTH SHOWN

At 50c a win pays the stake and a loss costs it, which is the convention every
Plan B number in this project is quoted at, and break-even is 50%. The owner's
real terms are $1.57 on a $50 bet paying $90, where break-even is 57.30%. The
same schedule is run at both, because the schedule is not what decides.

    python stopgo.py [--days 365] [--after 1] [--stake 50] [--data F]

Default book is Plan B on Saturdays and Sundays — the one just measured.
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


class Price:
    """What one bet is worth, won or lost, under a given set of terms."""

    def __init__(self, name, stake, payout, fee):
        self.name, self.stake = name, stake
        self.win = payout - stake - fee
        self.loss = -(stake + fee)
        self.breakeven = -self.loss / (self.win - self.loss)


def scheme(wins, price, after=1, start_out=True):
    """
    Walk the outcomes with the schedule applied.

    `start_out=True` begins sidelined, because the cycle is defined as starting
    after a win and at the first signal there has not been one yet. The
    alternative is one cycle of noise away and is reported alongside.
    """
    out_state = start_out
    run = peak = dip = 0.0
    placed = won = skipped = 0
    streak = 0
    spells, spell = [], 0
    for w in wins:
        if out_state:
            skipped += 1
            spell += 1
            if w:
                out_state = False
                spells.append(spell)
                spell = 0
            continue
        placed += 1
        if w:
            run += price.win
            won += 1
            streak = 0
        else:
            run += price.loss
            streak += 1
            if streak >= after:
                out_state = True
                streak = 0
        peak = max(peak, run)
        dip = min(dip, run - peak)
    if spell:
        spells.append(spell)
    return {"pnl": run, "dip": dip, "placed": placed, "won": won,
            "skipped": skipped, "spells": spells,
            "rate": won / placed if placed else 0.0}


def flat_all(wins, price):
    w = sum(1 for x in wins if x)
    return w * price.win + (len(wins) - w) * price.loss


def conditional(wins):
    """What follows a win, one loss, two losses, three or more."""
    out = {"بعد از برد": [0, 0], "بعد از ۱ باخت": [0, 0],
           "بعد از ۲ باخت": [0, 0], "بعد از ۳+ باخت": [0, 0]}
    streak, started = 0, False
    for w in wins:
        if started:
            k = ("بعد از برد" if streak == 0 else
                 "بعد از ۱ باخت" if streak == 1 else
                 "بعد از ۲ باخت" if streak == 2 else "بعد از ۳+ باخت")
            out[k][1] += 1
            out[k][0] += 1 if w else 0
        started = True
        streak = 0 if w else streak + 1
    return out


def shuffle_test(wins, price, after, real, rng):
    seq = list(wins)
    vals = []
    for _ in range(SHUFFLES):
        rng.shuffle(seq)
        vals.append(scheme(seq, price, after)["pnl"])
    m = sum(vals) / len(vals)
    sd = (sum((v - m) ** 2 for v in vals) / (len(vals) - 1)) ** 0.5
    return m, sd, ((real - m) / sd if sd else 0.0)


def report(label, sigs, prices, after, rng):
    wins = [s["won"] for s in sigs]
    n = len(wins)
    w = sum(1 for x in wins if x)
    lo, hi = S.wilson(w, n)
    print("\n" + "=" * 84)
    print(f"  {label}")
    print("=" * 84)
    print(f"  {n:,} signals · {w:,} won · {n - w:,} lost · {w / n * 100:.2f}%"
          f"  [{lo * 100:.2f}–{hi * 100:.2f}]")

    r = scheme(wins, prices[0], after)
    alt = scheme(wins, prices[0], after, start_out=False)
    print(f"\n  bets placed        {r['placed']:,} of {n:,}"
          f"  ({r['placed'] / n * 100:.1f}%)   ·   watched, not bet"
          f"  {r['skipped']:,}")
    print(f"  win rate while betting   {r['won']:,}/{r['placed']:,}"
          f" = {r['rate'] * 100:.2f}%   (all signals {w / n * 100:.2f}%)")
    z = S.two_prop_z(r["won"], r["placed"], w - r["won"], n - r["placed"])
    print(f"  bet vs skipped           z = {z:+.2f}"
          f"   ({'a real split' if abs(z) >= 2 else 'inside chance'})")
    if r["spells"]:
        sp = sorted(r["spells"])
        print(f"  times sidelined          {len(sp):,}"
              f"   (median {sp[len(sp) // 2]}, longest {sp[-1]} signals)")

    print(f"\n  {'terms':<26}{'break-even':>12}{'this scheme':>14}"
          f"{'bet everything':>16}{'difference':>13}")
    for p in prices:
        sc = scheme(wins, p, after)
        fa = flat_all(wins, p)
        print(f"  {p.name:<26}{p.breakeven * 100:>11.2f}%"
              f"${sc['pnl']:>+13,.0f}${fa:>+15,.0f}${sc['pnl'] - fa:>+12,.0f}")
    print(f"\n  worst drawdown at {prices[0].name}: ${r['dip']:,.0f}"
          f"   ·   starting IN instead: ${alt['pnl']:+,.0f}")

    print(f"\n  --- do losses cluster? (if not, there is nothing to stop for)")
    for k, (a, b) in conditional(wins).items():
        if b >= 30:
            l2, h2 = S.wilson(a, b)
            print(f"  {k:<16}{a:>6,}/{b:<7,}{a / b * 100:>7.2f}%"
                  f"   [{l2 * 100:>5.2f}–{h2 * 100:<5.2f}]")

    m, sd, zz = shuffle_test(wins, prices[0], after, r["pnl"], rng)
    print(f"\n  --- shuffle control, {SHUFFLES:,} random orders")
    print(f"  real ${r['pnl']:+,.0f}   shuffled ${m:+,.0f} ± ${sd:,.0f}"
          f"   z = {zz:+.2f}"
          f"   {'-> outside chance' if abs(zz) >= 2 else '-> inside chance'}")
    return r


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    days = g("--days", 365)
    after = g("--after", 1)
    stake = g("--stake", 50.0)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    prices = [Price("۵۰-۵۰ (بدون کارمزد)", stake, stake * 2, 0.0),
              Price("واقعی: ۹۰$ و کارمزد", stake, stake * 1.8,
                    stake * 0.0314)]

    print(f"replaying {days} days from {data} …")
    closes = S.load_candles(data)
    ts = sorted(closes)
    cut = ts[-1] - days * 86400
    sigs = [s for s in S.replay(closes) if s["t"] >= cut]
    for s in sigs:
        s["d"] = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
    planb = [s for s in sigs if s["rules"] == PLANB]
    weekend = [s for s in planb if s["d"].weekday() in (5, 6)]
    seven = [s for s in sigs if s["rules"] != PLANB]

    print("=" * 84)
    print(f"  SCHEME: flat ${stake:,.0f} · stop after {after} loss"
          f"{'es' if after > 1 else ''} · wait for a win · start again")
    print("=" * 84)

    rng = random.Random(SEED)
    for label, sel in (("پلن بی — فقط شنبه و یکشنبه", weekend),
                       ("پلن بی — همهٔ هفته", planb),
                       ("هفت قانون ۱ تا ۷", seven)):
        if len(sel) >= 100:
            report(label, sel, prices, after, rng)

    print("\n" + "=" * 84)
    print("  Stopping after a loss removes bets; it does not improve the ones")
    print("  that remain unless losses actually cluster. The conditional table")
    print("  above is what decides that, and the shuffle says whether the")
    print("  order carried anything at all.")
    print("=" * 84)


if __name__ == "__main__":
    main()
