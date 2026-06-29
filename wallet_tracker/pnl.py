"""Accurate realized-PnL engine for a Polymarket wallet (FIFO cost basis).

Why FIFO and the full history matter
------------------------------------
"How much did this wallet make in the last hour" is a *realized* PnL question,
and realized PnL = proceeds of what you closed − the cost basis of those exact
shares. The cost basis can come from a buy that happened days ago, so we must
replay the wallet's **entire** activity in time order, maintaining per-outcome
inventory lots, and only then slice the resulting closing events by the window.

Activity types handled (Polymarket Data API `type` field):

  TRADE/BUY    -> open a lot at the trade price
  TRADE/SELL   -> close lots FIFO; realized = proceeds − matched cost
  REDEEM       -> market resolved; close remaining lots at the payout
  MERGE        -> complete set merged back to USDC; close lots FIFO
  SPLIT        -> USDC split into a complete set; opens a lot
  REWARD       -> liquidity-mining income; pure positive cash, no cost basis
  CONVERSION   -> neg-risk conversion; cash-neutral, recorded as a warning

The engine is pure Python and deterministic, so it is fully unit-tested offline.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional, Tuple


@dataclass
class ClosingEvent:
    """One position-closing (or income) event, the unit of realized PnL."""

    timestamp: int
    kind: str            # SELL / REDEEM / MERGE / REWARD
    asset: str
    title: str
    outcome: str
    size: float          # shares closed (0 for pure income)
    proceeds: float      # USDC received
    cost_basis: float    # matched cost of those shares
    realized: float      # proceeds − cost_basis

    def as_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "kind": self.kind,
            "asset": self.asset,
            "title": self.title,
            "outcome": self.outcome,
            "size": round(self.size, 4),
            "proceeds": round(self.proceeds, 4),
            "cost_basis": round(self.cost_basis, 4),
            "realized": round(self.realized, 4),
        }


@dataclass
class WindowPnL:
    realized: float                 # from closes inside the window
    rewards: float                  # liquidity rewards inside the window
    total: float                    # realized + rewards
    net_cash_flow: float            # USDC in − out for activity in the window
    trades_count: int               # TRADE rows in the window
    events: List[ClosingEvent] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "realized": round(self.realized, 4),
            "rewards": round(self.rewards, 4),
            "total": round(self.total, 4),
            "net_cash_flow": round(self.net_cash_flow, 4),
            "trades_count": self.trades_count,
            "events": [e.as_dict() for e in self.events],
        }


class _Lot:
    __slots__ = ("size", "price")

    def __init__(self, size: float, price: float) -> None:
        self.size = size
        self.price = price


class PnLEngine:
    """Replays activity once; then answers windowed-PnL queries cheaply."""

    def __init__(self) -> None:
        self._lots: Dict[str, Deque[_Lot]] = {}
        self.closing_events: List[ClosingEvent] = []
        self.realized_total: float = 0.0
        self.warnings: List[str] = []
        self._meta: Dict[str, Tuple[str, str]] = {}  # asset -> (title, outcome)

    # -- ingestion --------------------------------------------------------- #

    def load(self, activity: List[Dict[str, Any]]) -> "PnLEngine":
        """Replay activity rows. Must be oldest-first for correct cost basis."""
        for row in activity:
            self._apply(row)
        return self

    def _apply(self, row: Dict[str, Any]) -> None:
        asset = str(row.get("asset", ""))
        atype = str(row.get("type", "")).upper()
        side = str(row.get("side", "")).upper()
        ts = _int(row.get("timestamp")) or 0
        size = abs(_float(row.get("size")) or 0.0)
        usdc = abs(_float(row.get("usdcSize")) or 0.0)
        price = _float(row.get("price"))
        title = str(row.get("title", "") or "")
        outcome = str(row.get("outcome", "") or "")
        if asset:
            self._meta[asset] = (title, outcome)

        if atype == "REWARD":
            self.closing_events.append(
                ClosingEvent(ts, "REWARD", asset, title, outcome, 0.0, usdc, 0.0, usdc)
            )
            self.realized_total += usdc
            return

        if atype == "CONVERSION":
            self.warnings.append(
                "یک رویداد CONVERSION (neg-risk) نادیده گرفته شد؛ روی سود/زیان نقدی اثر مستقیم ندارد."
            )
            return

        if atype == "TRADE" and side == "BUY":
            self._open(asset, size, _buy_price(price, usdc, size))
            return
        if atype == "SPLIT":
            # USDC split into a complete set -> opens inventory at its cash cost.
            self._open(asset, size, _buy_price(price, usdc, size))
            return

        if atype == "TRADE" and side == "SELL":
            self._close(ts, "SELL", asset, size, usdc if usdc else size * (price or 0.0))
            return
        if atype == "MERGE":
            self._close(ts, "MERGE", asset, size, usdc if usdc else size * (price or 0.0))
            return
        if atype == "REDEEM":
            self._close(ts, "REDEEM", asset, size, usdc)
            return

        # Unknown / unhandled type: record once so the report can surface it.
        if atype and atype not in ("TRADE",):
            self.warnings.append(f"نوع فعالیت ناشناخته نادیده گرفته شد: {atype}")

    def _open(self, asset: str, size: float, price: float) -> None:
        if size <= 0:
            return
        self._lots.setdefault(asset, deque()).append(_Lot(size, price))

    def _close(self, ts: int, kind: str, asset: str, size: float, proceeds: float) -> None:
        title, outcome = self._meta.get(asset, ("", ""))
        lots = self._lots.get(asset)
        cost = 0.0
        remaining = size
        if lots:
            while remaining > 1e-9 and lots:
                lot = lots[0]
                take = min(lot.size, remaining)
                cost += take * lot.price
                lot.size -= take
                remaining -= take
                if lot.size <= 1e-9:
                    lots.popleft()
        if remaining > 1e-6:
            # Closed more than we have a recorded basis for (history truncated or
            # pre-existing position). Basis for the uncovered part is unknown → 0.
            self.warnings.append(
                f"بخشی از یک بستن پوزیشن بدون مبنای هزینه‌ی ثبت‌شده بود ({asset[:10]}…)؛ "
                "ممکن است تاریخچه‌ی کامل در دسترس نباشد."
            )
        realized = proceeds - cost
        self.realized_total += realized
        self.closing_events.append(
            ClosingEvent(ts, kind, asset, title, outcome, size, proceeds, cost, realized)
        )

    # -- queries ----------------------------------------------------------- #

    def window(self, start_ts: int, end_ts: int, activity: List[Dict[str, Any]]) -> WindowPnL:
        """Realized PnL, rewards and cash flow for [start_ts, end_ts]."""
        events = [e for e in self.closing_events if start_ts <= e.timestamp <= end_ts]
        realized = sum(e.realized for e in events if e.kind != "REWARD")
        rewards = sum(e.realized for e in events if e.kind == "REWARD")

        inflow = outflow = 0.0
        trades = 0
        for row in activity:
            ts = _int(row.get("timestamp")) or 0
            if not (start_ts <= ts <= end_ts):
                continue
            atype = str(row.get("type", "")).upper()
            side = str(row.get("side", "")).upper()
            usdc = abs(_float(row.get("usdcSize")) or 0.0)
            if atype == "TRADE":
                trades += 1
                if side == "BUY":
                    outflow += usdc
                elif side == "SELL":
                    inflow += usdc
            elif atype in ("REDEEM", "MERGE", "REWARD"):
                inflow += usdc
            elif atype == "SPLIT":
                outflow += usdc

        return WindowPnL(
            realized=realized,
            rewards=rewards,
            total=realized + rewards,
            net_cash_flow=inflow - outflow,
            trades_count=trades,
            events=sorted(events, key=lambda e: e.timestamp, reverse=True),
        )


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _buy_price(price: Optional[float], usdc: float, size: float) -> float:
    if price is not None and price > 0:
        return price
    if size > 0:
        return usdc / size
    return 0.0


def _float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None
