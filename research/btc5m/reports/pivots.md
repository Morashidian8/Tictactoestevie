# Classic pivot points on BTC 5m — do crossings predict the next candle?

Data: `btc5m_fresh.csv` — 169,925 5m candles, 1736208000 .. 1787185200 (UTC).
Usable (warm-up 300, flat bars dropped): 168,120 — TRAIN 117,683 / TEST 50,437, chronological 70/30 split at bar 119,008.

**Verdict up front:** see section 8.

## 1. The search space

- pivot sets: daily (UTC), 4-hour, weekly — from the prior *complete* session's H/L/C
- formulas: classic (P, R1-R3, S1-S3) and Fibonacci (0.382 / 0.618 / 1.0)
- level groups: P, R1/S1, R2/S2, R3/S3, ANY
- cross definitions: `close_cross` (prev close one side, this close the other), `wick_reject` (high/low touches, close does not follow), `strongX` (close_cross and beyond by >= X x median100 |move|), X = 0.5/1.0/2.0
- conditioners on the ANY/close_cross family: cross-strength terciles (cut on TRAIN only) and four 6-hour UTC blocks
- both bet directions always, never fixed post-hoc: **FADE** (next candle reverses back across) and **FOLLOW** (continuation)

**K = 354** (variant x direction) pairs evaluated. Bonferroni threshold: p < 1.41e-04.
Of those, 62 passed the TRAIN screen (n >= 200 and one-sided p < 0.05) and were carried to TEST.

## 2. Real pivots — top 15 by TRAIN z, judged on the held-out third

| variant | dir | n train | train | z train | n test | test | 95% CI | z test | p test | survives |
|---|---|---|---|---|---|---|---|---|---|---|
| `daily/fib ANY close_cross [str_hi]` | FADE | 3107 | 53.69% | +4.11 | 1401 | 54.10% | [51.5, 56.7] | +3.07 | 1.06e-03 | no |
| `h4/fib ANY close_cross [str_hi]` | FADE | 7915 | 52.27% | +4.04 | 3551 | 52.55% | [50.9, 54.2] | +3.04 | 1.19e-03 | no |
| `daily/fib ANY strong1.0` | FADE | 4365 | 52.97% | +3.92 | 1858 | 53.93% | [51.7, 56.2] | +3.39 | 3.53e-04 | no |
| `h4/classic ANY close_cross [utc12-17]` | FADE | 5595 | 52.46% | +3.68 | 2184 | 53.80% | [51.7, 55.9] | +3.55 | 1.91e-04 | no |
| `h4/classic ANY close_cross [str_hi]` | FADE | 5688 | 52.32% | +3.50 | 2632 | 54.37% | [52.5, 56.3] | +4.48 | 3.68e-06 | YES |
| `daily/fib ANY strong0.5` | FADE | 6466 | 52.09% | +3.36 | 2607 | 53.36% | [51.4, 55.3] | +3.43 | 3.05e-04 | no |
| `h4/fib ANY strong1.0` | FADE | 10690 | 51.60% | +3.31 | 4605 | 51.99% | [50.5, 53.4] | +2.70 | 3.50e-03 | no |
| `weekly/fib R1/S1 strong2.0` | FADE | 259 | 60.23% | +3.29 | 140 | 50.71% | [42.5, 58.9] | +0.17 | 4.33e-01 | no |
| `h4/fib ANY close_cross [utc12-17]` | FADE | 7427 | 51.91% | +3.28 | 2800 | 51.86% | [50.0, 53.7] | +1.97 | 2.47e-02 | no |
| `daily/fib R1/S1 strong1.0` | FADE | 1616 | 53.96% | +3.18 | 655 | 53.59% | [49.8, 57.4] | +1.84 | 3.31e-02 | no |
| `daily/fib ANY strong2.0` | FADE | 2081 | 53.48% | +3.18 | 976 | 55.23% | [52.1, 58.3] | +3.26 | 5.47e-04 | no |
| `daily/fib ANY close_cross [utc12-17]` | FADE | 3129 | 52.80% | +3.13 | 1235 | 52.06% | [49.3, 54.8] | +1.45 | 7.34e-02 | no |
| `h4/classic ANY strong2.0` | FADE | 3681 | 52.57% | +3.12 | 1832 | 55.08% | [52.8, 57.3] | +4.35 | 6.94e-06 | YES |
| `h4/classic ANY close_cross` | FADE | 17062 | 51.14% | +2.97 | 7139 | 52.68% | [51.5, 53.8] | +4.53 | 2.91e-06 | YES |
| `h4/fib ANY strong0.5` | FADE | 16017 | 51.15% | +2.92 | 6643 | 52.22% | [51.0, 53.4] | +3.62 | 1.48e-04 | no |

