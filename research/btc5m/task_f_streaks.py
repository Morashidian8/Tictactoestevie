"""
The consecutive-loss anatomy of every strategy, over the last year.

The question this answers is the one that actually decides whether a martingale
is survivable: when you take a position on EVERY signal, how do the losses
arrive? A 54% strategy whose losses are spread evenly is a different instrument
from a 54% strategy whose losses arrive in clumps of eight, even though both
report the same accuracy.

Three things are measured that the accuracy number cannot tell you:

  * the run-length distribution — what share of losing runs are singles, pairs,
    triples, and so on, and what share of the year's LOSSES sit inside the long
    runs (a small number of long runs can hold a large share of the damage);
  * the same distribution predicted by a coin with the same win rate, so that
    "the losses are clustered" stops being a feeling and becomes a measurement.
    Independent losses give geometric run lengths: P(run = k) = q^(k-1)·p;
  * how long you wait between the runs that hurt, and how much of the year you
    spend inside one.

Run:
    python3 research/btc5m/task_f_streaks.py
"""

import datetime
import math
import os

import engine as E

UTC = datetime.timezone.utc
TEHRAN = E.TEHRAN
HERE = os.path.dirname(os.path.abspath(__file__))


def bot_signals(candles):
    """
    The configuration actually being traded: rule 6, else the statistical pool.

    `golden` is omitted from the chain deliberately — it is a strict subset of
    the pool and always agrees with it, so including it produces a byte-identical
    signal list. Leaving it in would imply it does something.
    """
    cl = E.closes_of(candles)
    out = []
    for i in range(E.WARMUP, len(cl) - 1):
        w = cl[i + 1 - E.WARMUP:i + 1]
        s6 = E.rule6(w)
        if s6:
            side = s6["side"]
        else:
            fired = [E.RULES[k](w) for k in ("rule1", "rule2", "rule3", "rule5")]
            fired = [x for x in fired if x]
            if not fired:
                continue
            sides = {x["side"] for x in fired}
            if len(sides) != 1:
                continue
            side = sides.pop()
        nxt = cl[i + 1] - cl[i]
        if nxt == 0:
            continue
        out.append((i, candles[i]["t"], side, (side == "up") == (nxt > 0)))
    return out


def runs_of(signals):
    """Every maximal consecutive-loss run as (length, start_ts, end_ts)."""
    out, cur, start = [], 0, None
    for s in signals:
        if s[3]:
            if cur:
                out.append((cur, start, prev_ts))
            cur, start = 0, None
        else:
            if not cur:
                start = s[1]
            cur += 1
            prev_ts = s[1]
    if cur:
        out.append((cur, start, prev_ts))
    return out


def anatomy(signals, label):
    """The full run-length picture for one strategy."""
    n = len(signals)
    losses = sum(1 for s in signals if not s[3])
    q = losses / n
    p = 1 - q
    rs = runs_of(signals)
    total_runs = len(rs)
    hist = {}
    for L, _, _ in rs:
        hist[L] = hist.get(L, 0) + 1
    return {
        "label": label, "n": n, "losses": losses, "q": q, "p": p,
        "runs": rs, "total_runs": total_runs, "hist": hist,
        "max": max(hist) if hist else 0,
    }


