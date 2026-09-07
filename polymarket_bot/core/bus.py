"""Fan-out from collectors to consumers, with backpressure that never blocks
the feed.

The hot path is "bytes in -> parsed event -> published". A consumer that falls
behind (a Parquet flush, an analytics pass, a slow log) must degrade its own
data, not stall the socket read that the execution path also depends on. So
every subscriber gets a bounded queue and publishing to a full queue DROPS,
loudly, into a counter.

A dropped event is a real hole. The counters are surfaced by the monitor, and
Phase 8's risk manager is expected to treat a recorder that is dropping as a
reason to stop trading — a strategy running on a feed with unrecorded gaps
cannot be backtested against what it actually saw.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from .events import MarketEvent


@dataclass
class Subscription:
    name: str
    queue: asyncio.Queue[MarketEvent]
    delivered: int = 0
    dropped: int = 0
    #: Highest queue depth seen. A high-water mark near maxsize means this
    #: consumer is about to start dropping even if it has not yet.
    high_water: int = 0

    def stats(self) -> dict[str, int]:
        return {
            "delivered": self.delivered,
            "dropped": self.dropped,
            "high_water": self.high_water,
            "depth": self.queue.qsize(),
        }


class EventBus:
    """Synchronous publish, asynchronous consume.

    `publish` is deliberately not a coroutine: the collectors call it from
    inside their read loop and must not yield there.
    """

    def __init__(self) -> None:
        self._subs: list[Subscription] = []
        self.published = 0

    def subscribe(self, name: str, maxsize: int = 100_000) -> Subscription:
        sub = Subscription(name=name, queue=asyncio.Queue(maxsize=maxsize))
        self._subs.append(sub)
        return sub

    def publish(self, event: MarketEvent) -> None:
        self.published += 1
        for sub in self._subs:
            try:
                sub.queue.put_nowait(event)
            except asyncio.QueueFull:
                sub.dropped += 1
                continue
            sub.delivered += 1
            depth = sub.queue.qsize()
            if depth > sub.high_water:
                sub.high_water = depth

    def publish_all(self, events: list[MarketEvent]) -> None:
        for event in events:
            self.publish(event)

    @property
    def subscriptions(self) -> list[Subscription]:
        return list(self._subs)

    def stats(self) -> dict[str, object]:
        return {
            "published": self.published,
            "subscribers": {s.name: s.stats() for s in self._subs},
        }

    @property
    def total_dropped(self) -> int:
        return sum(s.dropped for s in self._subs)
