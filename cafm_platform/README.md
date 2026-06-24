# FacilityOS — Enterprise CMMS + CAFM Android Platform

> A mobile-first Computerized Maintenance Management System (CMMS) and Computer-Aided
> Facility Management (CAFM) platform for managing buildings, assets, inspections,
> preventive & corrective maintenance, safety (HSE), fire compliance, and technical
> operations from Android devices.
>
> Designed to start at **85 buildings** and scale to **thousands of buildings** and
> **hundreds of thousands of assets**, with full **offline-first** field operation.

This directory is the **design & architecture package**. It is comparable in scope and
intent to IBM Maximo, FM:Systems, and Archibus, but optimized for field technicians on
Android.

## Deliverables index

| # | Deliverable | Document |
|---|-------------|----------|
| 1 | System architecture | [docs/01-system-architecture.md](docs/01-system-architecture.md) |
| 2 | Database schema (DDL) | [docs/02-database-schema.md](docs/02-database-schema.md) |
| 3 | ER diagram | [docs/03-erd.md](docs/03-erd.md) |
| 4 | API design | [docs/04-api-design.md](docs/04-api-design.md) |
| 5 | Mobile screens + wireframes | [docs/05-mobile-screens-ux.md](docs/05-mobile-screens-ux.md) |
| 6 | User flows | [docs/06-user-flows.md](docs/06-user-flows.md) |
| 7 | Technology stack | [docs/07-tech-stack.md](docs/07-tech-stack.md) |
| 8 | Security design | [docs/08-security.md](docs/08-security.md) |
| 9 | Offline sync architecture | [docs/09-offline-sync.md](docs/09-offline-sync.md) |
| 10 | Scalability plan | [docs/10-scalability.md](docs/10-scalability.md) |
| 11 | Deployment & cloud infrastructure | [docs/11-deployment-infra.md](docs/11-deployment-infra.md) |
| 12 | Development roadmap | [docs/12-roadmap.md](docs/12-roadmap.md) |
| 13 | Cost estimate | [docs/13-cost-estimate.md](docs/13-cost-estimate.md) |
| 14 | Source code structure | [docs/14-source-code-structure.md](docs/14-source-code-structure.md) |
| 15 | AI / future features | [docs/15-ai-features.md](docs/15-ai-features.md) |
| 16 | Domain glossary | [CONTEXT.md](CONTEXT.md) |

## Functional module map

```
FacilityOS
├── Building Management        (buildings, documents, media, GPS)
├── Interactive Map           (clustering, navigation, technician tracking)
├── Digital Building Twin      (hierarchical location tree)
├── Asset Management          (dynamic categories, lifecycle, QR)
├── Inspection Engine         (dynamic checklists, readings, evidence)
├── Preventive Maintenance     (PM scheduling, work orders)
├── Corrective Maintenance     (fault reporting, dispatch)
├── Work Order Management
├── Spare Parts & Inventory
├── Contractor Management
├── HSE Management            (incidents, RCA, CAPA)
├── Fire Compliance
├── Utility Management         (consumption analytics)
├── Document Management        (versioning, approval, expiry)
├── Criticality Analysis
├── Dashboards                (technician → executive)
├── Building Status Center     (live health)
├── Reporting                 (PDF/Excel)
├── Notifications
└── Admin / RBAC / Audit
```

## Design principles

1. **Offline-first.** Every read/write path works without connectivity; sync reconciles later.
2. **Metadata-driven.** Asset categories, custom fields, and checklist templates are *data*,
   not code — new asset types and inspection forms ship without an app update.
3. **Multi-tenant from day one.** Every row is scoped to an `org_id`.
4. **Field-fast.** QR scan → asset in ≤ 2 taps. Inspection completion is the hot path.
5. **Auditable.** Every mutation produces an immutable audit record.
6. **Scale by partitioning, not rewriting.** Time-series and event tables are partitioned early.

See [docs/01-system-architecture.md](docs/01-system-architecture.md) to start.
