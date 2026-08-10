"""
The one definition of every rule, every ladder and every statistic.

Written so that a fleet of agents cannot silently disagree with each other:
each rule here is a line-by-line copy of what bot.py actually ships, and every
report in this project is produced by calling into this module rather than by
re-implementing anything. If a number in a report cannot be reproduced by a
call into engine.py, the report is wrong.

Settlement is close-to-close, which is exactly how Polymarket settles the
5-minute up/down markets: the window that opens after candle i settles on
close[i+1] vs close[i]. An unchanged close is a void, not a loss.

    from engine import load, resample, RULES, run_rule, simulate

    c = load()                       # 5m OHLC, oldest first
    c15 = resample(c, 3)             # 15m OHLC built from the same bars
    sigs = run_rule("rule1", c)      # [(index, ts, side, won), ...]
    st = simulate(sigs)              # ladder + streak statistics
"""

import csv
import datetime
import gzip
import math
import os
import pickle

HERE = os.path.dirname(os.path.abspath(__file__))
FROZEN = os.path.join(HERE, "btc5m.csv.gz")

# --- tunables: identical to bot.py's defaults -------------------------------
LOOKBACK = 20            # rule 1 level window
VOL_TH = 0.8884          # rule 1 vol20/vol100 floor (train median)
RULE2_MULT = 2.0
RULE3_RUN = 6
RULE5_MULT = 5.7
RULE5_SPAN = 4
RULE6_RSI_HI = 70.0
RULE7_BB_N = 20
RULE7_BB_SD = 2.0
RULE7_RSI_N = 7
RULE7_RSI_HI = 80.0
RULE7_RSI_LO = 20.0
GOLDEN_RULES = 3
GOLDEN_MULT = 9.0

STAKE_BASE = 20.0
LADDER_RUNGS = 3

TEHRAN = datetime.timezone(datetime.timedelta(hours=3, minutes=30))
UTC = datetime.timezone.utc


# --- data -------------------------------------------------------------------
def load(path=FROZEN):
    """5-minute OHLC, oldest first. Each row is {t,o,h,l,c}."""
    out = []
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        for x in csv.DictReader(f):
            out.append({"t": int(x["t"]), "o": float(x["o"]), "h": float(x["h"]),
                        "l": float(x["l"]), "c": float(x["c"])})
    out.sort(key=lambda r: r["t"])
    return out


def last_year(candles, days=365):
    """The trailing `days` of a candle list."""
    cut = candles[-1]["t"] - days * 86400
    return [x for x in candles if x["t"] >= cut]


def resample(candles, k, step=300):
    """
    Aggregate k consecutive bars into one, aligned to the wall clock.

    Alignment matters: a 15-minute Polymarket window runs :00-:15, not
    "whatever three bars happen to be adjacent in the file". Bars are grouped by
    floor(t / (k*step)), and a group missing any of its k bars is dropped rather
    than quietly published as a short candle.
    """
    span = k * step
    groups, order = {}, []
    for x in candles:
        key = x["t"] - (x["t"] % span)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(x)
    out = []
    for key in order:
        g = groups[key]
        if len(g) != k:
            continue
        out.append({"t": key, "o": g[0]["o"], "h": max(x["h"] for x in g),
                    "l": min(x["l"] for x in g), "c": g[-1]["c"]})
    return out


def closes_of(candles):
    return [x["c"] for x in candles]


# --- small helpers, byte-for-byte with bot.py -------------------------------
def _moves(closes):
    return [closes[i] - closes[i - 1] for i in range(1, len(closes))]


def _median(xs):
    """Upper median — the convention bot.py uses; do not 'fix' it."""
    s = sorted(xs)
    return s[len(s) // 2] if s else 0.0


def _stdev(xs):
    """Sample stdev, used by the rule 1 volatility filter."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    return math.sqrt(sum((v - m) ** 2 for v in xs) / (n - 1))


def _pstdev(xs):
    """Population stdev — what Bollinger bands are defined on."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    return math.sqrt(sum((v - m) ** 2 for v in xs) / n)


def rsi(closes, period=14):
    """Wilder's RSI of the last close. None until there is enough history."""
    if len(closes) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    ag, al = gains / period, losses / period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (period - 1) + max(d, 0.0)) / period
        al = (al * (period - 1) + max(-d, 0.0)) / period
    if al == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + ag / al)


# --- the rules --------------------------------------------------------------
# Every one takes `closes` (oldest first, the last element being the candle that
# just closed) and returns None or {"side": "up"|"down", ...}.

