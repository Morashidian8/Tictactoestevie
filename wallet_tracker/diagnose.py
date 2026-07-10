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

    redeems = [a for a in acts if str(a.get("type", "")).upper() == "REDEEM"]
    if redeems:
        print("\n--- one raw REDEEM row (all fields) ---")
        print(json.dumps(redeems[-1])[:900])

    buys = [a for a in acts if str(a.get("type", "")).upper() == "TRADE" and str(a.get("side", "")).upper() == "BUY"]
    if buys:
        print("\n--- one raw BUY row (all fields) ---")
        print(json.dumps(buys[-1])[:900])

    try:
        pos = c.positions(addr)
    except Exception as e:  # noqa: BLE001
        pos = []
        print("positions ERROR:", e)
    if pos:
        print("\n--- one raw positions row (all fields) ---")
        print(json.dumps(pos[0])[:900])

    # -- cash decomposition (ground for reconciliation) -------------------- #
    print(f"\n=== positions: {len(pos)} rows ===")
    red = sum(1 for p in pos if p.get("redeemable"))
    zero = sum(1 for p in pos if not p.get("curPrice"))
    print(f"  redeemable={red}  curPrice==0(worthless)={zero}")

    cash = collections.Counter()
    for a in acts:
        t = str(a.get("type", "")).upper()
        s = str(a.get("side", "")).upper()
        u = abs(float(a.get("usdcSize") or 0))
        key = f"{t}/{s}".rstrip("/")
        cash[key] += u
    print("\n=== cash by type (Σ usdcSize) ===")
    for k, v in sorted(cash.items()):
        print(f"  {k:14} {v:10.2f}")
    inflow = cash["TRADE/SELL"] + cash["REDEEM"] + cash["MERGE"] + cash["REWARD"]
    outflow = cash["TRADE/BUY"] + cash["SPLIT"]
    print(f"  -> net cash flow (all-time) = {inflow - outflow:+.2f}")

    now = int(time.time())
    eng = PnLEngine().load(acts)
    # Cost basis still sitting in un-closed lots BEFORE worthless handling.
    open_cost_before = sum(l.size * l.price for q in eng._lots.values() for l in q)
    open_lot_assets = {a for a, q in eng._lots.items() if sum(l.size for l in q) > 1e-6}
    pos_assets = {str(p.get("asset", "") or "") for p in pos}
    orphan_lots = open_lot_assets - pos_assets  # bought, never closed, NOT in positions API
    orphan_cost = sum(
        sum(l.size * l.price for l in eng._lots[a]) for a in orphan_lots
    )
    print("\n=== open-lot reconciliation (BEFORE worthless handling) ===")
    print(f"  open-lot cost total          = {open_cost_before:.2f}")
    print(f"  open-lot assets              = {len(open_lot_assets)}")
    print(f"  of which NOT in positions API= {len(orphan_lots)}  (cost {orphan_cost:.2f})")
    print("  -> 'realized minus cashflow' should equal open-lot cost")

    lost = eng.close_worthless(pos, now)
    print("\n=== FIFO engine (condition-matched redeems + worthless losses) ===")
    print("realized_total (all time):", round(eng.realized_total, 2))
    print("worthless positions realized as LOST:", len(lost))
    for label, mins in (("1h", 60), ("6h", 360), ("24h", 1440), ("7d", 10080), ("30d", 43200)):
        w = eng.window(now - mins * 60, now, acts)
        print(f"  window {label:>4}: total={w.total:+9.2f}  realized={w.realized:+9.2f}  "
              f"rewards={w.rewards:+7.2f}  cashflow={w.net_cash_flow:+9.2f}  trades={w.trades_count}")
    print("--- newest 10 closing events ---")
    for e in eng.closing_events[-10:]:
        print("  ", e.kind, e.timestamp, f"size={e.size:.2f}", f"proceeds={e.proceeds:.2f}",
              f"cost={e.cost_basis:.2f}", f"pnl={e.realized:+.2f}", (e.title or "")[:40])
    if eng.warnings:
        print(f"warnings: {len(eng.warnings)}  e.g. {eng.warnings[0]}")

    lost_set = set(lost)
    remaining = [p for p in pos if str(p.get("asset", "") or "") not in lost_set]
    print("\nopen positions after excluding LOST:", len(remaining), " (raw:", len(pos), ")")
    print("ENGINE_TOTAL_FOR_COMPARE:", round(eng.realized_total, 2))

    # Per-kind proceeds/cost, to locate where cost goes missing vs Σbuys.
    by_kind = collections.defaultdict(lambda: [0.0, 0.0, 0])
    for e in eng.closing_events:
        b = by_kind[e.kind]
        b[0] += e.proceeds
        b[1] += e.cost_basis
        b[2] += 1
    print("\n=== closing events by kind (proceeds / cost / n) ===")
    tot_cost = 0.0
    for k, b in sorted(by_kind.items()):
        print(f"  {k:8} proceeds={b[0]:10.2f}  cost={b[1]:10.2f}  n={b[2]}")
        tot_cost += b[1]
    buys_total = cash["TRADE/BUY"] + cash["SPLIT"]
    print(f"  Σ cost attributed in closes = {tot_cost:.2f}")
    print(f"  Σ buys+splits               = {buys_total:.2f}")
    print(f"  MISSING cost (buys - closes)= {buys_total - tot_cost:+.2f}  (should be ~0 when book closed)")

    # Official Polymarket PnL series (what the profile chart shows) — ground truth.
    print("\n=== official user-pnl API ===")
    import requests
    official_all = None
    for interval, fidelity in (("1d", "1h"), ("1w", "1d"), ("1m", "1d"), ("all", "1d")):
        try:
            r = requests.get(
                "https://user-pnl-api.polymarket.com/user-pnl",
                params={"user_address": addr, "interval": interval, "fidelity": fidelity},
                timeout=15,
            )
            d = r.json()
            if isinstance(d, list) and d:
                last = d[-1].get("p", 0) or 0
                if interval in ("1m", "all"):
                    official_all = last
                print(f"  {interval:>3}: points={len(d)}  first={d[0]}  last={d[-1]}")
            else:
                print(f"  {interval:>3}: {str(d)[:200]}")
        except Exception as e:  # noqa: BLE001
            print(f"  {interval:>3}: ERROR {e}")

    # -- SUMMARY (printed last so it survives log tailing) ----------------- #
    open_cost_after = sum(l.size * l.price for q in eng._lots.values() for l in q)
    print("\n==================== SUMMARY ====================")
    print(f"  our all-time realized   = {eng.realized_total:+.2f}")
    print(f"  net cash flow (all-time)= {inflow - outflow:+.2f}")
    print(f"  official Polymarket PnL = {official_all if official_all is not None else 'n/a'}")
    print(f"  open-lot cost remaining = {open_cost_after:.2f}   (should be ~0 if book closed)")
    print(f"  realized - cashflow     = {eng.realized_total - (inflow - outflow):+.2f}   (should be ~0)")
    print("================================================")


if __name__ == "__main__":
    main()
