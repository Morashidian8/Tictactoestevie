# PolyBot — Android app

The control & monitoring app for PolyBot (Phase 3). Kotlin + Jetpack Compose (Material 3).

It runs in two modes, switchable from the top bar:

- **Local** — a self-contained paper engine (Kotlin port of `polybot`) that runs and shows
  live trades **without a backend**. Great for trying the UI offline.
- **Server** — drives the FastAPI backend (`polybot/api.py`): REST for commands, WebSocket
  for live state. Enter the server URL in the bar (emulator → `http://10.0.2.2:8000`,
  which maps to your machine's `localhost`).

> ⚠️ **PAPER MODE ONLY** — simulated money, no real funds. The default martingale sizing
> can wipe the (simulated) balance; that's intentional and visible. Not financial advice.

## Screens

- **Dashboard** — live equity, PnL, win rate, W/L, current martingale step, last candle
  colour, and a rolling list of recent trades. Start / Stop / Reset.
- **Strategy** — build the strategy: Follow vs Fade the last candle, minimum streak
  trigger, martingale on/off + max doublings, base stake, and starting balance.

## How it works

`BotController` (a `ViewModel`) runs a coroutine that pulls a synthetic candle each tick,
feeds the `TradingEngine` (`strategy → sizing → paper execution → portfolio`), and
publishes a `BotUiState` the Compose UI observes. The engine mirrors `polybot/` in Python.

## Run it

Requires Android Studio (Hedgehog+) with an Android SDK — not buildable in the cloud
session (no SDK there).

```bash
# Open the ./android folder in Android Studio, let Gradle sync, then Run on a
# device/emulator. Or from the command line with the SDK installed:
cd android
./gradlew :app:assembleDebug      # builds app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:installDebug       # install on a connected device/emulator
```

To preview the UI without running, open `DashboardScreen.kt` / `StrategyScreen.kt` and use
the `@Preview` panes in Android Studio.

## Stack

Kotlin 1.9.24 · AGP 8.5.2 · Compose BOM 2024.09 · Material 3 · minSdk 26 · targetSdk 34 ·
Gradle 8.9 (wrapper included) · version catalog (`gradle/libs.versions.toml`).

## Networking

`net/PolyBotApi.kt` is an OkHttp + kotlinx.serialization client for the control API
(`/start`, `/stop`, `/reset`, `/kill`, `/status`, and the `/ws` snapshot stream).
`bot/RemoteBotController.kt` maps it onto the same `BotControl` surface the UI uses, so the
local and server controllers are interchangeable. Requires the `INTERNET` permission;
`usesCleartextTraffic` is enabled for local `http://` dev servers.

## Next

- A full strategy DSL editor mapping to the backend's rule engine.
- Auth on the control API + HTTPS before any non-local use.
