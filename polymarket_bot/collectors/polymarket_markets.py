"""Finding the BTC Up/Down market that is live right now.

Polymarket runs a fresh "Bitcoin Up or Down" market every 5 and every 15
minutes, so a bot that trades them must re-discover its own instrument several
times an hour, and must have the *next* window's token ids in hand before that
window opens — subscribing after the open means missing the first seconds,
which for a 300-second market is a meaningful slice of its life.

Discovery goes through the Gamma API (``https://gamma-api.polymarket.com``),
which is the metadata service; order books come from the CLOB
(``https://clob.polymarket.com``) and its WebSocket. Three lookups are tried in
order, cheapest first:

1. **By slug.** Polymarket's slug encodes both ends of the window
   (``bitcoin-up-or-down-january-20-745am-750am-et``), so it identifies the
   5-minute market unambiguously and cannot collide with the 15-minute one.
2. **By event slug**, for the periods when the same slug names an event holding
   the market rather than the market itself.
3. **By end-date range**, bounded to a couple of minutes around the window
   close. Unbounded "open markets ordered by end date" queries return markets
   months away.

Two hard-won rules are inherited from the collector already running in this
repository (`polymarket_collector.py`), and both are load-bearing:

* **The title decides the window, not ``startDate``.** Gamma's ``startDate`` is
  when the market opened for *trading*, which can be an hour or a day before the
  window it settles. Duration derived from it rejects the correct market.
* **Gamma's cached ``outcomePrices`` are not a book.** It answers 0.5/0.5 for a
  market it has not priced, which is indistinguishable from a real coin-flip.
  Prices in this system come from the CLOB book only.

Nothing here hardcodes a market id or a token id: those are per-window and
change every five minutes.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator
from zoneinfo import ZoneInfo

import httpx

log = logging.getLogger(__name__)

GAMMA_URL = "https://gamma-api.polymarket.com"
CLOB_URL = "https://clob.polymarket.com"

#: Polymarket labels these windows in US Eastern. Not a fixed -4: the label
#: follows the DST switch, and a fixed offset silently looks up the wrong
#: window for half the year.
ET = ZoneInfo("America/New_York")

GAMMA_PAGE_LIMIT = 100  # Gamma caps a page at 100 regardless of what is asked

_RANGE = re.compile(
    r"(\d{1,2}):(\d{2})\s*([AP]M)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*([AP]M)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class MarketRef:
    """One Up/Down window, resolved to the ids needed to trade it."""

    market_id: str
    condition_id: str
    question: str
    slug: str
    outcomes: tuple[str, ...]
    token_ids: tuple[str, ...]
    window_start_ts: float
    window_end_ts: float
    window_seconds: int
    closed: bool = False
    accepting_orders: bool = True

    def token_for(self, outcome: str) -> str | None:
        """Token id for "Up"/"Down", case-insensitively, or None."""
        wanted = outcome.strip().lower()
        for name, token in zip(self.outcomes, self.token_ids):
            if str(name).strip().lower() == wanted:
                return token
        return None

    @property
    def up_token_id(self) -> str | None:
        return self.token_for("up")

    @property
    def down_token_id(self) -> str | None:
        return self.token_for("down")

    def seconds_remaining(self, now_ts: float) -> float:
        return self.window_end_ts - now_ts


def jload(value: Any, default: Any) -> Any:
    """Gamma serves some list fields as JSON-encoded strings and some as lists."""
    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(value: Any) -> float | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError, TypeError):
        return None


def window_boundary(now_ts: float, window_seconds: int) -> float:
    """Start of the window containing `now_ts`."""
    return (int(now_ts) // window_seconds) * window_seconds


def slug_for(boundary_ts: float, window_seconds: int) -> str:
    """Polymarket's own slug for the window starting at `boundary_ts`.

    Derived from the observed format rather than documented, so it is only ever
    the first thing tried; `find` falls back to a date-bounded query when it
    misses.
    """
    start = datetime.fromtimestamp(boundary_ts, ET)
    end = datetime.fromtimestamp(boundary_ts + window_seconds, ET)

    def hm(d: datetime) -> str:
        return f"{d.strftime('%I').lstrip('0')}{d:%M}{d.strftime('%p').lower()}"

    return (
        f"bitcoin-up-or-down-{start.strftime('%B').lower()}-{start.day}-"
        f"{hm(start)}-{hm(end)}-et"
    )


def title_window(title: str) -> tuple[int, int, str, int, int, str] | None:
    """The ``7:45AM-7:50AM`` range out of a market title, or None."""
    hit = _RANGE.search(title or "")
    if not hit:
        return None
    return (
        int(hit.group(1)),
        int(hit.group(2)),
        hit.group(3).upper(),
        int(hit.group(4)),
        int(hit.group(5)),
        hit.group(6).upper(),
    )


def title_window_seconds(title: str) -> int | None:
    """Window length implied by the title's own time range.

    This is what separates the 5-minute market from the 15-minute one that ends
    at the same instant — the only field that can.
    """
    parsed = title_window(title)
    if not parsed:
        return None
    sh, sm, sap, eh, em, eap = parsed

    def minutes(h: int, m: int, ap: str) -> int:
        h = h % 12
        if ap == "PM":
            h += 12
        return h * 60 + m

    # Modulo a day, so a window that crosses midnight (11:50PM-12:00AM) comes
    # out as 10 minutes rather than as a negative number. A subtraction with a
    # 12-hour correction gets that case wrong by 11 hours.
    delta = (minutes(eh, em, eap) - minutes(sh, sm, sap)) % (24 * 60)
    if delta == 0:
        return None
    return delta * 60


def title_starts_at(title: str, boundary_ts: float) -> bool:
    """Does the title's start time match this window boundary (in ET)?"""
    parsed = title_window(title)
    if not parsed:
        return False
    sh, sm, sap, *_ = parsed
    start = datetime.fromtimestamp(boundary_ts, ET)
    return (int(start.strftime("%I")), int(start.strftime("%M")), start.strftime("%p").upper()) == (
        sh,
        sm,
        sap,
    )


