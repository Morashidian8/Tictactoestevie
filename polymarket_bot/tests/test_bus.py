import asyncio

import pytest

from polymarket_bot.core.bus import EventBus
from polymarket_bot.core.events import QuoteEvent, Venue


def quote(i: int) -> QuoteEvent:
    return QuoteEvent(
        venue=Venue.BINANCE,
        symbol="BTCUSDT",
        recv_ts_ns=i,
        proc_ts_ns=i,
        bid=1.0,
        bid_size=1.0,
        ask=2.0,
        ask_size=1.0,
    )


@pytest.mark.asyncio
async def test_fan_out_to_every_subscriber():
    bus = EventBus()
    a = bus.subscribe("a")
    b = bus.subscribe("b")
    bus.publish(quote(1))
    assert a.queue.qsize() == b.queue.qsize() == 1
    assert bus.published == 1


@pytest.mark.asyncio
async def test_slow_consumer_drops_instead_of_blocking():
    # The whole point of the bounded queue: a consumer that stops reading must
    # cost itself data, not stall the feed.
    bus = EventBus()
    slow = bus.subscribe("slow", maxsize=2)
    fast = bus.subscribe("fast", maxsize=100)
    for i in range(5):
        bus.publish(quote(i))
    assert slow.delivered == 2
    assert slow.dropped == 3
    assert fast.delivered == 5
    assert fast.dropped == 0
    assert bus.total_dropped == 3


@pytest.mark.asyncio
async def test_high_water_mark_tracks_peak_depth():
    bus = EventBus()
    sub = bus.subscribe("s", maxsize=10)
    for i in range(4):
        bus.publish(quote(i))
    await sub.queue.get()
    bus.publish(quote(9))
    assert sub.high_water == 4
    assert sub.stats()["depth"] == 4


@pytest.mark.asyncio
async def test_publish_never_awaits():
    # publish() is called from inside the socket read loop; if it were a
    # coroutine the read loop would yield on every message.
    bus = EventBus()
    bus.subscribe("s")
    result = bus.publish(quote(1))
    assert result is None
    assert not asyncio.iscoroutine(result)
