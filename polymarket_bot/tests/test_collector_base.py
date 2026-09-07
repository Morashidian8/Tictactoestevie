"""Integration tests for the collector lifecycle, against a fake socket.

No network: `websockets.connect` is replaced with a scripted stand-in, which is
the whole reason parsing was kept as a pure function separate from the socket.
"""

import asyncio
import json

import pytest

from polymarket_bot.collectors import base as base_module
from polymarket_bot.collectors.base import BackoffPolicy, WSCollector
from polymarket_bot.core.bus import EventBus
from polymarket_bot.core.events import ConnectionEvent, ConnState, QuoteEvent, Venue


class FakeWS:
    """Yields a scripted list of frames, then blocks (a quiet but live feed) or
    raises whatever the script ends with."""

    def __init__(self, frames, *, end_exception=None):
        self.frames = list(frames)
        self.sent: list[str] = []
        self.end_exception = end_exception
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        self.closed = True

    async def send(self, frame):
        self.sent.append(frame)

    async def recv(self):
        if self.frames:
            return self.frames.pop(0)
        if self.end_exception is not None:
            raise self.end_exception
        await asyncio.Event().wait()  # never returns


class ScriptedCollector(WSCollector):
    venue = Venue.BINANCE

    def __init__(self, bus, **kwargs):
        kwargs.setdefault("ping_interval_s", None)
        super().__init__(bus, **kwargs)
        self.subscribe_calls = 0

    def url(self):
        return "wss://example.invalid/ws"

    def subscribe_frames(self):
        self.subscribe_calls += 1
        return [json.dumps({"op": "subscribe"})]

    def parse(self, raw, recv_ts_ns):
        data = json.loads(raw)
        if data.get("bad"):
            raise ValueError("unparseable")
        return [
            QuoteEvent(
                venue=Venue.BINANCE,
                symbol="BTCUSDT",
                recv_ts_ns=recv_ts_ns,
                proc_ts_ns=recv_ts_ns,
                exchange_ts_ns=data.get("ts"),
                bid=data["bid"],
                bid_size=1.0,
                ask=data["ask"],
                ask_size=1.0,
            )
        ]


def patch_connect(monkeypatch, sockets):
    """Hand out one FakeWS per connection attempt."""
    queue = list(sockets)

    def connect(url, **kwargs):
        return queue.pop(0) if queue else FakeWS([], end_exception=ConnectionError("gone"))

    monkeypatch.setattr(base_module.websockets, "connect", connect)


@pytest.mark.asyncio
async def test_frames_become_events_on_the_bus(monkeypatch):
    bus = EventBus()
    sub = bus.subscribe("t")
    ws = FakeWS([json.dumps({"bid": 1.0, "ask": 2.0, "ts": 5})],
                end_exception=ConnectionError("closed"))
    patch_connect(monkeypatch, [ws])
    collector = ScriptedCollector(bus)

    task = asyncio.create_task(collector.run())
    await asyncio.sleep(0.05)
    collector.stop()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    events = [sub.queue.get_nowait() for _ in range(sub.queue.qsize())]
    quotes = [e for e in events if isinstance(e, QuoteEvent)]
    assert len(quotes) == 1 and quotes[0].bid == 1.0
    assert collector.stats.events == 1
    assert collector.subscribe_calls >= 1
    assert ws.sent == [json.dumps({"op": "subscribe"})]


@pytest.mark.asyncio
async def test_connection_lifecycle_is_published(monkeypatch):
    bus = EventBus()
    sub = bus.subscribe("t")
    patch_connect(monkeypatch, [FakeWS([], end_exception=ConnectionError("closed"))])
    collector = ScriptedCollector(bus, backoff=BackoffPolicy(initial_s=0.001, max_s=0.001))

    task = asyncio.create_task(collector.run())
    await asyncio.sleep(0.05)
    collector.stop()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    states = [e.state for e in list(sub.queue._queue) if isinstance(e, ConnectionEvent)]
    assert states[:4] == [
        ConnState.CONNECTING,
        ConnState.CONNECTED,
        ConnState.SUBSCRIBED,
        ConnState.DISCONNECTED,
    ]