def table(a, top=12):
    """Run-length distribution against the independent-loss prediction."""
    lines = []
    lines.append(f"\n{'='*104}\n{a['label']}   "
                 f"n={a['n']:,}  losses={a['losses']:,}  loss rate={a['q']*100:.2f}%  "
                 f"runs={a['total_runs']:,}  longest={a['max']}")
    lines.append(f"{'run':>4} {'count':>7} {'% of runs':>10} {'% of losses':>12} "
                 f"{'expected':>9} {'obs/exp':>8} {'busts made':>11} {'cumulative % of runs':>21}")
    lines.append("-" * 104)
    cum = 0.0
    shown = sorted(a["hist"])
    for L in shown:
        cnt = a["hist"][L]
        share = cnt / a["total_runs"] * 100
        cum += share
        loss_share = cnt * L / a["losses"] * 100
        # Independent losses => geometric run lengths.
        exp = a["total_runs"] * (a["q"] ** (L - 1)) * a["p"]
        ratio = cnt / exp if exp > 0 else float("nan")
        busts = cnt * (L // 3)
        if L <= top or cnt:
            lines.append(f"{L:>4} {cnt:>7,} {share:>9.2f}% {loss_share:>11.2f}% "
                         f"{exp:>9.1f} {ratio:>8.2f} {busts:>11,} {cum:>20.2f}%")
    return "\n".join(lines)


def tail(a, days=365):
    """How often the painful runs arrive, and how long the gaps are."""
    lines = []
    lines.append(f"\n{'threshold':>10} {'count/yr':>9} {'every':>12} "
                 f"{'% of runs':>10} {'% of losses':>12} {'expected/yr':>12}")
    lines.append("-" * 72)
    for k in (3, 4, 5, 6, 7, 8, 9, 10):
        rs = [r for r in a["runs"] if r[0] >= k]
        cnt = len(rs)
        loss_share = sum(r[0] for r in rs) / a["losses"] * 100
        exp = a["total_runs"] * (a["q"] ** (k - 1))
        every = f"{days/cnt:.1f} days" if cnt else "—"
        lines.append(f"{'>= '+str(k):>10} {cnt:>9,} {every:>12} "
                     f"{cnt/a['total_runs']*100:>9.2f}% {loss_share:>11.2f}% {exp:>12.1f}")
    return "\n".join(lines)


def worst(a, k=10):
    """The longest runs of the year, with dates, so they stop being abstract."""
    rs = sorted(a["runs"], key=lambda r: -r[0])[:k]
    lines = [f"\n{'len':>4} {'started (Tehran)':>20} {'ended (Tehran)':>20} {'span':>10} {'cost at $20 base':>18}"]
    lines.append("-" * 78)
    for L, s, e in rs:
        span = (e - s) / 60
        # A run of length L on a 3-rung ladder: L//3 busts plus the open rungs.
        cost = (L // 3) * 140 + (20 * (2 ** (L % 3) - 1))
        lines.append(f"{L:>4} {datetime.datetime.fromtimestamp(s, TEHRAN):%Y-%m-%d %H:%M} "
                     f"  {datetime.datetime.fromtimestamp(e, TEHRAN):%Y-%m-%d %H:%M} "
                     f"  {span:>7.0f}m {'-$'+format(cost, ',d'):>18}")
    return "\n".join(lines)


def main():
    candles = E.last_year(E.load())
    print(f"last year: {len(candles):,} candles  "
          f"{datetime.datetime.fromtimestamp(candles[0]['t'], UTC):%Y-%m-%d} .. "
          f"{datetime.datetime.fromtimestamp(candles[-1]['t'], UTC):%Y-%m-%d}")

    results = {}
    bot = bot_signals(candles)
    results["bot"] = anatomy(bot, "THE BOT AS TRADED TODAY (rule 6, else the statistical pool)")

    for name in ("rule1", "rule2", "rule3", "rule4", "rule5", "rule6", "rule7", "golden"):
        results[name] = anatomy(E.run_rule(name, candles), name)

    # --- headline: the configuration actually being traded
    a = results["bot"]
    print(table(a))
    print(tail(a))
    print(worst(a))

    # --- bust arithmetic, derived from the run lengths rather than re-counted
    st = E.simulate(bot)
    made = sum(cnt * (L // 3) for L, cnt in a["hist"].items())
    print(f"\nbusts implied by the run lengths: {made:,}   "
          f"busts counted by the ladder: {st['busts']:,}   "
          f"{'agree' if made == st['busts'] else 'MISMATCH'}")

    # --- every strategy, side by side
    print(f"\n\n{'='*104}\nRUN-LENGTH SHARE BY STRATEGY (% of that strategy's losing runs)")
    cols = [1, 2, 3, 4, 5, 6, 7, 8]
    head = "".join(f"{c:>7}" for c in cols)
    print(f"{'strategy':<10}{'runs':>7}{'longest':>9}{head}{'>=6':>8}{'>=7':>8}")
    print("-" * 104)
    order = ["bot", "rule1", "rule2", "rule3", "rule4", "rule5", "rule6", "rule7", "golden"]
    for k in order:
        x = results[k]
        row = "".join(f"{x['hist'].get(c, 0)/x['total_runs']*100:>6.1f}%" for c in cols)
        ge6 = sum(v for L, v in x["hist"].items() if L >= 6)
        ge7 = sum(v for L, v in x["hist"].items() if L >= 7)
        print(f"{x['label'][:10] if k=='bot' else k:<10}{x['total_runs']:>7,}{x['max']:>9}{row}"
              f"{ge6:>8,}{ge7:>8,}")

    # --- clustering test: are the losses independent?
    print(f"\n\n{'='*104}\nARE THE LOSSES CLUSTERED?  observed / expected under independent losses")
    print(f"{'strategy':<10}{'loss rate':>10}" + "".join(f"{'run '+str(c):>9}" for c in (3, 5, 6, 7, 8)))
    print("-" * 104)
    for k in order:
        x = results[k]
        cells = ""
        for c in (3, 5, 6, 7, 8):
            obs = sum(v for L, v in x["hist"].items() if L >= c)
            exp = x["total_runs"] * (x["q"] ** (c - 1))
            cells += f"{obs/exp:>9.2f}" if exp > 0 else f"{'—':>9}"
        print(f"{k:<10}{x['q']*100:>9.2f}%{cells}")
    print("\n1.00 = exactly what a coin with that loss rate produces. Above 1 means the")
    print("losses arrive in clumps; below 1 means they are more spread out than chance.")

    E.save(results, "task_f.pkl")


if __name__ == "__main__":
    main()
