"""
What is different about the chart when a rule goes on a losing run?

Two questions, in order:

  1. Which signal types produce the longest runs of consecutive losses?
  2. Taking those types, what did the chart look like at the moment a doomed
     signal fired, compared with the moment a winning one did — across volume,
     candle shape, trend, volatility and the usual indicators?

Method, and the trap it avoids. "Signals that lost" versus "signals that won"
is circular: the label is the outcome. What makes it non-circular is that every
feature is computed from candles STRICTLY BEFORE the bet — the same 300 candles
the live monitor could have in hand at that instant. So the question is not
"were they different" (they were, by construction) but "was the difference
VISIBLE IN ADVANCE".

Then the only test that matters: pick the separating features on the first two
thirds, and see whether they still separate on the final third, which the
selection never saw. A feature that stops separating there was fitting the
past, not describing the market.

    python streak_forensics.py [--data btc5m_fresh.csv] [--streak 5]

Needs OHLCV — closes alone cannot answer a question about volume or wicks.
"""

import csv
import gzip
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_TOKEN", "x")
import bot

GRAN = 300
TEHRAN = timezone(timedelta(hours=3, minutes=30))
LOOK = 300                      # candles of history each feature may read
ARCHIVE = os.path.join("research", "btc5m", "btc5m.csv.gz")


# --------------------------------------------------------------------------- #
# data
# --------------------------------------------------------------------------- #
def load_ohlcv(path):
    op = gzip.open if path.endswith(".gz") else open
    rows = []
    with op(path, "rt", newline="") as f:
        for r in csv.DictReader(f):
            rows.append({"t": int(r["t"]), "o": float(r["o"]), "h": float(r["h"]),
                         "l": float(r["l"]), "c": float(r["c"]),
                         "v": float(r["v"])})
    rows.sort(key=lambda r: r["t"])
    return rows


def median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def rsi(closes, n):
    gains = losses = 0.0
    for a, b in zip(closes[-n - 1:-1], closes[-n:]):
        d = b - a
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    if losses == 0:
        return 100.0
    rs = (gains / n) / (losses / n)
    return 100 - 100 / (1 + rs)


def atr(bars, n):
    trs = []
    for a, b in zip(bars[-n - 1:-1], bars[-n:]):
        trs.append(max(b["h"] - b["l"], abs(b["h"] - a["c"]), abs(b["l"] - a["c"])))
    return sum(trs) / len(trs) if trs else 0.0


def adx(bars, n=14):
    """Wilder's ADX, simple-averaged. High means a strong one-way trend."""
    plus = minus = trs = 0.0
    for a, b in zip(bars[-n - 1:-1], bars[-n:]):
        up, dn = b["h"] - a["h"], a["l"] - b["l"]
        plus += up if (up > dn and up > 0) else 0.0
        minus += dn if (dn > up and dn > 0) else 0.0
        trs += max(b["h"] - b["l"], abs(b["h"] - a["c"]), abs(b["l"] - a["c"]))
    if trs <= 0:
        return 0.0
    pdi, mdi = 100 * plus / trs, 100 * minus / trs
    return 100 * abs(pdi - mdi) / (pdi + mdi) if (pdi + mdi) > 0 else 0.0


