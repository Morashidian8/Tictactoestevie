# 07 — Technology Stack

Chosen for offline-first mobile, enterprise scale, and team hireability. Bias toward boring,
well-supported technology.

## Android client

| Concern | Choice | Why |
|---------|--------|-----|
| Language | **Kotlin** | first-class Android, coroutines |
| UI | **Jetpack Compose + Material 3** | declarative, fast iteration, theming |
| Architecture | **MVVM/MVI + Clean Architecture** | testable, clear layers |
| Local DB | **Room (SQLite)** | offline source of truth, SQL, migrations |
| Networking | **Retrofit + OkHttp + kotlinx.serialization** | standard, interceptors for auth/retry |
| Background/sync | **WorkManager** | guaranteed, constraint-aware (network/charging) |
| DI | **Hilt** | compile-time DI |
| Async | **Coroutines + Flow** | structured concurrency, reactive UI state |
| Paging | **Paging 3** | large lists (assets, WOs) |
| Images | **Coil** | Compose-native image loading |
| Camera/QR | **CameraX + ML Kit Barcode** | reliable QR/barcode scanning |
| Maps | **Google Maps SDK** (or **MapLibre** for cost) | clustering, navigation |
| Charts | **Vico** / MPAndroidChart | dashboards & utility trends |
| Secure storage | **Jetpack Security (EncryptedSharedPreferences) + Keystore** | tokens, MFA secret |
| PDF (on-device) | Android PdfDocument / iText (server preferred) | offline report stub |
| Auth | **AppAuth (OIDC)** | talks to Keycloak |
| Testing | JUnit5, Turbine, MockK, Compose UI Test, Espresso | unit → UI |

## Backend

| Concern | Primary | Alternative | Why |
|---------|---------|-------------|-----|
| Language/runtime | **Kotlin + Spring Boot** | Node/NestJS, Go | shares Kotlin with Android; mature ecosystem |
| API | REST (OpenAPI 3.1) + gRPC for sync | GraphQL | simple, cacheable; gRPC for high-throughput sync |
| DB | **PostgreSQL 15 + PostGIS** | — | relational integrity, geo, JSONB, partitioning |
| Cache/queue | **Redis** | — | sessions, rate limit, hot reads, job locks |
| Object storage | **S3** (MinIO self-host) | GCS/Azure Blob | media & documents, presigned uploads |
| Search | **OpenSearch** | Postgres FTS (start here) | document full-text, log analytics |
| Messaging | **Kafka** (or RabbitMQ to start) | — | domain events, PM scheduling, async reports |
| Auth/IdP | **Keycloak** | Auth0/Cognito | OIDC, MFA, RBAC, SSO/SAML for enterprise |
| Reports | **Apache POI** (Excel) + **JasperReports/Playwright→PDF** | — | branded PDF/Excel |
| Jobs/scheduler | **Quartz** / Spring `@Scheduled` + Kafka | — | PM generation, expiry scans |

## Web admin (companion)

React + TypeScript + Vite + TanStack Query + a component lib (MUI/shadcn). Reuses the same API.
Heavy admin tasks (template building, RBAC, bulk import, reporting) are easier on desktop.

## Platform / infra

| Concern | Choice |
|---------|--------|
| Containers | Docker |
| Orchestration | **Kubernetes** (EKS/GKE/AKS) |
| IaC | **Terraform** |
| CI/CD | GitHub Actions → registry → Argo CD / Helm |
| Observability | **OpenTelemetry** → Prometheus + Grafana + Loki + Tempo |
| Error tracking | Sentry (mobile + backend) |
| Secrets | Vault / cloud secrets manager |
| CDN | CloudFront/Cloudflare for media & APK |
| Push | **Firebase Cloud Messaging (FCM)** |

## AI / analytics (Phase 4)

Python service (FastAPI) for inference; scikit-learn/XGBoost for failure prediction;
vision model (YOLO/ONNX) for defect detection; an LLM (e.g. Claude) behind the natural-language
assistant translating questions → structured queries. Feature store fed by Kafka events.

## Why not full microservices on day one

At 85 buildings the bottleneck is product breadth, not load. A modular monolith with clean module
boundaries (see `01-system-architecture.md`) ships faster and is operationally simpler. The seams
are drawn so sync, media, reporting, and AI extract cleanly when traffic justifies it.
