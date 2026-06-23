"""Tests for the FastAPI control API and BotRunner."""

from __future__ import annotations

import pytest

from polybot.api import BotConfig, BotRunner, RiskModel, create_app

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


def test_runner_ticks_and_trades():
    runner = BotRunner()
    runner.start(BotConfig(base_stake=1.0, starting_balance=100.0))
    for _ in range(40):
        runner.tick()
    snap = runner.snapshot()
    assert snap["running"] in (True, False)
    assert snap["portfolio"]["trades"] >= 1
    assert "balance" in snap["portfolio"]


def test_runner_manual_stop():
    runner = BotRunner()
    runner.start(BotConfig(base_stake=1.0))
    runner.tick()
    runner.stop()
    assert runner.running is False
    assert runner.snapshot()["stop_reason"] == "manual"


def test_runner_auto_stops_after_run_minutes():
    # Fake clock we advance by hand; run for 1 minute (60s).
    now = {"t": 0.0}
    runner = BotRunner(clock=lambda: now["t"])
    runner.start(BotConfig(base_stake=1.0, run_minutes=1.0))
    for _ in range(5):
        runner.tick()
    assert runner.running is True            # still within the minute
    now["t"] = 61.0                          # past the deadline
    runner.tick()
    assert runner.running is False
    assert runner.snapshot()["stop_reason"] == "duration_reached"


def test_runner_kill_switch_blocks_new_trades():
    runner = BotRunner()
    runner.start(BotConfig(base_stake=1.0))
    runner.tick()
    runner.tick()
    before = runner.snapshot()["portfolio"]["trades"]
    runner.kill()
    for _ in range(10):
        runner.tick()
    after = runner.snapshot()
    assert after["portfolio"]["trades"] <= before + 1   # no new bets after kill
    assert after["risk"]["killed"] is True


def test_runner_respects_max_stake_cap():
    cfg = BotConfig(
        base_stake=1.0,
        sizing="martingale",
        risk=RiskModel(max_stake_per_trade=3.0),
    )
    runner = BotRunner()
    runner.start(cfg)
    for _ in range(60):
        runner.tick()
    trades = runner.engine.portfolio.trades
    assert all(t.stake <= 3.0 + 1e-9 for t in trades)


def test_rest_endpoints():
    client = TestClient(create_app())

    assert client.get("/status").json()["running"] is False

    cfg = BotConfig(base_stake=2.0, starting_balance=50.0).model_dump()
    set_resp = client.post("/config", json=cfg)
    assert set_resp.status_code == 200
    assert set_resp.json()["portfolio"]["starting_balance"] == 50.0

    assert client.get("/config").json()["base_stake"] == 2.0

    killed = client.post("/kill").json()
    assert killed["risk"]["killed"] is True

    reset = client.post("/reset").json()
    assert reset["risk"]["killed"] is False


def test_websocket_pushes_snapshot():
    client = TestClient(create_app())
    with client.websocket_connect("/ws") as ws:
        snap = ws.receive_json()
        assert "running" in snap


class _FakeMarket:
    def __init__(self):
        self.question = "Bitcoin Up or Down?"
        self.slug = "btc-up-or-down"
        self.condition_id = "0x1"
        self.token_ids = ["10", "11"]
        self.outcomes = ["Up", "Down"]
        self.active = True
        self.closed = False
        self.end_date = None


class _FakePoly:
    def find_btc_updown_markets(self):
        from dataclasses import dataclass
        # Return an object dataclasses.asdict can handle.
        from polybot.polymarket import Market
        return [Market(question="Bitcoin Up or Down?", slug="btc-up-or-down",
                       condition_id="0x1", token_ids=["10", "11"],
                       outcomes=["Up", "Down"], active=True, closed=False)]

    def midpoint(self, token_id):
        return 0.53

    def price(self, token_id, side="buy"):
        return 0.55 if side == "buy" else 0.51


def test_polymarket_endpoints_with_injected_client():
    app = create_app()
    app.state.polymarket = _FakePoly()
    client = TestClient(app)

    markets = client.get("/polymarket/markets").json()
    assert markets["count"] == 1
    assert markets["markets"][0]["outcomes"] == ["Up", "Down"]

    prices = client.get("/polymarket/prices/10").json()
    assert prices["midpoint"] == 0.53
    assert prices["buy"] == 0.55
