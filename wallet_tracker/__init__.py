"""Polymarket wallet balance + PnL tracker.

A fully self-contained tool: give it any Polymarket wallet address and a time
window (e.g. "last hour", "last 2 hours") and it reports

  * the wallet's USDC cash balance on Polygon, and
  * the realized profit/loss of its Polymarket trades inside that window.

This package has **no dependency on any other project in this repo**. It only
needs `requests` (HTTP) and, for the web app, `fastapi` + `uvicorn`. The PnL
engine itself is pure Python and fully unit-tested offline.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
