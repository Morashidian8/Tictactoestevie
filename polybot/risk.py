"""Risk controls — the safety layer that sits *below* the strategy.

Even a buggy strategy or sizer cannot place a bet the RiskManager rejects. It
enforces hard caps, a kill switch, daily loss/profit halts, a rate limit, and a
consecutive-loss breaker. All time is passed in explicitly (candle time), so the
same logic runs identically in paper, backtest, and live.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

DAY_SECONDS = 86_400


@dataclass
class RiskLimits:
    max_stake_per_trade: Optional[float] = None   # clamp every stake to this
    max_daily_loss: Optional[float] = None        # halt for the day when day PnL <= -this
    daily_profit_target: Optional[float] = None   # halt/rotate when day PnL >= this
    min_balance: float = 0.0                      # stop trading below this balance
    max_trades_per_window: Optional[int] = None   # runaway protection
    window_seconds: int = 60
    max_consecutive_losses: Optional[int] = None  # circuit breaker
    day_seconds: int = DAY_SECONDS


@dataclass
class RiskDecision:
    allowed: bool
    stake: float
    reason: Optional[str] = None


class RiskManager:
    def __init__(self, limits: RiskLimits) -> None:
        self.limits = limits
        self._killed = False
        self._day_start: Optional[int] = None
        self._day_pnl = 0.0
        self._consecutive_losses = 0
        self._trade_times: List[int] = []

    # -- kill switch ------------------------------------------------------- #

    @property
    def killed(self) -> bool:
        return self._killed

    def trip_kill_switch(self) -> None:
        self._killed = True

    def reset_kill_switch(self) -> None:
        self._killed = False

    # -- day handling ------------------------------------------------------ #

    def _roll_day(self, now: int) -> None:
        boundary = now - (now % self.limits.day_seconds)
        if self._day_start is None or boundary > self._day_start:
            self._day_start = boundary
            self._day_pnl = 0.0
            # Daily loss/profit halts clear on a new day; the kill switch does not.

    @property
    def day_pnl(self) -> float:
        return self._day_pnl

    # -- gating ------------------------------------------------------------ #

    def pre_trade(self, now: int, balance: float, proposed_stake: float) -> RiskDecision:
        """Decide whether a bet may be placed, and at what (possibly clamped) stake."""
        self._roll_day(now)
        lim = self.limits

        if self._killed:
            return RiskDecision(False, 0.0, "kill_switch")
        if balance <= lim.min_balance:
            return RiskDecision(False, 0.0, "min_balance")
        if lim.max_daily_loss is not None and self._day_pnl <= -lim.max_daily_loss:
            return RiskDecision(False, 0.0, "daily_loss")
        if lim.daily_profit_target is not None and self._day_pnl >= lim.daily_profit_target:
            return RiskDecision(False, 0.0, "daily_profit_target")
        if (
            lim.max_consecutive_losses is not None
            and self._consecutive_losses >= lim.max_consecutive_losses
        ):
            return RiskDecision(False, 0.0, "max_consecutive_losses")

        self._prune_window(now)
        if lim.max_trades_per_window is not None and len(self._trade_times) >= lim.max_trades_per_window:
            return RiskDecision(False, 0.0, "rate_limit")

        stake = proposed_stake
        if lim.max_stake_per_trade is not None:
            stake = min(stake, lim.max_stake_per_trade)
        stake = min(stake, balance)
        if stake <= 0:
            return RiskDecision(False, 0.0, "min_balance")
        return RiskDecision(True, stake, None)

    def register_trade(self, now: int) -> None:
        """Record that a bet was actually placed (for the rate limiter)."""
        self._prune_window(now)
        self._trade_times.append(now)

    def post_settlement(self, now: int, pnl: float) -> None:
        """Update daily PnL and the consecutive-loss counter after a bet resolves."""
        self._roll_day(now)
        self._day_pnl += pnl
        if pnl < 0:
            self._consecutive_losses += 1
        elif pnl > 0:
            self._consecutive_losses = 0

    def _prune_window(self, now: int) -> None:
        cutoff = now - self.limits.window_seconds
        self._trade_times = [t for t in self._trade_times if t > cutoff]

    def status(self) -> dict:
        return {
            "killed": self._killed,
            "day_pnl": round(self._day_pnl, 4),
            "consecutive_losses": self._consecutive_losses,
            "trades_in_window": len(self._trade_times),
        }
