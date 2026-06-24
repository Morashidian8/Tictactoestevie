# 14 — Source Code Structure

Monorepo with three deployables (Android app, backend, web admin) plus shared contracts and infra.
Boundaries mirror the modules in `01-system-architecture.md` so code, schema, and ownership align.

## 1. Repository layout

```
facilityos/
├── android/                      # Android client (Kotlin, Compose)
├── backend/                      # Kotlin Spring Boot (modular monolith)
├── web-admin/                    # React + TypeScript admin console
├── contracts/                    # OpenAPI spec, proto files, shared JSON schemas
├── infra/                        # Terraform, Helm charts, k8s manifests
├── docs/                         # this design package
└── .github/workflows/            # CI/CD pipelines
```

## 2. Android (`android/`)

Clean Architecture + MVVM. Feature modules map 1:1 to product modules; `:core:*` holds shared
infrastructure. Gradle Kotlin DSL + version catalog (matches the existing repo `android/` style).

```
android/
├── app/                          # application module, DI graph, navigation host
│   └── src/main/java/io/facilityos/app/
│       ├── MainActivity.kt
│       ├── FacilityOsApp.kt      # @HiltAndroidApp
│       └── navigation/AppNavHost.kt
├── core/
│   ├── designsystem/             # Compose theme, Material3, status colors, components
│   ├── ui/                       # shared composables (StatusChip, EvidencePicker, SyncPill)
│   ├── model/                    # pure Kotlin domain models (no Android deps)
│   ├── common/                   # Result, dispatchers, time, geo utils
│   ├── database/                 # Room: entities, DAOs, SQLCipher, migrations
│   ├── network/                  # Retrofit, OkHttp, auth/refresh interceptors, DTOs
│   ├── datastore/                # encrypted prefs, tokens, settings
│   ├── sync/                     # WorkManager workers, push/pull engine, conflict resolver
│   └── security/                 # Keystore, biometric, cert pinning, root detection
├── feature/
│   ├── auth/                     # login, MFA, biometric
│   ├── buildings/                # list, detail, twin tree, status center
│   ├── assets/                   # list, detail, history, custom-field renderer
│   ├── scan/                     # CameraX + ML Kit QR → asset deep link
│   ├── inspections/              # dynamic checklist runner, evidence capture
│   ├── faults/                   # report + track corrective maintenance
│   ├── workorders/               # list, detail, complete
│   ├── pm/                       # PM calendar
│   ├── inventory/                # parts, issue/return
│   ├── contractors/
│   ├── hse/                      # incidents, CAPA
│   ├── compliance/               # fire compliance
│   ├── utilities/                # readings + charts
│   ├── documents/                # DMS browser
│   ├── dashboards/               # 4 role dashboards
│   ├── reports/                  # generate/download
│   ├── map/                      # clustered buildings, navigation
│   ├── notifications/
│   └── admin/                    # categories, fields, template builder, RBAC
├── build-logic/                  # convention plugins (shared Gradle config)
└── gradle/libs.versions.toml     # version catalog
```

Per-feature internal structure:
```
feature/inspections/
├── data/        InspectionRepository (Room + Retrofit), mappers
├── domain/      use-cases: SubmitInspection, LoadTemplate, FlagFailedItem
└── ui/          ChecklistRunnerScreen.kt, ChecklistViewModel.kt, state, components
```

## 3. Backend (`backend/`)

Modular monolith; each module is a Gradle subproject with `api` (public interface) and `impl`
split so cross-module calls go through interfaces — ready for extraction into services.

```
backend/
├── bootstrap/                    # Spring Boot app entrypoint, wiring, config
├── platform/
│   ├── security/                 # OIDC/Keycloak, JWT, RBAC filters, RLS context
│   ├── tenancy/                  # org_id resolution, RLS session var
│   ├── audit/                    # audit_event interceptor
│   ├── persistence/              # JPA/jOOQ config, Flyway migrations, partition mgmt
│   ├── events/                   # Kafka producers/consumers, outbox
│   ├── storage/                  # S3 presign, media commit, AV scan hook
│   └── web/                      # gateway concerns: error mapping, idempotency, paging
├── modules/
│   ├── identity/                 # users, roles, permissions, MFA
│   ├── building/                 # buildings, location_node (twin), documents
│   ├── asset/                    # categories, custom fields, assets, QR, criticality
│   ├── inspection/               # templates, runs, responses
│   ├── maintenance/              # faults, pm_plan, work_order, scheduler
│   ├── inventory/                # parts, stock, warehouses
│   ├── contractor/
│   ├── hse/                      # incidents, CAPA, compliance items
│   ├── utility/                  # readings, analytics
│   ├── sync/                     # change_log, pull/push, conflict resolution
│   ├── reporting/                # async PDF/Excel jobs (POI, Jasper)
│   └── notification/             # rules engine, FCM, email/SMS
├── db/migration/                 # Flyway V__*.sql (matches 02-database-schema.md)
└── src/test/                     # unit + integration (Testcontainers Postgres)
```

Each module example:
```
modules/maintenance/
├── api/        MaintenanceFacade (interface), DTOs, events
└── impl/
    ├── domain/      WorkOrder, Fault aggregates, state machines
    ├── service/     WorkOrderService, PmSchedulerService
    ├── repository/  jOOQ/JPA repositories
    └── web/         WorkOrderController, FaultController
```

## 4. Web admin (`web-admin/`)

```
web-admin/src/
├── app/            routing, layout, auth guard
├── api/            generated client from contracts/openapi.yaml (orval/openapi-ts)
├── features/       templates-builder, rbac, categories, bulk-import, reports, tenants
├── components/     shared UI (tables, forms, charts)
└── lib/            query client, i18n (en/ar/fa), formatting
```

## 5. Contracts (`contracts/`)

```
contracts/
├── openapi.yaml          # single source of truth for REST API (04-api-design.md)
├── proto/sync.proto      # gRPC sync stream (optional/at scale)
└── schemas/              # shared JSON schemas (custom-field validation, sync payloads)
```
Codegen: Android (Retrofit/kotlinx via openapi-generator), web (openapi-typescript), backend
validates against the same spec in contract tests.

## 6. Infra (`infra/`)

```
infra/
├── terraform/            # VPC, EKS, RDS, Redis, MSK, S3, OpenSearch, IAM, KMS
│   ├── modules/
│   └── envs/{dev,staging,prod}/
├── helm/                 # umbrella chart + per-service charts/values
└── k8s/                  # raw manifests, Argo CD apps, network policies
```

## 7. Conventions

- **Naming:** packages `io.facilityos.<module>.<layer>`; tables snake_case; API paths kebab/snake.
- **Tests:** unit per use-case/service; integration with Testcontainers; Android Compose UI tests;
  contract tests against `openapi.yaml`.
- **Migrations:** expand/contract, never destructive in a single deploy.
- **Ownership:** `CODEOWNERS` maps `modules/*` and `feature/*` to teams.
- **Quality gates:** ktlint/detekt, ESLint/Prettier, CodeQL, coverage thresholds in CI.
```
