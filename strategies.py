"""
The measured BTC 5-minute edges, as a portable, dependency-free module.

Drop this file into any bot. It knows nothing about Telegram, price feeds, or
brokers — you hand it a list of 5-minute closing prices (oldest first) and it
hands back the signals and the stake to place. That separation is deliberate:
the trading bot in the other repo has its own feed and its own order plumbing,
and none of it should have to be rewritten to reuse the research.

    from strategies import evaluate, Book

    book = Book(state)                       # state = {} on first run
    for sig in evaluate(closes):             # closes = 5m closes, oldest first
        stake = book.stake(sig.stream)
        place_order(side=sig.side, size=stake)
    ...
    book.settle(stream, won=True)            # when the window closes
    state = book.state()                     # persist between restarts

Everything here is measured on 162,447 real 5-minute candles with a
chronological 70/30 split; see docs/research/btc-5m-patterns.md. The one thing
to never forget: these accuracies are only profitable while the market quotes
your side under ~55c. Above that the edge is gone regardless of the win rate.
"""

from collections import namedtuple

# --- tunables, all measured -------------------------------------------------
LOOKBACK = 20          # rule 1 level window
VOL_TH = 0.8884        # rule 1: vol20/vol100 floor (train median)
RULE2_MULT = 2.0       # rule 2: oversized move, x median
RULE3_RUN = 6          # rule 3: run length
RULE5_MULT = 5.7       # rule 5: stretch, x median
RULE5_SPAN = 4
GOLDEN_RULES = 3       # golden entry: how many statistical rules must agree
GOLDEN_MULT = 9.0      # ...on top of an extreme stretch
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70.0  # rule 6

# `alone` is informational: rule 6 firing with no statistical rule alongside it.
Signal = namedtuple("Signal", "rule name side detail stream accuracy alone")


# --- small helpers ----------------------------------------------------------
def moves(closes):
    """Close-to-close moves; their sign is the colour the market settles on."""
    return [closes[i] - closes[i - 1] for i in range(1, len(closes))]