def rule1(closes, lookback=LOOKBACK, vol_th=VOL_TH, vol_filter=True):
    """Close breaks the 20-close extreme while volatility is not collapsing."""
    if len(closes) < lookback + 2:
        return None
    cur = closes[-1]
    window = closes[-(lookback + 1):-1]
    hi, lo = max(window), min(window)
    if cur > hi:
        side, level, kind = "down", hi, "breakout-up"
    elif cur < lo:
        side, level, kind = "up", lo, "breakout-down"
    else:
        return None
    ratio = None
    if len(closes) >= 101:
        tail = closes[-101:]
        rets = [(tail[i] - tail[i - 1]) / tail[i - 1]
                for i in range(1, len(tail)) if tail[i - 1]]
        slow = _stdev(rets)
        if slow <= 0:
            return None
        ratio = _stdev(rets[-20:]) / slow
        if vol_filter and ratio < vol_th:
            return None
    return {"side": side, "level": level, "kind": kind, "ratio": ratio}


def rule2(closes, mult=RULE2_MULT):
    """Three same-direction moves ending in an oversized one -> fade."""
    if len(closes) < 104:
        return None
    mv = _moves(closes[-104:])
    last3 = mv[-3:]
    if any(m == 0 for m in last3):
        return None
    if not (last3[0] > 0) == (last3[1] > 0) == (last3[2] > 0):
        return None
    med = _median([abs(m) for m in mv[-101:-1]])
    if med <= 0 or abs(last3[-1]) <= mult * med:
        return None
    return {"side": "down" if last3[-1] > 0 else "up",
            "times": abs(last3[-1]) / med}


def rule3(closes, run=RULE3_RUN):
    """A run of N same-direction moves -> fade."""
    if len(closes) < run + 1:
        return None
    mv = _moves(closes)[-run:]
    if any(m == 0 for m in mv) or len({m > 0 for m in mv}) != 1:
        return None
    return {"side": "down" if mv[-1] > 0 else "up", "run": run}


def rule4(closes):
    """AABA — two same-direction moves, one against, back to the first."""
    if len(closes) < 6:
        return None
    m = _moves(closes)[-4:]
    if any(x == 0 for x in m):
        return None
    a = m[0] > 0
    if not ((m[1] > 0) == a and (m[2] > 0) != a and (m[3] > 0) == a):
        return None
    # Rule 4 as the bot emits it: continuation, i.e. bet WITH the last leg.
    return {"side": "up" if a else "down", "up_leg": a}


def rule5(closes, mult=RULE5_MULT, span=RULE5_SPAN):
    """Net travel over `span` candles beyond `mult` median moves -> fade it."""
    if len(closes) < 101 + span:
        return None
    net = closes[-1] - closes[-1 - span]
    if net == 0:
        return None
    med = _median([abs(m) for m in _moves(closes[-101:])])
    if med <= 0 or abs(net) / med < mult:
        return None
    return {"side": "down" if net > 0 else "up", "times": abs(net) / med}


def rule6(closes, rsi_hi=RULE6_RSI_HI, period=RULE7_RSI_N):
    """AABA completed while RSI is overbought -> bet DOWN.

    bot.py's module-level rsi() defaults to RULE7_RSI_N (7), and rule6_signal
    calls it with no period, so the shipped rule 6 is an RSI(7) rule. That is
    reproduced here on purpose — the research write-up says RSI(14), the code
    says 7, and the code is what has been trading.
    """
    if rule4(closes) is None:
        return None
    r = rsi(closes, period)
    if r is None or r < rsi_hi:
        return None
    return {"side": "down", "rsi": r}


def rule7(closes, bb_n=RULE7_BB_N, bb_sd=RULE7_BB_SD, rsi_n=RULE7_RSI_N,
          rsi_hi=RULE7_RSI_HI, rsi_lo=RULE7_RSI_LO):
    """Closed outside the Bollinger band with RSI already extreme -> fade."""
    if len(closes) < max(bb_n, rsi_n + 1) + 1:
        return None
    r = rsi(closes, rsi_n)
    if r is None:
        return None
    window = closes[-bb_n:]
    mid = sum(window) / bb_n
    sd = _pstdev(window)
    if sd <= 0:
        return None
    cur = closes[-1]
    if cur > mid + bb_sd * sd and r >= rsi_hi:
        return {"side": "down", "rsi": r, "band": mid + bb_sd * sd}
    if cur < mid - bb_sd * sd and r <= rsi_lo:
        return {"side": "up", "rsi": r, "band": mid - bb_sd * sd}
    return None


RULE8_MA = 20
RULE8_MULT = 3.5


