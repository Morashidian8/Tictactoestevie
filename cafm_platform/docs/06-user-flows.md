# 06 — User Flows

Primary journeys per role, as Mermaid flowcharts. These define the "happy paths" the UX in
`05-mobile-screens-ux.md` must make fast.

## 1. Technician — scan & inspect (the hot path)

```mermaid
flowchart TD
    A[Open app] --> B{Authenticated?}
    B -- no --> L[Login + biometric/MFA] --> C
    B -- yes --> C[Tap Scan QR FAB]
    C --> D[Scan asset QR]
    D --> E[Asset detail loads from Room]
    E --> F[Tap Inspect]
    F --> G[Pick checklist template by frequency]
    G --> H[Dynamic checklist runner]
    H --> I{Item fails?}
    I -- yes --> J[Auto-flag + capture photo/voice]
    I -- no --> K[Next item]
    J --> K
    K --> M{More items?}
    M -- yes --> H
    M -- no --> N[Sign + Complete]
    N --> O[Saved to Room, op queued]
    O --> P{Any failed items?}
    P -- yes --> Q[Auto-create Fault + Work Order]
    P -- no --> R[Done]
    Q --> R
    R --> S[WorkManager syncs when online]
```

## 2. Corrective maintenance — fault to closure

```mermaid
flowchart TD
    A[Technician reports fault] --> B[Set priority + evidence]
    B --> C[Fault: OPEN]
    C --> D[Supervisor reviews queue]
    D --> E[Assign technician/contractor → WO created]
    E --> F[Fault: ASSIGNED / WO: ASSIGNED]
    F --> G[Technician starts work]
    G --> H{Parts needed?}
    H -- yes --> I[Issue parts from inventory] --> J[WO: WAITING_PARTS if out of stock]
    H -- no --> K[In progress]
    I --> K
    J --> K
    K --> L[Complete WO: labor, parts, evidence, signature]
    L --> M[Fault: COMPLETED]
    M --> N[Supervisor verifies] --> O[Fault + WO: CLOSED]
    O --> P[Asset history + cost + MTTR updated]
```

## 3. Preventive maintenance — auto scheduling

```mermaid
flowchart TD
    A[PM plan: calendar or meter trigger] --> B[Scheduler job runs nightly]
    B --> C{Due within lead time?}
    C -- no --> B
    C -- yes --> D[Generate Work Order]
    D --> E[Notify assignee + appears on PM calendar]
    E --> F[Technician executes via checklist]
    F --> G[Complete WO]
    G --> H[Plan next_due_date advances]
    H --> I[PM compliance % recomputed]
    D --> J{Overdue past grace?}
    J -- yes --> K[Escalate to supervisor/manager]
```

## 4. Offline → online sync

```mermaid
flowchart TD
    A[Field work offline] --> B[Writes go to Room + sync_operation queue]
    B --> C{Connectivity?}
    C -- no --> A
    C -- yes --> D[WorkManager triggers sync]
    D --> E[POST /sync/push with op_ids]
    E --> F{Conflict?}
    F -- no --> G[Server applies, returns versions]
    F -- yes --> H[Return server state]
    H --> I{Auto-mergeable?}
    I -- yes --> J[Field-level merge, re-push]
    I -- no --> K[Surface in conflict UI for user]
    G --> L[GET /sync/pull since cursor]
    J --> L
    K --> L
    L --> M[Apply server changes to Room]
    M --> N[UI updates, sync pill = Synced]
```

## 5. Manager — building status review

```mermaid
flowchart TD
    A[Open Manager dashboard] --> B[See health score + KPIs]
    B --> C[Tap Building Status Center]
    C --> D[Grid of buildings with subsystem lights]
    D --> E{Red subsystem?}
    E -- yes --> F[Drill into building → failing assets]
    F --> G[Review open critical faults]
    G --> H[Reassign / escalate / approve cost]
    E -- no --> I[Review PM compliance + overdue]
    H --> J[Generate report PDF/Excel]
    I --> J
```

## 6. Admin — add a new asset type (no-code extensibility)

```mermaid
flowchart TD
    A[Admin: Asset Categories] --> B[Create category e.g. Solar Inverter]
    B --> C[Add custom fields: capacity_kw, mppt_count ...]
    C --> D[Create checklist template for category]
    D --> E[Define items + response types]
    E --> F[Publish]
    F --> G[Technicians immediately see new type + form]
    G --> H[No app update / no DB migration]
```
