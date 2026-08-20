"""
When do the losing streaks come, and can they be seen coming?

The rules are fade rules: they bet against the recent move. That is fine in a
market that keeps pulling back, and it is ruinous in a market that goes one way
and does not stop. Worse, the rules get LOUDER as such a move extends — rule 3
wants a long run, the golden tier wants an extreme stretch, and a real trend
supplies more of both with every candle. So a one-way pump does not merely
produce losses, it produces the system's most confident losses.

The user's observation, which is what this measures: right before such a run,
candle size jumps well above the previous few hours.

Everything here is computed from CLOSES ONLY and from candles STRICTLY BEFORE
the bet, because the live monitor keeps closes only and a filter that needs
anything else could not be implemented.

Two features carry the idea:

  expansion  median |move| over the last 12 candles, divided by the same over
             the last 100. "Are the candles suddenly bigger than they were?"
  efficiency |net move over the last N| / sum of |moves| over the last N.
             1.0 is a straight line with no pullback; 0 is pure chop. This is
             the "one-way, never came back" that a fade rule cannot survive.

    python streak_guard.py [--data btc5m_fresh.csv] [--days 0]

--days 0 uses the whole archive. Judgement is on a held-out chronological
third; nothing here is selected and scored on the same data.
"""

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
import same_dir as S

GRAN = 300
TEHRAN = timezone(timedelta(hours=3, minutes=30))
STAKE = 20.0                 # priced at 50c: a win pays it, a loss costs it


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def features(closes, ts, i):
    """
    What was knowable at the close of candle ts[i], the moment the signal fired.

    Nothing here reads ts[i+1]. The window is the 101 closes ending at ts[i],
    which is what the monitor already holds.
    """
    win = [closes[x] for x in ts[i - 100:i + 1]]
    mv = [b - a for a, b in zip(win, win[1:])]
    if len(mv) < 100:
        return None
    m100 = median([abs(x) for x in mv])
    if m100 <= 0:
        return None
    m12 = median([abs(x) for x in mv[-12:]])
    out = {"expansion": m12 / m100}
    for n in (6, 12, 24):
        path = sum(abs(x) for x in mv[-n:])
        out[f"er{n}"] = abs(sum(mv[-n:])) / path if path > 0 else 0.0
    run = 1
    for a, b in zip(reversed(mv), list(reversed(mv))[1:]):
        if (a > 0) == (b > 0):
            run += 1
        else:
            break
    out["run"] = run
    out["body"] = abs(mv[-1]) / m100
    return out


def collect(closes, days):
    ts = sorted(closes)
    need = S.bot.BREAKOUT_FULL_HISTORY + S.bot.RULE8_MA
    cut = ts[-1] - days * 86400 if days else 0
    out = []
    for i in range(max(need, 101) + 1, len(ts) - 1):
        t = ts[i]
        if t < cut:
            continue
        if ts[i - need] != t - need * GRAN or ts[i + 1] != t + GRAN:
            continue
        hits = S.bot.BreakoutMonitor.evaluate(
            [closes[x] for x in ts[i - need:i + 1]])
        if not hits:
            continue
        bets = {h[2] for h in hits}
        if len(bets) != 1:
            continue
        bet = bets.pop()
        nxt = closes[t + GRAN] - closes[t]
        if nxt == 0:
            continue
        f = features(closes, ts, i)
        if f is None:
            continue
        f.update({"t": t, "bet": bet, "won": (bet == "up") == (nxt > 0),
                  "rules": [h[0] for h in hits],
                  "golden": any(h[0].startswith("🏆") for h in hits)})
        out.append(f)
    return out


def rate(sel):
    if not sel:
        return 0, 0, 0.0
    w = sum(1 for s in sel if s["won"])
    return w, len(sel), w / len(sel) * 100


def longest_streak(sel):
    best = cur = 0
    for s in sel:
        cur = 0 if s["won"] else cur + 1
        best = max(best, cur)
    return best


