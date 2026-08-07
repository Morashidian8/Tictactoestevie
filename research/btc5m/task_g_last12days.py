"""
Day by day over the most recent twelve days, on the configuration being traded.

Two things about this file that must not be glossed over when the numbers are
read:

  * It is a RECONSTRUCTION from candles, not the bot's own record. The live log
    lives in `breakout_closes.json` on the phone and is not in this repository —
    an exhaustive search of the working tree, every branch and every git object
    ever written found no copy. So this says what the rules WOULD have produced,
    settled close-to-close. Where the live bot's own settlement disagreed, this
    cannot know it.
  * The candle data ends 2026-08-02. Exchange APIs are blocked here, so the
    last few days before today cannot be covered at all. The twelve days below
    are the twelve most recent COMPLETE Tehran days that exist in the data.

The ladder is simulated continuously across day boundaries, because that is how
it actually runs — a rung open at midnight is still open at 00:05. Each day is
then credited with the P&L of the signals that fell inside it, which is why a
day can show a loss larger than its own busts: it may be paying for a cycle that
started the night before.

Run:
    python3 research/btc5m/task_g_last12days.py
"""

import csv
import datetime
import gzip
import os

import engine as E

UTC = datetime.timezone.utc
TEHRAN = E.TEHRAN
HERE = os.path.dirname(os.path.abspath(__file__))
ONE_MIN = ("/tmp/claude-0/-home-user-Tictactoestevie/"
           "8ef0160f-4bcd-5870-bf9e-1bdc78f3e756/scratchpad/latest.csv")

BANKROLL = 2000.0
DAYS = 12


def extended_candles():
    """
    The frozen 5-minute set, extended with 5-minute bars built from 1-minute data.

    The overlap is checked rather than trusted: if the two sources disagree on a
    single close the stitch is wrong and everything downstream is worthless, so
    this raises instead of quietly returning a blended series.
    """
    base = E.load()
    if not os.path.exists(ONE_MIN):
        return base, None

    have = {r["t"] for r in base}
    frozen_close = {r["t"]: r["c"] for r in base}
    groups = {}
    with open(ONE_MIN) as f:
        for x in csv.DictReader(f):
            t = int(float(x["timestamp"]))
            groups.setdefault(t - t % 300, []).append(
                (t, float(x["open"]), float(x["high"]),
                 float(x["low"]), float(x["close"])))

    built, checked, bad = [], 0, 0
    for k in sorted(groups):
        g = sorted(groups[k])
        if len(g) != 5:            # an incomplete group is not a candle
            continue
        bar = {"t": k, "o": g[0][1], "h": max(x[2] for x in g),
               "l": min(x[3] for x in g), "c": g[-1][4]}
        if k in frozen_close:
            checked += 1
            if abs(bar["c"] - frozen_close[k]) > 0.01:
                bad += 1
            continue
        if k not in have:
            built.append(bar)
    if checked and bad:
        raise SystemExit(f"stitch rejected: {bad}/{checked} overlapping closes "
                         "disagree between the two sources")
    out = sorted(base + built, key=lambda r: r["t"])
    return out, {"checked": checked, "added": len(built)}


def bot_signals(candles):
    """The configuration actually being traded: rule 6, else the statistical pool."""
    cl = E.closes_of(candles)
    out = []
    for i in range(E.WARMUP, len(cl) - 1):
        w = cl[i + 1 - E.WARMUP:i + 1]
        s6 = E.rule6(w)
        if s6:
            side, which = s6["side"], "۶"
        else:
            fired = [(n, E.RULES[k](w)) for n, k in
                     (("۱", "rule1"), ("۲", "rule2"), ("۳", "rule3"), ("۵", "rule5"))]
            fired = [(n, s) for n, s in fired if s]
            if not fired:
                continue
            sides = {s["side"] for _, s in fired}
            if len(sides) != 1:
                continue
            side, which = sides.pop(), "،".join(n for n, _ in fired)
        nxt = cl[i + 1] - cl[i]
        if nxt == 0:
            continue
        out.append({"t": candles[i]["t"], "side": side, "rules": which,
                    "won": (side == "up") == (nxt > 0)})
    return out


