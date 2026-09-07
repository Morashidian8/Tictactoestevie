"""OKX v5 shapes, as documented for the books5 and trades channels."""

import json

from polymarket_bot.collectors.okx import build_subscribe, parse_message
from polymarket_bot.core.events import BookEvent, Side, TradeEvent, UnknownEvent

BOOKS5 = {
    "arg": {"channel": "books5", "instId": "BTC-USDT"},
    "data": [{
        "asks": [["43001.1", "0.5", "0", "2"], ["43002.0", "1.0", "0", "3"]],
        "bids": [["43000.9", "0.8", "0", "1"], ["43000.0", "2.0", "0", "4"]],
        "instId": "BTC-USDT",
        "ts": "1700000000000",
        "seqId": 9876,
    }],
}
TRADES = {
    "arg": {"channel": "trades", "instId": "BTC-USDT"},
    "data": [{"instId": "BTC-USDT", "tradeId": "130639474", "px": "43001.1",
              "sz": "0.01", "side": "buy", "ts": "1700000000000"}],
}


def test_books5_snapshot():
    (event,) = parse_message(json.dumps(BOOKS5), recv_ts_ns=5)
    assert isinstance(event, BookEvent)
    assert event.symbol == "BTC-USDT"
    assert event.is_snapshot
    assert event.sequence == 9876
    assert event.exchange_ts_ns == 1700000000000 * 1_000_000
    assert event.best_bid == (43000.9, 0.8)
    assert event.best_ask == (43001.1, 0.5)


def test_incremental_book_is_marked_as_such():
    payload = {**BOOKS5, "arg": {"channel": "books", "instId": "BTC-USDT"}, "action": "update"}
    (event,) = parse_message(json.dumps(payload), 1)
    assert not event.is_snapshot


def test_trades_report_the_taker_side_directly():
    # Unlike Binance's maker flag and Coinbase's maker side, OKX already gives
    # the aggressor, so no inversion belongs here.
    (event,) = parse_message(json.dumps(TRADES), 1)
    assert isinstance(event, TradeEvent)
    assert event.aggressor is Side.BUY
    assert event.price == 43001.1 and event.size == 0.01
    assert event.trade_id == "130639474"
    sells = {**TRADES, "data": [{**TRADES["data"][0], "side": "sell"}]}
    (event,) = parse_message(json.dumps(sells), 1)
    assert event.aggressor is Side.SELL


def test_batched_data_fans_out_to_one_event_each():
    payload = {**TRADES, "data": TRADES["data"] * 3}
    assert len(parse_message(json.dumps(payload), 1)) == 3


def test_subscribe_ack_is_not_an_event_but_an_error_is():
    assert parse_message(json.dumps({"event": "subscribe", "arg": {}}), 1) == []
    (event,) = parse_message(
        json.dumps({"event": "error", "code": "60012", "msg": "bad channel", "arg": {}}), 1
    )
    assert isinstance(event, UnknownEvent)
    assert "60012" in event.kind


def test_text_pong_is_not_json_and_is_ignored():
    assert parse_message("pong", 1) == []


def test_subscribe_frame_is_the_cross_product():
    frame = json.loads(build_subscribe(["BTC-USDT"], ["books5", "trades"]))
    assert frame["op"] == "subscribe"
    assert frame["args"] == [
        {"channel": "books5", "instId": "BTC-USDT"},
        {"channel": "trades", "instId": "BTC-USDT"},
    ]
