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
import datetime as _dt
import logging
import os
import pathlib
import time
from typing import Any, Callable, Dict, List, Optional, Set
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

_WEBUI = pathlib.Path(__file__).parent / "webui" / "index.html"
_log = logging.getLogger("polybot")

from .candles import BinanceLiveFeed, Candle, SyntheticFeed
from .engine import TradingEngine
from .execution import PaperExecutor, ShadowPolymarketExecutor
from .portfolio import Portfolio
from .risk import RiskLimits, RiskManager
from .sizing import FixedSizer, MartingaleSizer, SteppedMartingaleSizer
from .strategy import AlternationMartingale, RuleStrategy, SameColorStrategy
from .wallet import WalletManager


# --------------------------------------------------------------------------- #
# Trading-window schedule
# --------------------------------------------------------------------------- #

def _parse_hhmm(value: str) -> int:
    """'HH:MM' -> minutes since midnight. Raises ValueError on bad input."""
    parts = value.strip().split(":")
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError(f"invalid time {value!r}")
    return h * 60 + m


def in_trading_window(now_minutes: int, start: Optional[str], end: Optional[str]) -> bool:
    """Is `now_minutes` (minutes since local midnight) inside [start, end)?

    No schedule (either bound missing) means always-on. An end before the start
    is an overnight window (e.g. 23:00 -> 01:30) and wraps midnight.
    """
    if not start or not end:
        return True
    s, e = _parse_hhmm(start), _parse_hhmm(end)
    if s == e:
        return True   # degenerate window = 24h
    if s < e:
        return s <= now_minutes < e
    return now_minutes >= s or now_minutes < e   # overnight wrap


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
    strategy: str = Field(
        "same_color", description="'alt_martingale', 'same_color' or 'rule'"
    )
    min_streak: int = 1
    invert: bool = False
    rules: Optional[List[Dict[str, Any]]] = None
    # alt_martingale (the phone app's v13 strategy)
    alt_n: int = Field(5, description="alternations (colour flips) required to arm")
    # sizing — for 'alt_martingale' the stepped martingale is forced (it IS the strategy)
    sizing: str = Field("martingale", description="'martingale' or 'fixed'")
    base_stake: float = 1.0
    max_steps: int = 6
    # account / execution
    starting_balance: float = 100.0
    payout_multiple: float = 1.95
    # odds: 'fixed' simulates with payout_multiple; 'real' quotes each bet from the
    # live Polymarket market and SKIPS the bet if no real price is available.
    odds: str = "fixed"
    max_entry_price: Optional[float] = Field(
        None, description="limit mode: skip bets whose real price is above this"
    )
    # safety / privacy
    risk: RiskModel = RiskModel()
    rotate_wallet: bool = True
    stake_jitter: float = 0.0
    # session: auto-stop after this many minutes of wall-clock time (None = until stopped)
    run_minutes: Optional[float] = None
    # daily trading window (server-side scheduler); both set = only trade inside it
    schedule_start: Optional[str] = Field(None, description="'HH:MM' local to timezone")
    schedule_end: Optional[str] = Field(None, description="'HH:MM' local to timezone")
    timezone: str = "Asia/Tehran"
    # data source: "synthetic" (offline demo), "binance" (real closed candles),
    # or "polymarket" (sampled token price feed; needs market_token_id)
    source: str = "synthetic"
    symbol: str = "BTCUSDT"
    binance_interval: str = "5m"
    market_token_id: Optional[str] = None
    # loop
    tick_seconds: float = 1.0
    candle_interval_seconds: int = 300


class BacktestRequest(BaseModel):
    token_id: str
    interval: str = "1h"          # 1m / 1h / 6h / 1d / max
    config: BotConfig = BotConfig()


# --------------------------------------------------------------------------- #
# Engine construction (shared by the live runner and the backtest)
# --------------------------------------------------------------------------- #

def make_engine(config: BotConfig):
    """Build a TradingEngine + risk + wallet from a config. No data feed attached."""
    if config.strategy == "rule":
        if not config.rules:
            raise ValueError("strategy 'rule' requires a non-empty 'rules' list")
        strategy = RuleStrategy(rules=config.rules)
    elif config.strategy == "alt_martingale":
        strategy = AlternationMartingale(alt_n=config.alt_n, max_steps=config.max_steps)
    else:
        strategy = SameColorStrategy(min_streak=config.min_streak, invert=config.invert)

    if config.strategy == "alt_martingale":
        # The stepped martingale IS the strategy; the sizing menu doesn't apply.
        sizer = SteppedMartingaleSizer(base_stake=config.base_stake, stepped=strategy)
    elif config.sizing == "martingale":
        sizer = MartingaleSizer(base_stake=config.base_stake, max_steps=config.max_steps)
    else:
        sizer = FixedSizer(config.base_stake)
    risk = RiskManager(config.risk.to_limits())
    wallet = (
        WalletManager(
            daily_profit_cap=config.risk.daily_profit_target,
            day_seconds=config.risk.day_seconds,
        )
        if config.rotate_wallet
        else None
    )
    if config.odds == "real":
        executor = ShadowPolymarketExecutor(
            interval_seconds=config.candle_interval_seconds,
            max_entry_price=config.max_entry_price,
        )
    else:
        executor = PaperExecutor(payout_multiple=config.payout_multiple)
    engine = TradingEngine(
        strategy=strategy,
        sizer=sizer,
        portfolio=Portfolio(config.starting_balance),
        executor=executor,
        risk=risk,
        wallet=wallet,
        stake_jitter=config.stake_jitter,
    )
    return engine, risk, wallet


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #

class BotRunner:
    """Owns the engine and the (optional) async tick loop, and broadcasts state."""

    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        local_now: Optional[Callable[[str], _dt.datetime]] = None,
    ) -> None:
        self.config = BotConfig()
        self.running = False
        self.engine: Optional[TradingEngine] = None
        self.risk: Optional[RiskManager] = None
        self.wallet: Optional[WalletManager] = None
        self.feed: Optional[Any] = None
        self.last_candle: Optional[Candle] = None
        self._task: Optional[asyncio.Task] = None
        self._clients: Set[Any] = set()
        self._clock = clock
        # injectable wall clock for the scheduler (tests pass a fake)
        self._local_now = local_now or (lambda tz: _dt.datetime.now(ZoneInfo(tz)))
        self._deadline: Optional[float] = None   # wall-clock auto-stop, if run_minutes set
        self.stop_reason: Optional[str] = None
        self.in_window = True                    # scheduler state, shown in snapshot
        self._was_in_window = True

    # -- lifecycle --------------------------------------------------------- #

    def build(self, config: BotConfig) -> None:
        self.config = config
        self.engine, self.risk, self.wallet = make_engine(config)
        if config.source == "binance":
            self.feed = BinanceLiveFeed(symbol=config.symbol, interval=config.binance_interval)
        elif config.source == "polymarket":
            if not config.market_token_id:
                raise ValueError("source 'polymarket' requires 'market_token_id'")
            from .polymarket import PolymarketData, PolymarketSampledFeed
            self.feed = PolymarketSampledFeed(
                PolymarketData(), config.market_token_id, config.candle_interval_seconds
            )
        else:
            self.feed = SyntheticFeed(interval_seconds=config.candle_interval_seconds)
        self.last_candle = None
        self.in_window = True
        self._was_in_window = True

    def _check_window(self) -> bool:
        """Scheduler gate. Refreshes `in_window`; resets strategy state on re-entry."""
        cfg = self.config
        if not cfg.schedule_start or not cfg.schedule_end:
            self.in_window = True
        else:
            now = self._local_now(cfg.timezone)
            self.in_window = in_trading_window(
                now.hour * 60 + now.minute, cfg.schedule_start, cfg.schedule_end
            )
        if self.in_window and not self._was_in_window and self.engine is not None:
            # Window just opened after a pause: void any stale bet and clear
            # strategy state — the candles in between were never traded.
            self.engine.void_pending()
        self._was_in_window = self.in_window
        return self.in_window

    def tick(self) -> None:
        """Advance one candle. Synchronous core so it is unit-testable."""
        if not self.running or self.engine is None or self.feed is None:
            return
        # Optional session cap: auto-stop once the run duration is reached.
        if self._deadline is not None and self._clock() >= self._deadline:
            self.running = False
            self.stop_reason = "duration_reached"
            return
        if not self._check_window():
            return   # outside the trading window: stay alive, don't trade
        candle = self.feed.next()
        if candle is None:
            return   # live feed: no newly-closed candle yet
        # A gap in a live feed (downtime) voids the bet whose outcome we missed.
        if getattr(self.feed, "gap_detected", False):
            self.engine.void_pending()
        self.engine.on_candle(candle)
        self.last_candle = candle
        if self.engine.portfolio.equity <= 0.01:
            self.running = False
            self.stop_reason = "balance_exhausted"

    def start(self, config: Optional[BotConfig] = None) -> None:
        if config is not None or self.engine is None:
            self.build(config or self.config)
        self.running = True
        self.stop_reason = None
        self._deadline = (
            self._clock() + self.config.run_minutes * 60
            if self.config.run_minutes
            else None
        )

    def stop(self) -> None:
        self.running = False
        self.stop_reason = "manual"

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
        open_pos = p.trades[-1] if p.trades and not p.trades[-1].resolved else None
        remaining = None
        if self.running and self._deadline is not None:
            remaining = max(0.0, round(self._deadline - self._clock(), 1))
        strat = self.engine.strategy
        strat_state = (
            {"step": strat.step, "armed": strat.armed}
            if isinstance(strat, AlternationMartingale) else None
        )
        last_price = getattr(self.engine.executor, "last_quote_price", None)
        return {
            "running": self.running,
            "configured": True,
            "run_minutes": self.config.run_minutes,
            "remaining_seconds": remaining,
            "stop_reason": self.stop_reason,
            "in_window": self.in_window,
            "schedule": (
                {"start": self.config.schedule_start, "end": self.config.schedule_end,
                 "timezone": self.config.timezone}
                if self.config.schedule_start and self.config.schedule_end else None
            ),
            "strategy_state": strat_state,
            "last_quote_price": last_price,
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
            "open_position": (
                {"signal": open_pos.signal.value, "stake": round(open_pos.stake, 4),
                 "entry_price": open_pos.entry_price, "entry_time": open_pos.candle_open_time,
                 "payout_multiple": open_pos.payout_multiple}
                if open_pos else None
            ),
            "recent_trades": [
                {"signal": t.signal.value, "stake": round(t.stake, 4),
                 "won": t.won, "pnl": round(t.pnl, 4),
                 "entry_price": t.entry_price, "entry_time": t.candle_open_time}
                for t in p.trades[-15:][::-1]
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

def create_app(runner: Optional[BotRunner] = None, token: Optional[str] = None):
    """Build the app. `token` (or the POLYBOT_TOKEN env var) protects every API
    endpoint: requests must send `Authorization: Bearer <token>` (or an
    `X-Auth-Token` header / `?token=` query). Without a token configured the API
    is OPEN — fine on localhost, never in deployment (the deploy guide and the
    systemd unit both set POLYBOT_TOKEN)."""
    app = FastAPI(title="PolyBot Control API", version="0.2.0")
    app.state.runner = runner or BotRunner()
    auth_token = token if token is not None else os.environ.get("POLYBOT_TOKEN", "")
    if not auth_token:
        _log.warning(
            "POLYBOT_TOKEN is not set — the control API is UNPROTECTED. "
            "Set it before exposing this server to the network."
        )
    # Personal paper tool: allow the web UI to talk to the API from any origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _extract_token(request: Request) -> str:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            return header[7:].strip()
        return request.headers.get("x-auth-token") or request.query_params.get("token", "")

    def require_auth(request: Request) -> None:
        if auth_token and _extract_token(request) != auth_token:
            raise HTTPException(status_code=401, detail="invalid or missing token")

    guarded = [Depends(require_auth)]

    def r() -> BotRunner:
        return app.state.runner

    @app.get("/", response_class=HTMLResponse)
    def home():
        # The browser control panel — no install needed, just open this URL.
        if _WEBUI.exists():
            return _WEBUI.read_text(encoding="utf-8")
        return "<h1>PolyBot</h1><p>Web UI not found. API docs at <a href='/docs'>/docs</a>.</p>"

    @app.get("/status", dependencies=guarded)
    def status():
        return r().snapshot()

    @app.get("/config", dependencies=guarded)
    def get_config():
        return r().config.model_dump()

    @app.post("/config", dependencies=guarded)
    def set_config(config: BotConfig):
        r().build(config)
        return r().snapshot()

    @app.post("/start", dependencies=guarded)
    async def start(config: Optional[BotConfig] = None):
        # async so ensure_loop() can schedule the tick task on the running loop.
        run = r()
        run.start(config)
        run.ensure_loop()
        return run.snapshot()

    @app.post("/stop", dependencies=guarded)
    def stop():
        r().stop()
        return r().snapshot()

    @app.post("/reset", dependencies=guarded)
    def reset():
        r().reset()
        return r().snapshot()

    @app.post("/kill", dependencies=guarded)
    def kill():
        r().kill()
        return r().snapshot()

    # -- read-only Polymarket data (needs network; works on the deployed host) -- #

    def poly():
        if getattr(app.state, "polymarket", None) is None:
            from .polymarket import PolymarketData
            app.state.polymarket = PolymarketData()
        return app.state.polymarket

    @app.get("/polymarket/markets", dependencies=guarded)
    def polymarket_markets():
        try:
            from dataclasses import asdict
            markets = poly().find_btc_updown_markets()
            return {"count": len(markets), "markets": [asdict(m) for m in markets]}
        except Exception as exc:  # noqa: BLE001 - surface network/host issues to the client
            return {"error": str(exc), "markets": []}

    @app.post("/backtest", dependencies=guarded)
    def backtest(req: BacktestRequest):
        """Run the strategy over real Polymarket price history and return the result."""
        try:
            from .polymarket import history_to_candles
            hist = poly().prices_history(req.token_id, interval=req.interval)
            candles = history_to_candles(hist, req.config.candle_interval_seconds)
            if not candles:
                return {"error": "no price history for that token/interval", "candles": 0}
            engine, _, _ = make_engine(req.config)
            engine.run(candles)
            p = engine.portfolio
            return {
                "candles": len(candles),
                "interval": req.interval,
                "portfolio": p.summary(),
                "trades": [
                    {"signal": t.signal.value, "stake": round(t.stake, 4),
                     "won": t.won, "pnl": round(t.pnl, 4)}
                    for t in p.trades[-50:]
                ],
            }
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc), "candles": 0}

    @app.get("/polymarket/prices/{token_id}", dependencies=guarded)
    def polymarket_prices(token_id: str):
        try:
            api = poly()
            return {
                "token_id": token_id,
                "midpoint": api.midpoint(token_id),
                "buy": api.price(token_id, "buy"),
                "sell": api.price(token_id, "sell"),
            }
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket):
        if auth_token and websocket.query_params.get("token", "") != auth_token:
            await websocket.close(code=4401)
            return
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
