# 11 — Deployment & Cloud Infrastructure

Cloud-agnostic Kubernetes deployment (examples use AWS; GCP/Azure equivalents noted). Everything is
declared in Terraform and shipped via GitHub Actions + Argo CD/Helm.

## 1. Recommended cloud topology (AWS)

```
                         ┌────────── Route 53 (DNS) ──────────┐
                         │                                    │
                  CloudFront (CDN)                      WAF + ALB
                  media / docs / APK                        │
                         │                                   ▼
                    S3 (media,docs)            ┌──── EKS (Kubernetes) ────┐
                         │                      │  ns: api                 │
                         │                      │   ├ gateway              │
                         │                      │   ├ core-domain (HPA)    │
                         │                      │   ├ sync (HPA)           │
                         │                      │   ├ media-svc            │
                         │                      │   ├ reporting (jobs)     │
                         │                      │   ├ notification         │
                         │                      │   └ keycloak             │
                         │                      └───────────┬──────────────┘
                         │                                  │
       ┌─────────────────┼──────────────┬──────────────────┼───────────────┐
       ▼                 ▼              ▼                   ▼               ▼
   RDS PostgreSQL   ElastiCache     MSK (Kafka)        OpenSearch     Secrets Mgr
   Multi-AZ +PostGIS  (Redis)       events             search/logs    + KMS
   + read replicas
                         │
                   FCM (push)   ·   SES (email)   ·   Sentry   ·   Grafana Cloud
```

GCP map: GKE · Cloud SQL (Postgres) · Memorystore · Pub/Sub or Confluent · GCS · Cloud CDN.
Azure map: AKS · Azure DB for Postgres · Azure Cache · Event Hubs · Blob Storage · Front Door.

## 2. Environments

| Env | Purpose | Notes |
|-----|---------|-------|
| dev | feature work | smaller nodes, ephemeral DB, seeded data |
| staging | pre-prod, load tests, UAT | mirrors prod topology at reduced scale |
| prod | live | multi-AZ, autoscaled, full backups/DR |

Per-tenant isolation option for regulated customers: dedicated namespace + DB.

## 3. CI/CD pipeline

```
PR → GitHub Actions:
  lint + unit tests (backend & Android)
  SAST (CodeQL) · dependency scan (Snyk) · secret scan
  build container images + Android AAB
  push to registry (signed)
→ deploy staging via Argo CD (GitOps)
  integration + e2e (API) · Compose UI tests · k6 load smoke
→ manual approval → prod (blue/green or canary via Argo Rollouts)
Android: Play Console internal → closed → production track; Firebase App Distribution for QA
```

Database migrations: **Flyway/Liquibase**, applied as a pre-deploy job; backward-compatible
(expand/contract) so rollouts don't break running pods.

## 4. Observability

- **Metrics:** Prometheus + Grafana (RED/USE dashboards, SLOs).
- **Logs:** Loki/OpenSearch, structured JSON, correlation IDs.
- **Traces:** OpenTelemetry → Tempo/Jaeger across gateway → service → DB.
- **Errors:** Sentry (backend + Android).
- **Alerts:** Alertmanager → PagerDuty/Slack on SLO burn, error spikes, queue lag, DR lag.

## 5. Resilience

- Multi-AZ for EKS nodes, RDS, Redis, Kafka.
- PodDisruptionBudgets, liveness/readiness probes, graceful shutdown, retries with circuit breakers.
- RDS PITR + automated snapshots; S3 versioning + cross-region replication.
- Quarterly DR game-days restoring into an isolated account (RPO 15 min / RTO 1 h).

## 6. Cost controls

- Cluster autoscaler + spot nodes for stateless/async workloads; on-demand for stateful.
- S3 lifecycle (IA/Glacier for old media & cold partitions); CloudFront caching cuts egress.
- Right-sized RDS with read replicas added only when replica lag/CPU warrants.

## 7. Mobile release

- Signed **AAB** to Google Play (staged rollout %); **in-app update** API for forced upgrades when
  a sync-protocol version bumps.
- Feature flags (e.g. Unleash/Firebase Remote Config) to dark-launch modules per tenant.
- Crash-free-sessions SLO gates wider rollout.
