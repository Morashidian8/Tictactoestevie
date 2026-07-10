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
        # REDEEM rows carry a conditionId but an EMPTY `asset`, so lots must
        # also be reachable by condition (and, as a fallback, by title).
        self._cond_assets: Dict[str, List[str]] = {}
        self._asset_last_ts: Dict[str, int] = {}
        self._asset_slug: Dict[str, str] = {}

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
        cond = str(row.get("conditionId", "") or "")
        slug = str(row.get("slug", "") or row.get("eventSlug", "") or "")
        if asset:
            self._meta[asset] = (title, outcome)
            self._asset_last_ts[asset] = max(ts, self._asset_last_ts.get(asset, 0))
            if slug:
                self._asset_slug[asset] = slug
            if cond:
                bucket = self._cond_assets.setdefault(cond, [])
                if asset not in bucket:
                    bucket.append(asset)

        # Cash income the wallet receives that isn't a position close: liquidity
        # rewards and maker/taker rebates. Polymarket counts these in PnL, so we
        # book them as income (proceeds with zero cost).
        if atype == "REWARD" or "REBATE" in atype:
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
            # Redemption settles the WHOLE condition for this wallet: winning
            # shares pay $1, losing shares pay $0, nothing remains after. The
            # row's `asset` is empty, so match lots via conditionId (fallbacks:
            # the asset itself, then title) and close them all against the
            # payout — that books the winner's gain AND the loser's loss.
            self._close_condition(ts, cond, asset, title, size, usdc)
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

    def _drain_all(self, asset: str) -> float:
        """Remove every remaining lot of `asset`, returning their total cost."""
        cost = 0.0
        lots = self._lots.get(asset)
        while lots:
            lot = lots.popleft()
            cost += lot.size * lot.price
        return cost

    def _close_condition(self, ts: int, cond: str, asset: str, title: str,
                         size: float, proceeds: float) -> None:
        assets = list(self._cond_assets.get(cond, []))
        if not assets and asset and self._lots.get(asset):
            assets = [asset]
        if not assets and title:
            assets = [a for a, (t, _o) in self._meta.items() if t and t == title]
        cost = sum(self._drain_all(a) for a in assets)
        if not assets:
            self.warnings.append(
                "یک تسویه (REDEEM) به هیچ خریدی وصل نشد؛ ممکن است تاریخچه کامل نباشد."
            )
        if not title and assets:
            title = self._meta.get(assets[0], ("", ""))[0]
        realized = proceeds - cost
        self.realized_total += realized
        self.closing_events.append(
            ClosingEvent(ts, "REDEEM", cond or asset, title, "", size, proceeds, cost, realized)
        )

    def close_worthless(self, positions: List[Dict[str, Any]], now_ts: int) -> List[str]:
        """Realize losses for resolved-and-lost positions that were never redeemed.

        A losing outcome pays nothing, so most users never claim it and no
        REDEEM row ever appears — but the loss became real the moment the
        market resolved. The positions API shows these as size>0, curPrice==0.
        Books each as a LOST closing event at the market's end time (fallback:
        last trade time, then now). Returns the affected asset ids so the
        report can exclude them from "open positions".
        """
        lost: List[str] = []
        for p in positions:
            asset = str(p.get("asset", "") or "")
            size = _float(p.get("size")) or 0.0
            cur = _float(p.get("curPrice"))
            if not asset or size <= 1e-6 or cur is None or cur > 1e-9:
                continue
            # Best resolution-time source first: recurring up/down markets encode
            # the window start in their slug (…-5m-<unix>), while `endDate` is
            # date-only (midnight) — far too coarse for hourly PnL windows.
            end_ts = (
                _slug_end_ts(p.get("slug") or p.get("eventSlug"))
                or _parse_end_ts(p.get("endDate"))
                or self._asset_last_ts.get(asset)
                or now_ts
            )
            end_ts = max(end_ts, self._asset_last_ts.get(asset, 0))
            end_ts = min(end_ts, now_ts)
            cost = self._drain_all(asset)
            if cost <= 1e-9:
                # No recorded lots (history truncated) — fall back to the
                # position's own average cost so the loss is still counted.
                avg = _float(p.get("avgPrice")) or 0.0
                cost = _float(p.get("initialValue")) or (size * avg)
                if cost <= 1e-9:
                    continue
            title = str(p.get("title", "") or "")
            outcome = str(p.get("outcome", "") or "")
            realized = -cost
            self.realized_total += realized
            self.closing_events.append(
                ClosingEvent(end_ts, "LOST", asset, title, outcome, size, 0.0, cost, realized)
            )
            lost.append(asset)

        # Orphan losers: lots still open in inventory whose asset the positions
        # API does NOT report as currently valuable. A winning position would
        # have produced a REDEEM (cash) row that drained its lots, or would still
        # be listed with curPrice>0; so a leftover lot on a market that has
        # already resolved is a loss the feed simply never emitted. Without this,
        # those un-booked losses inflate realized profit (realized > cash flow).
        still_valued = {
            str(p.get("asset", "") or "")
            for p in positions
            if (_float(p.get("curPrice")) or 0.0) > 1e-9
        }
        for asset in list(self._lots.keys()):
            if asset in still_valued:
                continue
            remaining = sum(l.size for l in self._lots[asset])
            if remaining <= 1e-6:
                continue
            end_ts = _slug_end_ts(self._asset_slug.get(asset)) or self._asset_last_ts.get(asset)
            # Only book as a loss once the market has actually resolved; a lot on
            # a not-yet-resolved market is a genuine open position we simply lack
            # a positions row for, so leave it.
            if end_ts is None or end_ts > now_ts:
                continue
            cost = self._drain_all(asset)
            if cost <= 1e-9:
                continue
            title, outcome = self._meta.get(asset, ("", ""))
            self.realized_total += -cost
            self.closing_events.append(
                ClosingEvent(end_ts, "LOST", asset, title, outcome, remaining, 0.0, cost, -cost)
            )
            lost.append(asset)

        self.closing_events.sort(key=lambda e: e.timestamp)
        return lost

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

_SLUG_TS = None  # compiled lazily


def _slug_end_ts(slug: Any) -> Optional[int]:
    """Market end time from recurring-market slugs like btc-updown-5m-1783090500.

    The trailing number is the window START (unix seconds); add the window
    length encoded as -5m- / -15m- / -1h- / -4h- / -1d-.
    """
    global _SLUG_TS
    if not slug:
        return None
    if _SLUG_TS is None:
        import re

        _SLUG_TS = re.compile(r"-(\d{9,11})$")
    m = _SLUG_TS.search(str(slug))
    if not m:
        return None
    base = int(m.group(1))
    if not (1_000_000_000 <= base <= 4_000_000_000):
        return None
    text = str(slug)
    for token, seconds in (("-5m-", 300), ("-15m-", 900), ("-1h-", 3600),
                           ("-4h-", 14_400), ("-1d-", 86_400)):
        if token in text:
            return base + seconds
    return base


def _parse_end_ts(value: Any) -> Optional[int]:
    """Parse the positions API `endDate` (ISO 8601) to unix seconds."""
    if not value:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    try:
        from datetime import datetime, timezone

        text = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except (ValueError, TypeError):
        return None


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
