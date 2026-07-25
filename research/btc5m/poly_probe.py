"""
Probe Polymarket's public APIs for a 5-minute BTC price series.

WHY THIS EXISTS
---------------
The breakout-fade rule (docs/research/btc-5m-patterns.md, RULE 1) needs a series
of 5-minute BTC CLOSING prices *on the feed Polymarket settles against*
(Chainlink BTC/USD) — Binance prices are a different feed and drift from it.

The agent sandbox cannot reach *.polymarket.com (egress policy returns 403), so
the exact response shape could not be inspected from there. Run this on a device
that CAN reach Polymarket (e.g. Termux on the phone) and send the output back;
the parser in bot.py is then wired to whatever field actually carries the price.

USAGE
    python3 research/btc5m/poly_probe.py            # probe recent 5m windows
    python3 research/btc5m/poly_probe.py --full     # dump entire JSON objects

Nothing here trades or sends messages — it only reads public endpoints.
"""

import argparse
import json
import time

import requests

GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
SLUG_PREFIX = "btc-updown-5m"
UA = {"User-Agent": "btc-candle-alert-bot/probe"}

# Field names that plausibly carry the window's reference/open/close BTC price.
PRICE_HINTS = ("price", "open", "close", "strike", "reference", "start", "end",
               "settle", "resolution", "underlying", "spot", "level")


def get(url, **params):
    try:
        r = requests.get(url, params=params or None, timeout=20, headers=UA)
        return r.status_code, (r.json() if r.ok else r.text[:300])
    except Exception as exc:  # noqa: BLE001 - probe reports every failure
        return None, f"EXC {exc}"


def walk(obj, path=""):
    """Yield (path, value) for every scalar in a nested structure."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:3]):
            yield from walk(v, f"{path}[{i}]")
    else:
        yield path, obj


def looks_like_btc_price(v):
    """A BTC/USD level, not a 0-1 probability or a timestamp."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return False
    return 1_000 <= f <= 1_000_000


def probe_windows(n=3, full=False):
    """Fetch the last n ENDED 5-minute windows and hunt for a price field."""
    last_end = (int(time.time()) // 300 - 1) * 300
    found = []
    for k in range(n):
        ts = last_end - k * 300
        slug = f"{SLUG_PREFIX}-{ts}"
        print(f"\n{'='*70}\nWINDOW {slug}  ({time.strftime('%H:%M', time.gmtime(ts))} UTC)")
        for name, url in (("events", f"{GAMMA}/events"), ("markets", f"{GAMMA}/markets")):
            code, data = get(url, slug=slug)
            print(f"  [{code}] {name}?slug={slug}")
            if code != 200 or not data:
                print(f"      -> {str(data)[:200]}")
                continue
            if full:
                print(json.dumps(data, indent=2)[:4000])
            hits = [(p, v) for p, v in walk(data)
                    if looks_like_btc_price(v)
                    or any(h in p.lower() for h in PRICE_HINTS)]
            for p, v in hits[:25]:
                mark = "  <== BTC-LIKE" if looks_like_btc_price(v) else ""
                print(f"      {p} = {str(v)[:70]}{mark}")
                if looks_like_btc_price(v):
                    found.append((slug, name, p, v))
    return found


def probe_clob():
    """CLOB price history returns TOKEN probability, not BTC — confirm that."""
    print(f"\n{'='*70}\nCLOB endpoints (expected: probabilities, not BTC levels)")
    for path, params in (("/prices-history", {"interval": "1h", "fidelity": "5"}),
                         ("/markets", {}),
                         ("/simplified-markets", {})):
        code, data = get(CLOB + path, **params)
        print(f"  [{code}] {path} -> {str(data)[:200]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--windows", type=int, default=3)
    ap.add_argument("--full", action="store_true", help="dump whole JSON objects")
    args = ap.parse_args()

    print("Probing Polymarket for a 5-minute BTC price series ...")
    found = probe_windows(args.windows, args.full)
    probe_clob()

    print(f"\n{'='*70}\nSUMMARY")
    if found:
        print("BTC-like price values were found at these JSON paths:")
        for slug, ep, path, v in found:
            print(f"  {ep:8s} {path:45s} = {v}   ({slug})")
        print("\nSend this list back — bot.py's price parser will be wired to it.")
    else:
        print("No BTC-price-like field found in the window metadata.")
        print("Re-run with --full and send the whole JSON so the right field can")
        print("be identified (or confirm the price simply is not exposed there).")


if __name__ == "__main__":
    main()
