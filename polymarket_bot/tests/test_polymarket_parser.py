"""Polymarket CLOB market-channel shapes, taken from the documented payloads."""

import json

import pytest

from polymarket_bot.collectors.polymarket import build_subscribe, parse_message
from polymarket_bot.core.events import (
    PolyBookEvent,
    PolyPriceChangeEvent,
    PolyTickSizeEvent,
    PolyTradeEvent,
    Side,
    UnknownEvent,
)

ASSET = "101007741586870489619361069512452187353898396425142157315847015703471254508752"
CONDITION = "0xf83fb46dd70a4459fcc441a8511701c463374c5c3c250f585d74fda85ddfb7c9"

BOOK = {
    "market": CONDITION,
    "asset_id": ASSET,
    "timestamp": "1740759191594",
    "hash": "c0e51b1cfdbcb1b2aec58feaf7b01004019a89c6",
    # As documented: bids ascending, asks descending - i.e. worst first.
    "bids": [{"price": "0.01", "size": "510000"}, {"price": "0.02", "size": "3100"}],
    "asks": [{"price": "0.99", "size": "58.07"}, {"price": "0.97", "size": "178.73"}],
    "event_type": "book",
}
PRICE_CHANGE = {
    "market": CONDITION,
    "price_changes": [
        {"asset_id": ASSET, "price": "0.5", "size": "200", "side": "BUY",
         "hash": "56621a121a47ed9333273e21c83b660cff37ae50",
         "best_bid": "0.5", "best_ask": "1"},
        {"asset_id": "other", "price": "0.5", "size": "10", "side": "SELL",
         "hash": "x", "best_bid": "0.49", "best_ask": "0.51"},
    ],
    "timestamp": "1757908892351",
    "event_type": "price_change",
}
LAST_TRADE = {
    "asset_id": ASSET, "event_type": "last_trade_price", "fee_rate_bps": "0",
    "market": CONDITION, "price": "0.12", "side": "BUY", "size": "8.333332",
    "timestamp": "1740760245471",
    "transaction_hash": "0xd449923990fce41c5fcd1fef8079df5b1dc55fa00c2df62831d0bd3a7cdcc2aa",
}
TICK_SIZE = {
    "event_type": "tick_size_change", "asset_id": ASSET, "market": CONDITION,
    "old_tick_size": "0.01", "new_tick_size": "0.001", "timestamp": "100000000",
}


def test_book_levels_are_normalised_to_best_first():
    # The venue sends them worst-first. Every consumer here assumes index 0 is
    # the best price, so the ordering is fixed once, at the boundary.
    (event,) = parse_message(json.dumps(BOOK), recv_ts_ns=7)
    assert isinstance(event, PolyBookEvent)
    assert event.best_bid == (0.02, 3100.0)
    assert event.best_ask == (0.97, 178.73)
    assert event.bids == ((0.02, 3100.0), (0.01, 510000.0))
    assert event.asks == ((0.97, 178.73), (0.99, 58.07))
    assert event.symbol == ASSET
    assert event.condition_id == CONDITION
    assert event.exchange_ts_ns == 1740759191594 * 1_000_000


def test_price_change_fans_out_one_event_per_asset():
    events = parse_message(json.dumps(PRICE_CHANGE), 1)
    assert len(events) == 2
    first, second = events
    assert isinstance(first, PolyPriceChangeEvent)
    assert first.symbol == ASSET and first.side is Side.BUY
    assert first.best_bid == 0.5 and first.best_ask == 1.0
    assert second.symbol == "other" and second.side is Side.SELL
    # Both carry the parent message's timestamp and market.
    assert first.exchange_ts_ns == second.exchange_ts_ns
    assert second.condition_id == CONDITION


def test_last_trade_price():
    (event,) = parse_message(json.dumps(LAST_TRADE), 1)
    assert isinstance(event, PolyTradeEvent)
    assert event.price == 0.12 and event.size == 8.333332
    assert event.aggressor is Side.BUY
    assert event.fee_rate_bps == 0.0
    assert event.transaction_hash.startswith("0xd449")


def test_tick_size_change_is_kept_as_its_own_event():
    # The tick is the smallest edge that can exist, and it changes mid-market.
    (event,) = parse_message(json.dumps(TICK_SIZE), 1)
    assert isinstance(event, PolyTickSizeEvent)
    assert event.old_tick_size == 0.01
    assert event.new_tick_size == 0.001


def test_a_batched_array_is_unpacked():
    events = parse_message(json.dumps([BOOK, LAST_TRADE]), 1)
    assert [type(e).__name__ for e in events] == ["PolyBookEvent", "PolyTradeEvent"]


def test_keepalive_replies_are_not_events():
    assert parse_message("PONG", 1) == []
    assert parse_message("PING", 1) == []
    assert parse_message("  ", 1) == []


def test_unknown_event_type_is_surfaced():
    (event,) = parse_message(json.dumps({"event_type": "something_new"}), 1)
    assert isinstance(event, UnknownEvent)
    assert event.kind == "something_new"


def test_subscribe_frame_matches_the_documented_shape():
    frame = json.loads(build_subscribe([ASSET]))
    assert frame == {"type": "market", "assets_ids": [ASSET], "initial_dump": True}


def test_empty_book_side_does_not_crash():
    (event,) = parse_message(json.dumps({**BOOK, "asks": []}), 1)
    assert event.best_ask is None