def buckets(sigs, key, edges, label):
    print(f"\n  {label}")
    print(f"  {'bucket':<18}{'n':>8}{'won':>8}{'rate':>9}{'95% CI':>18}")
    prev = None
    for e in edges + [float("inf")]:
        sel = [s for s in sigs if (prev is None or s[key] >= prev) and s[key] < e]
        w, n, r = rate(sel)
        if n < 50:
            prev = e
            continue
        lo, hi = S.wilson(w, n)
        name = f"{prev if prev is not None else 0:.2f} – {e:.2f}" if e != float("inf") \
            else f"{prev:.2f} +"
        print(f"  {name:<18}{n:>8,}{w:>8,}{r:>8.2f}%"
              f"   [{lo * 100:>5.2f}–{hi * 100:<5.2f}]")
        prev = e


def main():
    argv = sys.argv[1:]
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 0
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    closes = S.load_candles(data)
    print("replaying …")
    sigs = collect(closes, days)
    ts = sorted(closes)
    print(f"{len(sigs):,} signals  "
          f"{datetime.fromtimestamp(sigs[0]['t'], timezone.utc):%Y-%m-%d} -> "
          f"{datetime.fromtimestamp(sigs[-1]['t'], timezone.utc):%Y-%m-%d}")
    w, n, r = rate(sigs)
    print(f"baseline {w:,}/{n:,} = {r:.2f}%   longest losing streak "
          f"{longest_streak(sigs)}\n")

    # ---- 1. what a losing streak is made of ------------------------------- #
    streaks, cur = [], []
    for s in sigs:
        if s["won"]:
            if len(cur) >= 5:
                streaks.append(cur)
            cur = []
        else:
            cur.append(s)
    if len(cur) >= 5:
        streaks.append(cur)
    inside = [s for st in streaks for s in st]
    print("=" * 76)
    print("1.  WHAT IS INSIDE A LOSING STREAK OF 5 OR MORE")
    print("=" * 76)
    print(f"  {len(streaks):,} such streaks, {len(inside):,} signals "
          f"({len(inside) / len(sigs) * 100:.1f}% of all)\n")
    print(f"  {'feature':<14}{'inside streaks':>18}{'everywhere':>14}{'lift':>9}")
    for k in ("expansion", "er6", "er12", "er24", "run", "body"):
        a = sum(s[k] for s in inside) / len(inside)
        b = sum(s[k] for s in sigs) / len(sigs)
        print(f"  {k:<14}{a:>18.3f}{b:>14.3f}{a / b:>8.2f}x")
    ga = sum(1 for s in inside if s["golden"]) / len(inside) * 100
    gb = sum(1 for s in sigs if s["golden"]) / len(sigs) * 100
    print(f"  {'golden tier':<14}{ga:>17.1f}%{gb:>13.1f}%{ga / gb:>8.2f}x")

    # ---- 2. accuracy by feature, on the held-out third -------------------- #
    cutp = len(sigs) * 2 // 3
    tr, te = sigs[:cutp], sigs[cutp:]
    print(f"\n{'=' * 76}")
    print("2.  ACCURACY BY FEATURE — held-out final third only")
    print("=" * 76)
    print(f"  train {len(tr):,} signals (not shown)  ·  test {len(te):,} "
          f"signals, baseline {rate(te)[2]:.2f}%")
    buckets(te, "er12", [0.15, 0.25, 0.35, 0.50, 0.70],
            "efficiency over 12 candles — 1.0 is a straight line, no pullback")
    buckets(te, "expansion", [0.7, 1.0, 1.3, 1.8, 2.5],
            "expansion — recent candle size against the last 100")
    buckets(te, "run", [2, 3, 4, 5, 6],
            "consecutive same-direction candles")

    # ---- 3. does standing aside actually help? ---------------------------- #
    # The threshold is chosen on TRAIN and applied unchanged to TEST. Choosing
    # it on the same data it is scored on is the whole trap.
    print(f"\n{'=' * 76}")
    print("3.  STANDING ASIDE — threshold picked on train, judged on test")
    print("=" * 76)
    print(f"  {'filter':<34}{'bets':>7}{'rate':>8}{'P&L':>9}"
          f"{'longest streak':>16}")
    w, n, r = rate(te)
    print(f"  {'take everything (baseline)':<34}{n:>7,}{r:>7.2f}%"
          f"{STAKE * (2 * w - n):>+9,.0f}{longest_streak(te):>16}")

    best = None
    for key in ("er6", "er12", "er24", "expansion"):
        for thr in [x / 100 for x in range(10, 300, 5)]:
            sel = [s for s in tr if s[key] < thr]
            if len(sel) < len(tr) * 0.35:
                continue
            w2, n2, r2 = rate(sel)
            pnl = STAKE * (2 * w2 - n2)
            if best is None or pnl > best[0]:
                best = (pnl, key, thr)
    _, bkey, bthr = best
    print(f"\n  train picked: stand aside when {bkey} >= {bthr:.2f}")
    for key, thr in ((bkey, bthr), ("er12", 0.35), ("er12", 0.50),
                     ("expansion", 1.8)):
        sel = [s for s in te if s[key] < thr]
        if not sel:
            continue
        w2, n2, r2 = rate(sel)
        print(f"  {f'skip when {key} >= {thr:.2f}':<34}{n2:>7,}{r2:>7.2f}%"
              f"{STAKE * (2 * w2 - n2):>+9,.0f}{longest_streak(sel):>16}")

    # ---- 3b. a cooldown, which does not have to predict anything ---------- #
    # Every filter above tries to see a bad run coming. A cooldown does not:
    # it waits until the run has already announced itself and then stops
    # feeding it. That is mechanically guaranteed to truncate streaks, so the
    # direction of the result is safe even though the exact pair below was read
    # off the test grid and is therefore optimistic.
    print(f"\n  {'-' * 72}")
    print("  cooldown — after k losses in a row, sit out the next few signals")
    print(f"  {'-' * 72}")
    for k, skip in ((3, 6), (4, 6), (5, 6), (4, 3)):
        sel, loss, wait = [], 0, 0
        for s in te:
            if wait > 0:
                wait -= 1
                loss = 0
                continue
            sel.append(s)
            if s["won"]:
                loss = 0
            else:
                loss += 1
                if loss >= k:
                    wait, loss = skip, 0
        w2, n2, r2 = rate(sel)
        print(f"  {f'after {k} losses, skip {skip}':<34}{n2:>7,}{r2:>7.2f}%"
              f"{STAKE * (2 * w2 - n2):>+9,.0f}{longest_streak(sel):>16}")

    # ---- 3c. what a streak actually costs --------------------------------- #
    # The number that decides whether any of this matters.
    ls = longest_streak(te)
    print(f"\n  a {ls}-loss streak costs, at a ${STAKE:,.0f} base:")
    print(f"    flat            ${STAKE * ls:>9,.0f}")
    for rungs in (3, 7):
        print(f"    martingale {rungs}    "
              f"${sum(STAKE * 2 ** (i % rungs) for i in range(ls)):>9,.0f}")

    # ---- 4. the same filter, on the golden tier alone --------------------- #
    print(f"\n{'=' * 76}")
    print("4.  THE GOLDEN TIER — the loudest signals, on the held-out third")
    print("=" * 76)
    g = [s for s in te if s["golden"]]
    if g:
        w2, n2, r2 = rate(g)
        print(f"  {'all golden':<34}{n2:>7,}{r2:>7.2f}%"
              f"{STAKE * (2 * w2 - n2):>+9,.0f}{longest_streak(g):>16}")
        for thr in (0.35, 0.50):
            sel = [s for s in g if s["er12"] < thr]
            if len(sel) < 30:
                continue
            w3, n3, r3 = rate(sel)
            print(f"  {f'golden, skip er12 >= {thr:.2f}':<34}{n3:>7,}"
                  f"{r3:>7.2f}%{STAKE * (2 * w3 - n3):>+9,.0f}"
                  f"{longest_streak(sel):>16}")


if __name__ == "__main__":
    main()
