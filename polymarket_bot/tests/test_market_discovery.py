"""Discovery of the live Up/Down window, against mocked Gamma responses.

The 5-minute and 15-minute markets close at the same instant four times an
hour. Picking the wrong one is not a crash - it is a bot quietly trading a
different instrument from the one its signal was computed for, which is why
most of these tests are about rejection rather than selection.
"""

import json
from datetime import datetime

import httpx
import pytest

from polymarket_bot.collectors.polymarket_markets import (
    ET,
    MarketDiscovery,
    slug_for,
    title_starts_at,
    title_window_seconds,
    to_market_ref,
    window_boundary,
)


def et_ts(year, month, day, hour, minute) -> float:
    return datetime(year, month, day, hour, minute, tzinfo=ET).timestamp()


def gamma_market(question, end_iso, *, tokens=("111", "222"), outcomes=("Up", "Down")):
    return {
        "id": "5150",
        "conditionId": "0xcond",
        "question": question,
        "slug": "bitcoin-up-or-down-january-20-745am-750am-et",
        "outcomes": json.dumps(list(outcomes)),
        "clobTokenIds": json.dumps(list(tokens)),
        "endDate": end_iso,
        "closed": False,
        "acceptingOrders": True,
    }


def test_window_boundary_floors_to_the_window():
    assert window_boundary(1_700_000_123, 300) == 1_700_000_100
    assert window_boundary(1_700_000_123, 900) == 1_700_000_100
    assert window_boundary(1_700_000_123, 900) % 900 == 0


def test_title_duration_distinguishes_5m_from_15m():
    assert title_window_seconds("Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET") == 300
    assert title_window_seconds("Bitcoin Up or Down - January 20, 7:45AM-8:00AM ET") == 900
    assert title_window_seconds("Bitcoin Up or Down today") is None


def test_title_duration_across_the_12_hour_boundary():
    assert title_window_seconds("Bitcoin Up or Down - 11:55AM-12:00PM ET") == 300
    assert title_window_seconds("Bitcoin Up or Down - 11:50PM-12:00AM ET") == 600
    assert title_window_seconds("Bitcoin Up or Down - 12:00AM-12:05AM ET") == 300


def test_title_start_is_matched_in_eastern_time():
    boundary = et_ts(2026, 1, 20, 7, 45)
    assert title_starts_at("Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET", boundary)
    assert not title_starts_at("Bitcoin Up or Down - January 20, 7:50AM-7:55AM ET", boundary)


def test_slug_follows_the_daylight_saving_switch():
    # A fixed -4 offset looks up the wrong window for half the year.
    winter = slug_for(et_ts(2026, 1, 20, 7, 45), 300)
    summer = slug_for(et_ts(2026, 7, 20, 7, 45), 300)
    assert winter == "bitcoin-up-or-down-january-20-745am-750am-et"
    assert summer == "bitcoin-up-or-down-july-20-745am-750am-et"


def test_market_ref_maps_outcomes_to_tokens():
    ref = to_market_ref(
        gamma_market("Bitcoin Up or Down - 7:45AM-7:50AM ET", "2026-01-20T12:50:00Z"),
        300,
        et_ts(2026, 1, 20, 7, 45),
    )
    assert ref is not None
    assert ref.up_token_id == "111"
    assert ref.down_token_id == "222"
    assert ref.token_for("UP") == "111"  # case-insensitive
    assert ref.token_for("Sideways") is None


def test_market_without_clob_tokens_is_rejected():
    # Untradeable and unquotable; better rejected here than in the executor.
    item = gamma_market("Bitcoin Up or Down - 7:45AM-7:50AM ET", "2026-01-20T12:50:00Z")
    item["clobTokenIds"] = "[]"
    assert to_market_ref(item, 300, 0) is None


def make_discovery(handler) -> MarketDiscovery:
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport)
    return MarketDiscovery(client=client)


