"""
Risk management for the Polymarket trading bot.

Enforces hard limits so a bad streak cannot drain the wallet:
  - fixed stake per trade (STAKE_USDC)
  - maximum entry price (never buy worse odds than MAX_ENTRY_PRICE)
  - daily loss limit (DAILY_LOSS_LIMIT_USDC) — halts until the next UTC day
  - max consecutive losses (MAX_CONSECUTIVE_LOSSES) — halts until next UTC day

State (daily P&L, loss streak) is persisted to a JSON file so limits
survive restarts.
"""

import json
import os
import logging
from datetime import datetime, timezone

log = logging.getLogger("trade-bot")


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class RiskManager:
    def __init__(
        self,
        stake_usdc: float,
        max_entry_price: float,
        daily_loss_limit_usdc: float,
        max_consecutive_losses: int,
        state_path: str = "trader_state.json",
    ):
        self.stake_usdc = float(stake_usdc)
        self.max_entry_price = float(max_entry_price)
        self.daily_loss_limit_usdc = float(daily_loss_limit_usdc)
        self.max_consecutive_losses = int(max_consecutive_losses)
        self.state_path = state_path
        self.state = self._load()

    # -- persistence --------------------------------------------------------
    def _load(self):
        try:
            with open(self.state_path, "r", encoding="utf-8") as fh:
                state = json.load(fh)
        except (OSError, ValueError):
            state = {}
        state.setdefault("day", _utc_day())
        state.setdefault("daily_pnl", 0.0)
        state.setdefault("consecutive_losses", 0)
        state.setdefault("trades_today", 0)
        state.setdefault("total_pnl", 0.0)
        return state

    def _save(self):
        tmp = self.state_path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self.state, fh, ensure_ascii=False, indent=2)
            os.replace(tmp, self.state_path)
        except OSError as exc:
            log.error("Could not persist risk state: %s", exc)

    def _roll_day(self):
        today = _utc_day()
        if self.state["day"] != today:
            log.info(
                "New UTC day %s — resetting daily P&L (was %.2f).",
                today,
                self.state["daily_pnl"],
            )
            self.state["day"] = today
            self.state["daily_pnl"] = 0.0
            self.state["consecutive_losses"] = 0
            self.state["trades_today"] = 0
            self._save()

    # -- checks --------------------------------------------------------------
    def can_trade(self, entry_price: float):
        """Return (allowed: bool, reason: str)."""
        self._roll_day()
        if entry_price <= 0 or entry_price >= 1:
            return False, f"قیمت ورود نامعتبر است ({entry_price})"
        if entry_price > self.max_entry_price:
            return False, (
                f"قیمت ورود {entry_price:.2f} از سقف مجاز "
                f"{self.max_entry_price:.2f} بیشتر است"
            )
        if -self.state["daily_pnl"] >= self.daily_loss_limit_usdc:
            return False, (
                f"سقف ضرر روزانه ({self.daily_loss_limit_usdc:.2f} USDC) پر شده —"
                " تا روز بعد (UTC) معامله‌ای انجام نمی‌شود"
            )
        if self.state["consecutive_losses"] >= self.max_consecutive_losses:
            return False, (
                f"{self.state['consecutive_losses']} ضرر پشت سر هم —"
                " تا روز بعد (UTC) معامله‌ای انجام نمی‌شود"
            )
        return True, ""

    def record_result(self, pnl_usdc: float):
        self._roll_day()
        self.state["daily_pnl"] += pnl_usdc
        self.state["total_pnl"] += pnl_usdc
        self.state["trades_today"] += 1
        if pnl_usdc < 0:
            self.state["consecutive_losses"] += 1
        else:
            self.state["consecutive_losses"] = 0
        self._save()

    # -- reporting ------------------------------------------------------------
    @property
    def daily_pnl(self) -> float:
        return self.state["daily_pnl"]

    @property
    def total_pnl(self) -> float:
        return self.state["total_pnl"]

    @property
    def trades_today(self) -> int:
        return self.state["trades_today"]
