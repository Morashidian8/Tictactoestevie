"""
Three signals a day, chosen in advance — can it be done, and how well?

The owner does not want 63 trades a day. Two or three good ones is enough. So
this builds a score for every signal, keeps only the highest-scoring few, and
asks whether that handful beats the real break-even of 57.30% on data the
score was never fitted to.

TWO WAYS TO KEEP "THREE A DAY", AND ONLY ONE OF THEM IS REAL

  * A THRESHOLD. Score each signal as it arrives, bet it if the score is above
    a line drawn on the training data, ignore it otherwise. The line is set so
    the average day produces about three bets. This is implementable: nothing
    in the decision needs a fact from later in the day.

  * TOP-3-OF-THE-DAY. Rank the day's signals and take the best three. This
    CANNOT be traded. At 09:00 you do not know whether a better signal arrives
    at 21:00; choosing the day's best three requires seeing the day first. It
    is reported anyway, clearly labelled, because it is the ceiling — the score
    cannot do better than this even with tomorrow's newspaper, so if the
    ceiling is under 57.30% the threshold version is finished before it starts.

THE SCORE. Logistic regression, fitted on 18 months and never refitted after.
Features are all causal — everything is known at the close of the candle the
signal fires on:

    how many rules agree · which rules · the golden entry · agrees with the
    last candle or fights it · hour of day · body and range of the last candle
    against recent volatility · volume against its own recent average · how
    far price sits from its 20-candle mean · how long the current run of
    same-direction candles is

Baselines it has to beat, or it is just an expensive way to pick at random:
every signal, three at random each day, and the three with the most rules
agreeing — that last one is free, needs no model, and is the honest thing to
use if the model cannot beat it.

    python top3.py [--per-day 3] [--test-days 60] [--data F]
"""

import math
import os
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
os.environ.setdefault("RULE8", "1")
import same_dir as S

TEHRAN = timezone(timedelta(hours=3, minutes=30))
GRAN = 300
STAKE, PAYOUT, FEE = 50.0, 90.0, 1.57
WIN_NET, LOSS_NET = PAYOUT - STAKE - FEE, STAKE + FEE
BREAKEVEN = LOSS_NET / (WIN_NET + LOSS_NET)
RULES = ["۱) شکستِ ۲۰ کندلی", "۲) ۳ حرکتِ هم‌جهت + حرکتِ بزرگ", "۳) رشتهٔ هم‌جهت",
         "۵) کشیدگیِ ۴ کندلی", "۶) AABA در اشباعِ خرید",
         "۷) باندِ بولینگر + RSI", "۸) پلن بی"]
SEED = 20260827


# --------------------------------------------------------------------------- #
#  candles, with the columns same_dir.load_candles throws away
# --------------------------------------------------------------------------- #
def load_ohlcv(path):
    import csv
    import gzip
    op = gzip.open if path.endswith(".gz") else open
    rows = {}
    with op(path, "rt", newline="") as f:
        for r in csv.DictReader(f):
            rows[int(r["t"])] = (float(r["o"]), float(r["h"]), float(r["l"]),
                                 float(r["c"]), float(r["v"]))
    return rows


def build_features(sigs, ohlcv):
    """
    Everything known at the close of the signal candle, and nothing else.

    The window being bet on is t+1, so every lookback here ends at t. A feature
    that peeked at t+1 would score beautifully and be worthless.
    """
    ts = sorted(ohlcv)
    idx = {t: i for i, t in enumerate(ts)}
    close = np.array([ohlcv[t][3] for t in ts])
    high = np.array([ohlcv[t][1] for t in ts])
    low = np.array([ohlcv[t][2] for t in ts])
    vol = np.array([ohlcv[t][4] for t in ts])
    body = np.abs(np.diff(close, prepend=close[0]))
    rng = high - low

    # rolling means, causal: position i uses i-19..i
    def roll(a, n):
        c = np.cumsum(np.insert(a, 0, 0.0))
        out = np.full_like(a, np.nan, dtype=float)
        out[n - 1:] = (c[n:] - c[:-n]) / n
        return out

    atr20 = roll(rng, 20)
    vol20 = roll(vol, 20)
    ma20 = roll(close, 20)
    body20 = roll(body, 20)

    rows, keep = [], []
    for s in sigs:
        i = idx.get(s["t"])
        if i is None or i < 25:
            continue
        a = atr20[i] if atr20[i] and not math.isnan(atr20[i]) else 1e-9
        v = vol20[i] if vol20[i] and not math.isnan(vol20[i]) else 1e-9
        b = body20[i] if body20[i] and not math.isnan(body20[i]) else 1e-9
        d = datetime.fromtimestamp(s["t"] + GRAN, TEHRAN)
        # how many candles in a row have moved the same way, ending at t
        run = 0
        up = close[i] > close[i - 1]
        for k in range(i, max(i - 12, 1), -1):
            if (close[k] > close[k - 1]) == up:
                run += 1
            else:
                break
        f = [len(s["rules"]), 1.0 if s["golden"] else 0.0,
             1.0 if s["aligned"] else 0.0]
        f += [1.0 if r in s["rules"] else 0.0 for r in RULES]
        f += [math.sin(2 * math.pi * d.hour / 24),
              math.cos(2 * math.pi * d.hour / 24),
              body[i] / a, rng[i] / a, body[i] / b, vol[i] / v,
              (close[i] - ma20[i]) / a, a / close[i] * 1000.0, float(run)]
        if not all(math.isfinite(x) for x in f):
            continue
        rows.append(f)
        s["date"] = d
        keep.append(s)
    return np.array(rows, dtype=float), keep


