# PolyBot

Strategy-driven Bitcoin **up/down** trading bot for **Polymarket**. You define a strategy;
the bot evaluates each closed candle and places the matching bet. See [PLAN.md](./PLAN.md)
for the full architecture, decisions, and risks.

> ⚠️ **Read the risks in PLAN.md first.** The default martingale sizing can wipe the
> account, and candle-colour strategies have no proven edge. Start in paper mode.
> This is not financial advice.

## Status

| Phase | What | State |
| ----- | ---- | ----- |
| 1 | Paper-trading core (candles, strategy engine, sizing, executor, engine, backtest, tests) | ✅ done |
| 2 | FastAPI control API + WebSocket for the app | ✅ done |
| 3 | Android app (Kotlin/Compose) — strategy builder + dashboard (in-app paper engine) | ✅ done |
| 3.5 | Wire the Android app to the control API (replace the in-app engine) | ⏳ next |
| 4 | Live Polymarket executor (py-clob-client, wallet/secrets on server) | ⏳ planned |

## Quick start

```bash
pip install -r polybot/requirements.txt

# Run the tests
python -m pytest polybot/tests

# Backtest offline on synthetic candles (no network)
python -m polybot.backtest --demo --limit 500 --balance 100 --stake 1

# Backtest on real Binance BTC candles
python -m polybot.backtest --interval 5m --limit 500 --balance 100 --stake 1 --min-streak 1
```

## Control API (Phase 2)

The bot is served over REST + WebSocket so the Android app (or any client) can drive it.

```bash
pip install -r polybot/requirements.txt
uvicorn polybot.api:app --reload      # http://127.0.0.1:8000  · interactive docs at /docs
```

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET  | `/status` | current portfolio + risk + wallet + recent trades |
| GET/POST | `/config` | read / set the bot config (strategy, sizing, risk, privacy) |
| POST | `/start` | build (optional config in body) and start the tick loop |
| POST | `/stop` | pause the loop |
| POST | `/reset` | rebuild from current config |
| POST | `/kill` | trip the kill switch (panic stop) |
| WS   | `/ws` | live state pushed every tick |

Example config body (`POST /start`):

```json
{
  "strategy": "same_color", "min_streak": 1,
  "sizing": "martingale", "base_stake": 1, "max_steps": 6,
  "starting_balance": 100, "stake_jitter": 0.15, "rotate_wallet": true,
  "risk": {"max_stake_per_trade": 5, "max_daily_loss": 20, "daily_profit_target": 15,
           "max_consecutive_losses": 5},
  "tick_seconds": 1.0
}
```

## Defining a strategy

**Built-in** — "after a red candle, bet the next one red too":

```python
from polybot import SameColorStrategy
strategy = SameColorStrategy(min_streak=1)       # follow the last colour
```

**Rule DSL** (safe to accept from the app — no code execution):

```python
from polybot import RuleStrategy
strategy = RuleStrategy.from_dict({
    "name": "red-follow",
    "rules": [
        # if the last candle closed red, bet the same direction (down)
        {"when": {"all": [{"last_color": "red"}, {"streak_at_least": 1}]}, "signal": "same"},
        # otherwise (e.g. 3+ greens in a row) fade it
        {"when": {"streak_at_least": 3}, "signal": "opposite"},
    ],
})
```

DSL conditions: `last_color`, `streak_at_least`/`streak_equals`, `alternation_at_least`,
`sma_cross`, combined with `all`/`any`/`not`. Signals: `up`, `down`, `same`, `opposite`, `none`.

## Safety layer (caps · kill switch · wallet rotation)

A `RiskManager` sits **below** the strategy — even a buggy strategy or sizer can't place
a bet it rejects. A `WalletManager` rotates the active wallet (daily / on a profit cap) so
only a small balance is ever exposed. Both run in paper mode and are unit-tested.

```python
from polybot import (TradingEngine, Portfolio, MartingaleSizer, PaperExecutor,
                     SameColorStrategy, RiskManager, RiskLimits, WalletManager)

risk = RiskManager(RiskLimits(
    max_stake_per_trade=5,        # hard cap per bet (beats a runaway martingale)
    max_daily_loss=20,            # halt for the day after losing this much
    daily_profit_target=15,      # stop/rotate once the day is green enough
    max_consecutive_losses=5,    # circuit breaker
    max_trades_per_window=10, window_seconds=60,   # runaway protection
    min_balance=1,
))

engine = TradingEngine(
    strategy=SameColorStrategy(min_streak=1),
    sizer=MartingaleSizer(base_stake=1, max_steps=6),
    portfolio=Portfolio(starting_balance=100),
    executor=PaperExecutor(),
    risk=risk,
    wallet=WalletManager(daily_profit_cap=15),   # privacy / blast-radius
    stake_jitter=0.15,                            # randomise stake to blur the footprint
)

risk.trip_kill_switch()   # panic stop — no new bets until reset_kill_switch()
```

When the risk layer blocks a bet, `engine.last_halt_reason` says why
(`kill_switch`, `daily_loss`, `daily_profit_target`, `max_consecutive_losses`,
`rate_limit`, `min_balance`). See PLAN.md for the full threat model.

## Wiring it together

```python
from polybot import TradingEngine, Portfolio, MartingaleSizer, PaperExecutor, SameColorStrategy

engine = TradingEngine(
    strategy=SameColorStrategy(min_streak=1),
    sizer=MartingaleSizer(base_stake=1, max_steps=6),   # ⚠️ doubles after losses
    portfolio=Portfolio(starting_balance=100),
    executor=PaperExecutor(payout_multiple=1.95),
)
for c in candles:          # feed closed candles oldest -> newest (live or historical)
    engine.on_candle(c)
print(engine.portfolio.summary())
```
