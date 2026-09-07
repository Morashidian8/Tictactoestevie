"""Polymarket CLOB market channel.

Endpoint ``wss://ws-subscriptions-clob.polymarket.com/ws/market``. The
subscription frame, per Polymarket's own ``clob-client`` example
(``examples/socketConnection.ts``), is::

    {"type": "market", "assets_ids": [...], "initial_dump": true}

and the keepalive is the literal text ``PING`` (the example sends one every
50 seconds); the server answers ``PONG``.

Four event types arrive on this channel. Field names below are taken verbatim
from Polymarket's documented payloads:

    book              market asset_id timestamp hash bids[] asks[] event_type
    price_change      market timestamp event_type price_changes[]
                      -> asset_id price size side hash best_bid best_ask
    last_trade_price  asset_id market price size side timestamp
                      fee_rate_bps transaction_hash event_type
    tick_size_change  asset_id market old_tick_size new_tick_size timestamp

Timestamps are epoch **milliseconds as strings**.

Two things this collector deliberately does not do:

* It does not maintain an incremental book from ``price_change``. Those messages
  give a changed level plus the resulting best bid/ask, and rebuilding depth
  from them without a documented sequence number risks silently diverging from
  the venue. Depth comes from ``book`` snapshots; ``price_change`` is recorded
  as its own event type and the reconstruction question is settled in Phase 5
  against recorded data, not guessed at now.
* It does not add or drop assets on a live connection. A third-party library
  documents an ``{"operation": "subscribe", "assets_ids": [...]}`` frame for
  that, but it is not in Polymarket's own example, and an unacknowledged
  subscription that silently fails is indistinguishable from a quiet market.
  Since these markets turn over every 5 minutes anyway, `set_assets` reconnects
  instead — a known-good path, at the cost of one reconnect per window.
"""

from __future__ import annotations

import json

from ..core.clock import now_ns, parse_epoch_ns
from ..core.events import (
    MarketEvent,
    PolyBookEvent,
    PolyPriceChangeEvent,
    PolyTickSizeEvent,
    PolyTradeEvent,
    Side,
    UnknownEvent,
    Venue,
)
from .base import WSCollector

MARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
USER_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/user"
KEEPALIVE = "PING"


def build_subscribe(asset_ids: list[str], initial_dump: bool = True) -> str:
    return json.dumps(
        {"type": "market", "assets_ids": list(asset_ids), "initial_dump": initial_dump}
    )


def _levels(raw, *, descending: bool) -> tuple[tuple[float, float], ...]:
    """Price levels, sorted best-first.

    Polymarket's documented example lists bids ascending (0.01 before 0.02) and
    asks descending, i.e. worst-first on both sides. Every consumer here assumes
    index 0 is the best price, so the ordering is normalised once, at the
    boundary, rather than remembered at each use.
    """
    levels = [(float(item["price"]), float(item["size"])) for item in raw or ()]
    levels.sort(key=lambda level: level[0], reverse=descending)
    return tuple(levels)


