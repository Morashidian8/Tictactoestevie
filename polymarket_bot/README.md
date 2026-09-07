# polymarket_bot — BTC 5m/15m Up-Down research system

A staged attempt to find out whether a **repeatable, tradeable edge** exists in
Polymarket's 5-minute and 15-minute "Bitcoin Up or Down" markets, and to
disprove it as cheaply as possible if it does not.

The system is built to fail loudly and early. It does not place orders, and it
will not until a recorded dataset, a replay backtester and a paper-trading run
have all had a chance to kill the idea first.

**Status: Phase 1 (collectors) complete. Nothing else exists yet.**
No recorder, no features, no model, no backtester, no executor, no live mode.

---

## Why the caution is not boilerplate

This repository already contains a body of measured research on 5-minute BTC
predictability (`docs/research/btc-5m-patterns.md` in the parent repo, and the
`btc-patterns` skill). Three of its findings constrain this project from day
one:

1. **There is no >90% next-candle pattern.** Cherry-picking across 114,003
   rules on the test set tops out at 65.3%, and shuffled random labels produce
   *better* in-sample patterns than the real data. Any component here that
   reports a high hit rate on in-sample data is reporting an artifact.
2. **The measured directional edge is mean reversion, around 55–57%** — betting
   *against* the recent move, not with it.
3. **The 50% baseline is statistical, not a market price.** At ~55% accuracy the
   edge dies once your side is quoted above ~55c, and *no Polymarket order-book
   data has ever been collected here*. That gap is the single biggest untested
   assumption in the whole body of work.

Point 3 is the actual reason Phase 1 exists and why it comes first. The
recorder in Phase 2 is what finally makes the "is there anything left after the
spread" question answerable with data instead of assertion.

---

## Phases

| # | Phase | Status |
| - | ----- | ------ |
| 1 | Exchange + Polymarket collectors | **done** |
| 2 | Raw market-data recorder (Parquet, partitioned) | not started |
| 3 | Feature engine (momentum, OFI, volatility, microprice) | not started |
| 4 | Fair-value model (interpretable first, no black boxes) | not started |
| 5 | Historical replay engine | not started |
| 6 | Realistic backtester (latency, slippage, partial + missed fills) | not started |
| 7 | Paper trader | not started |
| 8 | Risk manager | not started |
| 9 | Execution engine | not started |
| 10 | Live trading with tiny limits | not started |

Each phase must run green tests and produce evidence before the next begins.

## What Phase 1 does

Connects to four feeds, normalises everything into one event vocabulary, and
publishes it on an in-process bus with drop accounting.

```
polymarket_bot/
├── config/
│   ├── default.yaml          every tunable, in one place
│   └── settings.py           typed loading; unknown keys are an error
├── core/
│   ├── clock.py              ns timestamps, clock-skew estimation
│   ├── events.py             the normalized event vocabulary
│   └── bus.py                bounded fan-out; a slow consumer drops, loudly
├── collectors/
│   ├── base.py               connect / subscribe / read / reconnect
│   ├── binance.py            trade, bookTicker, partial depth
│   ├── okx.py                books5, trades
│   ├── coinbase.py           ticker, matches
│   ├── polymarket.py         CLOB market channel
│   ├── polymarket_markets.py Gamma discovery of the live 5m/15m window
│   └── market_tracker.py     re-points the feed as windows roll over
├── run_collectors.py         Phase 1 diagnostic entry point
└── tests/                    83 tests, no network required
```

### Run it

```bash
pip install -r requirements.txt

# Resolve the currently live Up/Down markets and exit
python -m polymarket_bot.run_collectors --discover

# Open every feed for a minute and report what arrived
python -m polymarket_bot.run_collectors --duration 60 --print-events 20
```

Before believing a feed: every enabled venue should show a non-zero event count
and a small last-event age; `unknown` and `parse_errors` should both stay at
zero. A rising `unknown` means a venue changed a message shape.

### Tests

```bash
python -m pytest polymarket_bot/tests -q
```

Every parser is a pure function of `(raw frame, receive timestamp)`, so the
whole wire-format surface is tested from captured payloads with no network and
no mocks. The lifecycle tests drive the collector against a scripted fake
socket.

## Design decisions that later phases depend on

**Three timestamps on every event.** Venue clock, local receive, local
post-parse. Only the two local ones share a clock, so only their difference is a
measurement; the venue-to-local gap is an estimate contaminated by clock skew
and is treated as one (`core/clock.Skew`). The receive timestamp is taken
before the frame is even JSON-decoded — stamping it later folds our own CPU
time into what we would later call network latency, which is exactly the number
the latency-edge question turns on.

**Parsing is pure and separate from the socket.** Same functions serve the live
feed and (in Phase 5) the replay engine, so a backtest cannot diverge from
production by parsing the data differently.

