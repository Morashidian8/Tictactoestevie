"""Keeping the Polymarket feed pointed at the windows that are live.

These markets expire every 5 or 15 minutes, so "which instrument am I trading"
is a question with a new answer several times an hour. This component owns that
question: it discovers the current and next window for each configured
duration, keeps the collector's asset list in step, and bounces the connection
when the set changes.

It runs on its own task, off the hot path. A discovery call is an HTTP request
that can take seconds or fail; nothing in the read loop may ever wait on one.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time

from .polymarket import PolymarketCollector
from .polymarket_markets import MarketDiscovery, MarketRef

log = logging.getLogger(__name__)


class ActiveMarketTracker:
    """Refreshes the active Up/Down markets and re-points the collector."""

    def __init__(
        self,
        discovery: MarketDiscovery,
        collector: PolymarketCollector,
        *,
        window_seconds: tuple[int, ...] = (300, 900),
        refresh_s: float = 20.0,
    ) -> None:
        self.discovery = discovery
        self.collector = collector
        self.window_seconds = window_seconds
        self.refresh_s = refresh_s
        self.markets: dict[str, MarketRef] = {}
        self.last_refresh_ts: float | None = None
        self.failures = 0
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    async def refresh(self, now_ts: float | None = None) -> list[MarketRef]:
        """Discover current + next window for every configured duration."""
        now_ts = now_ts if now_ts is not None else time.time()
        found: list[MarketRef] = []
        for seconds in self.window_seconds:
            try:
                found += await self.discovery.find_current_and_next(seconds, now_ts=now_ts)
            except Exception as exc:  # noqa: BLE001 - a failed lookup is not fatal
                self.failures += 1
                log.warning("market discovery failed for %ss window: %s", seconds, exc)
        # Keyed by condition id so the same market found through two lookups
        # does not get subscribed twice.
        self.markets = {m.condition_id or m.market_id: m for m in found}
        self.last_refresh_ts = now_ts
        return found

    def asset_ids(self) -> list[str]:
        ids: list[str] = []
        for market in self.markets.values():
            ids += [t for t in market.token_ids if t]
        return list(dict.fromkeys(ids))

    async def run(self) -> None:
        """Refresh loop. Bounces the collector whenever the token set changes.

        The collector is stopped and restarted rather than re-subscribed in
        place; `PolymarketCollector.set_assets` explains why.
        """
        task: asyncio.Task | None = None
        while not self._stop.is_set():
            await self.refresh()
            ids = self.asset_ids()
            if ids and self.collector.set_assets(ids):
                log.info("polymarket assets changed: %d tokens", len(ids))
                if task is not None:
                    await self._bounce(task)
                    self.collector.reset()  # reuse the same collector object
                task = asyncio.create_task(self.collector.run())
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.refresh_s)
            except asyncio.TimeoutError:
                continue
        if task is not None:
            await self._bounce(task)

    async def _bounce(self, task: asyncio.Task) -> None:
        """Tear down the running collector task and wait for it to finish."""
        self.collector.stop()
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task

    def summary(self, now_ts: float | None = None) -> list[dict[str, object]]:
        now_ts = now_ts if now_ts is not None else time.time()
        rows = []
        for market in sorted(self.markets.values(), key=lambda m: m.window_end_ts):
            rows.append(
                {
                    "question": market.question,
                    "window_s": market.window_seconds,
                    "ends_in_s": round(market.seconds_remaining(now_ts), 1),
                    "condition_id": market.condition_id,
                    "up_token": market.up_token_id,
                    "down_token": market.down_token_id,
                }
            )
        return rows
