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
