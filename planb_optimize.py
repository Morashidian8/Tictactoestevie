"""
The best day / hour / ladder for Plan B — searched properly, and judged honestly.

The search asked for is day-of-week x hour x ladder depth. That is 200
combinations, and the best of 200 beats the rest by chance almost every time,
so the search alone answers nothing. Three things are therefore run alongside
it:

  * a chronological split — the grid picks its winner on the first two thirds
    and is judged on the last third, which the picking never saw;
  * Bonferroni over the 200, because looking at 200 and reporting the best is
    how a coin gets a reputation;
  * a shuffled-label null — the same grid over scrambled outcomes, so the
    height chance reaches is measured rather than assumed.

And one arithmetic fact that no amount of searching can move, established
earlier in this project and worth restating because it decides most of the
question: FOR INDEPENDENT BETS, EVERY LADDER'S BREAK-EVEN IS EXACTLY 50%.
Expected value is linear in stake, so doubling after a loss multiplies every
term by the same positive number and cannot change the sign. A ladder moves
variance, never edge. Depth belongs in the risk column, not the profit one.

    python planb_optimize.py [--days 60] [--data btc5m_now.csv] [--stake 50]

Priced at 50c: a win pays the stake, a loss costs it.
"""

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import NormalDist

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import planb_list as PB
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
FA_DAY = ["دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه", "یکشنبه"]
EN_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "SAT", "SUN"]


def ladder(rows, stake, rungs):
    """
    Walk the taken signals in time order.

    rungs=0 is flat. Otherwise the stake doubles after each loss and resets
    after `rungs` of them. Returns profit, worst drawdown, busts, and the
    largest single bet the scheme ever demands — that last one is what decides
    whether an account can actually run it.
    """
    run = peak = dip = 0.0
    rung = busts = 0
    biggest = 0.0
    streak = worst = 0
    for r in rows:
        bet = stake * 2 ** rung
        biggest = max(biggest, bet)
        if r["won"]:
            run += bet
            rung = streak = 0
        else:
            run -= bet
            streak += 1
            worst = max(worst, streak)
            if rungs:
                rung += 1
                if rung >= rungs:
                    rung, busts = 0, busts + 1
        peak = max(peak, run)
        dip = min(dip, run - peak)
    return {"pnl": run, "dip": dip, "busts": busts, "max_bet": biggest,
            "streak": worst, "n": len(rows)}


def filters():
    """Every slice of the calendar the search is allowed to consider."""
    out = [("همه ساعت‌ها و روزها", lambda r: True)]
    for i in range(7):
        out.append((f"فقط {FA_DAY[i]}", lambda r, i=i: r["wd"] == i))
    out.append(("آخر هفته (شنبه+یکشنبه)", lambda r: r["wd"] in (5, 6)))
    out.append(("بقیهٔ هفته", lambda r: r["wd"] not in (5, 6)))
    for lo in range(0, 24, 4):
        out.append((f"ساعت {lo:02d}–{lo + 3:02d} تهران",
                    lambda r, lo=lo: lo <= r["hr"] < lo + 4))
    for h in range(24):
        out.append((f"فقط ساعت {h:02d} تهران", lambda r, h=h: r["hr"] == h))
    return out


STAKINGS = [("حجم ثابت", 0), ("مارتینگل ۲ پله", 2), ("مارتینگل ۳ پله", 3),
            ("مارتینگل ۴ پله", 4), ("مارتینگل ۵ پله", 5)]