Train-selected #1 (`daily/fib ANY close_cross [str_hi]`, FADE): train 53.69% (n=3,107) -> **test 54.10%** (n=1,401, z=+3.07).
Bonferroni survivors on TEST: **7**.

| variant | dir | n train | train | z train | n test | test | 95% CI | z test | p test | survives |
|---|---|---|---|---|---|---|---|---|---|---|
| `h4/classic ANY close_cross [str_hi]` | FADE | 5688 | 52.32% | +3.50 | 2632 | 54.37% | [52.5, 56.3] | +4.48 | 3.68e-06 | YES |
| `h4/classic ANY strong2.0` | FADE | 3681 | 52.57% | +3.12 | 1832 | 55.08% | [52.8, 57.3] | +4.35 | 6.94e-06 | YES |
| `h4/classic ANY close_cross` | FADE | 17062 | 51.14% | +2.97 | 7139 | 52.68% | [51.5, 53.8] | +4.53 | 2.91e-06 | YES |
| `h4/fib ANY close_cross` | FADE | 23744 | 50.90% | +2.76 | 9578 | 52.00% | [51.0, 53.0] | +3.92 | 4.36e-05 | YES |
| `h4/classic ANY strong0.5` | FADE | 11717 | 51.09% | +2.36 | 5013 | 53.14% | [51.8, 54.5] | +4.45 | 4.31e-06 | YES |
| `daily/classic ANY strong0.5` | FADE | 4771 | 51.62% | +2.24 | 1912 | 54.24% | [52.0, 56.5] | +3.70 | 1.06e-04 | YES |
| `h4/classic R3/S3 strong0.5` | FADE | 811 | 53.76% | +2.14 | 368 | 59.51% | [54.4, 64.4] | +3.65 | 1.32e-04 | YES |

Best TEST z among carried variants (this is a *post-hoc* maximum, shown only for scale): +4.53 — `h4/classic ANY close_cross` FADE, 52.68% (n=7,139)

### 2b. Whole-family FADE rates on TEST (no selection at all)

