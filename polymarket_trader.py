"""
Polymarket order execution and market discovery for trade_bot.py.

Two executors share one interface:
  - PaperTrader: no keys, no real money. Fills at the live CLOB ask so the
    simulated P&L matches what a real fill would have cost.
  - LiveTrader:  real USDC orders through the official Polymarket CLOB API
    (py-clob-client), as FOK market orders.

Market discovery uses the public Gamma API: each 5-minute BTC Up/Down
window is its own market with slug "<prefix>-<window_start_unix>" whose
clobTokenIds map to the Up and Down outcome tokens.
"""

import json
import logging

import requests

log = logging.getLogger("trade-bot")

GAMMA_EVENTS_URL = "https://gamma-api.polymarket.com/events"
CLOB_HOST = "https://clob.polymarket.com"
POLYGON_CHAIN_ID = 137
USER_AGENT = {"User-Agent": "polymarket-trade-bot/1.0"}


def _parse_list(value):
    """Gamma returns some fields as JSON-encoded strings; normalize to list."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return None
    return None


def fetch_window_market(slug: str):
    """
    Return {"up": token_id, "down": token_id} for a window's market,
    or None if the market does not exist (yet).
    """
    resp = requests.get(
        GAMMA_EVENTS_URL, params={"slug": slug}, timeout=15, headers=USER_AGENT
    )
    resp.raise_for_status()
    events = resp.json()
    if not isinstance(events, list) or not events:
        return None
    markets = events[0].get("markets") or []
    if not markets:
        return None
    market = markets[0]
    outcomes = _parse_list(market.get("outcomes"))
    token_ids = _parse_list(market.get("clobTokenIds"))
    if not outcomes or not token_ids or len(outcomes) != len(token_ids):
        return None
    mapping = {}
    for outcome, token_id in zip(outcomes, token_ids):
        key = str(outcome).strip().lower()
        if key in ("up", "yes"):
            mapping["up"] = str(token_id)
        elif key in ("down", "no"):
            mapping["down"] = str(token_id)
    if "up" not in mapping or "down" not in mapping:
        return None
    return mapping


def fetch_resolved_direction(slug: str):
    """+1 (Up), -1 (Down), or None if the window is not resolved yet."""
    try:
        resp = requests.get(
            GAMMA_EVENTS_URL,
            params={"slug": slug},
            timeout=15,
            headers=USER_AGENT,
        )
        resp.raise_for_status()
        events = resp.json()
    except requests.RequestException as exc:
        log.warning("Resolution fetch failed for %s: %s", slug, exc)
        return None
    if not isinstance(events, list) or not events:
        return None
    markets = events[0].get("markets") or []
    if not markets:
        return None
    market = markets[0]
    outcomes = _parse_list(market.get("outcomes"))
    prices = _parse_list(market.get("outcomePrices"))
    if not outcomes or not prices or len(outcomes) != len(prices):
        return None
    try:
        pvals = [float(p) for p in prices]
    except (TypeError, ValueError):
        return None
    top = max(pvals)
    if top < 0.99:  # still a live probability, not a resolution
        return None
    winner = str(outcomes[pvals.index(top)]).strip().lower()
    if winner in ("up", "yes"):
        return 1
    if winner in ("down", "no"):
        return -1
    return None


def fetch_buy_price(token_id: str):
    """Best ask for a token from the public CLOB price endpoint, or None."""
    try:
        resp = requests.get(
            f"{CLOB_HOST}/price",
            params={"token_id": token_id, "side": "buy"},
            timeout=15,
            headers=USER_AGENT,
        )
        resp.raise_for_status()
        price = float(resp.json().get("price"))
    except (requests.RequestException, TypeError, ValueError) as exc:
        log.warning("Price fetch failed for token %s: %s", token_id, exc)
        return None
    return price if 0 < price < 1 else None


class PaperTrader:
    """Simulated executor: records the trade at the live ask, spends nothing."""

    mode = "paper"

    def buy(self, token_id: str, stake_usdc: float, price: float):
        shares = stake_usdc / price
        log.info(
            "[PAPER] BUY token=%s stake=%.2f USDC price=%.3f shares=%.2f",
            token_id,
            stake_usdc,
            price,
            shares,
        )
        return {"shares": shares, "cost": stake_usdc, "price": price}


class LiveTrader:
    """
    Real executor using the official Polymarket CLOB client.

    signature_type / funder:
      0 — trading directly from an EOA wallet (funder not needed)
      1 — Polymarket account created with email/Magic (funder = the
          Polymarket deposit/proxy address shown in your profile)
      2 — Polymarket account created with a browser wallet (funder = proxy)
    """

    mode = "live"

    def __init__(self, private_key: str, signature_type: int = 1, funder: str = ""):
        try:
            from py_clob_client.client import ClobClient
            from py_clob_client.clob_types import MarketOrderArgs, OrderType
            from py_clob_client.order_builder.constants import BUY
        except ImportError as exc:
            raise SystemExit(
                "py-clob-client is required for live trading: "
                "pip install py-clob-client"
            ) from exc

        self._MarketOrderArgs = MarketOrderArgs
        self._OrderType = OrderType
        self._BUY = BUY

        kwargs = {}
        if signature_type in (1, 2):
            if not funder:
                raise SystemExit(
                    "POLY_FUNDER is required for signature types 1 and 2 "
                    "(your Polymarket deposit/proxy address)."
                )
            kwargs = {"signature_type": signature_type, "funder": funder}
        self.client = ClobClient(
            CLOB_HOST, key=private_key, chain_id=POLYGON_CHAIN_ID, **kwargs
        )
        self.client.set_api_creds(self.client.create_or_derive_api_creds())
        log.info("Live CLOB client ready (signature_type=%s).", signature_type)

    def buy(self, token_id: str, stake_usdc: float, price: float):
        """
        Buy `stake_usdc` worth of an outcome token with a fill-or-kill
        market order. Returns the same position dict as PaperTrader, or
        raises on rejection.
        """
        order = self.client.create_market_order(
            self._MarketOrderArgs(
                token_id=token_id, amount=float(stake_usdc), side=self._BUY
            )
        )
        resp = self.client.post_order(order, self._OrderType.FOK)
        log.info("[LIVE] order response: %s", resp)
        if isinstance(resp, dict) and not resp.get("success", True):
            raise RuntimeError(f"Order rejected: {resp}")
        # FOK fills entirely at or better than the quoted ask.
        shares = stake_usdc / price
        return {"shares": shares, "cost": stake_usdc, "price": price, "raw": resp}
