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
| 2 | FastAPI control API + WebSocket for the app | ⏳ next |
| 3 | Android app (Kotlin/Compose) — strategy builder + dashboard | ⏳ planned |
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