def main():
    candles, stitch = extended_candles()
    last = candles[-1]["t"]
    print(f"candles: {len(candles):,}  through "
          f"{datetime.datetime.fromtimestamp(last, UTC):%Y-%m-%d %H:%M} UTC")
    if stitch:
        print(f"stitch : {stitch['checked']:,} overlapping bars agreed, "
              f"{stitch['added']:,} newer bars added from 1-minute data")

    sigs = bot_signals(candles)

    # Whole Tehran days only. A day is complete when the data reaches its end.
    def day_of(ts):
        return datetime.datetime.fromtimestamp(ts, TEHRAN).date()

    end_of_last_full = day_of(last - 86400)
    days = sorted({day_of(s["t"]) for s in sigs if day_of(s["t"]) <= end_of_last_full})
    days = days[-DAYS:]
    keep = set(days)

    # One continuous ladder, exactly as it runs.
    rung = 0
    per = {d: {"n": 0, "w": 0, "l": 0, "busts": 0, "pnl": 0.0,
               "streak": 0, "max_streak": 0} for d in days}
    streak = 0
    # The ladder runs over the whole history so its rung is warm when the window
    # opens, but the BALANCE has to start at the bankroll on the first kept day —
    # measuring it from the start of the dataset makes the low a number about
    # 2025, not about these twelve days.
    balance = BANKROLL
    lowest, lowest_day, lowest_at = BANKROLL, None, None
    for s in sigs:
        d = day_of(s["t"])
        stake = E.STAKE_BASE * 2 ** rung
        if s["won"]:
            delta, rung, streak = +stake, 0, 0
        else:
            delta, rung = -stake, rung + 1
            streak += 1
        bust = rung >= E.LADDER_RUNGS
        if bust:
            rung = 0
        if d in keep:
            balance += delta
            r = per[d]
            r["n"] += 1
            r["w" if s["won"] else "l"] += 1
            r["pnl"] += delta
            r["busts"] += bust
            r["max_streak"] = max(r["max_streak"], streak)
            if balance < lowest:
                lowest, lowest_day, lowest_at = balance, d, s["t"]

    print(f"\n{'='*100}")
    print("THE LAST 12 COMPLETE DAYS — reconstructed, $20 base, 3 rungs, "
          f"opening balance ${BANKROLL:,.0f}")
    print(f"{'='*100}")
    print(f"{'day (Tehran)':<14}{'sig':>5}{'W':>5}{'L':>5}{'acc':>8}"
          f"{'busts':>7}{'worst run':>11}{'P&L':>10}{'balance':>11}")
    print("-" * 100)
    run_bal = BANKROLL
    tot = {"n": 0, "w": 0, "l": 0, "busts": 0, "pnl": 0.0}
    for d in days:
        r = per[d]
        run_bal += r["pnl"]
        acc = r["w"] / r["n"] * 100 if r["n"] else float("nan")
        for k in tot:
            tot[k] += r[k]
        print(f"{d.isoformat():<14}{r['n']:>5}{r['w']:>5}{r['l']:>5}{acc:>7.1f}%"
              f"{r['busts']:>7}{r['max_streak']:>11}{r['pnl']:>+10,.0f}{run_bal:>11,.0f}")
    print("-" * 100)
    acc = tot["w"] / tot["n"] * 100 if tot["n"] else float("nan")
    lo, hi = E.wilson(tot["w"], tot["n"])
    print(f"{'TOTAL':<14}{tot['n']:>5}{tot['w']:>5}{tot['l']:>5}{acc:>7.1f}%"
          f"{tot['busts']:>7}{'':>11}{tot['pnl']:>+10,.0f}{run_bal:>11,.0f}")
    print(f"\n95% Wilson on the 12-day accuracy: [{lo:.2f}% – {hi:.2f}%]  "
          f"(half-width ±{(hi-lo)/2:.2f} points)")
    when = (f" on {datetime.datetime.fromtimestamp(lowest_at, TEHRAN):%Y-%m-%d %H:%M}"
            if lowest_at else "")
    print(f"lowest balance reached: ${lowest:,.0f}{when}   "
          f"(worst drop from $2,000: ${BANKROLL - lowest:,.0f})")
    print(f"profitable days: {sum(1 for d in days if per[d]['pnl'] > 0)}/{len(days)}   "
          f"days with at least one bust: {sum(1 for d in days if per[d]['busts'])}/{len(days)}")

    # The honest comparison: is this stretch unusual for this strategy?
    year = [s for s in sigs if s["t"] >= last - 365 * 86400]
    ys = E.simulate([(0, s["t"], s["side"], s["won"]) for s in year])
    print(f"\nfor scale, the same configuration over the trailing year: "
          f"n={ys['n']:,}  acc={ys['acc']:.2f}%  busts={ys['busts']:,}  "
          f"({ys['busts']/ys['n']*100:.2f} per 100 signals)")
    print(f"these 12 days: {tot['n']:,} signals, {acc:.2f}%, {tot['busts']} busts "
          f"({tot['busts']/tot['n']*100:.2f} per 100)")

    # Is the gap real, or is 806 signals simply too few to tell? Two-proportion
    # z-test of this stretch against the rest of the year, which is the only
    # question worth asking before changing anything because of it.
    rest_n = ys["n"] - tot["n"]
    rest_w = ys["wins"] - tot["w"]
    p1, p2 = tot["w"] / tot["n"], rest_w / rest_n
    pool_p = (tot["w"] + rest_w) / (tot["n"] + rest_n)
    se = (pool_p * (1 - pool_p) * (1 / tot["n"] + 1 / rest_n)) ** 0.5
    z = (p1 - p2) / se if se else float("nan")
    print(f"\nthis stretch vs the rest of the year: {p1*100:.2f}% vs {p2*100:.2f}%  "
          f"z={z:+.2f}  " + ("SIGNIFICANT at 95%" if abs(z) > 1.96
                             else "not significant — inside normal variance"))

    # And the same question asked non-parametrically: how does a 12-day stretch
    # normally look for this strategy?
    import random
    random.seed(20260807)
    n_win = tot["n"]
    pool_sigs = [(0, s["t"], s["side"], s["won"]) for s in year]
    accs, bsts, worse = [], [], 0
    for _ in range(1000):
        i = random.randrange(0, len(pool_sigs) - n_win)
        st = E.simulate(pool_sigs[i:i + n_win])
        accs.append(st["acc"])
        bsts.append(st["busts"])
        worse += st["acc"] <= acc
    accs.sort(); bsts.sort()
    print(f"1,000 random {n_win}-signal stretches from the year: "
          f"median acc {accs[500]:.2f}%  5th pct {accs[50]:.2f}%  "
          f"median busts {bsts[500]}")
    print(f"share of random stretches at least this bad: {worse/10:.1f}%")

    E.save({"days": days, "per": {d.isoformat(): per[d] for d in days},
            "total": tot, "wilson": (lo, hi), "lowest": lowest,
            "reconstructed": True, "data_through": last}, "task_g.pkl")


if __name__ == "__main__":
    main()