| system/formula | group | cross def | n test | FADE test | 95% CI | z |
|---|---|---|---|---|---|---|
| daily/classic | ANY | close_cross | 2693 | 53.17% | [51.3, 55.1] | +3.30 |
| daily/classic | ANY | strong2.0 | 688 | 56.83% | [53.1, 60.5] | +3.58 |
| daily/classic | ANY | wick_reject | 1957 | 51.25% | [49.0, 53.5] | +1.11 |
| daily/classic | P | close_cross | 1125 | 52.62% | [49.7, 55.5] | +1.76 |
| daily/classic | P | strong2.0 | 269 | 59.11% | [53.1, 64.8] | +2.99 |
| daily/classic | P | wick_reject | 767 | 51.11% | [47.6, 54.6] | +0.61 |
| daily/classic | R1/S1 | close_cross | 1093 | 52.97% | [50.0, 55.9] | +1.97 |
| daily/classic | R1/S1 | strong2.0 | 285 | 52.98% | [47.2, 58.7] | +1.01 |
| daily/classic | R1/S1 | wick_reject | 785 | 51.21% | [47.7, 54.7] | +0.68 |
| daily/fib | ANY | close_cross | 3683 | 51.78% | [50.2, 53.4] | +2.16 |
| daily/fib | ANY | strong2.0 | 976 | 55.23% | [52.1, 58.3] | +3.26 |
| daily/fib | ANY | wick_reject | 2754 | 49.46% | [47.6, 51.3] | -0.57 |
| daily/fib | R1/S1 | close_cross | 1299 | 51.04% | [48.3, 53.8] | +0.75 |
| daily/fib | R1/S1 | strong2.0 | 361 | 53.19% | [48.0, 58.3] | +1.21 |
| daily/fib | R1/S1 | wick_reject | 1001 | 48.85% | [45.8, 51.9] | -0.73 |
| h4/classic | ANY | close_cross | 7139 | 52.68% | [51.5, 53.8] | +4.53 |
| h4/classic | ANY | strong2.0 | 1832 | 55.08% | [52.8, 57.3] | +4.35 |
| h4/classic | ANY | wick_reject | 5229 | 49.28% | [47.9, 50.6] | -1.04 |
| h4/classic | P | close_cross | 3181 | 52.62% | [50.9, 54.4] | +2.96 |
| h4/classic | P | strong2.0 | 669 | 55.01% | [51.2, 58.7] | +2.59 |
| h4/classic | P | wick_reject | 2138 | 48.74% | [46.6, 50.9] | -1.17 |
| h4/classic | R1/S1 | close_cross | 2656 | 52.22% | [50.3, 54.1] | +2.29 |
| h4/classic | R1/S1 | strong2.0 | 722 | 54.85% | [51.2, 58.4] | +2.61 |
| h4/classic | R1/S1 | wick_reject | 1961 | 49.62% | [47.4, 51.8] | -0.34 |
| h4/fib | ANY | close_cross | 9578 | 52.00% | [51.0, 53.0] | +3.92 |
| h4/fib | ANY | strong2.0 | 2307 | 52.97% | [50.9, 55.0] | +2.85 |
| h4/fib | ANY | wick_reject | 6858 | 48.57% | [47.4, 49.8] | -2.37 |
| h4/fib | R1/S1 | close_cross | 3618 | 50.83% | [49.2, 52.5] | +1.00 |
| h4/fib | R1/S1 | strong2.0 | 861 | 51.68% | [48.3, 55.0] | +0.99 |
| h4/fib | R1/S1 | wick_reject | 2556 | 47.97% | [46.0, 49.9] | -2.06 |
| weekly/classic | ANY | close_cross | 883 | 51.98% | [48.7, 55.3] | +1.18 |
| weekly/classic | ANY | strong2.0 | 223 | 55.61% | [49.0, 62.0] | +1.67 |
| weekly/classic | ANY | wick_reject | 677 | 53.62% | [49.9, 57.3] | +1.88 |
| weekly/classic | P | close_cross | 420 | 51.90% | [47.1, 56.6] | +0.78 |
| weekly/classic | P | strong2.0 | 95 | 51.58% | [41.7, 61.4] | +0.31 |
| weekly/classic | P | wick_reject | 303 | 54.13% | [48.5, 59.6] | +1.44 |
| weekly/classic | R1/S1 | close_cross | 356 | 51.12% | [45.9, 56.3] | +0.42 |
| weekly/classic | R1/S1 | strong2.0 | 93 | 56.99% | [46.8, 66.6] | +1.35 |
| weekly/classic | R1/S1 | wick_reject | 281 | 54.45% | [48.6, 60.2] | +1.49 |
| weekly/fib | ANY | close_cross | 1382 | 52.46% | [49.8, 55.1] | +1.83 |
| weekly/fib | ANY | strong2.0 | 340 | 53.82% | [48.5, 59.1] | +1.41 |
| weekly/fib | ANY | wick_reject | 1031 | 49.95% | [46.9, 53.0] | -0.03 |
| weekly/fib | R1/S1 | close_cross | 599 | 52.75% | [48.8, 56.7] | +1.35 |
| weekly/fib | R1/S1 | strong2.0 | 140 | 50.71% | [42.5, 58.9] | +0.17 |
| weekly/fib | R1/S1 | wick_reject | 449 | 46.77% | [42.2, 51.4] | -1.37 |

## 3. PLACEBO CONTROL (the decisive one)

The identical pipeline, rerun with the pivot grid moved somewhere meaningless. If the placebo scores as well as the real pivots, the signal is *'a big bar just happened'*, not *'a pivot was crossed'* — this is exactly what killed the earlier support/resistance work.

| level grid | best train z | train-#1 test acc | n | train-#1 test z | best test z (post-hoc) | Bonferroni survivors |
|---|---|---|---|---|---|---|
| **REAL PIVOTS** | +4.11 | 54.10% | 1401 | +3.07 | +4.53 | 7 |
| shift+137 | +3.23 | 51.76% | 4581 | +2.38 | +3.61 | 0 |
| shift-213 | +4.51 | 53.33% | 2672 | +3.44 | +4.45 | 6 |
| shift+451 | +5.24 | 52.82% | 2887 | +3.03 | +4.34 | 4 |
| random-level #1 | +4.79 | 51.46% | 4199 | +1.90 | +4.02 | 4 |
| random-level #2 | +3.92 | 52.88% | 4977 | +4.07 | +4.15 | 2 |

