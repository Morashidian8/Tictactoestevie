"""Binance spot market-data streams.

Verified against binance/binance-spot-api-docs `web-socket-streams.md`:

* base endpoint ``wss://stream.binance.com:9443`` (``:443`` also documented);
  ``wss://data-stream.binance.vision`` serves market data only and is the
  safer host for a process that holds no API key.
* combined streams at ``/stream?streams=<a>/<b>`` wrap every payload as
  ``{"stream": ..., "data": ...}``; all stream names are lowercase.
* ``timeUnit=MICROSECOND`` in the query string switches every time field from
  milliseconds to microseconds. We ask for it, because a 5-minute market
  decided by sub-second moves should not have its timestamps quantised to the
  millisecond before we even see them.
* a connection is dropped at the 24-hour mark by design, which the base class's
  reconnect loop already handles.

Field-name reference (from the same document):

    @trade       e E s t p q T m M
    @bookTicker  u s b B a A          <- no timestamp of any kind
    @depth<N>    lastUpdateId bids asks  <- also no timestamp

That absence matters: for those two streams the only timestamp that exists is
ours, so `exchange_ts_ns` is None and the staleness logic falls back to local
receive time. Do not invent one.
"""

from __future__ import annotations

import json

from ..core.clock import now_ns, parse_epoch_ns
from ..core.events import (
    BookEvent,
    MarketEvent,
    QuoteEvent,
    Side,
    TradeEvent,
    UnknownEvent,
    Venue,
)
from .base import WSCollector

DEFAULT_HOST = "wss://stream.binance.com:9443"
MARKET_DATA_HOST = "wss://data-stream.binance.vision"


def build_url(
    symbols: list[str],
    *,
    host: str = DEFAULT_HOST,
    depth_levels: int = 20,
    depth_speed_ms: int = 100,
    time_unit: str = "MICROSECOND",
) -> str:
    """Combined-stream URL for trades, book ticker and partial depth.

    `depth_levels` must be 5, 10 or 20 — the only values the partial-book
    stream accepts — and `depth_speed_ms` 100 or 1000.
    """
    if depth_levels not in (5, 10, 20):
        raise ValueError("binance partial depth supports levels 5, 10 or 20")
    if depth_speed_ms not in (100, 1000):
        raise ValueError("binance depth update speed is 100ms or 1000ms")
    speed = "@100ms" if depth_speed_ms == 100 else ""
    streams = []
    for symbol in symbols:
        s = symbol.lower()
        streams += [f"{s}@trade", f"{s}@bookTicker", f"{s}@depth{depth_levels}{speed}"]
    url = f"{host}/stream?streams={'/'.join(streams)}"
    if time_unit:
        url += f"&timeUnit={time_unit}"
    return url


def _levels(raw) -> tuple[tuple[float, float], ...]:
    return tuple((float(p), float(q)) for p, q in raw)


def parse_message(raw: str | bytes, recv_ts_ns: int, *, ts_unit: str = "us") -> list[MarketEvent]:
    """Pure parser. `ts_unit` must match the `timeUnit` used in the URL."""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    msg = json.loads(raw)

    stream = msg.get("stream")
    data = msg.get("data", msg)
    if not isinstance(data, dict):
        return []

    # A subscribe/unsubscribe reply, or the serverShutdown notice.
    if "result" in data and "id" in data:
        return []

    proc = now_ns()
    event_type = data.get("e")

    if event_type == "trade":
        return [
            TradeEvent(
                venue=Venue.BINANCE,
                symbol=data["s"],
                exchange_ts_ns=parse_epoch_ns(data.get("T"), ts_unit),
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                sequence=int(data["t"]),
                price=float(data["p"]),
                size=float(data["q"]),
                # "m" is "is the buyer the market maker". True therefore means
                # the aggressor was the seller. Getting this backwards silently
                # inverts every trade-imbalance feature downstream.
                aggressor=Side.SELL if data.get("m") else Side.BUY,
                trade_id=str(data["t"]),
                raw=data,
            )
        ]

    if event_type == "depthUpdate":
        return [
            BookEvent(
                venue=Venue.BINANCE,
                symbol=data["s"],
                exchange_ts_ns=parse_epoch_ns(data.get("E"), ts_unit),
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                sequence=int(data["u"]),
                bids=_levels(data.get("b", ())),
                asks=_levels(data.get("a", ())),
                is_snapshot=False,
                raw=data,
            )
        ]

    # bookTicker and partial depth carry no "e" field; the stream name is the
    # only way to tell them apart.
    if "b" in data and "a" in data and "u" in data and "s" in data:
        return [
            QuoteEvent(
                venue=Venue.BINANCE,
                symbol=data["s"],
                exchange_ts_ns=None,  # the venue sends none. See module docstring.
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                sequence=int(data["u"]),
                bid=float(data["b"]),
                bid_size=float(data["B"]),
                ask=float(data["a"]),
                ask_size=float(data["A"]),
                raw=data,
            )
        ]

    if "lastUpdateId" in data:
        symbol = ""
        if isinstance(stream, str):
            symbol = stream.split("@", 1)[0].upper()
        return [
            BookEvent(
                venue=Venue.BINANCE,
                symbol=symbol,
                exchange_ts_ns=None,
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                sequence=int(data["lastUpdateId"]),
                bids=_levels(data.get("bids", ())),
                asks=_levels(data.get("asks", ())),
                is_snapshot=True,
                raw=data,
            )
        ]

    return [
        UnknownEvent(
            venue=Venue.BINANCE,
            symbol=str(data.get("s", stream or "")),
            recv_ts_ns=recv_ts_ns,
            proc_ts_ns=proc,
            kind=str(event_type or stream or "?"),
            raw=data,
        )
    ]


class BinanceCollector(WSCollector):
    venue = Venue.BINANCE

    def __init__(
        self,
        bus,
        symbols: list[str],
        *,
        host: str = DEFAULT_HOST,
        depth_levels: int = 20,
        depth_speed_ms: int = 100,
        time_unit: str = "MICROSECOND",
        **kwargs,
    ) -> None:
        super().__init__(bus, **kwargs)
        self.symbols = symbols
        self.host = host
        self.depth_levels = depth_levels
        self.depth_speed_ms = depth_speed_ms
        self.time_unit = time_unit
        self.ts_unit = "us" if time_unit.upper().startswith("MICRO") else "ms"

    def url(self) -> str:
        return build_url(
            self.symbols,
            host=self.host,
            depth_levels=self.depth_levels,
            depth_speed_ms=self.depth_speed_ms,
            time_unit=self.time_unit,
        )

    def parse(self, raw, recv_ts_ns):
        return parse_message(raw, recv_ts_ns, ts_unit=self.ts_unit)
