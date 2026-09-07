"""OKX v5 public market-data channels.

Endpoint ``wss://ws.okx.com:8443/ws/v5/public`` (the paper-trading host is
``wss://wspap.okx.com:8443/ws/v5/public``).

Channels used, both public and requiring no credentials:

* ``books5`` — top 5 levels, pushed every 100ms as a full snapshot, so there is
  no incremental book to maintain and no chance of silently diverging from the
  venue's state.
* ``trades`` — one message per taker fill, with the taker's ``side``.

OKX does **not** answer protocol-level ping frames; it wants the literal text
``ping`` and replies with ``pong``, and it closes a connection that has been
silent for 30 seconds. That is why this collector overrides the keepalive.

Wire shapes (OKX v5, ``arg``/``data`` envelope):

    {"event":"subscribe","arg":{"channel":"books5","instId":"BTC-USDT"}}
    {"arg":{"channel":"books5","instId":"BTC-USDT"},
     "data":[{"asks":[["p","sz","0","numOrders"]],"bids":[...],
              "ts":"1700000000000","seqId":123}]}
    {"arg":{"channel":"trades","instId":"BTC-USDT"},
     "data":[{"instId":"BTC-USDT","tradeId":"1","px":"p","sz":"s",
              "side":"buy","ts":"1700000000000"}]}

Book levels are 4-tuples ``[price, size, deprecated, order_count]``; only the
first two are used here, but the count is kept in ``raw`` because order count
per level is a genuine microstructure feature for Phase 3.
"""

from __future__ import annotations

import json

from ..core.clock import now_ns, parse_epoch_ns
from ..core.events import (
    BookEvent,
    MarketEvent,
    Side,
    TradeEvent,
    UnknownEvent,
    Venue,
)
from .base import WSCollector

PUBLIC_URL = "wss://ws.okx.com:8443/ws/v5/public"
DEMO_URL = "wss://wspap.okx.com:8443/ws/v5/public"


def build_subscribe(inst_ids: list[str], channels: list[str]) -> str:
    args = [{"channel": c, "instId": i} for i in inst_ids for c in channels]
    return json.dumps({"op": "subscribe", "args": args})


def _levels(raw) -> tuple[tuple[float, float], ...]:
    # Levels arrive best-first on both sides already.
    return tuple((float(row[0]), float(row[1])) for row in raw)


def parse_message(raw: str | bytes, recv_ts_ns: int) -> list[MarketEvent]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    text = raw.strip()
    if text in ("pong", "ping"):
        return []
    msg = json.loads(text)
    proc = now_ns()

    # Subscription acks and errors are control, not data. An error here means a
    # channel name is wrong and the feed will stay silent, so it is surfaced as
    # an UnknownEvent rather than dropped.
    if "event" in msg:
        if msg["event"] == "error":
            return [
                UnknownEvent(
                    venue=Venue.OKX,
                    symbol=str((msg.get("arg") or {}).get("instId", "")),
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    kind=f"error:{msg.get('code')}:{msg.get('msg')}",
                    raw=msg,
                )
            ]
        return []

    arg = msg.get("arg") or {}
    channel = arg.get("channel")
    rows = msg.get("data") or []
    events: list[MarketEvent] = []

    if channel in ("books5", "books", "books-l2-tbt", "books50-l2-tbt"):
        for row in rows:
            events.append(
                BookEvent(
                    venue=Venue.OKX,
                    symbol=row.get("instId") or arg.get("instId", ""),
                    exchange_ts_ns=parse_epoch_ns(row.get("ts"), "ms"),
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    sequence=int(row["seqId"]) if row.get("seqId") is not None else None,
                    bids=_levels(row.get("bids", ())),
                    asks=_levels(row.get("asks", ())),
                    # books5 is snapshot-only; the incremental channels tag the
                    # message with action="update".
                    is_snapshot=msg.get("action", "snapshot") != "update",
                    raw=row,
                )
            )
        return events

    if channel in ("trades", "trades-all"):
        for row in rows:
            events.append(
                TradeEvent(
                    venue=Venue.OKX,
                    symbol=row.get("instId") or arg.get("instId", ""),
                    exchange_ts_ns=parse_epoch_ns(row.get("ts"), "ms"),
                    recv_ts_ns=recv_ts_ns,
                    proc_ts_ns=proc,
                    sequence=None,
                    price=float(row["px"]),
                    size=float(row["sz"]),
                    # OKX reports the taker side directly - no inversion here,
                    # unlike Binance's maker flag or Coinbase's maker side.
                    aggressor=Side.BUY if row.get("side") == "buy" else Side.SELL,
                    trade_id=str(row.get("tradeId", "")),
                    raw=row,
                )
            )
        return events

    return [
        UnknownEvent(
            venue=Venue.OKX,
            symbol=str(arg.get("instId", "")),
            recv_ts_ns=recv_ts_ns,
            proc_ts_ns=proc,
            kind=str(channel or "?"),
            raw=msg,
        )
    ]


class OKXCollector(WSCollector):
    venue = Venue.OKX

    def __init__(
        self,
        bus,
        inst_ids: list[str],
        *,
        url: str = PUBLIC_URL,
        channels: list[str] | None = None,
        **kwargs,
    ) -> None:
        # OKX cuts an idle connection at 30s and ignores protocol pings, so the
        # library-level ping is disabled and a text keepalive is used instead.
        kwargs.setdefault("ping_interval_s", None)
        kwargs.setdefault("keepalive_interval_s", 20.0)
        super().__init__(bus, **kwargs)
        self.inst_ids = inst_ids
        self._url = url
        self.channels = channels or ["books5", "trades"]

    def url(self) -> str:
        return self._url

    def subscribe_frames(self) -> list[str]:
        return [build_subscribe(self.inst_ids, self.channels)]

    def keepalive_frame(self) -> str | None:
        return "ping"

    def is_keepalive_reply(self, raw) -> bool:
        if isinstance(raw, bytes):
            return False
        return raw.strip() in ("pong", "ping")

    def parse(self, raw, recv_ts_ns):
        return parse_message(raw, recv_ts_ns)