def featurise(bars, i):
    """
    Everything knowable at the close of bars[i] — the instant the signal fired.

    Nothing reads bars[i+1]. Each ratio is normalised against the same bar's
    own recent history, so a feature means the same thing at $40k and $100k.
    """
    w = bars[i - LOOK + 1:i + 1]
    if len(w) < LOOK:
        return None
    cl = [b["c"] for b in w]
    vol = [b["v"] for b in w]
    mv = [b - a for a, b in zip(cl, cl[1:])]
    m100 = median([abs(x) for x in mv[-100:]])
    v100 = median(vol[-100:])
    rng100 = median([b["h"] - b["l"] for b in w[-100:]])
    a14, a100 = atr(w, 14), atr(w, 100)
    if m100 <= 0 or v100 <= 0 or rng100 <= 0 or a14 <= 0 or a100 <= 0:
        return None
    last = w[-1]
    body = abs(last["c"] - last["o"])
    rng = max(last["h"] - last["l"], 1e-9)
    ma20 = sum(cl[-20:]) / 20
    ma50 = sum(cl[-50:]) / 50
    sd20 = (sum((x - ma20) ** 2 for x in cl[-20:]) / 20) ** 0.5
    run = 1
    for a, b in zip(reversed(mv), list(reversed(mv))[1:]):
        if (a > 0) == (b > 0):
            run += 1
        else:
            break
    f = {
        # volume — the user's own observation
        "vol_now": last["v"] / v100,
        "vol_12": median(vol[-12:]) / v100,
        "vol_trend": (sum(vol[-12:]) / 12) / max(sum(vol[-48:]) / 48, 1e-9),
        # candle shape
        "body": body / max(median([abs(b["c"] - b["o"]) for b in w[-100:]]), 1e-9),
        "range": rng / rng100,
        "wick_frac": 1 - body / rng,
        # volatility regime
        "atr_ratio": a14 / a100,
        "expansion": median([abs(x) for x in mv[-12:]]) / m100,
        "bb_width": (2 * sd20 / ma20) * 100 if ma20 else 0.0,
        # trend strength — the thing a fade rule fears
        "adx14": adx(w, 14),
        "er12": (abs(sum(mv[-12:])) / max(sum(abs(x) for x in mv[-12:]), 1e-9)),
        "er48": (abs(sum(mv[-48:])) / max(sum(abs(x) for x in mv[-48:]), 1e-9)),
        "run": float(run),
        # location
        "dist_ma20": abs(cl[-1] - ma20) / a14,
        "dist_ma50": abs(cl[-1] - ma50) / a14,
        "rsi7": rsi(cl, 7),
        "rsi14": rsi(cl, 14),
        # displacement over the last hour and four hours, in ATR
        "ret_1h": abs(cl[-1] - cl[-13]) / a14,
        "ret_4h": abs(cl[-1] - cl[-49]) / a14,
    }
    return f


# --------------------------------------------------------------------------- #
# signals
# --------------------------------------------------------------------------- #
def collect(bars):
    by_t = {b["t"]: k for k, b in enumerate(bars)}
    need = bot.BREAKOUT_FULL_HISTORY + bot.RULE8_MA
    start = max(need, LOOK) + 1
    out = []
    for i in range(start, len(bars) - 1):
        if bars[i]["t"] != bars[i - need]["t"] + need * GRAN:
            continue
        if bars[i + 1]["t"] != bars[i]["t"] + GRAN:
            continue
        hits = bot.BreakoutMonitor.evaluate(
            [bars[x]["c"] for x in range(i - need, i + 1)])
        if not hits:
            continue
        bets = {h[2] for h in hits}
        if len(bets) != 1:
            continue
        bet = bets.pop()
        nxt = bars[i + 1]["c"] - bars[i]["c"]
        if nxt == 0:
            continue
        f = featurise(bars, i)
        if f is None:
            continue
        f.update({"t": bars[i]["t"], "bet": bet,
                  "won": (bet == "up") == (nxt > 0),
                  "rules": [h[0] for h in hits],
                  "golden": any(h[0].startswith("🏆") for h in hits),
                  "r1": any(h[0].startswith("۱)") for h in hits)})
        out.append(f)
    return out


def mark_streaks(sigs, minlen):
    """Tag every signal with the length of the losing run it belongs to."""
    for s in sigs:
        s["streak_len"] = 0
    i = 0
    while i < len(sigs):
        if sigs[i]["won"]:
            i += 1
            continue
        j = i
        while j < len(sigs) and not sigs[j]["won"]:
            j += 1
        for k in range(i, j):
            sigs[k]["streak_len"] = j - i
        i = j
    for s in sigs:
        s["doomed"] = s["streak_len"] >= minlen


def max_streak(sel):
    best = cur = 0
    for s in sel:
        cur = 0 if s["won"] else cur + 1
        best = max(best, cur)
    return best


def welch(a, b):
    """Two-sample t with unequal variance. Returns (mean_a, mean_b, t)."""
    if len(a) < 2 or len(b) < 2:
        return 0.0, 0.0, 0.0
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    va = sum((x - ma) ** 2 for x in a) / (len(a) - 1)
    vb = sum((x - mb) ** 2 for x in b) / (len(b) - 1)
    se = (va / len(a) + vb / len(b)) ** 0.5
    return ma, mb, ((ma - mb) / se if se > 0 else 0.0)