def parse_message(raw: str | bytes, recv_ts_ns: int) -> list[MarketEvent]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    text = raw.strip()
    if not text or text.upper() in ("PONG", "PING"):
        return []
    payload = json.loads(text)
    # The channel sends a bare object for a single event and an array when it
    # batches, including for the initial dump.
    messages = payload if isinstance(payload, list) else [payload]
    events: list[MarketEvent] = []
    proc = now_ns()

    for msg in messages:
        if not isinstance(msg, dict):
            continue
        kind = msg.get("event_type")
        ts_ns = parse_epoch_ns(msg.get("timestamp"), "ms")
        condition_id = str(msg.get("market", ""))

        if kind == "book":
            events.append(
                PolyBookEvent(
                    venue=Venue.POLYMARKET,
                    symbol=str(msg.get("asset_id", "")),
                    exchange_ts_ns=ts_ns,
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    bids=_levels(msg.get("bids"), descending=True),
                    asks=_levels(msg.get("asks"), descending=False),
                    is_snapshot=True,
                    condition_id=condition_id,
                    book_hash=str(msg.get("hash", "")),
                    raw=msg,
                )
            )
        elif kind == "price_change":
            for change in msg.get("price_changes") or ():
                events.append(
                    PolyPriceChangeEvent(
                        venue=Venue.POLYMARKET,
                        symbol=str(change.get("asset_id", "")),
                        exchange_ts_ns=ts_ns,
                        recv_ts_ns=recv_ts_ns,
                        proc_ts_ns=proc,
                        price=float(change["price"]),
                        size=float(change["size"]),
                        side=Side.BUY if change.get("side") == "BUY" else Side.SELL,
                        best_bid=_opt_float(change.get("best_bid")),
                        best_ask=_opt_float(change.get("best_ask")),
                        condition_id=condition_id,
                        raw=change,
                    )
                )
        elif kind == "last_trade_price":
            events.append(
                PolyTradeEvent(
                    venue=Venue.POLYMARKET,
                    symbol=str(msg.get("asset_id", "")),
                    exchange_ts_ns=ts_ns,
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    price=float(msg["price"]),
                    size=float(msg["size"]),
                    aggressor=Side.BUY if msg.get("side") == "BUY" else Side.SELL,
                    trade_id=str(msg.get("transaction_hash", "")),
                    condition_id=condition_id,
                    fee_rate_bps=float(msg.get("fee_rate_bps") or 0.0),
                    transaction_hash=str(msg.get("transaction_hash", "")),
                    raw=msg,
                )
            )
        elif kind == "tick_size_change":
            events.append(
                PolyTickSizeEvent(
                    venue=Venue.POLYMARKET,
                    symbol=str(msg.get("asset_id", "")),
                    exchange_ts_ns=ts_ns,
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    old_tick_size=float(msg["old_tick_size"]),
                    new_tick_size=float(msg["new_tick_size"]),
                    condition_id=condition_id,
                    raw=msg,
                )
            )
        else:
            events.append(
                UnknownEvent(
                    venue=Venue.POLYMARKET,
                    symbol=str(msg.get("asset_id", "")),
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    kind=str(kind or "?"),
                    raw=msg,
                )
            )
    return events


def _opt_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class PolymarketCollector(WSCollector):
    venue = Venue.POLYMARKET

    def __init__(
        self,
        bus,
        asset_ids: list[str] | None = None,
        *,
        url: str = MARKET_WS_URL,
        initial_dump: bool = True,
        **kwargs,
    ) -> None:
        # No protocol ping: the venue's convention is a text PING. The receive
        # timeout is generous because a quiet book sends nothing between our
        # PING and its PONG, and a thin market really can be quiet for a while.
        kwargs.setdefault("ping_interval_s", None)
        kwargs.setdefault("keepalive_interval_s", 30.0)
        kwargs.setdefault("recv_timeout_s", 90.0)
        kwargs.setdefault("stale_after_s", 120.0)
        super().__init__(bus, **kwargs)
        self.asset_ids = list(asset_ids or [])
        self._url = url
        self.initial_dump = initial_dump
        self._ws = None

    def url(self) -> str:
        return self._url

    def subscribe_frames(self) -> list[str]:
        if not self.asset_ids:
            # Subscribing to nothing yields a connection that will never speak,
            # which the staleness check would then report as a dead venue.
            raise ValueError("polymarket collector needs at least one asset id")
        return [build_subscribe(self.asset_ids, self.initial_dump)]

    def keepalive_frame(self) -> str | None:
        return KEEPALIVE

    def parse(self, raw, recv_ts_ns):
        return parse_message(raw, recv_ts_ns)

    def set_assets(self, asset_ids: list[str]) -> bool:
        """Point the feed at a new set of tokens.

        Returns True when the set actually changed, in which case the caller is
        expected to bounce the connection (see the module docstring for why a
        live re-subscribe is not used).
        """
        new = list(dict.fromkeys(asset_ids))
        if new == self.asset_ids:
            return False
        self.asset_ids = new
        return True
