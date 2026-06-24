# FacilityOS — Android client (Phase 1 MVP scaffold)

Offline-first Android app scaffold for the FacilityOS CMMS + CAFM platform. Implements the
architecture in [`../docs`](../docs): **Jetpack Compose + Material 3**, **MVVM/Clean**, **Room**
(local source of truth), **Hilt** (DI), **WorkManager** (sync), **Retrofit** (remote).

This is a runnable skeleton of the Phase-1 hot path (see `../docs/12-roadmap.md`), not the full
product. It demonstrates the offline-first plumbing end to end so feature modules can be filled in.

## What's implemented

- **App shell**: Hilt application + WorkManager factory, Compose theme with status colors, Nav graph.
- **Buildings**: list (search + sync pill) → detail with asset list. Offline-first repository.
- **Assets**: detail (identification, criticality, open faults) with Inspect / Report-fault actions.
- **QR scan**: resolve a code to an asset (manual entry now; CameraX + ML Kit wiring noted).
- **Dynamic inspection engine**: renders a checklist template (pass/fail/NA, numeric, text) and
  submits **offline** — writes to Room + queues an idempotent `sync_operation`.
- **Corrective maintenance**: report a fault offline (local write + queued op).
- **Sync engine**: `SyncWorker` runs the push/pull delta protocol against `/sync/*`
  (`../docs/09-offline-sync.md`); periodic + on-demand via `SyncScheduler`.

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

## Build

```bash
cd cafm_platform/android
./gradlew assembleDebug
```

Requires Android SDK (compileSdk 34, JDK 17). Without a backend, the inspection runner falls back
to a built-in demo template so the offline submit path is exercisable. Set the API base URL via the
`API_BASE_URL` `buildConfigField` in `app/build.gradle.kts`.

## Not yet wired (next steps)

Auth/MFA screens, real CameraX scanner, media capture + presigned upload, SQLCipher encryption,
conflict-resolution UI, dashboards, PM calendar, inventory/HSE/compliance modules, and the
remaining feature screens from `../docs/05-mobile-screens-ux.md`.