def rule8(closes, ma=RULE8_MA, mult=RULE8_MULT):
    """Price far from its own 20-candle average, in median moves -> fade."""
    if len(closes) < 101 + ma:
        return None
    avg = sum(closes[-ma:]) / ma
    med = _median([abs(m) for m in _moves(closes[-101:])])
    if med <= 0:
        return None
    gap = closes[-1] - avg
    if abs(gap) / med < mult:
        return None
    return {"side": "down" if gap > 0 else "up", "times": abs(gap) / med}


def golden(closes, need=GOLDEN_RULES, mult=GOLDEN_MULT):
    """Quality tier: >= `need` statistical rules agreeing on an extreme stretch."""
    fired = [r for r in (rule1(closes), rule2(closes), rule3(closes),
                         rule5(closes)) if r]
    if len(fired) < need:
        return None
    sides = {r["side"] for r in fired}
    if len(sides) != 1:
        return None
    stretch = rule5(closes, mult=mult)
    if not stretch:
        return None
    return {"side": sides.pop(), "agree": len(fired), "times": stretch["times"]}


def pool(closes, members=("rule1", "rule2", "rule3", "rule5")):
    """
    The combined vote: the named rules must all point the same way.

    This is what the bot calls "قانون‌های آماری" — one bet per window, not one
    per rule, because several rules reading the same series is still a single
    bet on a single market.
    """
    fired = [(k, RULES[k](closes)) for k in members]
    fired = [(k, s) for k, s in fired if s]
    if not fired:
        return None
    sides = {s["side"] for _, s in fired}
    if len(sides) != 1:
        return None
    return {"side": sides.pop(), "members": [k for k, _ in fired]}


RULES = {
    "rule1": rule1, "rule2": rule2, "rule3": rule3, "rule4": rule4,
    "rule5": rule5, "rule6": rule6, "rule7": rule7, "rule8": rule8,
    "golden": golden,
}

# How many closes each rule needs before it can speak. Every backtest starts at
# WARMUP so that all rules see the same windows and their stats are comparable.
WARMUP = 122   # rule 8 needs 101 + its 20-candle average


# --- walking the chart ------------------------------------------------------
def run_rule(name, candles, fn=None, warmup=WARMUP, **kw):
    """
    Walk the chart candle by candle and trade one rule.

    Returns [(i, ts, side, won)] — one entry per window the rule bet on, in
    chronological order. Windows where the next close is unchanged are voids and
    are dropped, matching the bot's settlement.
    """
    fn = fn or RULES[name]
    # Variant sweeps that widen a lookback must widen the window too, otherwise
    # the rule silently sees less history than it asked for and reports a
    # different edge than the one under test.
    need = max(int(kw.get("lookback", 0)) + 2, int(kw.get("bb_n", 0)) + 2,
               int(kw.get("span", 0)) + 102, int(kw.get("run", 0)) + 2)
    warmup = max(warmup, need)
    cl = closes_of(candles)
    out = []
    for i in range(warmup, len(cl) - 1):
        # A bounded tail, never cl[:i+1]. Every rule indexes from the END of the
        # series and none looks back further than WARMUP, so the tail is
        # identical input — but slicing the whole prefix each candle turns a
        # 100k-candle walk into 5 billion element copies and takes hours.
        window = cl[i + 1 - warmup:i + 1]
        s = fn(window, **kw) if kw else fn(window)
        if not s:
            continue
        nxt = cl[i + 1] - cl[i]
        if nxt == 0:
            continue
        won = (s["side"] == "up") == (nxt > 0)
        out.append((i, candles[i]["t"], s["side"], won))
    return out


def run_many(names, candles, warmup=WARMUP):
    """
    Evaluate several rules in ONE pass and return per-window firing data.

    Returns [(i, ts, {name: side}, next_move)] for every window where at least
    one of `names` fired. Combination searches need this: re-walking the chart
    once per candidate combination is what makes those searches take hours.
    """
    cl = closes_of(candles)
    out = []
    for i in range(warmup, len(cl) - 1):
        window = cl[i + 1 - warmup:i + 1]
        fired = {}
        for n in names:
            s = RULES[n](window)
            if s:
                fired[n] = s["side"]
        if not fired:
            continue
        out.append((i, candles[i]["t"], fired, cl[i + 1] - cl[i]))
    return out


