import asyncio

import pytest

from polymarket_bot.collectors.market_tracker import ActiveMarketTracker
from polymarket_bot.collectors.polymarket import PolymarketCollector
from polymarket_bot.collectors.polymarket_markets import MarketRef
from polymarket_bot.core.bus import EventBus


def ref(condition, tokens, window=300, end=1_000.0) -> MarketRef:
    return MarketRef(
        market_id=condition,
        condition_id=condition,
        question=f"Bitcoin Up or Down ({window}s)",
        slug="slug",
        outcomes=("Up", "Down"),
        token_ids=tokens,
        window_start_ts=end - window,
        window_end_ts=end,
        window_seconds=window,
    )


class FakeDiscovery:
    def __init__(self, per_window, fail_for=()):
        self.per_window = per_window
        self.fail_for = set(fail_for)
        self.calls = []

    async def find_current_and_next(self, window_seconds, now_ts=None):
        self.calls.append(window_seconds)
        if window_seconds in self.fail_for:
            raise RuntimeError("gamma is down")
        return self.per_window.get(window_seconds, [])


def tracker_for(discovery, windows=(300, 900)) -> ActiveMarketTracker:
    bus = EventBus()
    return ActiveMarketTracker(
        discovery, PolymarketCollector(bus), window_seconds=windows, refresh_s=0.01
    )


@pytest.mark.asyncio
async def test_refresh_collects_every_configured_window():
    discovery = FakeDiscovery({
        300: [ref("0xa", ("1", "2")), ref("0xb", ("3", "4"))],
        900: [ref("0xc", ("5", "6"), window=900)],
    })
    tracker = tracker_for(discovery)
    await tracker.refresh(now_ts=500.0)
    assert discovery.calls == [300, 900]
    assert tracker.asset_ids() == ["1", "2", "3", "4", "5", "6"]


@pytest.mark.asyncio
async def test_the_same_market_found_twice_is_subscribed_once():
    discovery = FakeDiscovery({300: [ref("0xa", ("1", "2")), ref("0xa", ("1", "2"))]})
    tracker = tracker_for(discovery, windows=(300,))
    await tracker.refresh()
    assert tracker.asset_ids() == ["1", "2"]


@pytest.mark.asyncio
async def test_one_failing_window_does_not_lose_the_other():
    # Gamma being down for the 15m lookup must not blind the 5m feed too.
    discovery = FakeDiscovery({300: [ref("0xa", ("1", "2"))]}, fail_for={900})
    tracker = tracker_for(discovery)
    await tracker.refresh()
    assert tracker.failures == 1
    assert tracker.asset_ids() == ["1", "2"]


@pytest.mark.asyncio
async def test_set_assets_reports_only_real_changes():
    bus = EventBus()
    collector = PolymarketCollector(bus)
    assert collector.set_assets(["1", "2"]) is True
    assert collector.set_assets(["1", "2"]) is False
    assert collector.set_assets(["1", "2", "1"]) is False  # duplicates collapse
    assert collector.set_assets(["1", "3"]) is True


@pytest.mark.asyncio
async def test_subscribing_to_nothing_is_refused():
    # A connection with no assets never speaks, which the staleness check would
    # then report as a dead venue rather than as a configuration mistake.
    collector = PolymarketCollector(EventBus())
    with pytest.raises(ValueError):
        collector.subscribe_frames()


@pytest.mark.asyncio
async def test_summary_reports_time_left_in_each_window():
    discovery = FakeDiscovery({300: [ref("0xa", ("1", "2"), end=1_000.0)]})
    tracker = tracker_for(discovery, windows=(300,))
    await tracker.refresh(now_ts=880.0)
    (row,) = tracker.summary(now_ts=880.0)
    assert row["ends_in_s"] == 120.0
    assert row["up_token"] == "1"
