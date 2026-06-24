# 12 — Development Roadmap

Phased delivery that puts a usable field tool in technicians' hands early, then layers management
and intelligence. Durations assume the team in `13-cost-estimate.md` (~6–8 people).

## Phase 0 — Foundations (Weeks 1–6)

- Repo, CI/CD, environments (dev/staging), Terraform skeleton, Kubernetes base.
- Auth & RBAC (Keycloak), multi-tenant `org_id` + RLS, audit log, base API gateway.
- Android app shell: nav, theme/design system, login+MFA, Room + sync engine **skeleton**.
- DB core schema (org, user, building, location_node, asset, asset_category, custom_field_def).

**Exit:** a technician can log in, see seeded buildings, and the offline sync round-trips a trivial
entity.

## Phase 1 — Field MVP (Weeks 7–16)

The minimum that delivers daily value to technicians.
- Building list + detail + **Digital Building Twin** tree.
- Asset management with metadata-driven categories/custom fields; **QR generation + scan**.
- Asset detail + history timeline.
- **Dynamic inspection engine** (templates, checklist runner, evidence: photo/voice/signature).
- **Corrective maintenance**: report fault with evidence + status lifecycle.
- **Work orders** (manual + from fault) and **My Work** screen.
- Full **offline mode** for all of the above + media sync.

**Exit (pilot):** run the 85-building pilot end-to-end offline; scan→inspect→fault→WO works.

## Phase 2 — Maintenance management (Weeks 17–26)

- **Preventive maintenance**: PM plans (calendar/meter), auto-generation, PM calendar, escalations.
- **Spare parts & inventory**: stock, issue/return/transfer, low-stock alerts, parts-on-WO.
- **Contractor management**: contracts, certs, SLA, performance ratings.
- **Notifications**: FCM rules engine (PM due/overdue, failed inspection, critical fault, expiry,
  low stock).
- **Asset criticality** scoring and prioritization.
- **Interactive map** (clustering, navigate, nearby, technician tracking).

**Exit:** the system schedules and dispatches work, not just records it.

## Phase 3 — Management, compliance & reporting (Weeks 27–38)

- **Dashboards**: technician → supervisor → manager → executive (KPIs, MTBF/MTTR, health score).
- **Building Status Center** (live subsystem health lights).
- **HSE management**: incidents, RCA, CAPA, follow-up.
- **Fire compliance** tracking + automatic compliance reports.
- **Utility management** + trend analytics.
- **Document management** (versioning, approval workflow, full-text search, expiry alerts).
- **Reporting**: branded PDF/Excel for all report types; web-admin console for config & bulk import.

**Exit:** managers and compliance officers run the operation from dashboards and reports.

## Phase 4 — Intelligence & scale (Weeks 39–52+)

- **Predictive maintenance** & failure prediction; **asset health scoring** model.
- **Defect detection from photos** (vision); **voice-to-checklist**.
- **AI assistant** (natural-language queries → structured reports).
- Scale hardening: read replicas, partitions in prod, OpenSearch, sharding readiness, multi-region
  groundwork.

**Exit:** differentiated AI features + proven scale headroom toward thousands of buildings.

## Cross-cutting (every phase)

Security reviews, accessibility, localization (EN/AR), automated tests, load tests, documentation,
and tenant onboarding tooling.

## Milestone summary

| Milestone | ~Week | Outcome |
|-----------|-------|---------|
| M0 Foundations | 6 | auth, tenancy, sync skeleton |
| M1 Field MVP / pilot | 16 | offline scan→inspect→fault→WO |
| M2 Maintenance mgmt | 26 | PM, inventory, contractors, notifications |
| M3 Mgmt & compliance | 38 | dashboards, HSE, fire, utilities, reports |
| M4 AI & scale | 52+ | predictive, assistant, scale-out |
