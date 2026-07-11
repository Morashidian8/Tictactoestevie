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
INTERVAL_SECONDS = {"5m": 300, "15m": 900, "1h": 3600, "1d": 86_400}


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


class BinanceLiveFeed:
    """Live feed of *closed* Binance candles, matching the real BTC chart.

    `next()` returns the newest closed candle the first time it is seen and
    None until a new one closes — the runner just skips None ticks. Missed
    candles during downtime are NOT replayed (live-consecutive-only, same rule
    as the phone app); check `gap_detected` after each candle and reset the
    strategy state when it is True.
    """

    def __init__(self, symbol: str = "BTCUSDT", interval: str = "5m", *, _requests=None) -> None:
        if interval not in SUPPORTED_INTERVALS:
            raise ValueError(f"unsupported interval {interval!r}; use one of {SUPPORTED_INTERVALS}")
        self.symbol = symbol
        self.interval = interval
        self._requests = _requests
        self._last_open: Optional[int] = None
        self.gap_detected = False   # newest candle didn't directly follow the previous one

    def next(self) -> Optional[Candle]:
        candles = fetch_binance_candles(
            symbol=self.symbol, interval=self.interval, limit=3,
            only_closed=True, _requests=self._requests,
        )
        if not candles:
            return None
        newest = candles[-1]
        if self._last_open is not None and newest.open_time == self._last_open:
            return None   # nothing new yet
        # Binance close times end at open + interval - 1ms, so derive the spacing
        # from the configured interval, not from close_time - open_time.
        interval_s = INTERVAL_SECONDS[self.interval]
        self.gap_detected = (
            self._last_open is not None
            and newest.open_time != self._last_open + interval_s
        )
        self._last_open = newest.open_time
        return newest


class SyntheticFeed:
    """Streaming random-walk candle generator for the live paper loop / demos."""

    def __init__(
        self,
        start_price: float = 65_000.0,
        interval_seconds: int = 300,
        volatility: float = 60.0,
        seed: Optional[int] = None,
    ) -> None:
        import random
        self._rng = random.Random(seed)
        self._price = start_price
        self._interval = interval_seconds
        self._vol = volatility
        self._t = 0

    def next(self) -> Candle:
        o = self._price
        c = o + self._rng.uniform(-self._vol, self._vol)
        hi = max(o, c) + self._rng.uniform(0, self._vol / 2)
        lo = min(o, c) - self._rng.uniform(0, self._vol / 2)
        now = int(time.time())   # real wall-clock so the UI shows real entry times
        candle = Candle(
            open_time=now - self._interval,
            close_time=now,
            open=o,
            high=hi,
            low=lo,
            close=c,
        )
        self._price = c
        self._t += self._interval
        return candle


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