@pytest.mark.asyncio
async def test_find_returns_the_five_minute_market():
    boundary = et_ts(2026, 1, 20, 7, 45)
    end_iso = datetime.utcfromtimestamp(boundary + 300).strftime("%Y-%m-%dT%H:%M:%SZ")
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(
            200,
            json=[gamma_market("Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET", end_iso)],
        )

    discovery = make_discovery(handler)
    ref = await discovery.find(300, boundary)
    assert ref is not None and ref.up_token_id == "111"
    assert ref.window_seconds == 300
    # The slug lookup is first and it succeeded, so nothing else was queried.
    assert len(calls) == 1 and "slug=" in calls[0]


@pytest.mark.asyncio
async def test_the_fifteen_minute_market_is_not_mistaken_for_the_five():
    # Both close at 8:00. Only the title's own range separates them.
    boundary = et_ts(2026, 1, 20, 7, 45)
    end_iso = datetime.utcfromtimestamp(boundary + 900).strftime("%Y-%m-%dT%H:%M:%SZ")

    def handler(request):
        return httpx.Response(
            200,
            json=[gamma_market("Bitcoin Up or Down - January 20, 7:45AM-8:00AM ET", end_iso)],
        )

    discovery = make_discovery(handler)
    assert await discovery.find(300, boundary) is None
    assert (await discovery.find(900, boundary)) is not None


@pytest.mark.asyncio
async def test_non_btc_markets_are_ignored():
    boundary = et_ts(2026, 1, 20, 7, 45)
    end_iso = datetime.utcfromtimestamp(boundary + 300).strftime("%Y-%m-%dT%H:%M:%SZ")

    def handler(request):
        return httpx.Response(
            200, json=[gamma_market("Ethereum Up or Down - 7:45AM-7:50AM ET", end_iso)]
        )

    assert await make_discovery(handler).find(300, boundary) is None


@pytest.mark.asyncio
async def test_a_failing_lookup_falls_through_to_the_next_source():
    boundary = et_ts(2026, 1, 20, 7, 45)
    end_iso = datetime.utcfromtimestamp(boundary + 300).strftime("%Y-%m-%dT%H:%M:%SZ")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/markets" and "slug" in request.url.params:
            return httpx.Response(500)
        if request.url.path == "/events":
            return httpx.Response(500)
        return httpx.Response(
            200,
            json=[gamma_market("Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET", end_iso)],
        )

    ref = await make_discovery(handler).find(300, boundary)
    assert ref is not None
    assert seen == ["/markets", "/events", "/markets"]


@pytest.mark.asyncio
async def test_events_response_is_unwrapped():
    boundary = et_ts(2026, 1, 20, 7, 45)
    end_iso = datetime.utcfromtimestamp(boundary + 300).strftime("%Y-%m-%dT%H:%M:%SZ")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/events":
            return httpx.Response(200, json=[{
                "slug": "x",
                "markets": [gamma_market(
                    "Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET", end_iso)],
            }])
        return httpx.Response(200, json=[])

    assert (await make_discovery(handler).find(300, boundary)) is not None


@pytest.mark.asyncio
async def test_find_current_and_next_covers_the_upcoming_window():
    # The next window's tokens must be in hand before it opens; a 300-second
    # market subscribed late has already lost a slice of its life.
    now = et_ts(2026, 1, 20, 7, 47)

    def handler(request: httpx.Request) -> httpx.Response:
        slug = request.url.params.get("slug", "")
        if "745am-750am" in slug:
            end = datetime.utcfromtimestamp(et_ts(2026, 1, 20, 7, 50))
            title = "Bitcoin Up or Down - January 20, 7:45AM-7:50AM ET"
        elif "750am-755am" in slug:
            end = datetime.utcfromtimestamp(et_ts(2026, 1, 20, 7, 55))
            title = "Bitcoin Up or Down - January 20, 7:50AM-7:55AM ET"
        else:
            return httpx.Response(200, json=[])
        return httpx.Response(
            200, json=[gamma_market(title, end.strftime("%Y-%m-%dT%H:%M:%SZ"))]
        )

    refs = await make_discovery(handler).find_current_and_next(300, now_ts=now)
    assert len(refs) == 2
    assert refs[0].seconds_remaining(now) == 180
    assert refs[1].window_start_ts == et_ts(2026, 1, 20, 7, 50)
