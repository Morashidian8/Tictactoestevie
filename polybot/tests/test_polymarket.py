"""Offline tests for the read-only Polymarket client (parsing + filtering)."""

from __future__ import annotations

from polybot.polymarket import Market, PolymarketData, is_btc_updown, parse_market


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class _Session:
    """Fake requests session returning canned payloads keyed by URL substring."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        # Match the most specific (longest) route key so "/price" doesn't shadow
        # "/prices-history".
        for key in sorted(self.routes, key=len, reverse=True):
            if key in url:
                return _Resp(self.routes[key])
        raise AssertionError(f"unexpected url {url}")


def test_parse_market_decodes_json_string_fields():
    raw = {
        "question": "Bitcoin Up or Down — 3pm ET?",
        "slug": "bitcoin-up-or-down-3pm",
        "conditionId": "0xabc",
        "clobTokenIds": '["111", "222"]',   # gamma returns these as JSON strings
        "outcomes": '["Up", "Down"]',
        "active": True,
        "closed": False,
    }
    m = parse_market(raw)
    assert m.token_ids == ["111", "222"]
    assert m.outcomes == ["Up", "Down"]
    assert m.token_for("down") == "222"
    assert m.token_for("up") == "111"


def test_is_btc_updown_filter():
    yes = parse_market({
        "question": "Bitcoin Up or Down?",
        "slug": "bitcoin-up-or-down",
        "clobTokenIds": '["1","2"]', "outcomes": '["Up","Down"]',
    })
    no = parse_market({
        "question": "Will ETH flip BTC by 2030?",
        "slug": "eth-flippening",
        "clobTokenIds": '["3","4"]', "outcomes": '["Yes","No"]',
    })
    assert is_btc_updown(yes) is True
    assert is_btc_updown(no) is False


def test_get_markets_and_discovery():
    rows = [
        {"question": "Bitcoin Up or Down 1pm?", "slug": "btc-up-or-down-1pm",
         "clobTokenIds": '["10","11"]', "outcomes": '["Up","Down"]', "active": True},
        {"question": "Random election market", "slug": "election",
         "clobTokenIds": '["20","21"]', "outcomes": '["Yes","No"]'},
    ]
    api = PolymarketData(session=_Session({"/markets": rows}))
    found = api.find_btc_updown_markets()
    assert len(found) == 1
    assert found[0].slug == "btc-up-or-down-1pm"


def test_prices_endpoints():
    api = PolymarketData(session=_Session({
        "/midpoint": {"mid": "0.53"},
        "/price": {"price": "0.55"},
        "/prices-history": {"history": [{"t": 1, "p": 0.5}, {"t": 2, "p": 0.52}]},
    }))
    assert api.midpoint("10") == 0.53
    assert api.price("10", "buy") == 0.55
    assert len(api.prices_history("10", interval="1h")) == 2


class _FakeData:
    """Minimal stand-in for PolymarketData with a scripted midpoint series."""

    def __init__(self, prices):
        self._prices = list(prices)
        self._i = 0

    def midpoint(self, token_id):
        v = self._prices[min(self._i, len(self._prices) - 1)]
        self._i += 1
        return v

    def price(self, token_id, side="buy"):
        return None


def test_history_to_candles():
    from polybot.polymarket import history_to_candles

    hist = [{"t": 0, "p": 0.50}, {"t": 300, "p": 0.55}, {"t": 600, "p": 0.52}]
    candles = history_to_candles(hist, interval_seconds=300)
    assert len(candles) == 3
    assert candles[0].open == 0.50 and candles[0].close == 0.50
    assert candles[1].open == 0.50 and candles[1].close == 0.55 and candles[1].color.value == "green"
    assert candles[2].color.value == "red"


def test_sampled_feed_builds_candles_from_prices():
    from polybot.polymarket import PolymarketSampledFeed

    feed = PolymarketSampledFeed(_FakeData([0.50, 0.55, 0.52]), token_id="10", interval_seconds=300)
    c1 = feed.next()   # first sample: open == close == 0.50
    c2 = feed.next()   # 0.50 -> 0.55 : green (up)
    c3 = feed.next()   # 0.55 -> 0.52 : red (down)
    assert c1.close == 0.50
    assert c2.open == 0.50 and c2.close == 0.55 and c2.color.value == "green"
    assert c3.open == 0.55 and c3.close == 0.52 and c3.color.value == "red"
    assert c2.close_time == c2.open_time + 300