# --------------------------------------------------------------------------- #
#  logistic regression, written out because sklearn is not installed here
# --------------------------------------------------------------------------- #
def fit(X, y, l2=1.0, iters=400, lr=0.5):
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1.0
    Z = np.hstack([(X - mu) / sd, np.ones((len(X), 1))])
    w = np.zeros(Z.shape[1])
    for _ in range(iters):
        p = 1.0 / (1.0 + np.exp(-Z @ w))
        gr = Z.T @ (p - y) / len(Z)
        gr[:-1] += l2 * w[:-1] / len(Z)
        w -= lr * gr
    return w, mu, sd


def score(X, w, mu, sd):
    Z = np.hstack([(X - mu) / sd, np.ones((len(X), 1))])
    return 1.0 / (1.0 + np.exp(-Z @ w))


# --------------------------------------------------------------------------- #
def pnl_of(sel):
    w = sum(1 for s in sel if s["won"])
    return w * WIN_NET - (len(sel) - w) * LOSS_NET, w


def show(label, sel, days, note=""):
    n = len(sel)
    if not n:
        print(f"  {label:<34}{'—':>7}")
        return
    p, w = pnl_of(sel)
    r = w / n
    lo, hi = S.wilson(w, n)
    need = LOSS_NET / r if r else float("inf")
    print(f"  {label:<34}{n:>6,}{n / days:>7.1f}{r * 100:>8.2f}%"
          f"   [{lo * 100:>5.2f}–{hi * 100:<5.2f}]${p:>+9,.0f}{need:>9.2f}"
          f"  {note}")


def per_day_top(sigs, probs, k):
    """The ceiling: rank each day and keep its best k. Not tradeable."""
    by = defaultdict(list)
    for s, p in zip(sigs, probs):
        by[s["date"].date()].append((p, s))
    out = []
    for day in by.values():
        day.sort(key=lambda x: -x[0])
        out += [s for _, s in day[:k]]
    return out


