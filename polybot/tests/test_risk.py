"""Tests for the safety layer: risk caps, kill switch, and wallet rotation."""

from __future__ import annotations

from polybot.candles import Candle
from polybot.engine import TradingEngine
from polybot.execution import PaperExecutor
from polybot.portfolio import Portfolio
from polybot.risk import RiskLimits, RiskManager
from polybot.sizing import FixedSizer, MartingaleSizer
from polybot.strategy import SameColorStrategy, Signal
from polybot.wallet import WalletManager


def candle(open_, close_, t=0):
    return Candle(open_time=t, close_time=t + 300, open=open_, high=max(open_, close_),
                  low=min(open_, close_), close=close_)


def green(t=0):
    return candle(10, 11, t)


def red(t=0):
    return candle(11, 10, t)


# --- RiskManager units ----------------------------------------------------- #

def test_max_stake_clamps():
    rm = RiskManager(RiskLimits(max_stake_per_trade=5))
    d = rm.pre_trade(now=0, balance=100, proposed_stake=20)
    assert d.allowed and d.stake == 5


def test_kill_switch_blocks():
    rm = RiskManager(RiskLimits())
    rm.trip_kill_switch()
    d = rm.pre_trade(now=0, balance=100, proposed_stake=1)
    assert not d.allowed and d.reason == "kill_switch"
    rm.reset_kill_switch()
    assert rm.pre_trade(now=0, balance=100, proposed_stake=1).allowed


def test_min_balance_blocks():
    rm = RiskManager(RiskLimits(min_balance=10))
    assert rm.pre_trade(now=0, balance=10, proposed_stake=1).reason == "min_balance"


def test_daily_loss_halts_and_resets_next_day():
    rm = RiskManager(RiskLimits(max_daily_loss=20))
    rm.post_settlement(now=100, pnl=-20)
    assert rm.pre_trade(now=200, balance=100, proposed_stake=1).reason == "daily_loss"
    # New day -> daily PnL resets, trading resumes.
    next_day = 86_400 + 10
    assert rm.pre_trade(now=next_day, balance=100, proposed_stake=1).allowed


def test_daily_profit_target_halts():
    rm = RiskManager(RiskLimits(daily_profit_target=15))
    rm.post_settlement(now=100, pnl=15)
    assert rm.pre_trade(now=200, balance=100, proposed_stake=1).reason == "daily_profit_target"


def test_consecutive_losses_breaker():
    rm = RiskManager(RiskLimits(max_consecutive_losses=3))
    for t in range(3):
        rm.post_settlement(now=t, pnl=-1)
    assert rm.pre_trade(now=10, balance=100, proposed_stake=1).reason == "max_consecutive_losses"
    rm.post_settlement(now=11, pnl=+1)  # a win resets the streak
    assert rm.pre_trade(now=12, balance=100, proposed_stake=1).allowed


def test_rate_limit():
    rm = RiskManager(RiskLimits(max_trades_per_window=2, window_seconds=60))
    rm.register_trade(0)
    rm.register_trade(1)
    assert rm.pre_trade(now=2, balance=100, proposed_stake=1).reason == "rate_limit"
    # Once the window passes, trading is allowed again.
    assert rm.pre_trade(now=120, balance=100, proposed_stake=1).allowed


# --- WalletManager units --------------------------------------------------- #

def test_wallet_rotates_on_new_day():
    wm = WalletManager()
    wm.advance(0)
    first = wm.current.id
    assert wm.advance(300) is None            # same day, no rotation
    rotated = wm.advance(86_400 + 5)          # next day
    assert rotated is not None and wm.current.id != first
    assert wm.rotations == 1


def test_wallet_rotates_on_profit_cap():
    wm = WalletManager(daily_profit_cap=10)
    wm.advance(0)
    first = wm.current.id
    assert wm.record(now=100, pnl=6) is None   # under cap
    new = wm.record(now=200, pnl=6)            # crosses cap -> rotate
    assert new is not None and wm.current.id != first


# --- Engine integration ---------------------------------------------------- #

def test_engine_respects_max_stake_cap():
    # Martingale would grow the stake, but the risk cap holds it at 3.
    greens = [green(t=i * 300) for i in range(8)]
    p = Portfolio(starting_balance=1000)
    rm = RiskManager(RiskLimits(max_stake_per_trade=3))
    engine = TradingEngine(
        SameColorStrategy(min_streak=1, invert=True),  # always bets the losing side here
        MartingaleSizer(base_stake=1, max_steps=10),
        p,
        PaperExecutor(),
        risk=rm,
    )
    engine.run(greens)
    assert all(t.stake <= 3 + 1e-9 for t in p.trades)


def test_engine_stops_after_kill_switch():
    rm = RiskManager(RiskLimits())
    p = Portfolio(starting_balance=100)
    engine = TradingEngine(SameColorStrategy(1), FixedSizer(1), p, PaperExecutor(), risk=rm)
    engine.on_candle(red(t=0))          # places a bet
    trades_before = len(p.trades)
    rm.trip_kill_switch()
    engine.on_candle(red(t=300))        # resolves prior bet, but no new bet
    engine.on_candle(red(t=600))
    assert len(p.trades) == trades_before
    assert engine.last_halt_reason == "kill_switch"


def test_engine_daily_loss_halt_blocks_new_bets():
    greens = [green(t=i * 300) for i in range(30)]
    p = Portfolio(starting_balance=1000)
    rm = RiskManager(RiskLimits(max_daily_loss=5))
    engine = TradingEngine(
        SameColorStrategy(min_streak=1, invert=True),
        FixedSizer(1),
        p,
        PaperExecutor(),
        risk=rm,
    )
    engine.run(greens)
    # Losses are 1 each; after 5 lost it must halt, so far fewer than 30 trades.
    assert p.losses <= 6
    assert engine.last_halt_reason == "daily_loss"


def test_engine_stake_jitter_within_band():
    import random
    reds = [red(t=i * 300) for i in range(6)]
    p = Portfolio(starting_balance=1000)
    engine = TradingEngine(
        SameColorStrategy(1),
        FixedSizer(10),
        p,
        PaperExecutor(),
        stake_jitter=0.2,
        rng=random.Random(1),
    )
    engine.run(reds)
    assert p.trades  # jittered stakes stay within +/-20% of 10
    assert all(8.0 - 1e-9 <= t.stake <= 12.0 + 1e-9 for t in p.trades)
