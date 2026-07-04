"""Build the wallet report: balance + windowed PnL for one address.

This is the orchestration layer that the web API and the CLI both call. It:

  1. validates the address,
  2. reads the USDC cash balance on Polygon (chain.py),
  3. reads portfolio value + open positions + full activity (polymarket_client),
  4. replays activity through the FIFO engine and slices it by the time window,

then returns one JSON-serializable dict. Network failures in any single source
degrade gracefully into a `warnings` entry instead of failing the whole report.
"""

from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional

from .chain import PolygonClient
from .pnl import PnLEngine
from .polymarket_client import PolymarketClient

_ADDR_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")

# Convenience window presets (minutes) the UI exposes as buttons.
PRESETS = {
    "1h": 60,
    "2h": 120,
    "6h": 360,
    "12h": 720,
    "24h": 1440,
    "7d": 10080,
}


def normalize_address(address: str) -> str:
    addr = (address or "").strip()
    if not _ADDR_RE.match(addr):
        raise ValueError("آدرس کیف پول نامعتبر است. باید یک آدرس 0x... روی شبکه Polygon باشد.")
    return addr


def window_label(minutes: float) -> str:
    if minutes < 60:
        return f"{_num(minutes)} دقیقه اخیر"
    hours = minutes / 60
    if hours < 24:
        return f"{_num(hours)} ساعت اخیر"
    return f"{_num(hours / 24)} روز اخیر"


def build_report(
    address: str,
    window_minutes: float,
    *,
    client: Optional[PolymarketClient] = None,
    chain: Optional[PolygonClient] = None,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    addr = normalize_address(address)
    if window_minutes <= 0:
        raise ValueError("بازه زمانی باید بزرگ‌تر از صفر باشد.")
    client = client or PolymarketClient()
    chain = chain or PolygonClient()
    now = int(now if now is not None else time.time())
    start_ts = now - int(window_minutes * 60)

    warnings: List[str] = []

    balance = _safe(warnings, "موجودی روی Polygon", lambda: chain.usdc_balances(addr)) or {}
    portfolio_value = _safe(warnings, "ارزش پورتفولیو", lambda: client.portfolio_value(addr))
    positions = _safe(warnings, "پوزیشن‌های باز", lambda: client.positions(addr)) or []
    activity = _safe(warnings, "تاریخچه فعالیت", lambda: client.activity(addr)) or []

    engine = PnLEngine().load(activity)
    # Resolved-but-never-redeemed losers are realized losses, not open positions.
    lost_assets = set(engine.close_worthless(positions, now))
    warnings.extend(engine.warnings)
    win = engine.window(start_ts, now, activity)

    open_pos = _summarize_positions(
        [p for p in positions if str(p.get("asset", "") or "") not in lost_assets]
    )

    return {
        "address": addr,
        "generated_at": now,
        "window": {
            "minutes": window_minutes,
            "start_ts": start_ts,
            "end_ts": now,
            "label": window_label(window_minutes),
        },
        "balance": {
            "usdc_e": _round(balance.get("usdc_e")),
            "usdc_native": _round(balance.get("usdc_native")),
            "total_cash": _round(balance.get("total")),
            "currency": "USDC",
            "source": "Polygon RPC (balanceOf)",
        },
        "portfolio_value": _round(portfolio_value),
        "pnl_window": win.as_dict(),
        "open_positions": open_pos,
        "activity_total_rows": len(activity),
        "warnings": warnings,
    }


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _summarize_positions(positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Current (not window-bounded) unrealized PnL of still-open positions."""
    items = []
    unrealized = 0.0
    for p in positions:
        pnl = _f(p.get("cashPnl"))
        if pnl is not None:
            unrealized += pnl
        items.append(
            {
                "title": p.get("title", ""),
                "outcome": p.get("outcome", ""),
                "size": _round(_f(p.get("size"))),
                "avg_price": _round(_f(p.get("avgPrice"))),
                "cur_price": _round(_f(p.get("curPrice"))),
                "current_value": _round(_f(p.get("currentValue"))),
                "unrealized_pnl": _round(pnl),
            }
        )
    items.sort(key=lambda x: (x["current_value"] or 0), reverse=True)
    return {
        "count": len(items),
        "unrealized_pnl_now": _round(unrealized),
        "positions": items[:25],
        "note": "سود/زیان تحقق‌نیافته‌ی پوزیشن‌های باز «در لحظه» است، نه محدود به بازه زمانی.",
    }


def _safe(warnings: List[str], label: str, fn):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - degrade per-source, keep the report
        warnings.append(f"خواندن «{label}» ناموفق بود: {exc}")
        return None


def _f(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: Any) -> Optional[float]:
    v = _f(value)
    return round(v, 4) if v is not None else None


def _num(value: float) -> str:
    return str(int(value)) if abs(value - round(value)) < 1e-9 else f"{value:.1f}"
