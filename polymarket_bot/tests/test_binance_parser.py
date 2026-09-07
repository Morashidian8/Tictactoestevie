"""Payload shapes here are copied from binance/binance-spot-api-docs
`web-socket-streams.md`. If a test starts failing after a doc update, the doc
is right and the parser is wrong."""

import json

import pytest

from polymarket_bot.collectors.binance import build_url, parse_message
from polymarket_bot.core.events import BookEvent, QuoteEvent, Side, TradeEvent, UnknownEvent


def wrap(stream: str, data: dict) -> str:
    return json.dumps({"stream": stream, "data": data})


TRADE = {
    "e": "trade", "E": 1672515782136, "s": "BTCUSDT", "t": 12345,
    "p": "0.001", "q": "100", "T": 1672515782136, "m": True, "M": True,
}
BOOK_TICKER = {
    "u": 400900217, "s": "BTCUSDT", "b": "25.35190000", "B": "31.21000000",
    "a": "25.36520000", "A": "40.66000000",
}
PARTIAL_DEPTH = {
    "lastUpdateId": 160,
    "bids": [["0.0024", "10"], ["0.0023", "5"]],
    "asks": [["0.0026", "100"], ["0.0027", "50"]],
}


def test_trade_uses_trade_time_not_event_time():
    (event,) = parse_message(wrap("btcusdt@trade", TRADE), recv_ts_ns=99, ts_unit="ms")
    assert isinstance(event, TradeEvent)
    assert event.price == 0.001 and event.size == 100.0
    assert event.exchange_ts_ns == 1672515782136 * 1_000_000
    assert event.recv_ts_ns == 99
    assert event.trade_id == "12345"


def test_maker_flag_is_inverted_into_an_aggressor_side():
    # "m": true means the BUYER was the maker, so the aggressor was the seller.
    (sell,) = parse_message(wrap("btcusdt@trade", TRADE), 1, ts_unit="ms")
    assert sell.aggressor is Side.SELL
    (buy,) = parse_message(wrap("btcusdt@trade", {**TRADE, "m": False}), 1, ts_unit="ms")
    assert buy.aggressor is Side.BUY


def test_microsecond_time_unit():
    (event,) = parse_message(
        wrap("btcusdt@trade", {**TRADE, "T": 1672515782136000}), 1, ts_unit="us"
    )
    assert event.exchange_ts_ns == 1672515782136 * 1_000_000


def test_book_ticker_has_no_exchange_timestamp():
    # The venue sends none for this stream. Inventing one would fabricate the
    # latency measurement the whole project turns on.
    (event,) = parse_message(wrap("btcusdt@bookTicker", BOOK_TICKER), 42)
    assert isinstance(event, QuoteEvent)
    assert event.exchange_ts_ns is None
    assert event.bid == 25.3519 and event.bid_size == 31.21
    assert event.ask == 25.3652 and event.ask_size == 40.66
    assert event.sequence == 400900217


def test_partial_depth_takes_its_symbol_from_the_stream_name():
    (event,) = parse_message(wrap("btcusdt@depth20@100ms", PARTIAL_DEPTH), 7)
    assert isinstance(event, BookEvent)
    assert event.symbol == "BTCUSDT"
    assert event.is_snapshot
    assert event.best_bid == (0.0024, 10.0)
    assert event.best_ask == (0.0026, 100.0)


def test_diff_depth_is_marked_incremental():
    data = {"e": "depthUpdate", "E": 1672515782136, "s": "BTCUSDT", "U": 157,
            "u": 160, "b": [["0.0024", "10"]], "a": [["0.0026", "100"]]}
    (event,) = parse_message(wrap("btcusdt@depth", data), 1, ts_unit="ms")
    assert isinstance(event, BookEvent) and not event.is_snapshot
    assert event.sequence == 160


def test_subscription_reply_is_not_an_event():
    assert parse_message(json.dumps({"result": None, "id": 1}), 1) == []


def test_unrecognised_message_is_surfaced_not_swallowed():
    (event,) = parse_message(wrap("btcusdt@newthing", {"e": "newthing", "s": "BTCUSDT"}), 1)
    assert isinstance(event, UnknownEvent)
    assert event.kind == "newthing"


def test_url_encodes_all_three_streams_and_the_time_unit():
    url = build_url(["BTCUSDT"], depth_levels=20, depth_speed_ms=100)
    assert "btcusdt@trade" in url
    assert "btcusdt@bookTicker" in url
    assert "btcusdt@depth20@100ms" in url
    assert url.endswith("&timeUnit=MICROSECOND")


def test_url_rejects_depth_settings_the_venue_does_not_accept():
    with pytest.raises(ValueError):
        build_url(["BTCUSDT"], depth_levels=15)
    with pytest.raises(ValueError):
        build_url(["BTCUSDT"], depth_speed_ms=250)
