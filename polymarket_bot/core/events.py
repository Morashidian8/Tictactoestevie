"""Normalized market events.

Four venues speak four dialects. Everything downstream — the recorder, the
feature engine, the replay backtester — sees only the types in this module, so
a venue's wire format is a fact about exactly one parser and nothing else.

Two rules the whole system depends on:

1. Prices and sizes are floats here, but every parser keeps the venue's own
   string in `raw` where the recorder can still reach it. Phase 2 writes the
   raw string, not the float, so a rounding decision made today cannot corrupt
   a dataset replayed in six months.
2. Nothing in an event may depend on information that arrived after
   `recv_ts_ns`. That is the whole anti-look-ahead contract, and it starts here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

Level = tuple[float, float]
"""(price, size) — one order-book price level."""


class Venue(str, Enum):
    BINANCE = "binance"
    OKX = "okx"
    COINBASE = "coinbase"
    POLYMARKET = "polymarket"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class ConnState(str, Enum):
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    SUBSCRIBED = "SUBSCRIBED"
    DISCONNECTED = "DISCONNECTED"
    ERROR = "ERROR"


@dataclass(frozen=True, slots=True, kw_only=True)
class MarketEvent:
    """Base for everything on the bus.

    `symbol` is the venue's own identifier: "BTCUSDT" on Binance, "BTC-USDT" on
    OKX, "BTC-USD" on Coinbase, and the CLOB token id on Polymarket. Mapping
    those onto one instrument is the reference-price engine's job (Phase 3), not
    the collector's.
    """

    venue: Venue
    symbol: str
    recv_ts_ns: int
    proc_ts_ns: int
    exchange_ts_ns: int | None = None
    sequence: int | None = None
    raw: Any = None

    @property
    def processing_ns(self) -> int:
        """Local parse cost. Same clock both ends, so this one is exact."""
        return self.proc_ts_ns - self.recv_ts_ns

    @property
    def transport_ns(self) -> int | None:
        """recv - exchange, uncorrected for clock skew. An estimate."""
        if self.exchange_ts_ns is None:
            return None
        return self.recv_ts_ns - self.exchange_ts_ns

    def age_ns(self, now_ns: int) -> int:
        """How stale this event is, measured on the local clock only."""
        return now_ns - self.recv_ts_ns


@dataclass(frozen=True, slots=True, kw_only=True)
class TradeEvent(MarketEvent):
    price: float
    size: float
    aggressor: Side | None = None
    trade_id: str | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class QuoteEvent(MarketEvent):
    """Top of book."""

    bid: float
    bid_size: float
    ask: float
    ask_size: float

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2.0

    @property
    def spread(self) -> float:
        return self.ask - self.bid

    @property
    def microprice(self) -> float:
        """Size-weighted mid — leans toward the side with less size behind it.

        Undefined with no size on a side; falls back to the plain mid rather
        than raising, because a momentarily empty side is normal and must not
        stop the feed.
        """
        total = self.bid_size + self.ask_size
        if total <= 0:
            return self.mid
        return (self.bid * self.ask_size + self.ask * self.bid_size) / total


@dataclass(frozen=True, slots=True, kw_only=True)
class BookEvent(MarketEvent):
    """Depth snapshot, best level first on both sides.

    `is_snapshot=False` marks an incremental update, where a size of 0 means
    "remove this level". No collector in Phase 1 emits incrementals yet — the
    field exists so a later diff-depth feed does not change the type.
    """

    bids: tuple[Level, ...]
    asks: tuple[Level, ...]
    is_snapshot: bool = True

    @property
    def best_bid(self) -> Level | None:
        return self.bids[0] if self.bids else None

    @property
    def best_ask(self) -> Level | None:
        return self.asks[0] if self.asks else None


@dataclass(frozen=True, slots=True, kw_only=True)
class PolyBookEvent(BookEvent):
    """Polymarket CLOB `book` message. `symbol` is the token (asset) id."""

    condition_id: str = ""
    book_hash: str = ""


@dataclass(frozen=True, slots=True, kw_only=True)
class PolyPriceChangeEvent(MarketEvent):
    """One entry of a CLOB `price_change` message.

    The venue batches several assets into one message; the parser fans them out
    so that every event on the bus concerns exactly one token.
    """

    price: float
    size: float
    side: Side
    best_bid: float | None = None
    best_ask: float | None = None
    condition_id: str = ""


@dataclass(frozen=True, slots=True, kw_only=True)
class PolyTradeEvent(TradeEvent):
    """CLOB `last_trade_price`."""

    condition_id: str = ""
    fee_rate_bps: float = 0.0
    transaction_hash: str = ""


@dataclass(frozen=True, slots=True, kw_only=True)
class PolyTickSizeEvent(MarketEvent):
    """CLOB `tick_size_change`.

    Worth its own type: the minimum price increment decides what a "1 tick"
    edge is worth, and it changes mid-market as a price approaches 0 or 1.
    """

    old_tick_size: float
    new_tick_size: float
    condition_id: str = ""


@dataclass(frozen=True, slots=True, kw_only=True)
class ConnectionEvent(MarketEvent):
    """Feed lifecycle. The risk layer keys its staleness kill switch off these."""

    state: ConnState
    detail: str = ""


@dataclass(frozen=True, slots=True, kw_only=True)
class UnknownEvent(MarketEvent):
    """A message the parser recognised as well-formed JSON but not as a type it
    handles. Kept rather than dropped: a silently ignored new message type is
    how a feed change becomes a week of quietly wrong data."""

    kind: str = ""


def as_record(event: MarketEvent) -> dict[str, Any]:
    """Flat dict for the Phase 2 recorder and for debug printing.

    Deliberately not `dataclasses.asdict`: that recurses into `raw` and would
    make every row carry the venue payload twice.
    """
    row: dict[str, Any] = {
        "type": type(event).__name__,
        "venue": event.venue.value,
        "symbol": event.symbol,
        "exchange_ts_ns": event.exchange_ts_ns,
        "recv_ts_ns": event.recv_ts_ns,
        "proc_ts_ns": event.proc_ts_ns,
        "sequence": event.sequence,
    }
    # __slots__ is per-class, so a subclass of BookEvent would otherwise lose
    # bids/asks. Walk the MRO to collect the whole set.
    for cls in reversed(type(event).__mro__):
        for name in getattr(cls, "__slots__", ()):
            if name in row or name == "raw":
                continue
            value = getattr(event, name)
            if isinstance(value, Enum):
                value = value.value
            row[name] = value
    return row