FEATS = ("vol_now", "vol_12", "vol_trend", "body", "range", "wick_frac",
         "atr_ratio", "expansion", "bb_width", "adx14", "er12", "er48", "run",
         "dist_ma20", "dist_ma50", "rsi7", "rsi14", "ret_1h", "ret_4h")


def main():
    argv = sys.argv[1:]
    minlen = int(argv[argv.index("--streak") + 1]) if "--streak" in argv else 5
    data = (argv[argv.index("--data") + 1] if "--data" in argv else ARCHIVE)
    if not os.path.exists(data):
        print(f"{data} not found — run research/btc5m/fetch_data.py first.")
        return

    bars = load_ohlcv(data)
    print(f"{len(bars):,} candles with volume  "
          f"{datetime.fromtimestamp(bars[0]['t'], timezone.utc):%Y-%m-%d} -> "
          f"{datetime.fromtimestamp(bars[-1]['t'], timezone.utc):%Y-%m-%d}")
    print("replaying …")
    sigs = collect(bars)
    mark_streaks(sigs, minlen)
    print(f"{len(sigs):,} signals\n")

    # ---- 1. which signal type runs longest -------------------------------- #
    print("=" * 84)
    print("1.  LONGEST RUN OF CONSECUTIVE LOSSES, BY SIGNAL TYPE")
    print("=" * 84)
    groups = [("همه — every signal", lambda s: True),
              ("🏆 golden", lambda s: s["golden"]),
              ("۱ breakout", lambda s: s["r1"]),
              ("۱ breakout + golden", lambda s: s["r1"] and s["golden"]),
              ("۱ breakout, alone", lambda s: s["r1"] and len(s["rules"]) == 1)]
    for code in ("۲", "۳", "۵", "۶", "۷", "۸"):
        groups.append((f"{code} rule",
                       lambda s, c=code: any(r.startswith(c) for r in s["rules"])))
    print(f"  {'type':<26}{'n':>8}{'rate':>8}{'longest':>9}"
          f"{'runs>=' + str(minlen):>10}{'share in them':>15}")
    for name, fn in groups:
        sel = [s for s in sigs if fn(s)]
        if len(sel) < 100:
            continue
        w = sum(1 for s in sel if s["won"])
        # runs counted inside this type's own ordered stream
        runs, cur = 0, 0
        for s in sel:
            cur = 0 if s["won"] else cur + 1
            if cur == minlen:
                runs += 1
        inside = sum(1 for s in sel if s["doomed"])
        print(f"  {name:<26}{len(sel):>8,}{w / len(sel) * 100:>7.2f}%"
              f"{max_streak(sel):>9}{runs:>10,}"
              f"{inside / len(sel) * 100:>14.1f}%")

    # ---- 2. the forensic comparison --------------------------------------- #
    cut = len(sigs) * 2 // 3
    tr, te = sigs[:cut], sigs[cut:]
    print(f"\n{'=' * 84}")
    print(f"2.  WHAT THE CHART LOOKED LIKE — doomed (in a run of {minlen}+) "
          f"vs winners")
    print("=" * 84)
    print("   Every feature is read from candles BEFORE the bet, so a gap here")
    print("   is a gap that was visible at the time.\n")
    K = len(FEATS)
    bar = 2.807     # two-sided 0.05 Bonferroni over 19 features
    for label, fn in (("🏆 GOLDEN", lambda s: s["golden"]),
                      ("۱ BREAKOUT (20-candle)", lambda s: s["r1"])):
        A = [s for s in tr if fn(s) and s["doomed"]]
        B = [s for s in tr if fn(s) and s["won"]]
        At = [s for s in te if fn(s) and s["doomed"]]
        Bt = [s for s in te if fn(s) and s["won"]]
        print(f"  {label}   train: {len(A):,} doomed vs {len(B):,} winners"
              f"   ·   test: {len(At):,} vs {len(Bt):,}")
        print(f"  {'feature':<13}{'doomed':>9}{'winners':>9}{'diff':>8}"
              f"{'t train':>9}{'t test':>9}   verdict")
        rows = []
        for k in FEATS:
            ma, mb, t1 = welch([s[k] for s in A], [s[k] for s in B])
            _, _, t2 = welch([s[k] for s in At], [s[k] for s in Bt])
            rows.append((abs(t1), k, ma, mb, t1, t2))
        for _, k, ma, mb, t1, t2 in sorted(rows, reverse=True):
            ok = abs(t1) >= bar and abs(t2) >= 1.96 and (t1 > 0) == (t2 > 0)
            mark = "HOLDS" if ok else ("train only" if abs(t1) >= bar else "")
            print(f"  {k:<13}{ma:>9.2f}{mb:>9.2f}{ma - mb:>+8.2f}"
                  f"{t1:>+9.2f}{t2:>+9.2f}   {mark}")
        print()

    print(f"  a train difference must clear |t| >= {bar:.2f} "
          f"(Bonferroni over {K} features) AND repeat on test to count.")

    # ---- 3. does it actually separate, or is it just describable? --------- #
    # A table of significant differences is not yet a usable thing. The test is
    # whether one number built ONLY from train statistics sorts the held-out
    # third — features chosen on train, weights from train means and spreads,
    # and then never touched again.
    print(f"\n{'=' * 84}")
    print("3.  ONE SCORE, BUILT ON TRAIN, APPLIED TO THE HELD-OUT THIRD")
    print("=" * 84)
    for label, fn in (("🏆 GOLDEN", lambda s: s["golden"]),
                      ("۱ BREAKOUT (20-candle)", lambda s: s["r1"]),
                      ("EVERY SIGNAL", lambda s: True)):
        A = [s for s in tr if fn(s) and s["doomed"]]
        B = [s for s in tr if fn(s) and s["won"]]
        if len(A) < 60 or len(B) < 60:
            continue
        keep = []
        for k in FEATS:
            ma, mb, t1 = welch([s[k] for s in A], [s[k] for s in B])
            if abs(t1) >= bar:
                allv = [s[k] for s in tr if fn(s)]
                mu = sum(allv) / len(allv)
                sd = (sum((x - mu) ** 2 for x in allv) / max(1, len(allv) - 1)) ** 0.5
                if sd > 0:
                    keep.append((k, mu, sd, 1.0 if t1 > 0 else -1.0))
        if not keep:
            continue

        def score(s):
            return sum(w * (s[k] - mu) / sd for k, mu, sd, w in keep) / len(keep)

        tesel = [s for s in te if fn(s)]
        tesel.sort(key=score)
        print(f"\n  {label} — {len(keep)} features kept, test n = {len(tesel):,}")
        print(f"  {'quintile (low score = calm)':<32}{'n':>7}{'rate':>8}"
              f"{'longest run':>13}")
        q = len(tesel) // 5
        for j in range(5):
            part = tesel[j * q:(j + 1) * q] if j < 4 else tesel[4 * q:]
            w = sum(1 for s in part if s["won"])
            # the run length is measured back in time order, not score order
            part_t = sorted(part, key=lambda s: s["t"])
            print(f"  {f'{j + 1} of 5' + (' (calmest)' if j == 0 else ' (most extended)' if j == 4 else ''):<32}"
                  f"{len(part):>7,}{w / len(part) * 100:>7.2f}%"
                  f"{max_streak(part_t):>13}")
        w = sum(1 for s in tesel if s["won"])
        print(f"  {'all of them':<32}{len(tesel):>7,}{w / len(tesel) * 100:>7.2f}%"
              f"{max_streak(sorted(tesel, key=lambda s: s['t'])):>13}")
        # and what dropping the worst quintile would have done, in money
        keepset = set(id(s) for s in tesel[:4 * q])
        taken = [s for s in sorted(te, key=lambda s: s["t"])
                 if not fn(s) or id(s) in keepset]
        base = sorted(te, key=lambda s: s["t"])
        for nm, sel in (("take everything", base),
                        (f"drop the top quintile of {label}", taken)):
            w2 = sum(1 for s in sel if s["won"])
            print(f"    {nm:<44}{len(sel):>7,} bets  "
                  f"{w2 / len(sel) * 100:6.2f}%  "
                  f"${20 * (2 * w2 - len(sel)):>+8,.0f}  "
                  f"longest run {max_streak(sel)}")


if __name__ == "__main__":
    main()
