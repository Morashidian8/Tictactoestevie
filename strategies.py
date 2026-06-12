"""
Pluggable trading strategies for the Polymarket trading bot (trade_bot.py).

A strategy receives the directions of recent *resolved* 5-minute windows
(oldest -> newest, +1 = Up, -1 = Down, 0 = flat/unknown) and returns the
outcome to buy for the *current* window: "up", "down", or None (no trade).

To add your own strategy, subclass Strategy, implement decide(), and
register it in STRATEGIES at the bottom of this file. Then select it with
the STRATEGY environment variable.
"""


def alternation_streak(directions) -> int:
    """Length of the trailing run of strictly alternating directions."""
    if not directions:
        return 0
    streak = 1
    for i in range(len(directions) - 1, 0, -1):
        cur, prev = directions[i], directions[i - 1]
        if cur != 0 and prev != 0 and cur == -prev:
            streak += 1
        else:
            break
    return streak


class Strategy:
    name = "base"

    def decide(self, directions):
        """Return "up", "down", or None given resolved window directions."""
        raise NotImplementedError

    def describe(self) -> str:
        return self.name


class AlternationStrategy(Strategy):
    """
    Trade the alternation pattern the alert bot watches for.

    When the last `threshold` windows alternated strictly (Up/Down/Up/...),
    bet on the current window:
      - mode="follow": the alternation continues (opposite of last window)
      - mode="fade":   the alternation breaks (same as last window)
    """

    name = "alternation"

    def __init__(self, threshold: int = 5, mode: str = "follow"):
        if mode not in ("follow", "fade"):
            raise ValueError("mode must be 'follow' or 'fade'")
        self.threshold = max(2, int(threshold))
        self.mode = mode

    def decide(self, directions):
        if not directions or directions[-1] == 0:
            return None
        if alternation_streak(directions) < self.threshold:
            return None
        last = directions[-1]
        nxt = -last if self.mode == "follow" else last
        return "up" if nxt > 0 else "down"

    def describe(self) -> str:
        return f"alternation(threshold={self.threshold}, mode={self.mode})"


class StreakStrategy(Strategy):
    """
    Trade a one-directional run: after `threshold` windows in the SAME
    direction, bet it continues (mode="follow") or reverses (mode="fade").
    """

    name = "streak"

    def __init__(self, threshold: int = 4, mode: str = "fade"):
        if mode not in ("follow", "fade"):
            raise ValueError("mode must be 'follow' or 'fade'")
        self.threshold = max(2, int(threshold))
        self.mode = mode

    def decide(self, directions):
        if len(directions) < self.threshold:
            return None
        tail = directions[-self.threshold:]
        if any(d == 0 for d in tail) or len(set(tail)) != 1:
            return None
        last = tail[-1]
        nxt = last if self.mode == "follow" else -last
        return "up" if nxt > 0 else "down"

    def describe(self) -> str:
        return f"streak(threshold={self.threshold}, mode={self.mode})"


STRATEGIES = {
    AlternationStrategy.name: AlternationStrategy,
    StreakStrategy.name: StreakStrategy,
}


def make_strategy(name: str, threshold: int, mode: str) -> Strategy:
    cls = STRATEGIES.get(name.strip().lower())
    if cls is None:
        raise SystemExit(
            f"Unknown STRATEGY '{name}'. Available: {', '.join(STRATEGIES)}"
        )
    return cls(threshold=threshold, mode=mode)
