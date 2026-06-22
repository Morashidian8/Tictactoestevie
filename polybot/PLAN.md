# PolyBot — Bitcoin up/down trading bot for Polymarket

A strategy-driven bot that trades Bitcoin **up/down** prediction markets on **Polymarket**.
You define a strategy; the bot evaluates each closed candle and places the matching bet.

## Decisions (agreed with the user)

| Topic | Decision |
| ----- | -------- |
| Platform | **Polymarket** BTC up/down markets (candle "red" = bet **Down**, "green" = bet **Up**) |
| Architecture | **Backend service + Android app.** The bot runs 24/7 on a server; the Android app only defines strategies, starts/stops, and monitors. |
| First milestone | **Paper trading** (simulated money against real Binance candles). Live trading comes later. |
| Strategy engine | **Advanced** — a configurable rule engine (DSL) plus pluggable Python strategies. |
| Position sizing | **Martingale** (double the stake after a loss). ⚠️ High risk of ruin — see Risks. |
| Timeframe | **5m and 15m** candles. |

## ⚠️ Risks & honest caveats

1. **No statistical edge.** "Red closed → bet red again" treats candle direction as
   predictable; it is close to random. The bot executes faithfully but profitability is
   not implied. This is not financial advice.
2. **Martingale can wipe the account.** Doubling after losses grows exposure exponentially;
   a short losing streak hits limits or drains the balance. The engine enforces a
   configurable max-step / max-stake cap and stops when balance is insufficient.
3. **Polymarket market cadence.** Polymarket's BTC up/down markets are generally **hourly /
   daily**, not 5m/15m. Paper trading on 5m/15m candles works fine (we simulate). **Live**
   trading at 5m/15m depends on such markets actually existing on Polymarket — to be
   verified before going live. If they don't exist, live falls back to the nearest
   available cadence.
4. **Custody & secrets.** Live trading needs a funded Polygon wallet + USDC + signing keys.
   These live on the **server**, never in the Android app. Region restrictions may apply.

## Privacy-aware design (Phase 4)

Goal: make a successful strategy **hard to copy or track**, while being honest that
on-chain trades are public and can never be made fully invisible. The user handles
wallet funding/cash-out independently; the bot provides the operational pieces.

- **Daily wallet rotation.** A wallet manager rotates the active trading wallet on a
  schedule or when a daily profit/volume cap is hit. Only the day's working balance is
  ever hot (this also caps blast radius if a key leaks — see security below).
- **Behaviour randomisation.** Jitter the entry timing (no fixed "fraction of a second
  after the candle") and randomise stake within a band, so the on-chain footprint is not
  a clean, clusterable signature.
- **Daily profit cap.** User-set ceiling; once reached, stop for the day / rotate.
- **Honest limits.** Funding-source and cash-out linkage, plus behavioural clustering,
  can still associate wallets. This design defeats leaderboard/copy-trading, not a
  determined chain-analysis adversary. Multi-wallet use may also conflict with
  Polymarket's terms / regional rules — the user's responsibility.

## Fund safety & security threat model (Phase 4)

The bot can lose funds two ways: **market losses** (strategy/martingale — see Risks) and
**security failures**. The latter and their mitigations:

| Threat | Mitigation |
| ------ | ---------- |
| **Private-key compromise** (server breach, leaked env/logs, bad dependency) — drains the whole wallet | Keys in a secrets manager/KMS or a separate signer; never in code, logs, or the app. Keep only the day's balance hot (rotation limits the loss). |
| **Order-sizing bug** (decimal/units error, runaway loop, martingale past intent) | Hard caps enforced *below* the executor: max stake per trade, max daily loss, max open exposure, max bets/min. Kill-switch + circuit breaker. |
| **Wrong-market / wrong-outcome bet** | Verify market id + outcome token before signing; assert the candle window matches. |
| **Over-broad ERC-20 approvals** (USDC) | Approve exact/limited amounts to the known CLOB contract only; no infinite approvals. |
| **Exposed control API** (the app's backend) | Authenticated + TLS, not publicly reachable; least privilege; the app never holds keys. |
| **Supply-chain / dependency** | Pin and audit deps; minimal surface; reproducible builds. |
| **Protocol/counterparty risk** | Polymarket contract risk is outside our control — size accordingly. |

Rollout: testnet → tiny real canary with caps → scale slowly. The kill-switch and caps
ship **before** any live key is loaded.

## Architecture

```
┌─────────────────┐         REST + WebSocket          ┌──────────────────────────┐
│  Android app    │  ───────────────────────────────► │  Backend service (this)  │
│  (Kotlin/Compose)│ ◄─────────────────────────────── │  FastAPI + TradingEngine │
│  strategy UI,   │     status / trades / PnL          │                          │
│  start/stop,    │                                    │  candle feed (Binance)   │
│  monitoring     │                                    │  strategy engine (DSL)   │
└─────────────────┘                                    │  martingale sizing       │
                                                       │  executor:               │
                                                       │   • PaperExecutor (now)  │
                                                       │   • PolymarketExecutor   │
                                                       │     (live, later)        │
                                                       └──────────────────────────┘
```

## Backend modules (`polybot/`)

- `candles.py` — fetch closed BTC candles from Binance (5m/15m); colour = green/red. Live poll + historical.
- `indicators.py` — sma, ema, streak, same-colour run length, etc.
- `strategy.py` — `Strategy` interface; `RuleStrategy` built from a JSON DSL; built-in `SameColorStrategy`.
- `sizing.py` — `FixedSizer`, `MartingaleSizer`, `PercentSizer`.
- `portfolio.py` — balance, open position, trade log, realised/unrealised PnL.
- `execution.py` — `Executor` interface; `PaperExecutor` (resolves a bet against the actual next candle); `PolymarketExecutor` (live stub with documented py-clob-client integration points).
- `engine.py` — `TradingEngine`: on each closed candle → resolve previous bet, update portfolio, ask strategy for a signal, size it, place the next bet.
- `backtest.py` — run the engine over historical candles and report stats.
- `api.py` — FastAPI control surface the Android app talks to.
- `config.py` — configuration / env.
- `tests/` — unit tests for indicators, strategy, sizing, paper executor, engine resolution.

## Phases

1. **Backend paper-trading core** (this milestone) — candles, strategy engine, martingale
   sizing, paper executor, engine, backtest, tests. ✅ buildable & testable with no funds.
2. **Control API** — FastAPI endpoints + WebSocket for the app.
3. **Android app** — Kotlin/Compose: strategy builder, dashboard, start/stop, live trades.
4. **Live Polymarket executor** — py-clob-client integration, wallet/secrets on server,
   small-stake canary, kill-switch. Only after paper results are understood.
```