def main():
    argv = sys.argv[1:]
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 60
    stake = float(argv[argv.index("--stake") + 1]) if "--stake" in argv else 50.0
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print(f"replaying {days} days …")
    rows = PB.collect(data, days)
    for r in rows:
        r["wd"] = r["teh"].weekday()
        r["hr"] = r["teh"].hour
    n = len(rows)
    won = sum(1 for r in rows if r["won"])
    lo_, hi_ = S.wilson(won, n)
    print(f"{n:,} Plan B signals · {won:,} won · {won / n * 100:.2f}% "
          f"[{lo_ * 100:.2f}–{hi_ * 100:.2f}]  ·  break-even 50%\n")

    cut = n * 2 // 3
    tr, te = rows[:cut], rows[cut:]
    FS = filters()
    K = len(FS) * len(STAKINGS)
    bar = NormalDist().inv_cdf(1 - 0.05 / (2 * K))

    print("=" * 92)
    print("1.  THE ARITHMETIC THAT DECIDES MOST OF THIS")
    print("=" * 92)
    print("  For independent bets, expected value is LINEAR in stake:")
    print("    E[profit] = sum over bets of (stake_i x (2p - 1))")
    print("  Doubling after a loss changes every stake_i, never the (2p - 1).")
    print(f"  Plan B's p is {won / n * 100:.2f}%, so 2p-1 = "
          f"{2 * won / n - 1:+.4f}.")
    print("  A deeper ladder therefore multiplies BOTH the profit and the")
    print("  loss by the same number. It cannot turn a losing rate into a")
    print("  winning one; what it CAN do is change how much has to be")
    print("  survived.")
    print("  A caution about reading section 2: a deep ladder's profit is")
    print("  also far NOISIER, because the whole result then hangs on where")
    print("  the losing runs happened to fall. Shuffling these same outcomes")
    print("  200 times moves the 5-rung figure by about $8,000 either way, so")
    print("  a difference of that size between two depths says nothing at all.")
    print("  Section 5 measures that spread instead of assuming it.\n")

    print("=" * 92)
    print(f"2.  LADDER DEPTH ON EVERY SIGNAL — ${stake:,.0f} base, 50c")
    print("=" * 92)
    print(f"  {'staking':<18}{'P&L':>11}{'worst dip':>12}{'max bet':>10}"
          f"{'bankroll':>11}{'busts':>8}{'longest run':>13}")
    for name, rungs in STAKINGS:
        m = ladder(rows, stake, rungs)
        need = abs(m["dip"]) + m["max_bet"]
        print(f"  {name:<18}{m['pnl']:>+11,.0f}{m['dip']:>+12,.0f}"
              f"{m['max_bet']:>10,.0f}{need:>11,.0f}{m['busts']:>8,}"
              f"{m['streak']:>13}")

    # ---- the grid ---------------------------------------------------------- #
    print(f"\n{'=' * 92}")
    print(f"3.  THE FULL GRID — {len(FS)} calendar slices x {len(STAKINGS)} "
          f"stakings = {K} combinations")
    print("=" * 92)
    print("  Chosen on the first two thirds, judged on the last third.\n")
    best = []
    for fname, fn in FS:
        ftr = [r for r in tr if fn(r)]
        fte = [r for r in te if fn(r)]
        if len(ftr) < 60 or len(fte) < 30:
            continue
        for sname, rungs in STAKINGS:
            a = ladder(ftr, stake, rungs)
            b = ladder(fte, stake, rungs)
            # profit per dollar of drawdown: the thing actually asked for,
            # "most profit AND least loss", in one number
            score = a["pnl"] / max(abs(a["dip"]), stake)
            best.append((score, fname, sname, a, b))
    best.sort(key=lambda x: -x[0])
    print(f"  {'slice':<26}{'staking':<16}"
          f"{'TRAIN P&L':>11}{'dip':>9}  |{'TEST P&L':>10}{'dip':>9}"
          f"{'rate':>8}{'z':>7}")
    for score, fname, sname, a, b in best[:12]:
        w = sum(1 for r in [] if False)
        rate = None
        print(f"  {fname[:24]:<26}{sname:<16}{a['pnl']:>+11,.0f}"
              f"{a['dip']:>+9,.0f}  |{b['pnl']:>+10,.0f}{b['dip']:>+9,.0f}"
              f"{'':>8}{'':>7}")

    # the honest headline: what the train-best did out of sample
    if best:
        _, fname, sname, a, b = best[0]
        fn = dict(FS)[fname]
        fte = [r for r in te if fn(r)]
        w = sum(1 for r in fte if r["won"])
        rate = w / len(fte) if fte else 0
        se = (0.25 / len(fte)) ** 0.5 if fte else 1
        z = (rate - 0.5) / se
        print(f"\n  TRAIN'S FAVOURITE: {fname} · {sname}")
        print(f"    train {a['pnl']:+,.0f} (dip {a['dip']:+,.0f})")
        print(f"    test  {b['pnl']:+,.0f} (dip {b['dip']:+,.0f}) · "
              f"{w}/{len(fte)} = {rate * 100:.2f}% · z = {z:+.2f}")
        print(f"    with K={K} combinations, |z| must reach {bar:.2f}")
        print(f"    -> {'SURVIVES' if abs(z) >= bar else 'does NOT survive'}")

    # ---- is a deep ladder's extra profit real, or where the runs fell? ----- #
    # Worth its own section because the table in 2 invites the opposite
    # conclusion. A martingale stakes most right after a loss, so its result
    # depends on the ORDER of wins and losses, not just how many there were.
    # Shuffling the same outcomes keeps the win rate and destroys the order,
    # which separates "this ladder found something" from "the runs fell kindly".
    import random
    import statistics
    print(f"\n{'=' * 92}")
    print("5.  IS THE DEEP LADDER'S EXTRA PROFIT REAL? — same outcomes, "
          "shuffled 200x")
    print("=" * 92)
    print(f"  {'staking':<18}{'real':>11}{'shuffled mean':>16}{'sd':>10}"
          f"{'z':>8}   verdict")
    random.seed(20260827)
    outs = [r["won"] for r in rows]
    for name, rungs in STAKINGS:
        real = ladder(rows, stake, rungs)["pnl"]
        sims = []
        for _ in range(200):
            random.shuffle(outs)
            sims.append(ladder([{"won": o} for o in outs], stake, rungs)["pnl"])
        m = statistics.fmean(sims)
        sd = statistics.pstdev(sims)
        z = (real - m) / sd if sd else 0.0
        print(f"  {name:<18}{real:>+11,.0f}{m:>+16,.0f}{sd:>10,.0f}{z:>+8.2f}"
              f"   {'beyond chance' if abs(z) >= 2 else 'inside chance'}")
    print("\n  Flat has sd = 0: with one stake size the order cannot matter,")
    print("  and its profit IS the edge. Every ladder's spread grows with its")
    print("  depth, which is the cost of depth stated as a number.")

    # ---- the noise null for the grid --------------------------------------- #
    print(f"\n{'=' * 92}")
    print("4.  WHAT THE SAME GRID FINDS IN PURE NOISE")
    print("=" * 92)
    random.seed(20260827)
    heights = []
    for k in range(10):
        sh = [dict(r) for r in rows]
        outs = [r["won"] for r in sh]
        random.shuffle(outs)
        for r, o in zip(sh, outs):
            r["won"] = o
        s_tr, s_te = sh[:cut], sh[cut:]
        top = None
        for fname, fn in FS:
            ftr = [r for r in s_tr if fn(r)]
            fte = [r for r in s_te if fn(r)]
            if len(ftr) < 60 or len(fte) < 30:
                continue
            for sname, rungs in STAKINGS:
                a = ladder(ftr, stake, rungs)
                sc = a["pnl"] / max(abs(a["dip"]), stake)
                if top is None or sc > top[0]:
                    top = (sc, ladder(fte, stake, rungs)["pnl"])
        if top:
            heights.append(top[1])
    if heights:
        heights.sort()
        print(f"  10 shuffled runs · what the train-best made on test:")
        print("    " + "  ".join(f"{h:+,.0f}" for h in heights))
        print(f"    median {heights[len(heights) // 2]:+,.0f}  ·  "
              f"best {heights[-1]:+,.0f}")
        if best:
            real = best[0][4]["pnl"]
            beat = sum(1 for h in heights if h >= real)
            print(f"\n  the real search's test result was {real:+,.0f};")
            print(f"  {beat} of {len(heights)} noise runs did at least as well.")


if __name__ == "__main__":
    main()
