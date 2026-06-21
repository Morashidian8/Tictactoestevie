"""Candle model and Binance candle feed.

A candle is "green" when it closes above its open and "red" when it closes
below. A doji (close == open) is treated as NONE so strategies can decide how
to handle a flat candle rather than silently calling it one colour.
"""

from __future__ import annotations

import enum
import time
from dataclasses import dataclass
from typing import List, Optional

# Binance hosts tried in order; the public data host needs no API key.
_BINANCE_HOSTS = (
    "https://data-api.binance.vision",
    "https://api.binance.com",
)

# Candle intervals we support, mapped to Binance's interval strings.
SUPPORTED_INTERVALS = ("5m", "15m", "1h", "1d")


class Color(enum.Enum):
    GREEN = "green"   # close > open  -> "up"
    RED = "red"       # close < open  -> "down"
    NONE = "none"     # close == open -> flat / doji

    @property
    def is_up(self) -> bool:
        return self is Color.GREEN

    @property
    def is_down(self) -> bool:
        return self is Color.RED


@dataclass(frozen=True)
class Candle:
    open_time: int       # unix seconds
    close_time: int      # unix seconds
    open: float
    high: float
    low: float
    close: float

    @property
    def color(self) -> Color:
        if self.close > self.open:
            return Color.GREEN
        if self.close < self.open:
            return Color.RED
        return Color.NONE

    @property
    def is_closed(self) -> bool:
        return self.close_time <= time.time()


def fetch_binance_candles(
    symbol: str = "BTCUSDT",
    interval: str = "5m",
    limit: int = 200,
    *,
    only_closed: bool = True,
    _requests=None,
) -> List[Candle]:
    """Return closed Binance candles, oldest -> newest.

    `_requests` is injectable so tests can run without network access.
    """
    if interval not in SUPPORTED_INTERVALS:
        raise ValueError(f"unsupported interval {interval!r}; use one of {SUPPORTED_INTERVALS}")

    requests = _requests
    if requests is None:  # pragma: no cover - exercised only with real network
        import requests as requests  # type: ignore

    last_err: Optional[Exception] = None
    rows = None
    for host in _BINANCE_HOSTS:
        try:
            resp = requests.get(
                f"{host}/api/v3/klines",
                params={"symbol": symbol, "interval": interval, "limit": limit},
                timeout=15,
            )
            resp.raise_for_status()
            rows = resp.json()
            break
        except Exception as exc:  # noqa: BLE001 - try next host
            last_err = exc
            continue
    if rows is None:
        raise RuntimeError(f"could not fetch candles from Binance: {last_err}")

    return _rows_to_candles(rows, only_closed=only_closed)


def _rows_to_candles(rows, *, only_closed: bool) -> List[Candle]:
    """Convert Binance kline rows to Candle objects.

    Row layout: [openTime(ms), open, high, low, close, volume, closeTime(ms), ...].
    """
    now = time.time()
    candles: List[Candle] = []
    for row in rows:
        open_time = int(row[0]) / 1000.0
        close_time = int(row[6]) / 1000.0
        if only_closed and close_time > now:
            continue
        candles.append(
            Candle(
                open_time=int(open_time),
                close_time=int(close_time),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
            )
        )
    candles.sort(key=lambda c: c.open_time)
    return candles
