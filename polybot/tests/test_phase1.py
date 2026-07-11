"""Phase-1 server tests: the v13 strategy port, shadow odds, scheduler, auth."""

from __future__ import annotations

import datetime as dt
import json
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from polybot.api import BotConfig, BotRunner, create_app, in_trading_window, make_engine
from polybot.candles import BinanceLiveFeed, Candle
from polybot.engine import TradingEngine
from polybot.execution import PaperExecutor, ShadowPolymarketExecutor
from polybot.polymarket import PolymarketData
from polybot.portfolio import Portfolio
from polybot.risk import RiskLimits, RiskManager
from polybot.sizing import SteppedMartingaleSizer
from polybot.strategy import AlternationMartingale, Signal


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def candles_from(colors, start=1_000_000, interval=300):
    """Build a candle list from 'r'/'g'/'d' colour codes."""
    out = []
    for i, c in enumerate(colors):
        open_ = 100.0
        close = {"r": 99.0, "g": 101.0, "d": 100.0}[c]
        t = start + i * interval
        out.append(Candle(open_time=t, close_time=t + interval,
                          open=open_, high=max(open_, close), low=min(open_, close), close=close))
    return out


def alt_engine(alt_n=5, max_steps=3, base=1.0, balance=1000.0, risk=None, executor=None):
    strat = AlternationMartingale(alt_n=alt_n, max_steps=max_steps)
    return TradingEngine(
        strategy=strat,
        sizer=SteppedMartingaleSizer(base_stake=base, stepped=strat),
        portfolio=Portfolio(balance),
        executor=executor or PaperExecutor(payout_multiple=2.0),
        risk=risk,
    ), strat


# --------------------------------------------------------------------------- #
# AlternationMartingale strategy
# --------------------------------------------------------------------------- #

def test_alt_strategy_arms_after_n_flips_and_follows():
    engine, strat = alt_engine()
    # 5 flips, then the break (g,g) arms and bets UP; next candle red -> loss,
    # bet DOWN doubled; next red -> win, disarm.
    engine.run(candles_from("rgrgrg" + "g" + "rr"))
    trades = engine.portfolio.resolved_trades
    assert [t.signal for t in trades] == [Signal.UP, Signal.DOWN]
    assert [t.stake for t in trades] == [1.0, 2.0]
    assert [t.won for t in trades] == [False, True]
    assert strat.step == 0 and not strat.armed  # win resets and disarms


def test_alt_strategy_never_exceeds_max_steps():
    engine, strat = alt_engine(max_steps=3)
    # After arming, the market keeps alternating so every FOLLOW bet loses.
    engine.run(candles_from("rgrgrg" + "g" + "rgrgrg"))
    trades = engine.portfolio.resolved_trades
    assert [t.stake for t in trades] == [1.0, 2.0, 4.0]   # capped: no 8.0 bet ever
    assert all(t.won is False for t in trades)
    assert not strat.armed                                 # stood down at the cap


def test_alt_strategy_rearms_from_base_after_cap():
    engine, strat = alt_engine(max_steps=3)
    seq = "rgrgrg" + "g" + "rgrg"        # arm + 3 capped losses
    seq += "rgrgrg" + "g" + "rr"         # fresh trigger: restart from base, win on 2nd
    engine.run(candles_from(seq))
    stakes = [t.stake for t in engine.portfolio.resolved_trades]
    assert stakes == [1.0, 2.0, 4.0, 1.0, 2.0]             # restart at base, never 8.0


def test_alt_strategy_doji_resets_alternation():
    engine, strat = alt_engine(alt_n=3)
    engine.run(candles_from("rgr" + "d" + "gg"))           # doji kills the run -> no arm
    assert engine.portfolio.trades == []
    assert not strat.armed


def test_risk_blocked_bet_does_not_advance_step():
    risk = RiskManager(RiskLimits(max_trades_per_window=0))  # blocks every bet
    engine, strat = alt_engine(risk=risk)
    engine.run(candles_from("rgrgrg" + "g" + "rgrg"))
    assert engine.portfolio.trades == []
    assert strat.step == 0            # no bet placed -> step untouched
    assert strat.armed                # still armed, will bet when unblocked


def test_no_quote_means_no_bet():
    class NoQuote(PaperExecutor):
        def quote(self, signal):  # noqa: ARG002
            return None
    engine, strat = alt_engine(executor=NoQuote())
    engine.run(candles_from("rgrgrg" + "g" + "rg"))
    assert engine.portfolio.trades == []  # never a fake fallback price
    assert strat.step == 0


def test_void_pending_refunds_and_resets():
    engine, strat = alt_engine()
    engine.run(candles_from("rgrgrg" + "g"))               # arm + open a bet
    assert engine.portfolio.open_stake == 1.0
    engine.void_pending()
    assert engine.portfolio.open_stake == 0.0
    assert engine.portfolio.balance == 1000.0              # stake refunded
    assert strat.step == 0 and not strat.armed             # state cleared


# --------------------------------------------------------------------------- #
# Shadow executor (real odds, paper money)
# --------------------------------------------------------------------------- #

class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload
    def raise_for_status(self):
        pass
    def json(self):
        return self._payload


