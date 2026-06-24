# FacilityOS — Android client (Phase 1 MVP scaffold)

Offline-first Android app scaffold for the FacilityOS CMMS + CAFM platform. Implements the
architecture in [`../docs`](../docs): **Jetpack Compose + Material 3**, **MVVM/Clean**, **Room**
(local source of truth), **Hilt** (DI), **WorkManager** (sync), **Retrofit** (remote).

This is a runnable skeleton of the Phase-1 hot path (see `../docs/12-roadmap.md`), not the full
product. It demonstrates the offline-first plumbing end to end so feature modules can be filled in.

## What's implemented

All screens run **fully offline** from seeded Room data, reachable via a 5-tab bottom nav
(Home · Buildings · Work · Status · More).

- **App shell**: Hilt application + WorkManager factory, Compose theme with status colors, bottom-nav
  Nav graph.
- **Dashboards (Home)**: four role views (Technician / Supervisor / Manager / Executive) with KPIs
  computed live from Room — asset health score, PM compliance, availability, MTBF/MTTR, risk score,
  asset value, maintenance & deferred cost, critical-fault and open-WO lists.
- **Building Status Center**: per-building subsystem health-light grid (elevators, generators,
  mechanical, fire alarm, PM, inspections).
- **Buildings**: list (search + sync pill) → detail with asset list.
- **Assets**: detail (identification, criticality, open faults) with Inspect / Report-fault actions.
- **QR scan**: resolve a code to an asset (manual entry now; CameraX + ML Kit wiring noted).
- **Dynamic inspection engine**: renders a checklist template (pass/fail/NA, numeric, text) and
  submits **offline** — writes to Room + queues an idempotent `sync_operation`.
- **Work**: tabbed work orders + faults (corrective maintenance), reported offline.
- **More hub**: Inventory (low-stock alerts) · HSE incidents · Fire compliance (status badges) ·
  Utilities (consumption bars) · Notifications (derived alerts) · Map (offline building list).
- **Sync engine**: `SyncWorker` runs the push/pull delta protocol against `/sync/*`
  (`../docs/09-offline-sync.md`); periodic + on-demand via `SyncScheduler`. Disabled in offline mode.

## Package layout (`io.facilityos.app`)

```
core/
  designsystem/  theme + reusable components (StatusDot, CriticalityChip, SyncPill)
  model/         pure-Kotlin domain models + enums
  database/      Room: entities, DAOs, converters, FacilityDatabase
  network/       Retrofit API, DTOs + mappers, AuthInterceptor
  data/          SessionStore (tokens)
  sync/          SyncEngine, SyncWorker, SyncScheduler
data/            repositories (Building/Asset/Inspection/Fault) + entity↔domain mappers
di/              Hilt module (db, retrofit, okhttp, json)
feature/         buildings · assets · inspections · scan  (Screen + ViewModel each)
navigation/      FacilityOsNavGraph + Routes
```
A single `:app` module for clarity; split into `:core:*` / `:feature:*` Gradle modules per
`../docs/14-source-code-structure.md` as the team grows.

## Offline-only mode (current default)

The app ships in **fully offline** mode — it never touches the network and runs entirely from the
local Room database:

- `REMOTE_SYNC_ENABLED = false` (`app/build.gradle.kts`) gates every network path. The sync
  scheduler and all repository `refresh()` / QR network-fallback calls become no-ops.
- On first launch `DatabaseSeeder` populates the database with sample data — 5 buildings, assets
  across categories (each with a QR code like `QR-TWR-A-002`), a monthly checklist template, and a
  few open faults — so every screen is usable with no backend.
- Inspections and faults you record are written to Room and queued as `sync_operation`s (the sync
  pill shows the pending count); they simply wait until remote sync is turned on.

To go online later, flip `REMOTE_SYNC_ENABLED` to `true` and point `API_BASE_URL` at a backend —
no code changes needed; the sync engine then hydrates and pushes the queue.

## Build

```bash
cd cafm_platform/android
./gradlew assembleDebug
```

Requires Android SDK (compileSdk 34, JDK 17).

## Not yet wired (next steps)

Auth/MFA screens, real CameraX scanner, media capture + presigned upload, SQLCipher encryption,
conflict-resolution UI, PM calendar, contractor module, document management, RCA/CAPA detail forms,
data-entry forms for the read-only module screens, and report (PDF/Excel) generation.
