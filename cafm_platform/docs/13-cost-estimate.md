# 13 — Cost Estimate

Indicative ranges, USD. Actuals depend on region, seniority, and whether you self-host vs. managed.
Two views: **build** (one-time) and **run** (monthly cloud + services).

## 1. Build cost — team & timeline

A 12-month build to GA (Phases 0–4 in `12-roadmap.md`). Blended global rates; mid-to-senior.

| Role | Count | Months | Blended/mo | Subtotal |
|------|------:|-------:|-----------:|---------:|
| Product manager | 1 | 12 | $9,000 | $108,000 |
| Solution architect / tech lead | 1 | 12 | $12,000 | $144,000 |
| Android engineers | 2 | 12 | $9,000 | $216,000 |
| Backend engineers | 2 | 12 | $9,000 | $216,000 |
| Web-admin / full-stack | 1 | 8 | $8,500 | $68,000 |
| UX/UI designer | 1 | 8 | $7,500 | $60,000 |
| QA / SDET | 1 | 10 | $7,000 | $70,000 |
| DevOps / SRE | 1 | 10 | $9,500 | $95,000 |
| Data/ML engineer (Phase 4) | 1 | 5 | $10,000 | $50,000 |
| **Team total** | | | | **~$1,027,000** |
| Contingency (~15%) | | | | ~$154,000 |
| **Build total (MVP→GA)** | | | | **≈ $1.15M – $1.4M** |

**Leaner MVP-only path (Phases 0–1, ~4 months, 4–5 people):** **≈ $180k – $260k** to a working
offline field app for the 85-building pilot.

Rate sensitivity: US/EU senior rates push these 2–3×; near/offshore teams can land the full build
in the **$400k–$700k** range.

## 2. One-time / tooling

| Item | Est. |
|------|------|
| Design tools, Play Console, Apple-not-needed | ~$1,000 |
| Security pen-test (pre-GA) | $8,000 – $20,000 |
| SOC 2 readiness (if pursued) | $15,000 – $40,000 |
| Code signing / certs | ~$500 |

## 3. Run cost — cloud (monthly)

### Launch scale (85 buildings, ~100 concurrent users)

| Service | Spec | Monthly |
|---------|------|--------:|
| EKS/GKE control + 3× nodes | small/medium | $400 – $700 |
| PostgreSQL (RDS Multi-AZ) | 2 vCPU/8–16GB + 1 replica | $350 – $600 |
| Redis (ElastiCache) | small | $80 – $150 |
| Object storage (S3) | ~1–2 TB media + egress | $80 – $200 |
| Kafka (MSK) or RabbitMQ | small / single broker set | $250 – $500 |
| OpenSearch (or defer, use PG FTS) | small (optional) | $0 – $300 |
| CDN (CloudFront) | media/APK | $50 – $150 |
| Keycloak (self-host on cluster) | — | included |
| Observability (Grafana/Loki/Sentry) | managed or self-host | $100 – $400 |
| FCM push | free tier | $0 |
| **Subtotal** | | **≈ $1,400 – $3,300 / mo** |

### Growth scale (1,000+ buildings, ~1,000 concurrent)

Roughly **$6,000 – $15,000 / mo** — driven by larger DB + read replicas, more nodes, Kafka
throughput, OpenSearch, and media storage/egress. Self-hosting components (MinIO, Kafka, Keycloak,
Grafana) trades cloud bill for ops effort.

### AI features (Phase 4, when enabled)

- Inference service nodes (GPU optional for vision): **$300 – $2,000 / mo**.
- LLM assistant API usage (e.g. Claude) is usage-based; budget per query volume.

## 4. Ongoing team (post-GA, steady state)

A maintenance + iteration team of ~4–6 (2 Android, 1–2 backend, 1 QA, part-time DevOps/PM):
**≈ $40k – $70k / mo** blended global.

## 5. Cost-reduction levers

- Start with **Postgres FTS** instead of OpenSearch; add later.
- **RabbitMQ** instead of managed Kafka until event volume demands it.
- **MapLibre + OpenStreetMap** instead of Google Maps to cut per-map-load fees at scale.
- Self-host MinIO/Keycloak/Grafana on the cluster.
- Spot instances for stateless/async workloads.
- Defer Phase 4 (AI) until the core platform has paying usage.

## 6. TCO snapshot (Year 1)

| Line | Range |
|------|-------|
| Build (MVP→GA) | $1.15M – $1.4M (or $400k–$700k offshore) |
| Cloud run (12 mo, launch scale) | $20k – $40k |
| Security/compliance/tooling | $25k – $60k |
| **Year-1 total** | **≈ $1.2M – $1.5M** (full) / **$450k–$800k** (lean offshore) |