class _FakeSession:
    """Serves the gamma market lookup and the CLOB buy price."""
    def __init__(self, price="0.40", with_market=True):
        self.price = price
        self.with_market = with_market
    def get(self, url, params=None, timeout=None):  # noqa: ARG002
        if "/markets" in url:
            if not self.with_market:
                return _FakeResponse([])
            return _FakeResponse([{
                "question": "BTC up or down?", "slug": params.get("slug", ""),
                "conditionId": "c1", "active": True, "closed": False,
                "clobTokenIds": json.dumps(["111", "222"]),
                "outcomes": json.dumps(["Up", "Down"]),
            }])
        if "/price" in url:
            return _FakeResponse({"price": self.price})
        raise AssertionError(f"unexpected url {url}")


def shadow(price="0.40", with_market=True, **kw):
    data = PolymarketData(session=_FakeSession(price=price, with_market=with_market))
    return ShadowPolymarketExecutor(data, retries=0, _sleep=lambda s: None,
                                    _clock=lambda: 1_000_000.0, **kw)


def test_shadow_quotes_real_price_as_payout():
    ex = shadow(price="0.40")
    assert ex.quote(Signal.UP) == pytest.approx(2.5)       # 1 / 0.40
    assert ex.last_quote_price == pytest.approx(0.40)


def test_shadow_returns_none_when_market_missing():
    assert shadow(with_market=False).quote(Signal.UP) is None


def test_shadow_limit_mode_skips_expensive_entries():
    assert shadow(price="0.60", max_entry_price=0.55).quote(Signal.DOWN) is None
    assert shadow(price="0.50", max_entry_price=0.55).quote(Signal.DOWN) == pytest.approx(2.0)


# --------------------------------------------------------------------------- #
# Scheduler
# --------------------------------------------------------------------------- #

def test_in_trading_window_basic_and_overnight():
    assert in_trading_window(9 * 60 + 30, "09:00", "10:00")
    assert not in_trading_window(10 * 60, "09:00", "10:00")     # end exclusive
    assert in_trading_window(23 * 60 + 30, "23:00", "01:30")    # overnight
    assert in_trading_window(60, "23:00", "01:30")
    assert not in_trading_window(2 * 60, "23:00", "01:30")
    assert in_trading_window(300, None, None)                    # no schedule = always


def test_runner_trades_only_inside_the_window():
    now = {"t": dt.datetime(2026, 7, 11, 8, 0, tzinfo=ZoneInfo("Asia/Tehran"))}
    runner = BotRunner(local_now=lambda tz: now["t"])
    runner.start(BotConfig(schedule_start="09:00", schedule_end="10:00",
                           strategy="same_color", run_minutes=None))
    runner.tick()
    assert runner.last_candle is None and not runner.in_window   # 08:00 -> paused
    now["t"] = now["t"].replace(hour=9, minute=30)
    runner.tick()
    assert runner.last_candle is not None and runner.in_window   # trading resumed


# --------------------------------------------------------------------------- #
# Live Binance feed
# --------------------------------------------------------------------------- #

def _kline_row(open_s, interval=300, close=101.0):
    return [open_s * 1000, "100", "102", "99", str(close), "1",
            (open_s + interval) * 1000 - 1, "0", 0, "0", "0", "0"]


class _KlineRequests:
    def __init__(self):
        self.rows = []
    def get(self, url, params=None, timeout=None):  # noqa: ARG002
        return _FakeResponse(self.rows)


def test_binance_live_feed_emits_each_closed_candle_once_and_flags_gaps():
    req = _KlineRequests()
    feed = BinanceLiveFeed(_requests=req)
    req.rows = [_kline_row(1_000_000)]
    first = feed.next()
    assert first is not None and first.open_time == 1_000_000
    assert feed.next() is None                       # same candle -> nothing new
    req.rows = [_kline_row(1_000_000), _kline_row(1_000_300)]
    second = feed.next()
    assert second.open_time == 1_000_300 and feed.gap_detected is False
    req.rows += [_kline_row(1_001_200)]              # skipped 1_000_600/900 -> gap
    third = feed.next()
    assert third.open_time == 1_001_200 and feed.gap_detected is True


# --------------------------------------------------------------------------- #
# API auth
# --------------------------------------------------------------------------- #

def test_api_requires_token_when_configured():
    client = TestClient(create_app(token="s3cret"))
    assert client.get("/status").status_code == 401
    assert client.get("/status", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/status", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert client.get("/status", headers={"X-Auth-Token": "s3cret"}).status_code == 200
    assert client.get("/status", params={"token": "s3cret"}).status_code == 200
    assert client.get("/").status_code == 200        # the panel page itself is open
    assert client.post("/kill").status_code == 401   # mutations are guarded too


def test_api_open_when_no_token_configured():
    client = TestClient(create_app(token=""))
    assert client.get("/status").status_code == 200


def test_alt_martingale_via_config():
    engine, _, _ = make_engine(BotConfig(strategy="alt_martingale", alt_n=4, max_steps=2,
                                         base_stake=2.0))
    assert isinstance(engine.strategy, AlternationMartingale)
    assert engine.strategy.alt_n == 4 and engine.strategy.max_steps == 2
    assert isinstance(engine.sizer, SteppedMartingaleSizer)
    assert engine.sizer.stepped is engine.strategy
