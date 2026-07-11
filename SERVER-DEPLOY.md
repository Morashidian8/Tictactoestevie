# PolyBot Server Deployment Guide

Deployment branch (`server-phase3`) — Phase 1 shadow-mode server, real Polymarket odds,
real Binance candles, paper money only. Real-money execution (Phase 3/4) is NOT yet built —
see polybot/RISKS.md "پیش‌نیازهای مهندسی فاز ۳" for what's still required before real capital.

## Quick Start

```bash
# Local testing with Docker
docker-compose up

# VPS deployment (Ubuntu 22.04+)
bash scripts/setup-vps.sh
```

## What's on this branch

- **polybot/** — Full strategy engine, API, tests (identical to the dev branch)
- **polybot/DEPLOY.md** — VPS deployment checklist (Persian)
- **polybot/RISKS.md** — Risk register & $1,400 capital plan
- **Dockerfile / docker-compose.yml** — Container setup
- **polybot.service** — systemd unit file
- **Caddyfile.example** — HTTPS reverse proxy config
- **.env.example** — POLYBOT_TOKEN template
- **scripts/setup-vps.sh** — One-shot VPS bootstrap

## Status: Shadow mode only

This server runs with **paper money** against **real live odds**. It does NOT place real
orders and cannot withdraw funds. Real execution requires the Phase 3 engineering
checklist in polybot/RISKS.md (state persistence, Polymarket-native settlement,
order idempotency, hard server-side caps, Telegram alerts) — none of that exists yet.

## Security

- SSH key-only auth, UFW firewall, fail2ban
- POLYBOT_TOKEN required on every endpoint
- Runs on 127.0.0.1 only; HTTPS via Caddy
- No wallet key on this server (shadow mode)
