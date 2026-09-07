"""Coinbase Exchange feed shapes."""

import json

from polymarket_bot.collectors.coinbase import (
    build_subscribe,
    parse_message,
    parse_rfc3339_ns,
)
from polymarket_bot.core.events import BookEvent, QuoteEvent, Side, TradeEvent, UnknownEvent

TICKER = {
    "type": "ticker", "sequence": 12042642428, "product_id": "BTC-USD",
    "price": "9380.55", "open_24h": "9450.81", "volume_24h": "9611.79",
    "low_24h": "9195.49", "high_24h": "9475.19", "volume_30d": "327812.00",
    "best_bid": "9380.54", "best_bid_size": "0.31", "best_ask": "9380.55",
    "best_ask_size": "1.24", "side": "buy",
    "time": "2020-02-01T01:40:16.253563Z", "trade_id": 82062566,
    "last_size": "0.41969131",
}
MATCH = {
    "type": "match", "trade_id": 82047307,
    "maker_order_id": "0f358725-2134-435e-be11-753912a326e0",
    "taker_order_id": "252b7002-87a3-425c-ac73-f5b9e23f3caf",
    "side": "sell", "size": "0.00513192", "price": "9314.78",
    "product_id": "BTC-USD", "sequence": 12038915443,
    "time": "2020-01-31T20:03:41.158814Z",
}


def test_rfc3339_keeps_microsecond_resolution():
    ns = parse_rfc3339_ns("2020-01-31T20:03:41.158814Z")
    assert ns is not None
    # Microseconds on the wire, so the nanosecond digits must be zero rather
    # than fabricated precision.
    assert ns % 1000 == 0
    assert (ns // 1000) % 1_000_000 == 158814


def test_rfc3339_rejects_garbage():
    assert parse_rfc3339_ns(None) is None
    assert parse_rfc3339_ns("yesterday") is None


def test_ticker_becomes_a_quote():
    (event,) = parse_message(json.dumps(TICKER), recv_ts_ns=11)
    assert isinstance(event, QuoteEvent)
    assert event.bid == 9380.54 and event.bid_size == 0.31
    assert event.ask == 9380.55 and event.ask_size == 1.24
    assert event.sequence == 12042642428
    assert event.mid == 9380.545


def test_ticker_without_sizes_still_parses():
    payload = {k: v for k, v in TICKER.items() if not k.endswith("_size")}
    (event,) = parse_message(json.dumps(payload), 1)
    assert event.bid_size == 0.0 and event.ask_size == 0.0


def test_match_side_is_the_maker_so_the_aggressor_is_inverted():
    # side="sell" means a resting sell was hit, i.e. the aggressor was a BUYER.
    # Getting this backwards silently flips every trade-imbalance feature.
    (event,) = parse_message(json.dumps(MATCH), 1)
    assert isinstance(event, TradeEvent)
    assert event.aggressor is Side.BUY
    (event,) = parse_message(json.dumps({**MATCH, "side": "buy"}), 1)
    assert event.aggressor is Side.SELL


def test_last_match_is_treated_as_a_trade():
    (event,) = parse_message(json.dumps({**MATCH, "type": "last_match"}), 1)
    assert isinstance(event, TradeEvent)


def test_level2_snapshot_and_update():
    snapshot = {"type": "snapshot", "product_id": "BTC-USD",
                "bids": [["9380.54", "0.31"]], "asks": [["9380.55", "1.24"]]}
    (event,) = parse_message(json.dumps(snapshot), 1)
    assert isinstance(event, BookEvent) and event.is_snapshot

    update = {"type": "l2update", "product_id": "BTC-USD",
              "time": "2020-02-01T01:40:16.253563Z",
              "changes": [["buy", "9380.50", "0.5"], ["sell", "9380.60", "0.0"]]}
    (event,) = parse_message(json.dumps(update), 1)
    assert not event.is_snapshot
    assert event.bids == ((9380.50, 0.5),)
    # Size 0 on an incremental means "level removed", and must survive as 0.
    assert event.asks == ((9380.60, 0.0),)


def test_control_messages_are_not_events():
    assert parse_message(json.dumps({"type": "subscriptions", "channels": []}), 1) == []
    assert parse_message(json.dumps({"type": "heartbeat"}), 1) == []


def test_error_is_surfaced():
    (event,) = parse_message(
        json.dumps({"type": "error", "message": "auth required"}), 1
    )
    assert isinstance(event, UnknownEvent)
    assert "auth required" in event.kind


def test_default_channels_need_no_credentials():
    frame = json.loads(build_subscribe(["BTC-USD"], ["ticker", "matches"]))
    assert frame == {"type": "subscribe", "product_ids": ["BTC-USD"],
                     "channels": ["ticker", "matches"]}