def _median(xs):
    """Upper median — the convention the research code used; keep it."""
    s = sorted(xs)
    return s[len(s) // 2] if s else 0.0


def _stdev(xs):
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5


def rsi(closes, period=RSI_PERIOD):
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
def rule1(closes):
    """Close breaks the 20-close extreme AND volatility is not collapsing."""
    if len(closes) < LOOKBACK + 2:
        return None
    cur = closes[-1]
    window = closes[-(LOOKBACK + 1):-1]
    hi, lo = max(window), min(window)
    if cur > hi:
        side, level = "down", hi
    elif cur < lo:
        side, level = "up", lo
    else:
        return None
    if len(closes) >= 101:
        tail = closes[-101:]
        rets = [(tail[i] - tail[i - 1]) / tail[i - 1]
                for i in range(1, len(tail)) if tail[i - 1]]
        slow = _stdev(rets)
        if slow <= 0 or _stdev(rets[-20:]) / slow < VOL_TH:
            return None
    return {"side": side, "level": level}


def rule2(closes, mult=RULE2_MULT):
    """Three same-direction moves ending in an oversized one -> fade."""
    if len(closes) < 104:
        return None
    mv = moves(closes[-104:])
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
    mv = moves(closes)[-run:]
    if any(m == 0 for m in mv) or len({m > 0 for m in mv}) != 1:
        return None
    return {"side": "down" if mv[-1] > 0 else "up", "run": run}


def rule4(closes):
    """
    AABA — two same-direction moves, one against, back to the first.

    No edge on its own (48.8% out-of-sample) and it is NOT emitted as a signal.
    It exists because rule 6 is defined on top of it.
    """
    if len(closes) < 6:
        return None
    m = moves(closes)[-4:]
    if any(x == 0 for x in m):
        return None
    a = m[0] > 0
    if not ((m[1] > 0) == a and (m[2] > 0) != a and (m[3] > 0) == a):
        return None
    return {"up_leg": a}


def rule5(closes, mult=RULE5_MULT, span=RULE5_SPAN):
    """Net travel over `span` candles beyond `mult` median moves -> fade it."""
    if len(closes) < 101 + span:
        return None
    net = closes[-1] - closes[-1 - span]
    if net == 0:
        return None
    med = _median([abs(m) for m in moves(closes[-101:])])
    if med <= 0 or abs(net) / med < mult:
        return None
    return {"side": "down" if net > 0 else "up", "times": abs(net) / med}


def rule6(closes):
    """
    AABA completed while RSI(14) >= 70 -> bet DOWN.

    The one condition, out of 114 tested, that made the user's own pattern do
    something: 59.1% over 724 occurrences, positive in all six chronological
    blocks, 0 of 300 shuffled-label runs reached it, and 61% on the subset where
    no other rule fires. In 93% of cases this is the OPPOSITE of what rule 4
    would have said — the pattern marks exhaustion, not continuation.

    One-sided by measurement, not by choice: the mirror condition (RSI <= 30,
    bet up) scores 50.07%, i.e. nothing. Do not add it out of symmetry.
    """
    if rule4(closes) is None:
        return None
    r = rsi(closes)
    if r is None or r < RSI_OVERBOUGHT:
        return None
    return {"side": "down", "rsi": r}


# --- putting them together --------------------------------------------------
def evaluate(closes, streams=("rule6", "golden")):
    """
    Signals for the just-closed candle, as bets on the window now opening.

    `streams` selects which betting streams are live. They are kept SEPARATE on
    purpose — measured over 12 months, one shared martingale ladder returned
    $14,650 while two independent ladders over the identical signals returned
    $18,150, because a ladder pays the same +base per cycle no matter which rule
    closed it, so a 60% signal is worth no more than a 53% one once they share
    a ladder. Ranked: rule 6 first, since it is the more accurate stream.
    """
    out = []
    stat = [(1, "شکستِ ۲۰ کندلی", rule1(closes)),
            (2, "۳ حرکتِ هم‌جهت + حرکتِ بزرگ", rule2(closes)),
            (3, "رشتهٔ هم‌جهت", rule3(closes)),
            (5, "کشیدگیِ ۴ کندلی", rule5(closes))]
    fired = [(n, lab, s) for n, lab, s in stat if s]
    if "rule6" in streams:
        s6 = rule6(closes)
        if s6:
            # `alone` is a LABEL, not a second stream. Splitting it into its own
            # ladder would silently give rule 6 two independent martingales and
            # halve the recovery each one sees.
            alone = not fired
            out.append(Signal(
                6, "AABA در اشباع خرید", s6["side"],
                f"RSI={s6['rsi']:.0f}" + ("، تنها" if alone else "، همراهِ قانون‌های آماری"),
                "rule6", 61.0 if alone else 56.0, alone))
    if "golden" in streams:
        g = golden(closes)
        if g:
            out.append(Signal(
                0, "ورودِ طلایی", g["side"],
                f"{g['agree']} قانونِ هم‌نظر + کشیدگیِ {g['times']:.1f}×",
                "golden", 55.7, False))
    if "statistical" in streams and fired:
        # ONE signal for the window, not one per rule: several rules reading the
        # same series is a single bet on a single market. Emitting one each
        # would place duplicate orders and settle the ladder once, so the
        # accounting would silently drift from reality.
        sides = {s["side"] for _, _, s in fired}
        if len(sides) == 1:
            out.append(Signal(
                min(n for n, _, _ in fired),
                "قانون‌های آماری: " + "، ".join(str(n) for n, _, _ in fired),
                sides.pop(), "، ".join(lab for _, lab, _ in fired),
                "statistical", 53.7, False))
    return out


def golden(closes):
    """
    Quality tier: enough statistical rules agreeing on an extreme stretch.

    58.3% out-of-sample, ~3.7 signals a day. Rule 4 is deliberately excluded
    from the vote — a rule with no edge would only dilute what this measures.
    """
    fired = [r for r in (rule1(closes), rule2(closes), rule3(closes),
                         rule5(closes)) if r]
    if len(fired) < GOLDEN_RULES:
        return None
    sides = {r["side"] for r in fired}
    if len(sides) != 1:
        return None
    stretch = rule5(closes, mult=GOLDEN_MULT)
    if not stretch:
        return None
    return {"side": sides.pop(), "agree": len(fired), "times": stretch["times"]}


class Ladder:
    """
    One martingale ladder: base, 2x, 4x. A win ends the cycle and nets +base.

    Three losses in a row is a bust — the ladder resets and the cycle is down
    7x base. Measured on rule 6 over 12 months: 22 busts, worst drawdown $850
    at a $50 base, longest losing run 8.
    """

    def __init__(self, base=50.0, rungs=3, state=None):
        self.base = base
        self.rungs = rungs
        self.rung = 0
        self.pnl = 0.0
        self.wins = self.losses = self.busts = 0
        self.peak = 0.0
        self.drawdown = 0.0
        if state:
            self.__dict__.update(state)

    @property
    def stake(self):
        return self.base * 2 ** self.rung

    def settle(self, won):
        """Record an outcome and move the ladder. Returns the realised P&L."""
        stake = self.stake
        if won:
            self.pnl += stake
            self.wins += 1
            self.rung = 0
        else:
            self.pnl -= stake
            self.losses += 1
            self.rung += 1
            if self.rung >= self.rungs:
                self.busts += 1
                self.rung = 0
        self.peak = max(self.peak, self.pnl)
        self.drawdown = max(self.drawdown, self.peak - self.pnl)
        return stake if won else -stake

    def state(self):
        return dict(self.__dict__)


class Book:
    """
    One ladder per stream, kept strictly independent.

    Mixing them is the single most expensive mistake available here: a loss on
    one stream must NOT raise the stake on another. If rule 6 is on rung 3 and
    the golden stream fires, that bet starts at rung 1.
    """

    def __init__(self, state=None, bases=None):
        bases = bases or {"rule6": 50.0, "golden": 20.0, "statistical": 20.0}
        self.bases = bases
        self.ladders = {}
        for name, base in bases.items():
            self.ladders[name] = Ladder(base, state=(state or {}).get(name))

    def stake(self, stream):
        return self.ladders[stream].stake

    def rung(self, stream):
        return self.ladders[stream].rung + 1

    def settle(self, stream, won):
        return self.ladders[stream].settle(won)

    def state(self):
        return {k: v.state() for k, v in self.ladders.items()}

    def report(self):
        lines = []
        for name, l in self.ladders.items():
            n = l.wins + l.losses
            if not n:
                continue
            lines.append(f"{name}: {l.wins}/{n} ({l.wins / n * 100:.1f}%)  "
                         f"P&L {l.pnl:+,.0f}  پله {l.rung + 1}  "
                         f"انفجار {l.busts}  بدترین افت {l.drawdown:,.0f}")
        return "\n".join(lines) or "هنوز معامله‌ای ثبت نشده."
