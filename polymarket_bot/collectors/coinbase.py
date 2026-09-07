"""Coinbase Exchange public market-data feed.

Endpoint ``wss://ws-feed.exchange.coinbase.com``. Subscribe with

    {"type":"subscribe","product_ids":["BTC-USD"],"channels":["ticker","matches"]}

Two channels are used by default, and both are public:

* ``ticker`` — one message per trade, carrying ``best_bid``/``best_ask`` (and,
  on the current format, ``best_bid_size``/``best_ask_size``). This is the only
  top-of-book Coinbase gives away without credentials.
* ``matches`` — the trade tape.

``level2``/``level2_batch`` are deliberately **not** in the default set: Coinbase
requires authentication for them on this feed. They can be enabled through
config once credentials exist, and the parser below already handles the
``snapshot`` and ``l2update`` messages they produce — but do not assume depth is
available until a real connection has been observed delivering it.

One trap worth spelling out. In a ``match`` message, ``side`` is the **maker's**
side, not the taker's. A sell-side match means the resting order was a sell and
the aggressor was therefore a buyer. Getting this backwards inverts the trade
imbalance feature, which is precisely the kind of silent sign error that makes a
backtest look profitable for the wrong reason, so the inversion is done here,
once, at the boundary.

Timestamps are RFC 3339 strings with microsecond resolution
(``"2020-01-31T20:03:41.158814Z"``), not epoch numbers.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from ..core.clock import now_ns
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

FEED_URL = "wss://ws-feed.exchange.coinbase.com"
SANDBOX_URL = "wss://ws-feed-public.sandbox.exchange.coinbase.com"
PUBLIC_CHANNELS = ["ticker", "matches"]


def build_subscribe(product_ids: list[str], channels: list[str]) -> str:
    return json.dumps(
        {"type": "subscribe", "product_ids": product_ids, "channels": channels}
    )


def parse_rfc3339_ns(value: str | None) -> int | None:
    """Coinbase's ISO-8601 timestamp -> epoch nanoseconds.

    `datetime.fromisoformat` handles the microseconds; the nanosecond result is
    therefore always a multiple of 1000, which is honest about the resolution
    actually on the wire.
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1_000_000) * 1_000


def _levels(raw) -> tuple[tuple[float, float], ...]:
    return tuple((float(p), float(s)) for p, s in raw)


def _float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_message(raw: str | bytes, recv_ts_ns: int) -> list[MarketEvent]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    msg = json.loads(raw)
    proc = now_ns()
    kind = msg.get("type")
    product = msg.get("product_id", "")

    if kind in ("subscriptions", "heartbeat"):
        return []

    if kind == "error":
        return [
            UnknownEvent(
                venue=Venue.COINBASE,
                symbol=product,
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                kind=f"error:{msg.get('message')}",
                raw=msg,
            )
        ]

    if kind == "ticker":
        events: list[MarketEvent] = [
            QuoteEvent(
                venue=Venue.COINBASE,
                symbol=product,
                exchange_ts_ns=parse_rfc3339_ns(msg.get("time")),
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                sequence=msg.get("sequence"),
                bid=_float(msg.get("best_bid")),
                # Older ticker payloads omit the sizes. Zero here is not a real
                # size; consumers must treat a zero-size quote as "size
                # unknown" rather than as an empty book.
                bid_size=_float(msg.get("best_bid_size")),
                ask=_float(msg.get("best_ask")),
                ask_size=_float(msg.get("best_ask_size")),
                raw=msg,
            )
        ]
        return events

    if kind in ("match", "last_match"):
        maker_side = msg.get("side")
        return [
            TradeEvent(
                venue=Venue.COINBASE,
                symbol=product,
                exchange_ts_ns=parse_rfc3339_ns(msg.get("time")),
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                sequence=msg.get("sequence"),
                price=float(msg["price"]),
                size=float(msg["size"]),
                # See module docstring: `side` is the maker's, so invert it.
                aggressor=Side.BUY if maker_side == "sell" else Side.SELL,
                trade_id=str(msg.get("trade_id", "")),
                raw=msg,
            )
        ]

    if kind == "snapshot":
        return [
            BookEvent(
                venue=Venue.COINBASE,
                symbol=product,
                exchange_ts_ns=parse_rfc3339_ns(msg.get("time")),
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                bids=_levels(msg.get("bids", ())),
                asks=_levels(msg.get("asks", ())),
                is_snapshot=True,
                raw=msg,
            )
        ]

    if kind == "l2update":
        bids = tuple(
            (float(price), float(size))
            for side, price, size in msg.get("changes", ())
            if side == "buy"
        )
        asks = tuple(
            (float(price), float(size))
            for side, price, size in msg.get("changes", ())
            if side == "sell"
        )
        return [
            BookEvent(
                venue=Venue.COINBASE,
                symbol=product,
                exchange_ts_ns=parse_rfc3339_ns(msg.get("time")),
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=proc,
                bids=bids,
                asks=asks,
                is_snapshot=False,
                raw=msg,
            )
        ]

    return [
        UnknownEvent(
            venue=Venue.COINBASE,
            symbol=product,
            recv_ts_ns=recv_ts_ns,
            proc_ts_ns=proc,
            kind=str(kind or "?"),
            raw=msg,
        )
    ]


class CoinbaseCollector(WSCollector):
    venue = Venue.COINBASE

    def __init__(
        self,
        bus,
        product_ids: list[str],
        *,
        url: str = FEED_URL,
        channels: list[str] | None = None,
        **kwargs,
    ) -> None:
        super().__init__(bus, **kwargs)
        self.product_ids = product_ids
        self._url = url
        self.channels = channels or list(PUBLIC_CHANNELS)

    def url(self) -> str:
        return self._url

    def subscribe_frames(self) -> list[str]:
        return [build_subscribe(self.product_ids, self.channels)]

    def parse(self, raw, recv_ts_ns):
        return parse_message(raw, recv_ts_ns)