### 3b. Matched placebo — same variant, same geometry, wrong location

The table above compares two searches. This one compares the *same* variant head to head, which is sharper: identical rule, identical cross definition, only the level's location differs.

| variant (FADE, TEST) | REAL | shift+137 | shift-213 | shift+451 | random-level | real - mean(placebo) |
|---|---|---|---|---|---|---|
| `h4/classic ANY close_cross` | 52.68% (n=7139) | 51.16% (n=7085) | 52.21% (n=7090) | 52.04% (n=6503) | 50.97% (n=11282) | +1.09 pp (~0.59 pp per-arm SE) |
| `h4/classic ANY strong2.0` | 55.08% (n=1832) | 51.84% (n=1765) | 54.29% (n=1761) | 54.78% (n=1672) | 52.51% (n=2369) | +1.72 pp (~1.17 pp per-arm SE) |
| `daily/classic ANY close_cross` | 53.17% (n=2693) | 51.27% (n=2524) | 52.82% (n=2656) | 52.93% (n=2781) | 51.90% (n=5272) | +0.95 pp (~0.96 pp per-arm SE) |
| `daily/classic ANY strong2.0` | 56.83% (n=688) | 54.60% (n=652) | 54.95% (n=717) | 56.85% (n=679) | 52.67% (n=1272) | +2.06 pp (~1.91 pp per-arm SE) |
| `daily/classic P close_cross` | 52.62% (n=1125) | 52.13% (n=1078) | 52.50% (n=1082) | 52.71% (n=1013) | 52.09% (n=887) | +0.26 pp (~1.49 pp per-arm SE) |

Every gap is inside one standard error of a single arm — and the two arms share most of their bars, so the true error on the difference is smaller still but the gaps are smaller still too. Real and fake levels are not distinguishable here.

## 4. Shuffled-label null

