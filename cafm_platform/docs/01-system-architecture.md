# 01 — System Architecture

## 1. Architecture style

A **modular backend** (start as a well-structured modular monolith, extract services as load
demands) behind an API gateway, serving an **offline-first Android client**. This avoids premature
microservice sprawl at 85 buildings while keeping clean seams so the heavy modules (sync, reporting,
media, AI) can be peeled off into independent services as you grow toward thousands of buildings.

```
                        ┌──────────────────────────────────────────────┐
                        │                ANDROID CLIENT                 │
                        │  Jetpack Compose · MVVM · Offline-first       │
                        │                                               │
                        │  UI → ViewModel → Repository ─┬─ Room (SQLite)│
                        │                               └─ Retrofit     │
                        │  WorkManager (sync) · CameraX/ML Kit (QR)     │
                        └───────────────┬───────────────────────────────┘
                                        │ HTTPS / TLS 1.3 (REST + gRPC sync)
                                        │ JWT access + refresh
                        ┌───────────────▼───────────────────────────────┐
                        │              API GATEWAY / EDGE                │
                        │  TLS term · WAF · rate limit · auth introspect │
                        └───────────────┬───────────────────────────────┘
                                        │
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
 ┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐
 │  Identity  │ │   Core     │ │  Sync        │ │  Media     │ │ Reporting  │
 │  & RBAC    │ │  Domain    │ │  Engine      │ │  Service   │ │  & Export  │
 │ (Keycloak) │ │ (buildings,│ │ (delta pull/ │ │ (presigned │ │ (PDF/Excel,│
 │            │ │  assets,   │ │  push, CRDT- │ │  S3 upload,│ │  async job)│
 │            │ │  WO, HSE…) │ │  lite merge) │ │  thumbnails│ │            │
 └─────┬──────┘ └─────┬──────┘ └──────┬───────┘ └─────┬──────┘ └─────┬──────┘
       │              │               │               │              │
       └──────────────┴───────┬───────┴───────────────┴──────────────┘
                               ▼
        ┌──────────────┬───────────────┬──────────────┬──────────────┐
        ▼              ▼               ▼              ▼              ▼
 ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
 │ PostgreSQL │ │  Redis     │ │  Object    │ │ OpenSearch │ │  Kafka /   │
 │ (+PostGIS, │ │  (cache,   │ │  Storage   │ │ (full-text │ │  RabbitMQ  │
 │ partitions)│ │  sessions, │ │  (S3/MinIO)│ │  + logs)   │ │  (events,  │
 │            │ │  job queue)│ │  media/docs│ │            │ │  async PM) │
 └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
                               │
                     ┌─────────▼──────────┐
                     │  AI / Analytics     │  (Phase 4 — see 15-ai-features.md)
                     │  feature store +    │
                     │  inference service  │
                     └────────────────────┘
```

## 2. Logical layers

### Client (Android)
- **Presentation** — Jetpack Compose screens + ViewModels (MVVM/MVI). One ViewModel per screen,
  state exposed as `StateFlow`.
- **Domain** — use-cases (interactors) and pure Kotlin models. No Android/IO dependencies — unit
  testable.
- **Data** — Repositories abstract two sources: **Room** (local source of truth) and **Retrofit**
  (remote). The repository always reads from Room; the network only feeds the sync engine.
- **Sync** — `WorkManager` jobs run the delta pull/push protocol (see `09-offline-sync.md`).

### Backend modules (bounded contexts)
| Module | Owns |
|--------|------|
| **Identity & RBAC** | users, roles, permissions, MFA, sessions, audit |
| **Building & Twin** | buildings, location tree, documents, media metadata |
| **Asset** | categories, custom fields, assets, QR, lifecycle, criticality |
| **Inspection** | checklist templates, inspection runs, evidence |
| **Maintenance** | PM plans, work orders, faults (CM), scheduling engine |
| **Inventory** | spare parts, warehouses, stock transactions |
| **Contractor** | contractors, contracts, ratings, SLA |
| **HSE & Compliance** | incidents, RCA/CAPA, fire compliance items |
| **Utility** | meters, readings, consumption analytics |
| **Sync** | change-log, delta endpoints, conflict resolution |
| **Reporting** | report templates, async generation, exports |
| **Notification** | rules engine, FCM push, email/SMS fan-out |

Each module is a package with its own service/repository layer and a clear public interface;
inter-module calls go through interfaces, never directly into another module's tables. This is what
makes later extraction to a separate service a refactor, not a rewrite.

## 3. Key cross-cutting decisions

- **Multi-tenancy:** shared schema, `org_id` on every table, enforced by row-level security in
  PostgreSQL + a tenant filter in the data layer. Big tenants can later be moved to a dedicated
  schema/DB without API changes.
- **Source of truth for the field:** the **device** holds the working copy; the server is the
  system of record. Sync is the contract between them (last-writer-wins per field + tombstones +
  server-authoritative for IDs/sequences). See `09-offline-sync.md`.
- **Metadata-driven extensibility:** asset categories, custom fields, and checklist templates are
  data. New asset types / inspection forms are configured by admins, not shipped in an APK.
- **Event-driven side effects:** PM scheduling, notifications, report generation, and AI feature
  extraction subscribe to domain events on the message bus — keeps the request path fast.
- **Idempotency:** every write API accepts a client-generated `op_id` (UUID) so retried offline
  operations never double-apply.

## 4. Request lifecycle (example: complete an inspection offline)

1. Technician scans QR → asset loaded from **Room**.
2. Fills dynamic checklist → responses + photos written to Room; a `sync_operation` row is queued.
3. WorkManager (on connectivity) batches queued ops → `POST /sync/push` with `op_id`s.
4. Sync engine validates, applies in a transaction, emits `inspection.completed` event.
5. Notification module sees a failed item → raises a Fault + work order, pushes FCM to supervisor.
6. Next `GET /sync/pull?since=<cursor>` returns the new fault/WO to all relevant devices.

## 5. Non-functional targets

| Concern | Target |
|---------|--------|
| Cold app start | < 2 s on mid-range Android |
| QR scan → asset detail | < 1 s (local) |
| Sync push (50 ops, 20 photos) | < 30 s on 4G |
| API p95 latency | < 300 ms |
| Availability | 99.9% (3-AZ) |
| Scale ceiling (design) | 5,000 buildings · 500k assets · 5k concurrent field users |
| RPO / RTO | 15 min / 1 h |
