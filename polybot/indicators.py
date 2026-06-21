"""Indicators and helpers over a candle history.

All functions take a list of candles ordered oldest -> newest and operate on
the most recent values. They return None when there isn't enough history so
strategies can decide what to do rather than crashing.
"""

from __future__ import annotations

from typing import List, Optional, Sequence

from .candles import Candle, Color


def closes(candles: Sequence[Candle]) -> List[float]:
    return [c.close for c in candles]


def last_color(candles: Sequence[Candle]) -> Optional[Color]:
    return candles[-1].color if candles else None


def same_color_streak(candles: Sequence[Candle]) -> int:
    """Length of the current run of identical, non-flat colours ending at the last candle.

    A flat (NONE) last candle yields 0. Example: [G, R, R, R] -> 3.
    """
    if not candles:
        return 0
    last = candles[-1].color
    if last is Color.NONE:
        return 0
    streak = 0
    for candle in reversed(candles):
        if candle.color is last:
            streak += 1
        else:
            break
    return streak


def alternation_streak(candles: Sequence[Candle]) -> int:
    """Length of the current alternating run (G,R,G,R...) ending at the last candle."""
    if not candles:
        return 0
    if candles[-1].color is Color.NONE:
        return 0
    streak = 1
    for i in range(len(candles) - 1, 0, -1):
        cur = candles[i].color
        prev = candles[i - 1].color
        if cur is Color.NONE or prev is Color.NONE or cur is prev:
            break
        streak += 1
    return streak


def sma(candles: Sequence[Candle], period: int) -> Optional[float]:
    if period <= 0 or len(candles) < period:
        return None
    window = closes(candles)[-period:]
    return sum(window) / period


def ema(candles: Sequence[Candle], period: int) -> Optional[float]:
    if period <= 0 or len(candles) < period:
        return None
    values = closes(candles)
    k = 2 / (period + 1)
    # Seed with the SMA of the first `period` values, then walk forward.
    ema_val = sum(values[:period]) / period
    for price in values[period:]:
        ema_val = price * k + ema_val * (1 - k)
    return ema_val
