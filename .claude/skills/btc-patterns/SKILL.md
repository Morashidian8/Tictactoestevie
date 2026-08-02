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
| 5 | \|close − close[−4]\| ≥ 5.7 × median100(\|move\|) → fade the stretch | **55.6%** | 5,831 |
| 3 | run of ≥3 same-colour candles → bet opposite | 52.8% | 11,296 |
| 7 | close outside Bollinger(20, 2σ) **and** RSI(7) ≥80 / ≤20 → fade | **57.6%** | 1,957 |

Rule 7 came out of a 1,083-condition indicator sweep and was then rewritten from
scratch and re-measured before being believed: 56.15% over 6,522 signals, all six
chronological blocks positive (53.1–59.2%), 986 signals no other rule sees at
55.68%, and 0 of 300 shuffled-label runs came near it (best 51.9%). It votes with
rules 1/2/3/5 rather than standing apart — in a full year it agreed with them on
every one of the 3,684 windows where both fired, **zero vetoes** — so merging
returns $59,460 against $56,060 at a $20 base while cutting the worst drawdown
from $2,040 to $1,720.

Rule 5 is worth its slot because 44% of its signals are ones rules 1–3 never see,
and those alone hold 54.3% (n=2,748, z=+4.46); it contradicts the others in 8
cases out of 6,542, and where they agree accuracy reaches 56.7%.

Rule 1 detail: ~19 signals/day; 17/19 months above 50%; bootstrap CI [56.2%, 59.8%];
dies under shuffled labels (50.4%); **longest observed losing streak = 11**, with
≥5 consecutive losses in 4.6% of streaks — quote this whenever martingale sizing
is discussed.

Rule 2 only works evaluated **symmetrically**; forced to one fixed direction it is
49.85%, i.e. nothing.

## The user's own AABA pattern — measured and rejected (do not re-litigate)

"Two same-direction moves, one opposite, back to the first direction; bet the
next move continues it." Tested twice with 9 agents over both continuations:

| | train | test |
| --- | --- | --- |
| candle 5 (AABAA) | 50.5% | **48.8%** |
| candle 6 after a loss (AABABB) | 52.9% | **50.5%** |

AABA is not a special state at all — continuation after any ordinary candle is
49.7%, after AABA 49.9%. Geometry, time-of-day, direction, volatility regime and
a ~2,900-rule machine search all failed to find a condition that survives
out-of-sample; on the candle-6 search the best result had a 31.5% chance of
arising from shuffled labels. The two-rung martingale on it needs 55.2% on rung 2
to break even at 52c and has 50.5%, giving −4.65% EV per cycle.

Rule 5 came out of this analysis — but the control showed the edge belongs to the
stretch, not the pattern (same filter on non-AABA windows: 55.5%, 7× the sample).

## Volume, S/R, microstructure and regime — all dead, with controls

Five specialist sweeps, ~39,000 conditions, one survivor (rule 7 above).

- **Volume** (K=193): VWAP ≈ SMA, volume-profile POC ≈ dumb midpoint. Volume on
  top of a stretch filter buys ~1pp and halves the sample — strictly worse.
  Climax, absorption, low-volume reversion, VWAP crosses: nothing. Second
  independent failure; treat as settled.
- **Support/resistance** (K=262): a **placebo grid** (same geometry, shifted
  $137 so the levels are not round) scored *better* than real round numbers.
  Levels are a proxy for "a big bar just happened" — `fade a 3-bar stretch when
  the last body ≥2× median` scores the same 53.4% with no level involved.
- **Microstructure** (K=36,626): 0 of 209 intrabar modifiers add anything on top
  of where price sits in its recent range; a close-only version does as well as
  the high/low one. Wicks carry nothing.
- **Regime** (K=1,187): ADX, efficiency ratio, Hurst, volatility percentile,
  time-of-day and **day-of-week** all fail once calendar drift is removed by
  block-stratified contrasts. Only run-length ≥4 survives, at 52.5% — too thin.

Two facts worth keeping from that work:

1. **The test half is globally more mean-reverting** (unconditional fade 49.46%
   → 50.84%). Any rule split that correlates with the calendar inherits this and
   looks predictive. Always contrast within blocks.
2. **A fade signal does not decay**: accuracy at k=1..5 candles ahead is flat
   (rule 1: 56.1 / 55.5 / 55.5 / 54.2). Entries can carry a 3–5 candle horizon.

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