**The bus drops rather than blocks.** A slow consumer costs itself data; it
never stalls the read loop. Drops are counted, and Phase 8 is expected to treat
a dropping recorder as a reason to stop trading: a strategy running on a feed
with unrecorded gaps cannot be backtested against what it actually saw.

**Raw payloads are kept on the event.** The recorder will store the venue's own
strings, so a float-rounding decision made today cannot corrupt a dataset
replayed in six months.

**Aggressor side is normalised once, at the boundary.** The three exchanges
disagree: Binance sends a maker flag, Coinbase sends the *maker's* side, OKX
sends the taker's. Two of the three need inverting. A sign error here silently
flips every order-flow feature downstream, so each inversion is commented at the
point it happens and tested by name.

## Endpoints, and how they were verified

Nothing here was recalled from memory. Each was read from a primary source at
the time of writing:

| Feed | Endpoint | Source |
| ---- | -------- | ------ |
| Binance | `wss://data-stream.binance.vision` (market data only) or `wss://stream.binance.com:9443` | `binance/binance-spot-api-docs`, `web-socket-streams.md` |
| OKX | `wss://ws.okx.com:8443/ws/v5/public` | OKX v5 public channels |
| Coinbase | `wss://ws-feed.exchange.coinbase.com` | Coinbase Exchange feed |
| Polymarket CLOB | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | Polymarket `clob-client`, `examples/socketConnection.ts` |
| Polymarket metadata | `https://gamma-api.polymarket.com` | in use by `polymarket_collector.py` in the parent repo |
| Polymarket REST book | `https://clob.polymarket.com` | Polymarket `py-clob-client`, `endpoints.py` |

Two details are worth carrying forward:

* **Binance offers microsecond timestamps** via `timeUnit=MICROSECOND` in the
  stream URL, and that is what this collector asks for. But `bookTicker` and
  partial-depth payloads carry *no* venue timestamp at all, so those events have
  `exchange_ts_ns = None`. Inventing one would fabricate the latency
  measurement.
* **Coinbase `level2`/`level2_batch` need authentication** on the Exchange feed,
  so the default channel set is `ticker` + `matches`, which are public and carry
  top of book plus the tape. The depth parser exists but the channels are opt-in.

## Finding the market, which is most of the problem

These markets expire every 5 or 15 minutes, so "which instrument am I trading"
has a new answer several times an hour, and the *next* window's token ids must
be in hand before it opens. Discovery tries the slug first, then the event slug,
then a date-bounded query — and inherits two rules from the collector already
running in the parent repo, both learned the hard way:

* **The title decides the window, not `startDate`.** Gamma's `startDate` is when
  the market opened for *trading*, which can be an hour or a day before the
  window it settles. The title names both ends (`7:45AM-7:50AM ET`), which is
  the only field that separates the 5-minute market from the 15-minute one
  closing at the same instant.
* **Gamma's cached `outcomePrices` are not a book.** It answers 0.5/0.5 for a
  market it has not priced, which is indistinguishable from a real coin flip.
  Prices come from the CLOB book only.

Times are resolved in `America/New_York` with `zoneinfo`, not a fixed −4 offset,
which would look up the wrong window for half the year.

## Known limits of Phase 1

Stated plainly, because each is a thing a later phase must close:

1. **No feed has been observed live from this environment.** The sandbox blocks
   egress to every exchange and to `docs.polymarket.com`. Every parser is tested
   against documented payloads, and the lifecycle against a fake socket, but
   "the subscription is accepted and delivers" is unverified. Run
   `--discover` and `--duration 60` from a machine with network access before
   trusting anything downstream.
2. **Polymarket depth is snapshot-only.** `price_change` messages are recorded
   as their own event type but are not folded into a running book: rebuilding
   depth from them without a documented sequence number risks silently diverging
   from the venue. Settle this in Phase 5 against recorded data.
3. **Assets are re-pointed by reconnecting**, roughly once per window. A live
   `{"operation":"subscribe"}` frame is documented by a third-party library but
   not by Polymarket, and an unacknowledged subscription that silently fails is
   indistinguishable from a quiet market.
4. **Nothing is persisted.** A restart loses everything. That is Phase 2.
5. **Clock skew is estimated, not measured.** `Skew` reports delay relative to
   the fastest message ever seen, which is enough to rank feeds and spot one
   falling behind. It is not an absolute network delay and must never be
   reported as one.
6. **No fee, tick-size or resolution rule is hardcoded anywhere.** Tick size is
   read from the CLOB per token. Fees are deliberately absent until they are
   read from a primary source — an invented fee makes every net-edge number
   downstream fiction.

## Security

Secrets come from the environment only, never from YAML, and `Secrets.__repr__`
renders names without values so a key cannot reach a log line or a stack trace.
`Settings.to_dict()` omits them entirely. `.env` is git-ignored; `.env.example`
carries the names and no values. Phase 1 needs no credentials at all — every
feed it touches is public.
