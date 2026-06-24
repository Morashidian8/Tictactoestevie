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
| FacilityOS (CMMS+CAFM) | `cafm_platform/` | Design & architecture package for an enterprise, offline-first Android CMMS + CAFM platform (buildings, assets, inspections, PM/CM, HSE, fire compliance). Docs-only; see `cafm_platform/README.md` and `cafm_platform/CONTEXT.md`. |

When a skill needs the domain language for a given area, read the `CONTEXT.md` for the matching
context above. If it doesn't exist yet, proceed silently (see `docs/agents/domain.md`).
