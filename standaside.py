"""
The stand-aside ladder: martingale once, then get out of the way.

The owner's scheme, stated exactly:

    "با هر سیگنال که برد باهاش با مبلغ پایه ادامه می‌دهیم، در صورت باخت سیگنال
     بعدی مارتینگل می‌کنم و اگر برد مجدد با حجم پایه ادامه می‌دهم، و اگر باخت
     ادامه نمی‌دهم تا مجدد یک سیگنال ببرد، و از بعدِ سیگنالِ برد مجددا این کار
     را تکرار می‌کنم. با پایهٔ ۵۰ دلار."

As a state machine, which is how it is implemented below:

    BASE    bet 1x.  win -> BASE.  lose -> DOUBLE.
    DOUBLE  bet 2x.  win -> BASE.  lose -> OUT.
    OUT     bet nothing. Watch signals go by. The first one that WOULD have
            won puts us back in BASE — starting with the signal after it.

So the ladder is capped at two rungs, $50 then $100, and the third loss in a
row is never paid for. That cap is the whole idea, and it is worth being
precise about what it can and cannot do.

WHAT IT CANNOT DO. It cannot change the sign of the expected value. For
independent bets, E = SUM(stake_i * (2p - 1)); every stake is positive, so the
sum takes the sign of (2p - 1) no matter how the stakes are chosen. Skipping
bets removes terms from that sum, and doubling multiplies one, but neither
flips it. Break-even stays exactly 50%. This is arithmetic, not an opinion
about the market, and it is the same fact recorded in planb_optimize.py.

WHAT IT COULD DO, and what this script is actually testing: the stand-aside is
not a staking rule, it is a FILTER. It refuses to bet after two losses in a
row, and it only comes back after seeing a win. If losses cluster — if a bad
run really does tend to continue — then the bets it declines are worse than
average, the bets it places are better than average, and 2p-1 is measured on a
different, better p. That is a testable claim about the data and not about
arithmetic, so the script tests it three ways:

  1.  the win rate of the bets PLACED versus every signal (does the filter
      select?);
  2.  the same scheme run at FLAT stake (does the doubling add anything the
      filter did not?);
  3.  a SHUFFLE control — the identical outcomes in a random order, 2,000
      times. Order is the only thing the scheme can exploit, so if the real
      run is not out at the edge of the shuffled distribution, what was found
      was a lucky arrangement rather than a rule.

    python standaside.py [--days 60] [--stake 50] [--data btc5m_now.csv]

Grading is close-to-close, the market's own convention, and every entry is
priced at 50c per the standing instruction.
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


# --------------------------------------------------------------------------- #
#  the state machine
# --------------------------------------------------------------------------- #
def stand_aside(wins, stake=50.0, flat=False, start_out=True):
    """
    Run the owner's scheme over a sequence of True/False outcomes.

    `flat=True` keeps the identical skip pattern but never doubles, which is
    how the filter is separated from the sizing. `start_out=True` begins in
    the OUT state, because the cycle is defined as beginning after a win and
    at the first signal there has not been one yet; the alternative is
    reported too, since the difference is one cycle's worth of noise.
    """
    state = "out" if start_out else "base"
    run = peak = dip = 0.0
    placed = won = skipped = 0
    biggest = staked = 0.0
    curve = []
    out_spells, spell = [], 0

    for w in wins:
        if state == "out":
            skipped += 1
            spell += 1
            if w:                        # the observed win that lets us back in
                state = "base"
                out_spells.append(spell)
                spell = 0
            curve.append(run)
            continue

        bet = stake if (flat or state == "base") else stake * 2
        biggest = max(biggest, bet)
        staked += bet
        placed += 1
        if w:
            run += bet
            won += 1
            state = "base"
        else:
            run -= bet
            state = "double" if state == "base" else "out"
        peak = max(peak, run)
        dip = min(dip, run - peak)
        curve.append(run)

    if spell:
        out_spells.append(spell)         # still sidelined when the data ended
    return {
        "pnl": run, "dip": dip, "placed": placed, "won": won,
        "skipped": skipped, "max_bet": biggest, "curve": curve,
        "rate": won / placed * 100 if placed else 0.0,
        "spells": out_spells, "staked": staked,
        "roi": run / staked * 100 if staked else 0.0,
    }


def ladder(wins, stake=50.0, rungs=0):
    """The always-betting comparison: flat when rungs=0, else a plain ladder."""
    run = peak = dip = 0.0
    rung = busts = 0
    biggest = staked = 0.0
    for w in wins:
        bet = stake * 2 ** rung
        biggest = max(biggest, bet)
        staked += bet
        if w:
            run += bet
            rung = 0
        else:
            run -= bet
            if rungs:
                rung += 1
                if rung >= rungs:
                    rung, busts = 0, busts + 1
        peak = max(peak, run)
        dip = min(dip, run - peak)
    return {"pnl": run, "dip": dip, "busts": busts, "max_bet": biggest,
            "placed": len(wins), "staked": staked,
            "roi": run / staked * 100 if staked else 0.0}


# --------------------------------------------------------------------------- #
#  does the filter select? — the honest version of the question
# --------------------------------------------------------------------------- #
def conditional_table(wins):
    """
    What happens after a loss, after two losses, after a win. If losses really
    cluster, the rate after two losses is below the rate after a win, and the
    stand-aside is picking up something real. If the three numbers are the
    same, the sequence is memoryless and the scheme is a variance choice.
    """
    out = {"after win": [0, 0], "after 1 loss": [0, 0], "after 2 losses": [0, 0],
           "after 3+ losses": [0, 0]}
    streak = 0                 # losses immediately before the current signal
    started = False            # the first signal has no predecessor to condition on
    for w in wins:
        if started:
            k = ("after win" if streak == 0 else
                 "after 1 loss" if streak == 1 else
                 "after 2 losses" if streak == 2 else "after 3+ losses")
            out[k][1] += 1
            out[k][0] += 1 if w else 0
        started = True
        streak = 0 if w else streak + 1
    return out


def shuffle_test(wins, stake, real, rng):
    """Same outcomes, order destroyed. The only thing the scheme reads is order."""
    seq = list(wins)
    pnls = []
    for _ in range(SHUFFLES):
        rng.shuffle(seq)
        pnls.append(stand_aside(seq, stake)["pnl"])
    m = sum(pnls) / len(pnls)
    sd = (sum((p - m) ** 2 for p in pnls) / (len(pnls) - 1)) ** 0.5
    beat = sum(1 for p in pnls if p < real)
    return m, sd, (real - m) / sd if sd else 0.0, beat / len(pnls) * 100


# --------------------------------------------------------------------------- #
def report(name, sigs, stake, rng):
    wins = [s["won"] for s in sigs]
    n = len(wins)
    w = sum(wins)
    lo, hi = S.wilson(w, n)
    first = datetime.fromtimestamp(sigs[0]["t"] + GRAN, TEHRAN)
    last = datetime.fromtimestamp(sigs[-1]["t"] + GRAN, TEHRAN)

    print("\n" + "=" * 78)
    print(f"  {name}")
    print("=" * 78)
    print(f"  {n:,} signals   {first:%Y-%m-%d} -> {last:%Y-%m-%d} (Tehran)")
    print(f"  {w:,} won · {n - w:,} lost · {w / n * 100:.2f}%  "
          f"[{lo * 100:.2f}–{hi * 100:.2f}]   break-even 50%")

    r = stand_aside(wins, stake)
    alt = stand_aside(wins, stake, start_out=False)
    fl = stand_aside(wins, stake, flat=True)

    print(f"\n  --- the scheme, ${stake:,.0f} base " + "-" * 40)
    print(f"  profit / loss                  ${r['pnl']:+,.0f}")
    print(f"  bets actually placed           {r['placed']:,} of {n:,} signals"
          f"  ({r['placed'] / n * 100:.1f}%)")
    print(f"  won while betting              {r['won']:,}/{r['placed']:,}"
          f" = {r['rate']:.2f}%")
    print(f"  signals watched, not bet       {r['skipped']:,}")
    print(f"  biggest single bet             ${r['max_bet']:,.0f}")
    print(f"  total money staked             ${r['staked']:,.0f}")
    print(f"  return per dollar staked       {r['roi']:+.2f}%"
          f"   <- the number that compares fairly")
    print(f"  worst drawdown                 ${r['dip']:,.0f}")
    print(f"  bankroll needed                ${max(150.0, -r['dip']) + 150:,.0f}"
          f"   (worst dip + one full cycle)")
    if r["spells"]:
        sp = r["spells"]
        print(f"  times sidelined                {len(sp):,}"
              f"   (median {sorted(sp)[len(sp) // 2]}, longest {max(sp)} signals)")
    print(f"  same scheme, no doubling       ${fl['pnl']:+,.0f}"
          f"   <- the filter alone")
    print(f"  starting in BASE instead        ${alt['pnl']:+,.0f}"
          f"   (one cycle of noise apart)")

    # Compared on P&L alone a scheme that stakes more money looks better for
    # no reason but staking more money. Return per dollar staked is the column
    # that holds still, and it is where the schemes stop differing.
    print(f"\n  --- against the alternatives " + "-" * 39)
    print(f"  {'staking':<24}{'P&L':>11}{'staked':>12}{'ROI':>8}"
          f"{'worst dip':>11}{'max bet':>9}{'busts':>7}")
    rows = [("این طرح (stand-aside)", r), ("همین طرح بدون مارتینگل", fl),
            ("حجم ثابت (flat)", ladder(wins, stake, 0))]
    rows += [(f"مارتینگل {k} پله", ladder(wins, stake, k)) for k in (2, 3, 4, 5)]
    for lbl, d in rows:
        print(f"  {lbl:<24}${d['pnl']:>+10,.0f}${d['staked']:>11,.0f}"
              f"{d['roi']:>+7.2f}%${d['dip']:>10,.0f}${d['max_bet']:>8,.0f}"
              f"{d.get('busts', '—'):>7}")

    # ---- does the filter actually select better bets? ---------------------- #
    print(f"\n  --- what the filter is betting on " + "-" * 34)
    print(f"  every signal                   {w:,}/{n:,} = {w / n * 100:.2f}%")
    print(f"  the ones the scheme bets       {r['won']:,}/{r['placed']:,}"
          f" = {r['rate']:.2f}%")
    z = S.two_prop_z(r["won"], r["placed"], w - r["won"], n - r["placed"])
    print(f"  bet vs skipped                 z = {z:+.2f}"
          f"   ({'a real split' if abs(z) >= 2 else 'inside chance'})")

    print(f"\n  --- do losses cluster? " + "-" * 45)
    for k, (a, b) in conditional_table(wins).items():
        if b >= 30:
            l2, h2 = S.wilson(a, b)
            print(f"  {k:<18}{a:>6,}/{b:<7,}{a / b * 100:>7.2f}%"
                  f"   [{l2 * 100:>5.2f}–{h2 * 100:<5.2f}]")
    print("  (the scheme stops after two losses — if that row is not clearly")
    print("   below the others, there was nothing to stop for.)")

    # ---- the control -------------------------------------------------------- #
    m, sd, zz, pct = shuffle_test(wins, stake, r["pnl"], rng)
    print(f"\n  --- shuffle control, {SHUFFLES:,} random orders " + "-" * 24)
    print(f"  real run                       ${r['pnl']:+,.0f}")
    print(f"  shuffled average               ${m:+,.0f}  ±  ${sd:,.0f}")
    print(f"  the real order scores          z = {zz:+.2f}"
          f"   (beats {pct:.1f}% of shuffles)")
    if abs(zz) < 2:
        print("  -> inside chance. The order of these wins and losses carries")
        print("     no information the scheme can trade on.")
    else:
        print("  -> outside chance. Worth a second look before believing it.")
    return r


def main():
    argv = sys.argv[1:]
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 60
    stake = float(argv[argv.index("--stake") + 1]) if "--stake" in argv else 50.0
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

    planb = [s for s in sigs if s["rules"] == PLANB]
    main_book = [s for s in sigs if s["rules"] != PLANB]

    rng = random.Random(SEED)
    books = [("پلن بی — rule 8 alone", planb),
             ("the main book — rules 1-7", main_book),
             ("both books together, in time order", sigs)]
    results = []
    for name, sel in books:
        if len(sel) < 50:
            continue
        results.append((name, report(name, sel, stake, rng)))

    print("\n" + "=" * 78)
    print("  SUMMARY")
    print("=" * 78)
    for name, r in results:
        print(f"  {name:<40}${r['pnl']:>+10,.0f}"
              f"   {r['placed']:>5,} bets   dip ${r['dip']:>+9,.0f}")
    print("\n  Break-even is 50% for every one of these schemes. Skipping bets")
    print("  and doubling bets both change how the money arrives; neither can")
    print("  change whether there is any to arrive.")


if __name__ == "__main__":
    main()
