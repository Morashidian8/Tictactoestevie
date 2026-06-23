"""Read-only Polymarket data client.

Pulls public market + price data from Polymarket's Gamma and CLOB APIs — no
wallet, no keys, no money. Use it to discover BTC up/down markets and read the
real outcome-token prices (odds) and price history that the paper engine should
trade against.

This runs wherever outbound network is open (your PC / server). The cloud dev
sandbox blocks the Polymarket hosts, so verify there with:

    python -m polybot.polymarket discover
    python -m polybot.polymarket prices <TOKEN_ID>

`requests` is imported lazily and injectable, so the parsing logic is unit-tested
offline. Field names follow Polymarket's documented API; if a first real run
shows a mismatch, the parsing helpers are the only thing to adjust.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"


@dataclass
class Market:
    question: str
    slug: str
    condition_id: str
    token_ids: List[str]        # CLOB token ids, aligned with `outcomes`
    outcomes: List[str]         # e.g. ["Up", "Down"] or ["Yes", "No"]
    active: bool
    closed: bool
    end_date: Optional[str] = None

    def token_for(self, outcome_substr: str) -> Optional[str]:
        """Return the token id whose outcome label contains `outcome_substr`."""
        for tok, out in zip(self.token_ids, self.outcomes):
            if outcome_substr.lower() in out.lower():
                return tok
        return None


def _loads_maybe(value: Any) -> Any:
    """Gamma returns some list fields as JSON-encoded strings; decode defensively."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return value
    return value


def parse_market(raw: Dict[str, Any]) -> Market:
    return Market(
        question=raw.get("question", ""),
        slug=raw.get("slug", ""),
        condition_id=raw.get("conditionId", raw.get("condition_id", "")),
        token_ids=[str(t) for t in (_loads_maybe(raw.get("clobTokenIds")) or [])],
        outcomes=[str(o) for o in (_loads_maybe(raw.get("outcomes")) or [])],
        active=bool(raw.get("active", False)),
        closed=bool(raw.get("closed", False)),
        end_date=raw.get("endDate") or raw.get("end_date"),
    )


def is_btc_updown(market: Market) -> bool:
    """Heuristic: a Bitcoin 'up or down' style market."""
    text = f"{market.question} {market.slug}".lower()
    has_btc = "bitcoin" in text or "btc" in text
    has_dir = any(k in text for k in ("up or down", "up/down", "up-or-down", "higher", "above"))
    has_tokens = len(market.token_ids) >= 2 and len(market.outcomes) >= 2
    return has_btc and has_dir and has_tokens


class PolymarketData:
    def __init__(self, session=None, gamma_base: str = GAMMA_BASE, clob_base: str = CLOB_BASE) -> None:
        self._session = session  # injectable for tests; else a requests.Session is made
        self.gamma_base = gamma_base.rstrip("/")
        self.clob_base = clob_base.rstrip("/")

    def _http(self):
        if self._session is None:  # pragma: no cover - needs network
            import requests
            self._session = requests.Session()
        return self._session

    def _get_json(self, url: str, params: Optional[Dict[str, Any]] = None) -> Any:
        resp = self._http().get(url, params=params, timeout=20)
        resp.raise_for_status()
        return resp.json()

    # -- Gamma: markets ---------------------------------------------------- #

    def get_markets(self, **params: Any) -> List[Market]:
        params.setdefault("closed", "false")
        params.setdefault("limit", 100)
        data = self._get_json(f"{self.gamma_base}/markets", params)
        rows = data if isinstance(data, list) else data.get("data", data.get("markets", []))
        return [parse_market(r) for r in rows]

    def find_btc_updown_markets(self, scan_limit: int = 200) -> List[Market]:
        return [m for m in self.get_markets(limit=scan_limit) if is_btc_updown(m)]

    # -- CLOB: prices (odds) ---------------------------------------------- #

    def midpoint(self, token_id: str) -> Optional[float]:
        data = self._get_json(f"{self.clob_base}/midpoint", {"token_id": token_id})
        return _as_float(data.get("mid"))

    def price(self, token_id: str, side: str = "buy") -> Optional[float]:
        data = self._get_json(f"{self.clob_base}/price", {"token_id": token_id, "side": side})
        return _as_float(data.get("price"))

    def prices_history(self, token_id: str, interval: str = "1h", fidelity: int = 1) -> List[Dict[str, float]]:
        """Time series of the token's price. `interval` e.g. 1m/1h/6h/1d/max; `fidelity` in minutes."""
        data = self._get_json(
            f"{self.clob_base}/prices-history",
            {"market": token_id, "interval": interval, "fidelity": fidelity},
        )
        return data.get("history", []) if isinstance(data, dict) else []


def _as_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# Live feed adapter
# --------------------------------------------------------------------------- #

class PolymarketSampledFeed:
    """Builds candles by sampling a Polymarket token's live price each tick.

    Generic and honest: point it at the token you want the bot to react to —
    confirm *which* token (the market's underlying vs. an outcome token) via the
    `discover` endpoint on the first real run. Each `next()` reads the current
    price and forms a candle from the move since the previous sample, so the
    engine's up/down logic runs on **real Polymarket data**, not a simulation.

    Same `.next() -> Candle` shape as `SyntheticFeed`, so the engine is unchanged.
    """

    def __init__(self, data: "PolymarketData", token_id: str, interval_seconds: int = 300) -> None:
        from .candles import Candle  # local import to avoid a cycle
        self._Candle = Candle
        self._data = data
        self._token = token_id
        self._interval = interval_seconds
        self._t = 0
        self._last: Optional[float] = None

    def next(self):
        price = self._data.midpoint(self._token)
        if price is None:
            price = self._data.price(self._token) or self._last or 0.5
        open_ = self._last if self._last is not None else price
        candle = self._Candle(
            open_time=self._t,
            close_time=self._t + self._interval,
            open=open_,
            high=max(open_, price),
            low=min(open_, price),
            close=price,
        )
        self._last = price
        self._t += self._interval
        return candle


# --------------------------------------------------------------------------- #
# CLI (run where network is open)
# --------------------------------------------------------------------------- #

def _main(argv=None) -> None:  # pragma: no cover - manual/network tool
    import argparse

    p = argparse.ArgumentParser(description="Read-only Polymarket data explorer.")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("discover", help="list BTC up/down markets")
    pp = sub.add_parser("prices", help="show current odds for a token id")
    pp.add_argument("token_id")
    hp = sub.add_parser("history", help="price history for a token id")
    hp.add_argument("token_id")
    hp.add_argument("--interval", default="1h")
    args = p.parse_args(argv)

    api = PolymarketData()
    if args.cmd == "discover":
        markets = api.find_btc_updown_markets()
        if not markets:
            print("No BTC up/down markets matched. Try widening is_btc_updown() heuristics.")
        for m in markets:
            print(f"\n• {m.question}  [{'closed' if m.closed else 'open'}]")
            print(f"  slug: {m.slug}")
            for tok, out in zip(m.token_ids, m.outcomes):
                print(f"  {out:>6}: {tok}")
    elif args.cmd == "prices":
        print("midpoint:", api.midpoint(args.token_id))
        print("buy     :", api.price(args.token_id, "buy"))
        print("sell    :", api.price(args.token_id, "sell"))
    elif args.cmd == "history":
        hist = api.prices_history(args.token_id, interval=args.interval)
        print(f"{len(hist)} points")
        for pt in hist[-10:]:
            print(pt)


if __name__ == "__main__":  # pragma: no cover
    _main()
