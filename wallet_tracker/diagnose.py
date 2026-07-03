"""One-shot diagnostic against REAL data for one address.

Run where network is open (GitHub Actions):

    python -m wallet_tracker.diagnose 0xADDRESS

Prints: raw field shapes from the Data API, an event-type histogram, the FIFO
engine's results over several windows, open positions, and — crucially — the
official Polymarket user-pnl series for the same address, so our numbers can be
compared against Polymarket's own.
"""

from __future__ import annotations

import collections
import json
import sys
import time

from .pnl import PnLEngine
from .polymarket_client import PolymarketClient


def main() -> None:
    addr = sys.argv[1].strip().lower()
    c = PolymarketClient()

    print("=== /value ===")
    try:
        print(json.dumps(c._get("/value", {"user": addr}))[:500])
    except Exception as e:  # noqa: BLE001
        print("ERROR:", e)

    acts = c.activity(addr)
    print(f"\n=== activity: {len(acts)} rows ===")
    hist = collections.Counter((str(a.get("type")), str(a.get("side"))) for a in acts)
    for k, v in sorted(hist.items()):
        print("  ", k, "x", v)

    print("\n--- newest 12 rows (key fields) ---")
    for a in acts[-12:]:
        print("  ", {k: a.get(k) for k in ("timestamp", "type", "side", "size", "usdcSize", "price", "outcome", "title")})

    eng = PnLEngine().load(acts)
    now = int(time.time())
    print("\n=== FIFO engine ===")
    print("realized_total (all time):", round(eng.realized_total, 2))
    for label, mins in (("1h", 60), ("6h", 360), ("24h", 1440), ("7d", 10080), ("30d", 43200)):
        w = eng.window(now - mins * 60, now, acts)
        print(f"  window {label:>4}: total={w.total:+9.2f}  realized={w.realized:+9.2f}  "
              f"rewards={w.rewards:+7.2f}  cashflow={w.net_cash_flow:+9.2f}  trades={w.trades_count}")
    print("--- newest 8 closing events ---")
    for e in eng.closing_events[-8:]:
        print("  ", e.kind, e.timestamp, f"size={e.size:.2f}", f"proceeds={e.proceeds:.2f}",
              f"cost={e.cost_basis:.2f}", f"pnl={e.realized:+.2f}", (e.title or "")[:40])
    if eng.warnings:
        print(f"warnings: {len(eng.warnings)}  e.g. {eng.warnings[0]}")

    print("\n=== /positions ===")
    try:
        pos = c.positions(addr)
        print("count:", len(pos))
        for p in pos[:6]:
            print("  ", {k: p.get(k) for k in ("title", "outcome", "size", "avgPrice", "curPrice",
                                               "currentValue", "cashPnl", "redeemable")})
        zeros = [p for p in pos if not p.get("curPrice")]
        print("positions with curPrice==0 (resolved/lost, unredeemed):", len(zeros))
        for p in zeros[:6]:
            print("   LOST?", {k: p.get(k) for k in ("title", "outcome", "size", "avgPrice", "currentValue", "redeemable")})
    except Exception as e:  # noqa: BLE001
        print("ERROR:", e)

    # Official Polymarket PnL series (what the profile chart shows) — ground truth.
    print("\n=== official user-pnl API ===")
    import requests
    for interval, fidelity in (("1d", "1h"), ("1w", "1d"), ("1m", "1d"), ("all", "1d")):
        try:
            r = requests.get(
                "https://user-pnl-api.polymarket.com/user-pnl",
                params={"user_address": addr, "interval": interval, "fidelity": fidelity},
                timeout=15,
            )
            d = r.json()
            if isinstance(d, list) and d:
                delta = (d[-1].get("p", 0) or 0) - (d[0].get("p", 0) or 0)
                print(f"  {interval:>3}: points={len(d)}  first={d[0]}  last={d[-1]}  delta={delta:+.2f}")
            else:
                print(f"  {interval:>3}: {str(d)[:200]}")
        except Exception as e:  # noqa: BLE001
            print(f"  {interval:>3}: ERROR {e}")


if __name__ == "__main__":
    main()
