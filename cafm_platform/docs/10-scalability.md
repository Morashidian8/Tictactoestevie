# 10 — Scalability Plan

Target trajectory: **85 buildings → thousands of buildings, hundreds of thousands of assets,
thousands of concurrent field users.** Scale by partitioning data and extracting hot modules — not
by rewriting.

## 1. Capacity model (design ceiling)

| Dimension | Launch | Year 2 | Design ceiling |
|-----------|--------|--------|----------------|
| Orgs (tenants) | 1–5 | 50 | 1,000+ |
| Buildings | 85 | 1,000 | 10,000 |
| Assets | ~15k | 200k | 2M |
| Inspections/yr | ~200k | 5M | 100M |
| Concurrent field users | 100 | 1,000 | 10,000 |
| Media objects | ~100k | 5M | 100M |

## 2. Stateless app tier

- API/services are **stateless** → horizontal scale behind a load balancer; Kubernetes **HPA** on
  CPU/RPS. Sessions live in Redis, not memory.
- Sync and reporting are CPU/IO heavy → their own deployments/HPA so they can scale independently
  (and later become separate services along the module seams).

## 3. Database scaling path

1. **Vertical first** + tuned indexes (tenant-leading `org_id, …`), connection pooling (PgBouncer).
2. **Read replicas** for dashboards, reports, analytics, and `sync/pull` reads → offload the primary.
3. **Partitioning** (already designed): `change_log`, `audit_event`, `utility_reading`,
   eventually `inspection_response` by month → keeps indexes small and enables cheap archival.
4. **Tenant sharding** when needed: route by `org_id` to per-shard Postgres clusters (Citus or
   app-level routing). Large tenants get dedicated clusters; the API is unchanged because tenancy
   is already explicit.
5. **Archival tier:** cold partitions moved to cheaper storage / data warehouse (e.g. Redshift/
   BigQuery) for long-range analytics, keeping OLTP lean.

## 4. Caching

- **Redis** for: session/permission lookups, reference data (categories, templates), building
  status aggregates, rate-limit counters, distributed locks for schedulers.
- **CDN** for media, documents, and the APK.
- Dashboard KPIs are **precomputed** by event-driven rollups (materialized summaries refreshed on
  domain events) rather than scanned on every load.

## 5. Asynchronous & event-driven

- PM scheduling, notification fan-out, report generation, AI feature extraction, and audit
  indexing run off **Kafka** consumers — the request path stays fast and these scale by partition
  count + consumer replicas.
- Backpressure & retries with dead-letter topics for poison messages.

## 6. Sync at scale

- Forward-only `change_log` cursor + bounded per-user working set means a device pulls only its
  permitted slice — pull cost is O(changes since cursor), not O(org size).
- gRPC streaming option for `sync/pull` reduces overhead at high concurrency.
- Media offloaded to object storage + CDN; never proxied through app servers.

## 7. Search

- Start with Postgres FTS (`tsvector` + `pg_trgm`) for documents/assets. Move full-text & log
  search to **OpenSearch** when document volume or query complexity grows; index via Kafka so the
  primary DB isn't coupled to search load.

## 8. Multi-region (later)

- Read replicas per region for latency; object storage cross-region replication.
- Tenant residency: pin a tenant's data to a region for compliance. Active-active is avoided in
  favor of regional primaries + async replication (simpler, matches RPO 15 min).

## 9. Performance budget enforcement

- API p95 < 300 ms enforced via SLOs + alerts; slow queries flagged by `pg_stat_statements`.
- Load tests (k6/Gatling) gate releases at projected Year-2 volumes.
- Mobile: Paging 3 for large lists, lazy media, and capped local working set keep the device fast
  regardless of org size.