def is_btc_up_down(item: dict) -> bool:
    text = (item.get("question") or item.get("title") or "").lower()
    return "up or down" in text and ("bitcoin" in text or "btc" in text)


def to_market_ref(item: dict, window_seconds: int, boundary_ts: float) -> MarketRef | None:
    """Gamma market dict -> MarketRef, or None when it is unusable.

    A market with no CLOB token ids cannot be traded or even quoted, so it is
    rejected here rather than blowing up in the executor later.
    """
    outcomes = tuple(str(o) for o in jload(item.get("outcomes"), []))
    tokens = tuple(str(t) for t in jload(item.get("clobTokenIds"), []))
    if not tokens or len(tokens) != len(outcomes):
        return None
    end_ts = _parse_iso(item.get("endDate") or item.get("end_date_iso"))
    if end_ts is None:
        end_ts = boundary_ts + window_seconds
    return MarketRef(
        market_id=str(item.get("id", "")),
        condition_id=str(item.get("conditionId") or item.get("condition_id") or ""),
        question=str(item.get("question") or item.get("title") or ""),
        slug=str(item.get("slug", "")),
        outcomes=outcomes,
        token_ids=tokens,
        # The window start comes from the boundary we asked for, not from
        # Gamma's startDate — see the module docstring.
        window_start_ts=boundary_ts,
        window_end_ts=end_ts,
        window_seconds=window_seconds,
        closed=bool(item.get("closed")),
        accepting_orders=bool(item.get("acceptingOrders", True)),
    )


