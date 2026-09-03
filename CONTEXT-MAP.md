# Context Map

This repo is **multi-context**: it holds several distinct sub-projects. Each context owns its
own `CONTEXT.md` (domain language) and, optionally, a `docs/adr/` directory for decisions scoped
to that context. System-wide decisions live in the root `docs/adr/`.

`CONTEXT.md` files are created lazily by `/domain-modeling` as domain terms actually get resolved —
the entries below are seeded as placeholders and may not all exist yet.

| Context | Path | What it is |
| ------- | ---- | ---------- |
| Candle alert bot | `./` (root) | Telegram bot that watches 5-minute Binance BTC candles and alerts on alternation runs (`bot.py`, `predict_bot.py`, `predictor.py`, `analyze_history.py`). |
| HSE inspection | `hse_inspection/` | HSE inspection tooling. |
| HSE PWA | `hse_pwa/` | Progressive web app for HSE inspection. |
| Manhole PWA | `manhole_pwa/` | Progressive web app for manhole inspection. |
| PWA | `pwa/` | Shared / generic PWA assets. |
| Wallet tracker | `wallet_tracker/` | Standalone PWA + FastAPI backend that reports a Polymarket wallet's USDC cash balance and the FIFO-accurate realized PnL of its trades over a chosen time window. No dependency on `polybot`. |
| Mabhas 17 gas app | `mabhas17/privacy.html` only | Offline Persian calculator for **مبحث ۱۷** (natural-gas piping, Iranian National Building Code). Sold on Cafe Bazaar, so the source lives in the **private** repo `Morashidian8/mabhas17`. Only the privacy policy stays here — the store listing needs a public URL for it, served by Pages at `/mabhas17/`. |
| PolyBot | `polybot_web/` | Self-contained browser strategy simulator/backtester for Polymarket's 5-minute BTC up/down markets (`follow1`..`follow15`, day×hour scanner). Published to Pages under `/polybot/`. |
| Trading research | `docs/research/`, `research/btc5m/` | Empirical findings on BTC 5-minute candle predictability, with the frozen dataset and reproduction scripts. See `docs/research/btc-5m-patterns.md` and the `btc-patterns` skill. |

When a skill needs the domain language for a given area, read the `CONTEXT.md` for the matching
context above. If it doesn't exist yet, proceed silently (see `docs/agents/domain.md`).