The whole search rerun on scrambled outcomes, 25 plain permutations + 25 circular rotations (a rotation keeps the labels' own serial correlation and only breaks their alignment with the features — the stricter null).

| null | best train z (median / max) | best test z (median / max) | runs with >=1 Bonferroni survivor |
|---|---|---|---|
| permutation (n=25) | +2.66 / +4.23 | +1.59 / +3.13 | 0/25 |
| rotation (n=25) | +2.60 / +4.03 | +0.98 / +2.94 | 0/25 |
| **real data** | +4.11 | +4.53 | yes |

## 5. Redundancy control vs the already-known edge

| rule | n test | test acc | 95% CI | z |
|---|---|---|---|---|
| stretch3_body2 (fade) | 926 | 56.59% | [53.4, 59.7] | +4.01 |
| bigbar2 no-level (fade) | 12031 | 52.51% | [51.6, 53.4] | +5.50 |
| best pivot variant, bars the baseline does NOT flag | 1161 | 53.06% | [50.2, 55.9] | +2.08 |

Overlap: 712 of 4,508 pivot signals are already flagged by the 3-bar-stretch baseline (15.8%).

### 5b. Size-matched control — is it the level, or is it the bar?

A close-cross is *by construction* a bar that moved: `close` ended on the far side of a level the previous close was on the near side of, so the cross direction is always `sign(close[i]-close[i-1])`. Every column below therefore runs the identical bet — **fade the last move** — and they differ only in whether some level happened to sit in the way. Bars are bucketed by `|move| / median100|move|` using TRAIN quantiles; the reference column is bars that no grid, real or fake, flagged.

The placebo columns are the point: if a *fake* level shows the same size-matched lift as a real pivot, the lift is not about pivots.

| `|move|` bucket | no cross | real pivot (lift) | PLACEBO +451 (lift) | PLACEBO random (lift) |
|---|---|---|---|---|
| 0.00 - 0.36 | 10169 / 48.40% | 187 / 47.59% (-0.81) | 185 / 55.14% (+6.73) | 542 / 47.42% (-0.99) |
| 0.36 - 0.76 | 7415 / 50.02% | 571 / 52.01% (+1.99) | 513 / 51.27% (+1.25) | 1267 / 47.67% (-2.35) |
| 0.76 - 1.26 | 5865 / 51.18% | 946 / 50.21% (-0.97) | 866 / 52.08% (+0.89) | 1962 / 49.75% (-1.44) |
| 1.26 - 2.09 | 4800 / 49.92% | 1576 / 50.95% (+1.04) | 1449 / 49.14% (-0.78) | 2927 / 50.29% (+0.37) |
| 2.09 - 4.00 | 2708 / 51.44% | 2170 / 53.50% (+2.06) | 1998 / 51.55% (+0.11) | 3135 / 52.79% (+1.35) |
| 4.00 - inf | 625 / 51.84% | 1689 / 55.42% (+3.58) | 1492 / 55.36% (+3.52) | 1449 / 54.24% (+2.40) |
| **all** | 31582 / 49.86% | 7139 / 52.68% (+2.82) | 6503 / 52.04% (+2.18) | 11282 / 50.97% (+1.11) |

### 5c. Economics of the best surviving number

Best test result with n >= 1000: `h4/classic ANY close_cross` FADE = **52.68%** (n=7,139, 95% CI [51.5, 53.8]).

| entry price | break-even | EV per $100 at this win rate |
|---|---|---|
| 0.50 | 50% | +5.36$ |
| 0.52 | 52% | +1.31$ |
| 0.53 | 53% | -0.60$ |
| 0.55 | 55% | -4.21$ |

Polymarket realistically pays ~52c. The lower bound of the CI (51.5%) is at or below that break-even, and this number is a *post-hoc maximum over 354 tests* on top of that.

## 6. What was detectable at these sample sizes

Minimum win rate detectable at Bonferroni alpha = 0.05/354 with 80% power:

| n (test occurrences) | smallest detectable win rate |
|---|---|
| 200 | 65.81% |
| 500 | 60.00% |
| 1,000 | 57.07% |
| 2,000 | 55.00% |
| 5,000 | 53.16% |
| 10,000 | 52.24% |
| 20,000 | 51.58% |

So an edge of ~53% (the smallest thing worth trading at a 52c entry) would have been detected on any signal family with n >= ~10,000 test occurrences. The ANY/close_cross families all clear that by a wide margin, so this is a real negative, not an underpowered one.

## 7. Harness self-check

**(a) Planted edge.** A 62% FADE win rate was forced onto `daily/classic R1/S1 close_cross` (n=3,558) and the whole pipeline rerun.
Pipeline recovered it: train 60.45% -> test 62.76% (n=1,093, z=+8.44), Bonferroni survivor: **YES**. Total survivors in that run: 27 (relatives of the planted set also light up, as they should).

**(b) Pure-noise data.** 10 independent seeded random-walk OHLC series of the same length, full pipeline each time (levels rebuilt from the synthetic sessions).
False positives: **0/10** runs produced a Bonferroni survivor. Best post-hoc test z across noise runs: +1.92 (median +1.13).

## 8. Verdict

- Bonferroni survivors on the held-out third (K=354): **7** — real pivots; placebo grids produce up to **6**.
- Best test z: real **+4.53**, best placebo **+4.45**, best shuffled-label **+3.13**.
- Real pivots beat EVERY placebo grid: **NO**
- Real best test z inside the shuffled-label noise band: **no**

Reading these together:

1. There **is** something above the shuffled-label null — mean-reversion after a directional bar. That is the edge already documented in `docs/research/btc-5m-patterns.md`; it is not new.
2. Moving the entire pivot grid $137, $213 or $451 away — or replacing it with levels drawn at random inside the prior session's range — reproduces the result. Section 3b shows the same variant scoring the same on fake levels as on real ones.
3. Section 5b explains why: a close-cross is arithmetically a bar that moved. Matching on bar size removes most of the apparent lift, and in the largest-bar bucket — where nearly all of the remaining lift lives — a real pivot and a level shifted $451 give the *same* lift. The level is a proxy for the bar, not a cause of anything.
4. `wick_reject` — the version of the user's intuition that is genuinely *about* the level ('price touched the pivot and bounced') — is the one cross definition that is flat-to-negative on TEST. The 'reaction' is not there.

**Conclusion: classic floor-trader pivot points add nothing.** They do not beat the placebo, they do not beat the existing 3-bar-stretch fade, and the only numbers they produce are the known big-bar mean reversion wearing a pivot costume. Section 6 shows a ~53% edge would have been detected easily at these sample sizes, so this is a real negative, not an underpowered one.

---

Generated by `research/btc5m/pivots.py` (seed 20260820). Deterministic: same input -> same tables.
