"""FastAPI control API — Phase 2.

Serves the paper-trading engine over REST + WebSocket so the Android app (or any
client) can configure it, start/stop, hit the kill switch, and stream live state.

Run:
    pip install -r polybot/requirements.txt
    uvicorn polybot.api:app --reload      # http://127.0.0.1:8000  (docs at /docs)

PAPER MODE only — no real funds. Live execution stays Phase 4.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable, Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .candles import Candle, SyntheticFeed
from .engine import TradingEngine
from .execution import PaperExecutor
from .portfolio import Portfolio
from .risk import RiskLimits, RiskManager
from .sizing import FixedSizer, MartingaleSizer
from .strategy import RuleStrategy, SameColorStrategy
from .wallet import WalletManager


# --------------------------------------------------------------------------- #
# Config models
# --------------------------------------------------------------------------- #

class RiskModel(BaseModel):
    max_stake_per_trade: Optional[float] = None
    max_daily_loss: Optional[float] = None
    daily_profit_target: Optional[float] = None
    min_balance: float = 0.0
    max_trades_per_window: Optional[int] = None
    window_seconds: int = 60
    max_consecutive_losses: Optional[int] = None
    day_seconds: int = 86_400

    def to_limits(self) -> RiskLimits:
        return RiskLimits(**self.model_dump())


class BotConfig(BaseModel):
    # strategy
    strategy: str = Field("same_color", description="'same_color' or 'rule'")
    min_streak: int = 1
    invert: bool = False
    rules: Optional[List[Dict[str, Any]]] = None
    # sizing
    sizing: str = Field("martingale", description="'martingale' or 'fixed'")
    base_stake: float = 1.0
    max_steps: int = 6
    # account / execution
    starting_balance: float = 100.0
    payout_multiple: float = 1.95
    # safety / privacy
    risk: RiskModel = RiskModel()
    rotate_wallet: bool = True
    stake_jitter: float = 0.0
    # session: auto-stop after this many minutes of wall-clock time (None = until stopped)
    run_minutes: Optional[float] = None
    # demo loop
    tick_seconds: float = 1.0
    candle_interval_seconds: int = 300


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

class BotRunner:
    """Owns the engine and the (optional) async tick loop, and broadcasts state."""

    def __init__(self) -> None:
        self.config = BotConfig()
        self.running = False
        self.engine: Optional[TradingEngine] = None
        self.risk: Optional[RiskManager] = None
        self.wallet: Optional[WalletManager] = None
        self.feed: Optional[SyntheticFeed] = None
        self.last_candle: Optional[Candle] = None
        self._task: Optional[asyncio.Task] = None
        self._clients: Set[Any] = set()

    # -- lifecycle --------------------------------------------------------- #

    def build(self, config: BotConfig) -> None:
        self.config = config

        if config.strategy == "rule":
            if not config.rules:
                raise ValueError("strategy 'rule' requires a non-empty 'rules' list")
            strategy = RuleStrategy(rules=config.rules)
        else:
            strategy = SameColorStrategy(min_streak=config.min_streak, invert=config.invert)

        sizer = (
            MartingaleSizer(base_stake=config.base_stake, max_steps=config.max_steps)
            if config.sizing == "martingale"
            else FixedSizer(config.base_stake)
        )

        self.risk = RiskManager(config.risk.to_limits())
        self.wallet = (
            WalletManager(
                daily_profit_cap=config.risk.daily_profit_target,
                day_seconds=config.risk.day_seconds,
            )
            if config.rotate_wallet
            else None
        )
        self.engine = TradingEngine(
            strategy=strategy,
            sizer=sizer,
            portfolio=Portfolio(config.starting_balance),
            executor=PaperExecutor(payout_multiple=config.payout_multiple),
            risk=self.risk,
            wallet=self.wallet,
            stake_jitter=config.stake_jitter,
        )
        self.feed = SyntheticFeed(interval_seconds=config.candle_interval_seconds)
        self.last_candle = None

    def tick(self) -> None:
        """Advance one candle. Synchronous core so it is unit-testable."""
        if not self.running or self.engine is None or self.feed is None:
            return
        candle = self.feed.next()
        self.engine.on_candle(candle)
        self.last_candle = candle
        if self.engine.portfolio.equity <= 0.01:
            self.running = False

    def start(self, config: Optional[BotConfig] = None) -> None:
        if config is not None or self.engine is None:
            self.build(config or self.config)
        self.running = True

    def stop(self) -> None:
        self.running = False

    def reset(self) -> None:
        self.running = False
        self.build(self.config)

    def kill(self) -> None:
        if self.risk is not None:
            self.risk.trip_kill_switch()

    # -- state ------------------------------------------------------------- #

    def snapshot(self) -> Dict[str, Any]:
        if self.engine is None:
            return {"running": False, "configured": False}
        p = self.engine.portfolio
        return {
            "running": self.running,
            "configured": True,
            "portfolio": p.summary(),
            "risk": self.risk.status() if self.risk else None,
            "halt_reason": self.engine.last_halt_reason,
            "wallet": (
                {"id": self.wallet.current.id if self.wallet.current else None,
                 "rotations": self.wallet.rotations}
                if self.wallet else None
            ),
            "last_candle": (
                {"color": self.last_candle.color.value, "close": round(self.last_candle.close, 2)}
                if self.last_candle else None
            ),
            "recent_trades": [
                {"signal": t.signal.value, "stake": round(t.stake, 4),
                 "won": t.won, "pnl": round(t.pnl, 4)}
                for t in p.trades[-12:][::-1]
            ],
        }

    # -- async loop + websockets ------------------------------------------ #

    async def run_loop(self) -> None:
        while self.running:
            self.tick()
            await self._broadcast()
            await asyncio.sleep(self.config.tick_seconds)

    def ensure_loop(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run_loop())

    def add_client(self, ws: Any) -> None:
        self._clients.add(ws)

    def remove_client(self, ws: Any) -> None:
        self._clients.discard(ws)

    async def _broadcast(self) -> None:
        if not self._clients:
            return
        snap = self.snapshot()
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json(snap)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.remove_client(ws)


# --------------------------------------------------------------------------- #
# App
# --------------------------------------------------------------------------- #

def create_app(runner: Optional[BotRunner] = None):
    app = FastAPI(title="PolyBot Control API", version="0.1.0")
    app.state.runner = runner or BotRunner()

    def r() -> BotRunner:
        return app.state.runner

    @app.get("/status")
    def status():
        return r().snapshot()

    @app.get("/config")
    def get_config():
        return r().config.model_dump()

    @app.post("/config")
    def set_config(config: BotConfig):
        r().build(config)
        return r().snapshot()

    @app.post("/start")
    def start(config: Optional[BotConfig] = None):
        run = r()
        run.start(config)
        run.ensure_loop()
        return run.snapshot()

    @app.post("/stop")
    def stop():
        r().stop()
        return r().snapshot()

    @app.post("/reset")
    def reset():
        r().reset()
        return r().snapshot()

    @app.post("/kill")
    def kill():
        r().kill()
        return r().snapshot()

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket):
        await websocket.accept()
        run = r()
        run.add_client(websocket)
        await websocket.send_json(run.snapshot())
        try:
            while True:
                await websocket.receive_text()  # keepalive; clients may ping
        except WebSocketDisconnect:
            run.remove_client(websocket)
        except Exception:  # noqa: BLE001
            run.remove_client(websocket)

    return app


app = create_app()
