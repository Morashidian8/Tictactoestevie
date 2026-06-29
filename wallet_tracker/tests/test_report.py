"""Offline tests for report orchestration and the parsing/HTTP helpers."""

import pytest

from wallet_tracker.chain import PolygonClient, USDC_E
from wallet_tracker.polymarket_client import PolymarketClient
from wallet_tracker.report import build_report, normalize_address, window_label

ADDR = "0x9d84ce0306f8551e02efef1680475fc0f1dc1344"


class FakeClient(PolymarketClient):
    def __init__(self):
        super().__init__()

    def portfolio_value(self, address):
        return 250.0

    def positions(self, address, limit=500):
        return [{"title": "BTC up?", "outcome": "Up", "size": 10, "avgPrice": 0.4,
                 "curPrice": 0.5, "currentValue": 5.0, "cashPnl": 1.0}]

    def activity(self, address, **kw):
        return [
            {"type": "TRADE", "side": "BUY", "asset": "A", "size": 100, "price": 0.4,
             "usdcSize": 40, "timestamp": 1000, "title": "BTC up?", "outcome": "Up"},
            {"type": "TRADE", "side": "SELL", "asset": "A", "size": 100, "price": 0.6,
             "usdcSize": 60, "timestamp": 2000, "title": "BTC up?", "outcome": "Up"},
        ]


class FakeChain(PolygonClient):
    def __init__(self):
        super().__init__(http_post=lambda url, payload: {"result": "0x"})

    def usdc_balances(self, address):
        return {"usdc_e": 123.45, "usdc_native": 0.0, "total": 123.45}


def test_normalize_address_rejects_bad():
    with pytest.raises(ValueError):
        normalize_address("not-an-address")
    assert normalize_address("  " + ADDR + " ") == ADDR


def test_window_label():
    assert "دقیقه" in window_label(30)
    assert "ساعت" in window_label(120)
    assert "روز" in window_label(2880)


def test_build_report_end_to_end():
    rep = build_report(ADDR, 120, client=FakeClient(), chain=FakeChain(), now=2500)
    assert rep["address"] == ADDR
    assert rep["balance"]["total_cash"] == 123.45
    assert rep["portfolio_value"] == 250.0
    # Sell at ts 2000 is inside [2500-7200, 2500] → +20 realized.
    assert rep["pnl_window"]["realized"] == 20.0
    assert rep["open_positions"]["unrealized_pnl_now"] == 1.0
    assert rep["activity_total_rows"] == 2
    assert rep["warnings"] == []


def test_build_report_invalid_window():
    with pytest.raises(ValueError):
        build_report(ADDR, 0, client=FakeClient(), chain=FakeChain())


def test_erc20_balance_decodes_hex():
    # 1,000,000 raw units of a 6-decimal token == 1.0
    chain = PolygonClient(http_post=lambda url, payload: {"result": hex(1_000_000)})
    assert chain.erc20_balance(USDC_E, ADDR) == 1.0


def test_client_pagination_and_sort():
    pages = {
        0: [{"timestamp": 5}, {"timestamp": 3}],   # one short page → stop
    }
    calls = []

    def http_get(url, params):
        calls.append(params["offset"])
        return pages.get(params["offset"], [])

    client = PolymarketClient(http_get=http_get)
    rows = client.activity(ADDR)
    assert [r["timestamp"] for r in rows] == [3, 5]   # sorted oldest-first