@pytest.mark.asyncio
async def test_one_unparseable_frame_does_not_kill_the_feed(monkeypatch):
    bus = EventBus()
    frames = [
        json.dumps({"bad": True}),
        json.dumps({"bid": 1.0, "ask": 2.0}),
    ]
    patch_connect(monkeypatch, [FakeWS(frames)])
    collector = ScriptedCollector(bus)

    task = asyncio.create_task(collector.run())
    await asyncio.sleep(0.05)
    collector.stop()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert collector.stats.parse_errors == 1
    assert collector.stats.events == 1
    assert collector.stats.messages == 2


@pytest.mark.asyncio
async def test_it_reconnects_after_a_dropped_connection(monkeypatch):
    bus = EventBus()
    first = FakeWS([json.dumps({"bid": 1.0, "ask": 2.0})],
                   end_exception=ConnectionError("dropped"))
    second = FakeWS([json.dumps({"bid": 3.0, "ask": 4.0})])
    patch_connect(monkeypatch, [first, second])
    collector = ScriptedCollector(bus, backoff=BackoffPolicy(initial_s=0.001, max_s=0.002))

    task = asyncio.create_task(collector.run())
    await asyncio.sleep(0.2)
    collector.stop()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert collector.stats.connects >= 2
    assert collector.stats.events >= 2
    assert collector.subscribe_calls >= 2  # re-subscribed, not silently reconnected


@pytest.mark.asyncio
async def test_a_silent_socket_is_torn_down_rather_than_waited_on(monkeypatch):
    # TCP will not notice a feed that stopped talking. The receive timeout is
    # the only thing that does.
    bus = EventBus()
    patch_connect(monkeypatch, [FakeWS([]), FakeWS([])])
    collector = ScriptedCollector(
        bus, recv_timeout_s=0.02, backoff=BackoffPolicy(initial_s=0.001, max_s=0.001)
    )
    task = asyncio.create_task(collector.run())
    await asyncio.sleep(0.15)
    collector.stop()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    assert collector.stats.disconnects >= 2


@pytest.mark.asyncio
async def test_keepalive_frames_are_sent_but_not_counted_as_data(monkeypatch):
    class Keepalived(ScriptedCollector):
        def keepalive_frame(self):
            return "PING"

    bus = EventBus()
    ws = FakeWS(["PONG", json.dumps({"bid": 1.0, "ask": 2.0})])
    patch_connect(monkeypatch, [ws])
    collector = Keepalived(bus, keepalive_interval_s=0.01)

    task = asyncio.create_task(collector.run())
    await asyncio.sleep(0.08)
    collector.stop()
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert "PING" in ws.sent
    assert collector.stats.messages == 2
    assert collector.stats.events == 1  # the PONG did not become one


def test_staleness_starts_at_connect_not_at_first_event():
    # A subscription that silently failed looks exactly like a quiet market
    # unless "never sent anything" counts as stale.
    bus = EventBus()
    collector = ScriptedCollector(bus, stale_after_s=1.0)
    assert collector.is_stale(now=10**18)

    collector.stats.connected_since_ns = 1_000_000_000
    assert not collector.is_stale(1_000_000_000 + 500_000_000)
    assert collector.is_stale(1_000_000_000 + 2_000_000_000)

    collector.stats.last_event_ns = 1_000_000_000 + 1_900_000_000
    assert not collector.is_stale(1_000_000_000 + 2_000_000_000)


def test_backoff_is_bounded_and_jittered():
    policy = BackoffPolicy(initial_s=1.0, max_s=8.0, factor=2.0)
    for attempt in range(1, 12):
        assert 0.0 <= policy.delay(attempt) <= 8.0
    # Full jitter: four collectors losing one uplink must not retry in lockstep.
    samples = {policy.delay(5) for _ in range(50)}
    assert len(samples) > 1
