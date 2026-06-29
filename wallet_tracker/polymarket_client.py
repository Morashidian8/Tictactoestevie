"""Read-only client for Polymarket's public Data API.

No keys, no signing, no money moves through here. It just reads a wallet's
public activity, positions and portfolio value so the rest of the tool can
compute balance and PnL.

Endpoints (documented at https://docs.polymarket.com):

    GET {DATA_BASE}/value?user=<addr>        -> current portfolio value
    GET {DATA_BASE}/positions?user=<addr>    -> open positions (mark-to-market)
    GET {DATA_BASE}/activity?user=<addr>     -> full trade/redeem/reward feed

`requests` is imported lazily and the HTTP layer is injectable, so the parsing
and pagination logic is unit-tested offline. Field names follow Polymarket's
API; parsing is defensive so a minor field rename does not crash a report.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

DATA_BASE = "https://data-api.polymarket.com"

# How many activity rows to ask for per page, and a hard safety cap on total
# rows pulled so a whale's full history can't spin forever.
PAGE_LIMIT = 500
MAX_ROWS = 20_000


class PolymarketClient:
    """Thin wrapper over the Data API. `http_get` is injectable for tests."""

    def __init__(
        self,
        data_base: str = DATA_BASE,
        http_get: Optional[Callable[[str, Dict[str, Any]], Any]] = None,
        timeout: int = 20,
    ) -> None:
        self.data_base = data_base.rstrip("/")
        self.timeout = timeout
        self._http_get = http_get  # (url, params) -> parsed json
        self._session = None

    # -- HTTP -------------------------------------------------------------- #

    def _get(self, path: str, params: Dict[str, Any]) -> Any:
        url = f"{self.data_base}{path}"
        if self._http_get is not None:
            return self._http_get(url, params)
        if self._session is None:  # pragma: no cover - needs network
            import requests

            self._session = requests.Session()
        resp = self._session.get(url, params=params, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    # -- endpoints --------------------------------------------------------- #

    def portfolio_value(self, address: str) -> Optional[float]:
        """Total mark-to-market value of the user's open positions (USD)."""
        data = self._get("/value", {"user": address})
        # API returns e.g. [{"user": "0x..", "value": 123.45}] or {"value": ..}.
        if isinstance(data, list):
            data = data[0] if data else {}
        if isinstance(data, dict):
            return _as_float(data.get("value"))
        return None

    def positions(self, address: str, limit: int = 500) -> List[Dict[str, Any]]:
        """Open positions with their current unrealized PnL."""
        data = self._get(
            "/positions",
            {"user": address, "limit": limit, "sortBy": "CURRENT", "sortDirection": "DESC"},
        )
        return _as_rows(data)

    def activity(
        self,
        address: str,
        *,
        start: Optional[int] = None,
        end: Optional[int] = None,
        max_rows: int = MAX_ROWS,
    ) -> List[Dict[str, Any]]:
        """Full activity feed (TRADE / REDEEM / SPLIT / MERGE / REWARD / ...).

        Pages through the API until exhausted (or `max_rows` reached) and returns
        rows sorted oldest-first, which is what the FIFO PnL engine needs.

        `start`/`end` (unix seconds) are passed to the API when given; the engine
        still needs the *full* history before a window to know cost basis, so for
        accurate windowed PnL leave them unset and let the engine slice by time.
        """
        rows: List[Dict[str, Any]] = []
        offset = 0
        while len(rows) < max_rows:
            params: Dict[str, Any] = {
                "user": address,
                "limit": PAGE_LIMIT,
                "offset": offset,
                "sortBy": "TIMESTAMP",
                "sortDirection": "ASC",
            }
            if start is not None:
                params["start"] = int(start)
            if end is not None:
                params["end"] = int(end)
            page = _as_rows(self._get("/activity", params))
            if not page:
                break
            rows.extend(page)
            if len(page) < PAGE_LIMIT:
                break
            offset += PAGE_LIMIT
        rows.sort(key=lambda r: _as_int(r.get("timestamp")) or 0)
        return rows[:max_rows]


# --------------------------------------------------------------------------- #
# Parsing helpers (shared, defensive)
# --------------------------------------------------------------------------- #

def _as_rows(data: Any) -> List[Dict[str, Any]]:
    """Normalize a Data API response to a list of dict rows."""
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        for key in ("data", "activity", "positions", "history"):
            inner = data.get(key)
            if isinstance(inner, list):
                return [r for r in inner if isinstance(r, dict)]
    return []


def _as_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None
