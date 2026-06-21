"""Strategy engine.

Two ways to define a strategy:

1. Subclass `Strategy` and implement `decide()` in Python (full flexibility).
2. Build a `RuleStrategy` from a JSON/dict DSL — no code, safe to accept from the
   Android app. Rules are evaluated top to bottom; the first match wins.

A strategy maps a candle history to a `Signal`:
    UP   -> bet the market goes up   (Polymarket "Up" / green)
    DOWN -> bet the market goes down (Polymarket "Down" / red)
    NONE -> sit this candle out
"""

from __future__ import annotations

import enum
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Sequence

from .candles import Candle, Color
from . import indicators


class Signal(enum.Enum):
    UP = "up"
    DOWN = "down"
    NONE = "none"

    @staticmethod
    def from_color(color: Optional[Color]) -> "Signal":
        if color is Color.GREEN:
            return Signal.UP
        if color is Color.RED:
            return Signal.DOWN
        return Signal.NONE

    @property
    def opposite(self) -> "Signal":
        if self is Signal.UP:
            return Signal.DOWN
        if self is Signal.DOWN:
            return Signal.UP
        return Signal.NONE


class Strategy(ABC):
    name: str = "strategy"

    @abstractmethod
    def decide(self, candles: Sequence[Candle]) -> Signal:
        """Return the signal for the candle that is *about to form*, given closed history."""
        raise NotImplementedError


class SameColorStrategy(Strategy):
    """Bet the next candle matches the last one (red->down, green->up).

    `min_streak` requires at least N identical colours in a row before acting,
    so you can express "after the candle closes red, enter red" (min_streak=1)
    or "after 3 reds, enter red" (min_streak=3).
    """

    name = "same_color"

    def __init__(self, min_streak: int = 1, invert: bool = False) -> None:
        if min_streak < 1:
            raise ValueError("min_streak must be >= 1")
        self.min_streak = min_streak
        self.invert = invert

    def decide(self, candles: Sequence[Candle]) -> Signal:
        if not candles:
            return Signal.NONE
        if indicators.same_color_streak(candles) < self.min_streak:
            return Signal.NONE
        signal = Signal.from_color(candles[-1].color)
        return signal.opposite if self.invert else signal


# --------------------------------------------------------------------------- #
# Rule DSL
# --------------------------------------------------------------------------- #

def _facts(candles: Sequence[Candle]) -> Dict[str, Any]:
    """Flatten the candle history into the named facts conditions can reference."""
    last = candles[-1].color if candles else Color.NONE
    return {
        "last_color": last.value,
        "same_color_streak": indicators.same_color_streak(candles),
        "alternation_streak": indicators.alternation_streak(candles),
        "count": len(candles),
        "candles": candles,
    }


def _eval_condition(cond: Dict[str, Any], facts: Dict[str, Any]) -> bool:
    """Evaluate one DSL condition node against the facts.

    Supported nodes:
      {"all": [ ... ]}                  all sub-conditions true
      {"any": [ ... ]}                  any sub-condition true
      {"not": { ... }}                  negation
      {"last_color": "red"|"green"}     last candle colour
      {"streak_at_least": N}            same_color_streak >= N
      {"streak_equals": N}              same_color_streak == N
      {"alternation_at_least": N}       alternation_streak >= N
      {"sma_cross": {"fast": F, "slow": S, "dir": "above"|"below"}}
    """
    if "all" in cond:
        return all(_eval_condition(c, facts) for c in cond["all"])
    if "any" in cond:
        return any(_eval_condition(c, facts) for c in cond["any"])
    if "not" in cond:
        return not _eval_condition(cond["not"], facts)
    if "last_color" in cond:
        return facts["last_color"] == cond["last_color"]
    if "streak_at_least" in cond:
        return facts["same_color_streak"] >= int(cond["streak_at_least"])
    if "streak_equals" in cond:
        return facts["same_color_streak"] == int(cond["streak_equals"])
    if "alternation_at_least" in cond:
        return facts["alternation_streak"] >= int(cond["alternation_at_least"])
    if "sma_cross" in cond:
        spec = cond["sma_cross"]
        candles = facts["candles"]
        fast = indicators.sma(candles, int(spec["fast"]))
        slow = indicators.sma(candles, int(spec["slow"]))
        if fast is None or slow is None:
            return False
        return fast > slow if spec.get("dir", "above") == "above" else fast < slow
    raise ValueError(f"unknown condition: {cond!r}")


def _resolve_signal(value: str, candles: Sequence[Candle]) -> Signal:
    """Map a rule's `signal` value to a concrete Signal."""
    if value in ("up", "down", "none"):
        return Signal(value)
    last = Signal.from_color(candles[-1].color) if candles else Signal.NONE
    if value == "same":
        return last
    if value == "opposite":
        return last.opposite
    raise ValueError(f"unknown signal: {value!r}")


class RuleStrategy(Strategy):
    """Strategy assembled from a list of {when, signal} rules (the DSL).

    Example — "after the candle closes red, enter the next one red too":
        RuleStrategy([
            {"when": {"all": [{"last_color": "red"}, {"streak_at_least": 1}]},
             "signal": "same"},
        ])
    """

    name = "rule"

    def __init__(self, rules: List[Dict[str, Any]], name: str = "rule") -> None:
        if not rules:
            raise ValueError("a RuleStrategy needs at least one rule")
        self.rules = rules
        self.name = name

    def decide(self, candles: Sequence[Candle]) -> Signal:
        if not candles:
            return Signal.NONE
        facts = _facts(candles)
        for rule in self.rules:
            when = rule.get("when")
            if when is None or _eval_condition(when, facts):
                return _resolve_signal(rule["signal"], candles)
        return Signal.NONE

    @classmethod
    def from_dict(cls, spec: Dict[str, Any]) -> "RuleStrategy":
        """Build from {"name": ..., "rules": [...]} — what the Android app sends."""
        return cls(rules=spec["rules"], name=spec.get("name", "rule"))