# --- the money --------------------------------------------------------------
def simulate(signals, base=STAKE_BASE, rungs=LADDER_RUNGS, bankroll=None):
    """
    Run a martingale ladder over an ordered signal list and measure everything.

    `signals` is [(i, ts, side, won)] or any sequence whose 4th element is the
    outcome. Returns a dict with the statistics this project is judged on:

      busts        3 losses in a row — the number the user cares about most
      streaks      histogram of consecutive-loss run lengths
      path_low     worst cumulative P&L measured FROM THE START, which is what
                   empties an account; drawdown-from-peak is the softer number
      ruin         True if path_low would have exhausted `bankroll`
    """
    pnl = peak = drawdown = 0.0
    path_low = 0.0
    rung = 0
    wins = losses = busts = 0
    cur_streak = 0
    streaks = {}
    max_streak = 0
    curve = []
    bust_times = []
    for s in signals:
        won = s[3]
        stake = base * 2 ** rung
        if won:
            pnl += stake
            wins += 1
            rung = 0
            if cur_streak:
                streaks[cur_streak] = streaks.get(cur_streak, 0) + 1
                max_streak = max(max_streak, cur_streak)
                cur_streak = 0
        else:
            pnl -= stake
            losses += 1
            rung += 1
            cur_streak += 1
            if rung >= rungs:
                busts += 1
                bust_times.append(s[1])
                rung = 0
        peak = max(peak, pnl)
        drawdown = max(drawdown, peak - pnl)
        path_low = min(path_low, pnl)
        curve.append(pnl)
    if cur_streak:
        streaks[cur_streak] = streaks.get(cur_streak, 0) + 1
        max_streak = max(max_streak, cur_streak)
    n = wins + losses
    return {
        "n": n, "wins": wins, "losses": losses,
        "acc": wins / n * 100 if n else float("nan"),
        "pnl": pnl, "busts": busts, "bust_times": bust_times,
        "drawdown": drawdown, "path_low": path_low,
        "streaks": streaks, "max_streak": max_streak,
        "open_rung": rung, "curve": curve,
        "bust_rate": busts / n * 100 if n else float("nan"),
        "ruin": bankroll is not None and -path_low >= bankroll,
    }


def flat(signals, stake=STAKE_BASE):
    """Flat-stake P&L over the same signals, as the honest comparison."""
    w = sum(1 for s in signals if s[3])
    l = len(signals) - w
    return {"n": len(signals), "wins": w, "losses": l,
            "acc": w / len(signals) * 100 if signals else float("nan"),
            "pnl": (w - l) * stake}


# --- statistics -------------------------------------------------------------
def zscore(wins, n):
    return (wins / n - 0.5) / (0.5 / math.sqrt(n)) if n else float("nan")


def wilson(wins, n, z=1.96):
    """Wilson interval — an accuracy without one is not a measurement."""
    if not n:
        return (float("nan"), float("nan"))
    p = wins / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d * 100, (c + h) / d * 100)


def bonferroni_z(k):
    """The z a result must clear when it is the best of k tried."""
    return math.sqrt(2 * math.log(k)) if k > 1 else 1.96


def split(signals, frac=0.70):
    """Chronological train/test split of a signal list."""
    if not signals:
        return [], []
    cut = signals[int(len(signals) * frac)][1]
    return ([s for s in signals if s[1] < cut],
            [s for s in signals if s[1] >= cut])


def fmt(st, label=""):
    lo, hi = wilson(st["wins"], st["n"])
    return (f"{label:<28} n={st['n']:5d}  acc={st['acc']:5.2f}% "
            f"[{lo:.1f}–{hi:.1f}]  z={zscore(st['wins'], st['n']):+5.2f}  "
            f"busts={st['busts']:4d} ({st['bust_rate']:.2f}%)  "
            f"maxstreak={st['max_streak']:2d}  "
            f"P&L={st['pnl']:+10,.0f}  low={st['path_low']:+9,.0f}")


def save(obj, name):
    """Persist a result set so the next agent reads data, not a transcript."""
    d = os.path.join(HERE, "out")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    with open(p, "wb") as f:
        pickle.dump(obj, f)
    return p


def restore(name):
    with open(os.path.join(HERE, "out", name), "rb") as f:
        return pickle.load(f)


if __name__ == "__main__":
    c = load()
    y = last_year(c)
    print(f"5m: {len(c):,} candles  "
          f"{datetime.datetime.fromtimestamp(c[0]['t'], UTC):%Y-%m-%d} .. "
          f"{datetime.datetime.fromtimestamp(c[-1]['t'], UTC):%Y-%m-%d}")
    print(f"last year: {len(y):,} candles  "
          f"{datetime.datetime.fromtimestamp(y[0]['t'], UTC):%Y-%m-%d} ..")
    c15 = resample(y, 3)
    print(f"15m from the same bars: {len(c15):,} candles")
    for name in ("rule1", "rule2", "rule3", "rule5", "rule6", "rule7", "golden"):
        st = simulate(run_rule(name, y))
        print(fmt(st, name))
