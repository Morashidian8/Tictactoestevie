"""Unit tests for the PolyBot paper-trading core. Run: python -m pytest polybot/tests"""

from __future__ import annotations

from polybot.candles import Candle, Color, _rows_to_candles
from polybot.indicators import same_color_streak, alternation_streak, sma
from polybot.strategy import Signal, SameColorStrategy, RuleStrategy
from polybot.sizing import FixedSizer, MartingaleSizer, PercentSizer
from polybot.portfolio import Portfolio, Trade
from polybot.execution import PaperExecutor
from polybot.engine import TradingEngine


def candle(open_, close_, t=0):
    return Candle(open_time=t, close_time=t + 300, open=open_, high=max(open_, close_),
                  low=min(open_, close_), close=close_)


def green(t=0):
    return candle(10, 11, t)


def red(t=0):
    return candle(11, 10, t)


# --- candles & colour ------------------------------------------------------ #

def test_color():
    assert green().color is Color.GREEN
    assert red().color is Color.RED
    assert candle(10, 10).color is Color.NONE


def test_rows_to_candles_filters_unclosed():
    # close time far in the past -> kept; far in the future -> dropped.
    past = [0, "10", "12", "9", "11", "1", 300_000, ]
    future = [0, "10", "12", "9", "11", "1", 99_999_999_000_000]
    out = _rows_to_candles([past, future], only_closed=True)
    assert len(out) == 1
    assert out[0].close == 11.0


# --- indicators ------------------------------------------------------------ #

def test_same_color_streak():
    assert same_color_streak([green(), red(), red(), red()]) == 3
    assert same_color_streak([green(), green()]) == 2
    assert same_color_streak([candle(10, 10)]) == 0


def test_alternation_streak():
    assert alternation_streak([green(), red(), green(), red()]) == 4
    assert alternation_streak([green(), green(), red()]) == 2


def test_sma():
    cs = [candle(0, 2), candle(0, 4), candle(0, 6)]
    assert sma(cs, 3) == 4.0
    assert sma(cs, 5) is None


# --- strategies ------------------------------------------------------------ #

def test_same_color_strategy_follows_last():
    s = SameColorStrategy(min_streak=1)
    assert s.decide([green()]) is Signal.UP
    assert s.decide([red()]) is Signal.DOWN


def test_same_color_strategy_min_streak():
    s = SameColorStrategy(min_streak=3)
    assert s.decide([red(), red()]) is Signal.NONE
    assert s.decide([red(), red(), red()]) is Signal.DOWN


def test_same_color_strategy_invert():
    s = SameColorStrategy(min_streak=1, invert=True)
    assert s.decide([red()]) is Signal.UP


def test_rule_strategy_red_after_red():
    s = RuleStrategy.from_dict({
        "name": "red-follow",
        "rules": [
            {"when": {"all": [{"last_color": "red"}, {"streak_at_least": 1}]}, "signal": "same"},
        ],
    })
    assert s.decide([red()]) is Signal.DOWN
    assert s.decide([green()]) is Signal.NONE  # no rule matches


def test_rule_strategy_opposite_and_any():
    s = RuleStrategy([
        {"when": {"any": [{"streak_at_least": 3}]}, "signal": "opposite"},
    ])
    assert s.decide([red(), red(), red()]) is Signal.UP
    assert s.decide([red(), red()]) is Signal.NONE


# --- sizing ---------------------------------------------------------------- #

def test_fixed_sizer():
    assert FixedSizer(5).next_stake(100, None) == 5
    assert FixedSizer(5).next_stake(3, None) == 3  # clamped to balance


def test_percent_sizer():
    assert PercentSizer(0.2).next_stake(100, None) == 20


def test_martingale_doubles_on_loss_resets_on_win():
    m = MartingaleSizer(base_stake=1, max_steps=6)
    assert m.next_stake(1000, None) == 1     # first bet
    assert m.next_stake(1000, False) == 2    # after a loss
    assert m.next_stake(1000, False) == 4    # after another loss
    assert m.next_stake(1000, True) == 1     # reset after a win


def test_martingale_respects_caps():
    m = MartingaleSizer(base_stake=1, max_steps=2, max_stake=3)
    m.next_stake(1000, False)  # step 1 -> 2
    m.next_stake(1000, False)  # step 2 -> 4, capped to 3
    assert m.next_stake(1000, False) == 3  # step stays at max_steps, capped


# --- portfolio & executor -------------------------------------------------- #

def test_paper_executor_resolution():
    ex = PaperExecutor()
    assert ex.resolve(Signal.DOWN, red()) is True
    assert ex.resolve(Signal.DOWN, green()) is False
    assert ex.resolve(Signal.UP, green()) is True
    assert ex.resolve(Signal.UP, candle(10, 10)) is False  # doji -> loss


def test_portfolio_settle_win_and_loss():
    p = Portfolio(starting_balance=100)
    t = Trade(candle_open_time=0, signal=Signal.UP, stake=10, payout_multiple=2.0)
    p.open_trade(t)
    assert p.balance == 90
    p.settle(t, won=True)
    assert p.balance == 110          # 90 + 10*2.0
    assert p.realised_pnl == 10

    t2 = Trade(candle_open_time=0, signal=Signal.DOWN, stake=10, payout_multiple=2.0)
    p.open_trade(t2)
    p.settle(t2, won=False)
    assert p.balance == 100          # lost the 10 stake


# --- engine ---------------------------------------------------------------- #

def test_engine_resolves_against_next_candle():
    # SameColor on [red, red]: after first red, bet DOWN on next; next is red -> win.
    p = Portfolio(starting_balance=100)
    engine = TradingEngine(
        SameColorStrategy(min_streak=1),
        FixedSizer(10),
        p,
        PaperExecutor(payout_multiple=2.0),
    )
    engine.run([red(t=0), red(t=300)])
    assert p.wins == 1
    assert p.losses == 0
    assert p.realised_pnl == 10      # the one settled bet won 10
    # After the last candle the engine opens a fresh bet for the next window,
    # so 10 is reserved in an open trade; equity reflects the settled win.
    assert p.open_stake == 10
    assert p.equity == 110


def test_engine_stops_when_balance_exhausted():
    # Always-losing setup: bet DOWN but candles are green -> martingale drains balance.
    greens = [green(t=i * 300) for i in range(20)]
    p = Portfolio(starting_balance=10)
    engine = TradingEngine(
        SameColorStrategy(min_streak=1, invert=True),  # green -> bet DOWN, will lose
        MartingaleSizer(base_stake=1, max_steps=10),
        p,
        PaperExecutor(),
    )
    engine.run(greens)
    assert p.balance >= 0            # never goes negative
    assert p.losses >= 1
