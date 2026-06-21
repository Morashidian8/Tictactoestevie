# PolyBot — Android app

The control & monitoring app for PolyBot (Phase 3). Kotlin + Jetpack Compose (Material 3).

It ships with a **self-contained paper-trading engine** (a Kotlin port of the `polybot`
core) so it runs and shows live trades **without a backend**. The networked version that
talks to the FastAPI backend comes later.

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

## Next

- Replace the synthetic feed with a `RemoteCandleFeed` + `RemoteBot` client hitting the
  FastAPI backend (Phase 2) over REST/WebSocket.
- Strategy DSL editor mapping to the backend's rule engine.