class MarketDiscovery:
    """Async Gamma/CLOB lookups. One client, reused."""

    def __init__(
        self,
        *,
        gamma_url: str = GAMMA_URL,
        clob_url: str = CLOB_URL,
        timeout_s: float = 6.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.gamma_url = gamma_url.rstrip("/")
        self.clob_url = clob_url.rstrip("/")
        self.timeout_s = timeout_s
        self._client = client
        self._owns_client = client is None

    async def __aenter__(self) -> "MarketDiscovery":
        return self

    async def __aexit__(self, *exc) -> None:
        await self.aclose()

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            # Short timeout on purpose: a five-minute window is only worth
            # chasing for seconds, and a deep retry stack turns one dead
            # request into a missed window and then a missed *next* window.
            self._client = httpx.AsyncClient(timeout=self.timeout_s)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    async def _get(self, url: str, **params) -> Any:
        response = await self.client.get(url, params=params or None)
        response.raise_for_status()
        return response.json()

    async def _candidates(self, boundary_ts: float, window_seconds: int) -> AsyncIterator[dict]:
        slug = slug_for(boundary_ts, window_seconds)
        want_end = boundary_ts + window_seconds
        attempts = (
            ("slug", lambda: self._get(f"{self.gamma_url}/markets", slug=slug)),
            (
                "event slug",
                lambda: self._get(f"{self.gamma_url}/events", slug=slug),
            ),
            (
                "end-date window",
                lambda: self._get(
                    f"{self.gamma_url}/markets",
                    limit=GAMMA_PAGE_LIMIT,
                    order="endDate",
                    ascending="true",
                    end_date_min=_iso(want_end - 90),
                    end_date_max=_iso(want_end + 90),
                    closed="false",
                ),
            ),
        )
        for label, call in attempts:
            try:
                data = await call()
            except Exception as exc:  # noqa: BLE001 - try the next source
                log.debug("discovery via %s failed: %s", label, exc)
                continue
            if not isinstance(data, list):
                continue
            # The /events response nests the markets one level down.
            for entry in data:
                if isinstance(entry, dict) and "markets" in entry:
                    yield_from = entry.get("markets") or []
                    for market in yield_from:
                        yield market
                elif isinstance(entry, dict):
                    yield entry

    async def find(self, window_seconds: int, boundary_ts: float | None = None,
                   now_ts: float | None = None) -> MarketRef | None:
        """The Up/Down market whose window *starts* at `boundary_ts`.

        Returns None rather than raising when nothing matches: a missing window
        is a normal condition (the market may not be listed yet) and must not
        take the process down.
        """
        now_ts = now_ts if now_ts is not None else datetime.now(timezone.utc).timestamp()
        if boundary_ts is None:
            boundary_ts = window_boundary(now_ts, window_seconds)
        want_end = boundary_ts + window_seconds

        async for item in self._candidates(boundary_ts, window_seconds):
            if not is_btc_up_down(item):
                continue
            end_ts = _parse_iso(item.get("endDate") or item.get("end_date_iso"))
            if end_ts is None or abs(end_ts - want_end) > window_seconds / 2:
                continue
            title = item.get("question") or item.get("title") or ""
            implied = title_window_seconds(title)
            if implied is not None:
                # The title names both ends, so it is decisive: reject the
                # 15-minute market that happens to close at the same instant.
                if implied != window_seconds or not title_starts_at(title, boundary_ts):
                    continue
            ref = to_market_ref(item, window_seconds, boundary_ts)
            if ref is not None:
                return ref
        return None

    async def find_current_and_next(
        self, window_seconds: int, now_ts: float | None = None
    ) -> list[MarketRef]:
        """The live window and the one after it.

        Both, always — the next window's token ids have to be subscribed before
        it opens or the first seconds of a 300-second market are lost.
        """
        now_ts = now_ts if now_ts is not None else datetime.now(timezone.utc).timestamp()
        boundary = window_boundary(now_ts, window_seconds)
        found = []
        for b in (boundary, boundary + window_seconds):
            ref = await self.find(window_seconds, b, now_ts=now_ts)
            if ref is not None:
                found.append(ref)
        return found

    async def tick_size(self, token_id: str) -> float | None:
        """Minimum price increment for a token, from the CLOB.

        Not cosmetic: it sets the smallest edge that can exist, and Polymarket
        changes it as a price approaches 0 or 1.
        """
        try:
            data = await self._get(f"{self.clob_url}/tick-size", token_id=token_id)
        except Exception as exc:  # noqa: BLE001
            log.debug("tick-size lookup failed for %s: %s", token_id, exc)
            return None
        value = data.get("minimum_tick_size") if isinstance(data, dict) else data
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    async def book(self, token_id: str) -> dict | None:
        """REST order-book snapshot, used to prime state before the WS dump."""
        try:
            return await self._get(f"{self.clob_url}/book", token_id=token_id)
        except Exception as exc:  # noqa: BLE001
            log.debug("book lookup failed for %s: %s", token_id, exc)
            return None
