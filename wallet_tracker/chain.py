"""On-chain USDC balance for a Polygon address.

Polymarket settles in USDC on Polygon. A wallet's *cash* balance — the money
sitting in the account that is not currently in a position — is just the ERC-20
`balanceOf` of the USDC token(s) for that address.

Two tokens matter on Polygon:
  * USDC.e (bridged) `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` — Polymarket's
    historical collateral token.
  * USDC (native)   `0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359`.

We read both via a single JSON-RPC `eth_call` each. No keys, read-only. The RPC
URL is configurable (env `POLYGON_RPC_URL`) so the user can point at their own
node / paid endpoint if the public one rate-limits.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

DEFAULT_RPC = "https://polygon-rpc.com"
# Public endpoints differ in uptime/rate limits (polygon-rpc.com intermittently
# returns 401); try these in order until one answers.
FALLBACK_RPCS = [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon-rpc.com",
    "https://1rpc.io/matic",
    "https://polygon.drpc.org",
]

USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"  # bridged, Polymarket collateral
USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359"
USDC_DECIMALS = 6

# keccak256("balanceOf(address)")[:4]
BALANCE_OF_SELECTOR = "0x70a08231"


class PolygonClient:
    """Minimal Polygon JSON-RPC reader. `http_post` is injectable for tests."""

    def __init__(
        self,
        rpc_url: Optional[str] = None,
        http_post: Optional[Callable[[str, Dict[str, Any]], Any]] = None,
        timeout: int = 20,
    ) -> None:
        explicit = rpc_url or os.environ.get("POLYGON_RPC_URL")
        # An explicit URL goes first, but the public fallbacks stay behind it.
        self.rpc_urls = ([explicit] if explicit else []) + [
            u for u in FALLBACK_RPCS if u != explicit
        ]
        self.rpc_url = self.rpc_urls[0]
        self.timeout = timeout
        self._http_post = http_post
        self._session = None

    def _rpc(self, method: str, params: list) -> Any:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        if self._http_post is not None:
            return self._http_post(self.rpc_url, payload)
        if self._session is None:  # pragma: no cover - needs network
            import requests

            self._session = requests.Session()
        last_exc: Optional[Exception] = None
        for url in self.rpc_urls:  # pragma: no cover - needs network
            try:
                resp = self._session.post(url, json=payload, timeout=self.timeout)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and data.get("result") is not None:
                    return data
                last_exc = RuntimeError(f"{url}: {str(data)[:120]}")
            except Exception as exc:  # noqa: BLE001 - try the next endpoint
                last_exc = exc
        if last_exc is not None:
            raise last_exc
        return None

    def erc20_balance(self, token: str, address: str, decimals: int = USDC_DECIMALS) -> Optional[float]:
        """Return token balance as a human float, or None if the call fails."""
        data = BALANCE_OF_SELECTOR + _addr_arg(address)
        resp = self._rpc("eth_call", [{"to": token, "data": data}, "latest"])
        if not isinstance(resp, dict):
            return None
        raw = resp.get("result")
        if not isinstance(raw, str) or not raw.startswith("0x"):
            return None
        try:
            return int(raw, 16) / (10 ** decimals)
        except (ValueError, TypeError):
            return None

    def usdc_balances(self, address: str) -> Dict[str, Optional[float]]:
        """Return {'usdc_e', 'usdc_native', 'total'} for the address."""
        usdc_e = self.erc20_balance(USDC_E, address)
        usdc_native = self.erc20_balance(USDC_NATIVE, address)
        total = None
        if usdc_e is not None or usdc_native is not None:
            total = (usdc_e or 0.0) + (usdc_native or 0.0)
        return {"usdc_e": usdc_e, "usdc_native": usdc_native, "total": total}


def _addr_arg(address: str) -> str:
    """Left-pad a 20-byte hex address to a 32-byte ABI word (no 0x)."""
    clean = address.lower().removeprefix("0x")
    return clean.rjust(64, "0")
