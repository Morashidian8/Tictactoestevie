# Deploying PolyBot (from your phone)

The bot's brain (the FastAPI backend) runs on a cloud server with open internet, so it can
reach Polymarket. Your phone runs the Android app and points at that server. Everything
below can be done from a mobile browser.

> **PAPER MODE.** This deploys the simulator + read-only Polymarket data. No wallet, no
> money. Real-money trading (Phase 4) is a separate, gated step.

## Option A — Render (easiest from a phone)

1. Open **https://render.com** and sign up (use *Sign in with GitHub*).
2. Tap **New +** → **Blueprint**.
3. Connect the repo **`Morashidian8/Tictactoestevie`**. Render reads `render.yaml`
   automatically. Tap **Apply**.
4. Wait for the build to go green. You get a public URL like
   **`https://polybot-api-xxxx.onrender.com`**.

### Verify it works (from the phone browser)
- Open `…/status` → you should see JSON (`{"running": false, ...}`).
- Open `…/docs` → the interactive API page.
- Open `…/polymarket/markets` → the **real** Bitcoin up/down markets from Polymarket.
  This is the proof that real Polymarket data is flowing. Each market lists its
  `token_ids` and `outcomes` (e.g. `Up`, `Down`).

### Use it — no install needed ✅
- **Just open your Render URL in the phone browser.** The server serves a full
  **web control panel** at `/` — configure the strategy, Start/Stop, kill switch, live
  dashboard, and the Polymarket market list. Nothing to install, no antivirus prompt.
- (Optional) The native Android app is also available as an APK from the GitHub Actions
  **Artifacts** (`polybot-debug-apk`) — switch its top bar to **Server** and paste the URL.
  Use the web panel if the APK is blocked by antivirus/Play Protect.

### About "always on"
Render's **free** plan sleeps after ~15 min idle (≈1‑min cold start on the next request).
For short attended sessions that's usually fine — while the app holds the WebSocket the
service stays awake. For guaranteed no‑downtime, change `plan: free` → a paid instance in
`render.yaml` (≈$7/mo), or use a usage‑based host (below) and only pay for the hours you run.

## Option C — Replit (no credit card, phone-friendly)

Replit doesn't ask for a card and imports straight from GitHub.

1. Open **replit.com** and sign up (Google/GitHub login).
2. Tap **Create** (or **+**) → **Import from GitHub**.
3. Paste the repo URL: `https://github.com/Morashidian8/Tictactoestevie` → **Import**.
4. Replit reads `.replit` and runs `start.sh` (installs deps + starts the server).
   Tap the green **Run** button.
5. Wait for it to install and start. A **Webview** opens with a URL like
   `https://tictactoestevie.<your-user>.repl.co`.
6. Open that URL → the PolyBot web panel. Verify real data at `…/polymarket/markets`.

> Free Repls sleep when you close the tab and wake on the next visit — fine for short
> sessions. Keep the tab open while a session runs.

## Option B — Usage-based (cheapest for a few hours/day): Railway or Fly.io

Both can deploy the included **`Dockerfile`** and bill per running time, so a couple of
short sessions a day costs cents.

- **Railway:** railway.app → New Project → Deploy from GitHub repo → it builds the
  Dockerfile → set the start command if asked: `uvicorn polybot.api:app --host 0.0.0.0 --port $PORT`.
- **Fly.io:** needs the `fly` CLI (harder from a phone). `fly launch` detects the Dockerfile.

## Switching the bot to real Polymarket data

1. Call `…/polymarket/markets` and copy a `token_id` for the outcome you want to track.
2. Start the bot with that source (the app's **Data source** card, or `POST /start`):

```json
{ "source": "polymarket", "market_token_id": "<TOKEN_ID>", "base_stake": 1,
  "run_minutes": 90, "risk": {"max_stake_per_trade": 5, "max_daily_loss": 20} }
```

The bot then samples that token's real price each tick and trades on it (still paper).

## Files

- `render.yaml` — Render blueprint (no Docker needed)
- `Dockerfile` / `Procfile` — for Docker/usage-based hosts
- `.dockerignore` — keeps the image small (excludes the Android app, etc.)
