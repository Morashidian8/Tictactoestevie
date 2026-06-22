"""Wallet rotation — the privacy/blast-radius component.

Rotates the active trading wallet daily (or when a daily profit cap is hit), so
only a small working balance is ever exposed and no single wallet accumulates a
clusterable, copyable track record. In paper mode this models *when* rotations
would happen; in live mode (Phase 4) each `Wallet.id` maps to a real address the
user funds independently.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from .risk import DAY_SECONDS


@dataclass
class Wallet:
    id: str
    opened_at: int
    day_pnl: float = 0.0
    closed_at: Optional[int] = None


class WalletManager:
    def __init__(
        self,
        *,
        daily_profit_cap: Optional[float] = None,
        day_seconds: int = DAY_SECONDS,
        prefix: str = "w",
    ) -> None:
        self.daily_profit_cap = daily_profit_cap
        self.day_seconds = day_seconds
        self.prefix = prefix
        self._seq = 0
        self._day_start: Optional[int] = None
        self.history: List[Wallet] = []
        self._current: Optional[Wallet] = None

    @property
    def current(self) -> Optional[Wallet]:
        return self._current

    @property
    def rotations(self) -> int:
        return max(0, self._seq - 1)

    def _new_wallet(self, now: int) -> Wallet:
        self._seq += 1
        w = Wallet(id=f"{self.prefix}{self._seq:04d}", opened_at=now)
        if self._current is not None:
            self._current.closed_at = now
        self._current = w
        self.history.append(w)
        return w

    def advance(self, now: int) -> Optional[Wallet]:
        """Call once per candle. Opens the first wallet and rotates on a new day.

        Returns the new wallet if a rotation happened, else None.
        """
        boundary = now - (now % self.day_seconds)
        if self._current is None:
            self._day_start = boundary
            return self._new_wallet(now)
        if boundary > (self._day_start or 0):
            self._day_start = boundary
            return self._new_wallet(now)
        return None

    def record(self, now: int, pnl: float) -> Optional[Wallet]:
        """Book a settled PnL to the active wallet; rotate if the profit cap is hit."""
        if self._current is None:
            self.advance(now)
        assert self._current is not None
        self._current.day_pnl += pnl
        if self.daily_profit_cap is not None and self._current.day_pnl >= self.daily_profit_cap:
            return self._new_wallet(now)
        return None