def main():
    argv = sys.argv[1:]
    g = lambda k, d: (type(d)(argv[argv.index(k) + 1]) if k in argv else d)
    per_day = g("--per-day", 3)
    test_days = g("--test-days", 60)
    data = (argv[argv.index("--data") + 1] if "--data" in argv
            else os.path.join("research", "btc5m", "btc5m.csv.gz"))
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    print(f"replaying {data} …")
    ohlcv = load_ohlcv(data)
    closes = {t: v[3] for t, v in ohlcv.items()}
    sigs = S.replay(closes)
    X, sigs = build_features(sigs, ohlcv)
    y = np.array([1.0 if s["won"] else 0.0 for s in sigs])

    ts = sorted(closes)
    cut = ts[-1] - test_days * 86400
    tr = np.array([s["t"] < cut for s in sigs])
    Xtr, ytr = X[tr], y[tr]
    str_ = [s for s, k in zip(sigs, tr) if k]
    ste = [s for s, k in zip(sigs, tr) if not k]
    Xte = X[~tr]
    dtr = max(1, (str_[-1]["date"] - str_[0]["date"]).days)
    dte = max(1, (ste[-1]["date"] - ste[0]["date"]).days)

    print("=" * 96)
    print(f"  ${STAKE:,.0f} bet · fee ${FEE:.2f} · pays ${PAYOUT:,.0f}"
          f"   ->   BREAK-EVEN {BREAKEVEN * 100:.2f}%")
    print(f"  TRAIN {str_[0]['date']:%Y-%m-%d} -> {str_[-1]['date']:%Y-%m-%d}"
          f"  {len(str_):,} signals   |   "
          f"TEST {ste[0]['date']:%Y-%m-%d} -> {ste[-1]['date']:%Y-%m-%d}"
          f"  {len(ste):,} signals")
    print("=" * 96)

    w, mu, sd = fit(Xtr, ytr)
    ptr, pte = score(Xtr, w, mu, sd), score(Xte, w, mu, sd)

    # The threshold is chosen on TRAIN only: the score above which the average
    # training day produced `per_day` signals.
    want = per_day * dtr
    thr = float(np.sort(ptr)[-want]) if want < len(ptr) else float(ptr.min())

    hdr = (f"  {'selection':<34}{'n':>6}{'/day':>7}{'rate':>9}"
           f"{'95% CI':>17}{'P&L':>10}{'need$':>9}")
    print(f"\n{'-' * 96}\n  ON TRAIN — where the model was fitted (flattering "
          f"by construction)\n{'-' * 96}")
    print(hdr)
    show("همهٔ سیگنال‌ها", str_, dtr)
    show(f"امتیاز بالای خط ({thr:.4f})",
         [s for s, p in zip(str_, ptr) if p >= thr], dtr)
    show(f"بهترین {per_day} تای هر روز", per_day_top(str_, ptr, per_day), dtr)

    print(f"\n{'-' * 96}\n  ON TEST — never seen by the model\n{'-' * 96}")
    print(hdr)
    show("همهٔ سیگنال‌ها", ste, dte)
    sel_thr = [s for s, p in zip(ste, pte) if p >= thr]
    show(f"امتیاز بالای خط ({thr:.4f})", sel_thr, dte, "<- tradeable")
    show(f"بهترین {per_day} تای هر روز", per_day_top(ste, pte, per_day), dte,
         "<- ceiling, NOT tradeable")

    # ---- the free baselines it has to beat --------------------------------- #
    print(f"\n{'-' * 96}\n  BASELINES ON TEST — what you get without any model"
          f"\n{'-' * 96}")
    print(hdr)
    depth = np.array([len(s["rules"]) + (0.5 if s["golden"] else 0.0)
                      for s in ste], dtype=float)
    show(f"بیشترین قانونِ هم‌نظر، {per_day} تای روز",
         per_day_top(ste, depth, per_day), dte, "<- free, no model")
    show("۵+ قانون هم‌نظر", [s for s in ste if len(s["rules"]) >= 5], dte)
    show("ورودِ طلایی", [s for s in ste if s["golden"]], dte)

    rng = random.Random(SEED)
    by = defaultdict(list)
    for s in ste:
        by[s["date"].date()].append(s)
    rates, pnls = [], []
    for _ in range(400):
        pick = []
        for day in by.values():
            pick += rng.sample(day, min(per_day, len(day)))
        p, k = pnl_of(pick)
        rates.append(k / len(pick) * 100)
        pnls.append(p)
    print(f"  {'تصادفی، ' + str(per_day) + ' تای هر روز':<34}"
          f"{'':>6}{per_day:>7.1f}{sum(rates) / len(rates):>8.2f}%"
          f"{'':>17}${sum(pnls) / len(pnls):>+9,.0f}"
          f"   (400 draws, sd {np.std(rates):.2f} points)")

    # ---- does the score rank anything at all? ------------------------------ #
    print(f"\n{'-' * 96}\n  IS THE SCORE RANKING ANYTHING? — test signals in "
          f"five equal bands\n{'-' * 96}")
    order = np.argsort(-pte)
    band = len(order) // 5
    print(f"  {'band':<34}{'n':>6}{'':>7}{'rate':>9}{'95% CI':>17}")
    for b in range(5):
        part = [ste[i] for i in order[b * band:(b + 1) * band]]
        n = len(part)
        k = sum(1 for s in part if s["won"])
        lo, hi = S.wilson(k, n)
        print(f"  {'highest' if b == 0 else 'lowest' if b == 4 else f'band {b + 1}':<34}"
              f"{n:>6,}{'':>7}{k / n * 100:>8.2f}%"
              f"   [{lo * 100:>5.2f}–{hi * 100:<5.2f}]")
    auc_pairs = 200000
    rng2 = random.Random(SEED + 1)
    wi = [i for i, s in enumerate(ste) if s["won"]]
    li = [i for i, s in enumerate(ste) if not s["won"]]
    hit = sum(1 for _ in range(auc_pairs)
              if pte[rng2.choice(wi)] > pte[rng2.choice(li)])
    print(f"\n  AUC on test: {hit / auc_pairs:.4f}"
          f"   (0.50 = the score knows nothing)")

    print(f"\n{'=' * 96}")
    print(f"  The bar is {BREAKEVEN * 100:.2f}%. A selection that misses it is")
    print("  not a small edge, it is a slow loss. And the tradeable row is the")
    print("  threshold one — the day's best three cannot be known until the")
    print("  day is over.")
    print("=" * 96)


if __name__ == "__main__":
    main()
