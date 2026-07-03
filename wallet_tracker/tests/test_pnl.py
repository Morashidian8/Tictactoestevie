"""Offline tests for the FIFO realized-PnL engine."""

from wallet_tracker.pnl import PnLEngine


def _buy(asset, size, price, ts):
    return {"type": "TRADE", "side": "BUY", "asset": asset, "size": size,
            "price": price, "usdcSize": size * price, "timestamp": ts, "title": asset}


def _sell(asset, size, price, ts):
    return {"type": "TRADE", "side": "SELL", "asset": asset, "size": size,
            "price": price, "usdcSize": size * price, "timestamp": ts, "title": asset}


def test_simple_buy_sell_realized():
    eng = PnLEngine().load([_buy("A", 100, 0.40, 1000), _sell("A", 100, 0.60, 2000)])
    assert round(eng.realized_total, 6) == 20.0
    assert len(eng.closing_events) == 1
    assert eng.closing_events[0].kind == "SELL"


def test_fifo_partial_close_uses_oldest_lots():
    eng = PnLEngine().load([
        _buy("A", 100, 0.20, 1000),
        _buy("A", 100, 0.50, 1500),
        _sell("A", 150, 0.60, 2000),   # 100@0.20 + 50@0.50 = cost 45; proceeds 90
    ])
    ev = eng.closing_events[0]
    assert round(ev.cost_basis, 6) == 45.0
    assert round(ev.realized, 6) == 45.0
    # 50 shares of the 0.50 lot remain open.
    assert round(eng._lots["A"][0].size, 6) == 50.0


def test_redeem_winner_pays_one_dollar():
    eng = PnLEngine().load([
        _buy("A", 100, 0.30, 1000),
        {"type": "REDEEM", "asset": "A", "size": 100, "usdcSize": 100.0,
         "timestamp": 2000, "title": "A"},
    ])
    ev = eng.closing_events[0]
    assert ev.kind == "REDEEM"
    assert round(ev.realized, 6) == 70.0  # 100 payout − 30 cost


def test_reward_is_pure_income():
    eng = PnLEngine().load([
        {"type": "REWARD", "asset": "A", "size": 0, "usdcSize": 5.0,
         "timestamp": 1000, "title": "A"},
    ])
    assert round(eng.realized_total, 6) == 5.0
    assert eng.closing_events[0].kind == "REWARD"


def test_window_slices_by_timestamp():
    eng = PnLEngine().load([
        _buy("A", 100, 0.40, 1000),
        _sell("A", 100, 0.60, 2000),    # +20 realized at ts 2000
    ])
    activity = [_buy("A", 100, 0.40, 1000), _sell("A", 100, 0.60, 2000)]

    inside = eng.window(1500, 2500, activity)
    assert round(inside.realized, 6) == 20.0
    assert inside.trades_count == 1               # only the sell is in [1500, 2500]
    assert round(inside.net_cash_flow, 6) == 60.0

    before = eng.window(0, 1500, activity)
    assert round(before.realized, 6) == 0.0       # the close happened later
    assert before.trades_count == 1               # only the buy is in [0, 1500]
    assert round(before.net_cash_flow, 6) == -40.0


def test_close_without_basis_warns_but_keeps_going():
    eng = PnLEngine().load([_sell("A", 100, 0.60, 2000)])
    assert eng.warnings
    assert round(eng.closing_events[0].realized, 6) == 60.0  # basis 0 → all proceeds


def test_redeem_with_empty_asset_matches_by_condition():
    # Real API shape: REDEEM rows have asset="" but carry conditionId.
    eng = PnLEngine().load([
        {"type": "TRADE", "side": "BUY", "asset": "TOK", "conditionId": "C1",
         "size": 100, "price": 0.45, "usdcSize": 45.0, "timestamp": 1000,
         "title": "BTC 5m", "outcome": "Up"},
        {"type": "REDEEM", "asset": "", "conditionId": "C1", "size": 100,
         "usdcSize": 100.0, "timestamp": 2000, "title": "BTC 5m"},
    ])
    ev = eng.closing_events[0]
    assert ev.kind == "REDEEM"
    assert round(ev.cost_basis, 6) == 45.0
    assert round(ev.realized, 6) == 55.0        # 100 payout − 45 cost
    assert not eng.warnings


def test_worthless_position_realizes_loss_at_end_date():
    eng = PnLEngine().load([
        {"type": "TRADE", "side": "BUY", "asset": "TOK", "conditionId": "C1",
         "size": 100, "price": 0.50, "usdcSize": 50.0, "timestamp": 1000,
         "title": "BTC 5m", "outcome": "Down"},
    ])
    positions = [{"asset": "TOK", "size": 100, "curPrice": 0, "avgPrice": 0.5,
                  "title": "BTC 5m", "outcome": "Down",
                  "endDate": "1970-01-01T00:50:00Z"}]  # ts = 3000
    lost = eng.close_worthless(positions, now_ts=10_000)
    assert lost == ["TOK"]
    ev = eng.closing_events[-1]
    assert ev.kind == "LOST"
    assert ev.timestamp == 3000
    assert round(ev.realized, 6) == -50.0
    # the loss lands in a window that covers ts=3000, not later windows
    assert round(eng.window(2500, 3500, []).realized, 6) == -50.0
    assert round(eng.window(5000, 10_000, []).realized, 6) == 0.0


def test_worthless_position_without_lots_uses_avg_price():
    eng = PnLEngine()  # empty history (truncated)
    positions = [{"asset": "TOK", "size": 40, "curPrice": 0, "avgPrice": 0.5,
                  "title": "BTC 5m", "outcome": "Up"}]
    lost = eng.close_worthless(positions, now_ts=9000)
    assert lost == ["TOK"]
    assert round(eng.closing_events[-1].realized, 6) == -20.0


def test_open_position_with_price_is_not_worthless():
    eng = PnLEngine().load([
        {"type": "TRADE", "side": "BUY", "asset": "TOK", "conditionId": "C1",
         "size": 10, "price": 0.5, "usdcSize": 5.0, "timestamp": 1000, "title": "m"},
    ])
    positions = [{"asset": "TOK", "size": 10, "curPrice": 0.42, "avgPrice": 0.5}]
    assert eng.close_worthless(positions, now_ts=2000) == []
    assert eng.realized_total == 0.0
