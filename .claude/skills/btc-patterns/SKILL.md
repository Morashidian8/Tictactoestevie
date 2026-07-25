---
name: btc-patterns
description: Established research findings on BTC 5-minute candle patterns — which predictive edges are real, which are statistically dead, and the proof that no >90% next-candle pattern exists. Use whenever the user discusses PolyBot strategies, candle patterns, martingale sizing, win rates, backtests, Polymarket 5m up/down betting, or asks whether some pattern/indicator works. Also use before proposing or implementing any new PolyBot trading strategy.
---

# BTC 5-minute candle patterns — what is actually true

The full research lives in `docs/research/btc-5m-patterns.md`. **Read that file
before answering** anything substantive; this page is only the index and the
guardrails. Reproduce any number with `python3 research/btc5m/rules.py`.

## The three things to never get wrong

1. **No >90% pattern exists.** Proven three ways: (a) cherry-picking directly on
   the test set across 114,003 rules could not exceed **65.3%** (and only 57.4%
   at n≥1000); (b) randomly **shuffled** labels produce a *better* best-pattern
   (80% mean / 87% max on train) than the real data does (77%); (c) the analytic
   expected-max table shows ~90% is exactly what 4096 rules × n=30 yields by
   chance. Never present a long colour pattern's in-sample rate as a finding.

2. **The real edge is mean reversion — "fade", not "follow".** All three
   surviving rules bet **against** the recent direction. Every `follow1`..`follow15`
   strategy in `polybot_web/index.html` bets **with** the previous candle, i.e. on
   the wrong side of the measured edge. Say so when strategy design comes up.

3. **The 50% baseline is statistical, not a market price.** At ~55% accuracy the
   edge dies once Polymarket quotes your side above ~55c. This is the single
   biggest untested assumption in the whole body of work — no order-book data was
   ever collected. Always attach this caveat to any profit projection.

## The surviving edges (test-split accuracy)

| # | rule | test acc | test n |
| - | ---- | -------- | ------ |
| 1 | close breaks the 20-bar high/low **and** vol20/vol100 ≥ 0.8884 → bet the opposite | **57.4%** | 2,847 |
| 2 | 3 same-colour candles **and** body > 1× median100(range) → bet opposite | 55.4% | 2,648 |
| 3 | run of ≥3 same-colour candles → bet opposite | 52.8% | 11,296 |

Rule 1 detail: ~19 signals/day; 17/19 months above 50%; bootstrap CI [56.2%, 59.8%];
dies under shuffled labels (50.4%); **longest observed losing streak = 11**, with
≥5 consecutive losses in 4.6% of streaks — quote this whenever martingale sizing
is discussed.

Rule 2 only works evaluated **symmetrically**; forced to one fixed direction it is
49.85%, i.e. nothing.

## Dead — tested and rejected, do not propose these

Hammer (46.97%, *inverted*), shooting star, doji, bullish/bearish engulfing,
inside bar, outside bar — all ≈50% out of sample. All long colour patterns
(length 7–12) collapse. Time-of-day conditioning adds nothing beyond noise
(52.77% → 52.98%).

## Data

Bitstamp BTC/USD, 162,447 five-minute candles, 2025-01-07 → 2026-07-25, zero gaps,
frozen at `research/btc5m/btc5m.csv.gz`. Polymarket settles on **Chainlink**
BTC/USD, so expect roughly 1–2 points lower than these numbers in live trading.

Exchange APIs (Binance, Coinbase, Kraken, OKX, Bybit) are blocked by the sandbox
egress policy; `raw.githubusercontent.com` is not. `research/btc5m/fetch_data.py`
re-fetches from the GitHub-hosted Bitstamp mirror if fresher data is needed.

## How to behave

- Ground claims in the measured numbers; cite the file rather than recalling.
- If the user proposes a pattern, check it against "Dead" above before building it.
- If asked to validate something new, insist on the chronological 70/30 split, an
  occurrence count, and a multiple-testing correction — that protocol is what
  separated the one real edge from thousands of artifacts.
- Do not soften the no-90% result, and do not re-derive it from scratch each time.
