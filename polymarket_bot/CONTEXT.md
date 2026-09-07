# Context: polymarket_bot

Domain language for the staged Polymarket BTC Up/Down trading research system.
See `README.md` for the phase plan and current status.

## Terms

**Window** — one instance of a Polymarket "Bitcoin Up or Down" market: a fixed
5- or 15-minute interval labelled in US Eastern (`7:45AM-7:50AM ET`). A new one
opens every interval, so the tradeable instrument changes several times an hour.

**Window boundary** — the start instant of a window, `floor(now / window_seconds)`.
Discovery is always phrased as "the market whose window *starts* at this
boundary", never as "the nearest open market".

**Condition id** — Polymarket's identifier for a market (the CTF condition).
Stable for the life of one window.

**Token id / asset id** — the ERC-1155 id of one outcome (Up or Down) inside a
market. This is what the CLOB order book and the WebSocket market channel are
keyed by, and what `MarketEvent.symbol` holds for Polymarket events.

**Gamma** — `gamma-api.polymarket.com`, the metadata service. Answers "which
market is this window", never "what is it worth": its cached `outcomePrices`
returns 0.5/0.5 for an unpriced market, indistinguishable from a real coin flip.

**CLOB** — `clob.polymarket.com` and its WebSocket. The order book, and the only
source of price in this system.

**Venue** — one data source: `binance`, `okx`, `coinbase` or `polymarket`.

**Aggressor** — the side that crossed the spread. Normalised at the collector
boundary because the venues disagree: Binance sends a maker *flag*, Coinbase
sends the *maker's* side, OKX sends the taker's side directly.

**Exchange / receive / processing timestamp** — the three times on every event.
Only the last two share a clock; the first is the venue's own and can be
skewed. See `core/clock.py`.

**Signal age** — how long ago the information a decision rests on arrived,
measured on the local clock. The gate that decides whether a signal is still
tradeable (Phase 6+).

**Skew** — estimated offset between a venue's clock and ours, taken as the
largest observed `exchange_ts - recv_ts`. Yields a *relative* one-way delay, not
an absolute one.

**Drop** — an event a bus subscriber never received because its queue was full.
Counted, never silent: a recorded feed with unrecorded gaps cannot be
backtested against what the strategy actually saw.

**Fade** — betting against the recent direction. The measured edge in the
parent repo's research (~55–57%), as opposed to **follow**, which is what the
existing PolyBot strategies do and which is on the wrong side of it. See
`docs/research/btc-5m-patterns.md`.

## Rules that are not up for rediscovery

* The market **title** decides which window a market belongs to. Gamma's
  `startDate` is when trading opened, not when the window starts.
* Eastern time is `zoneinfo("America/New_York")`, never a fixed −4.
* No fee, tick size, endpoint, market id or token id is ever hardcoded or
  guessed. Tick size is read per token from the CLOB.
* Nothing in this system may use information that arrived after the timestamp
  it claims to be deciding at.
