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
