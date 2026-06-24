# 05 — Mobile Screens, UI/UX & Wireframes

Android-first, **Jetpack Compose** + **Material 3**. Designed for one-handed field use, gloves,
bright sunlight, and intermittent connectivity. Large tap targets (≥48dp), high-contrast status
colors, and a persistent offline/sync indicator.

## 1. Design system

- **Theme:** Material 3 dynamic color with a safe fallback palette. Light + dark.
- **Status semantics (consistent everywhere):** 🟢 `#2E7D32` OK · 🟡 `#F9A825` attention ·
  🔴 `#C62828` critical · ⚪ `#9E9E9E` unknown/NA.
- **Priority chips:** Critical (red), High (orange), Medium (amber), Low (grey).
- **Typography:** Roboto/Inter; min body 16sp for field legibility.
- **Iconography:** Material Symbols + custom asset-category glyphs.
- **Global affordances:** top sync-status pill (Synced / Pending N / Offline), persistent FAB for
  "Scan QR", bottom nav for the 5 primary destinations.
- **Accessibility:** TalkBack labels, dynamic type, 4.5:1 contrast, RTL support (Arabic-ready).

## 2. Navigation map

```
Splash / Auth
└── App shell (bottom nav)
    ├── Home (role dashboard)
    ├── Buildings ── Building detail ── Twin tree ── Location ── Asset detail
    │                                                            ├── History
    │                                                            ├── Checklists
    │                                                            └── Report fault
    ├── Map (clustered buildings)
    ├── Work (My work orders / inspections / faults)  ── WO detail ── Complete WO
    └── More (Inventory · Contractors · HSE · Compliance · Utilities · Documents · Reports · Admin · Settings)

Global: [Scan QR] FAB → Asset detail (deep link from any screen)
```

## 3. Screen inventory (≈ 40 screens)

| # | Screen | Key elements |
|---|--------|--------------|
| 1 | Splash / login | logo, email+password, biometric unlock |
| 2 | MFA challenge | 6-digit TOTP entry |
| 3 | Role dashboard (4 variants) | KPI cards, today's tasks, quick actions |
| 4 | Building list | search, filter, sort, status badge, asset count, last inspection |
| 5 | Building detail | tabs: Info · Twin · Documents · Media · Status · Assets |
| 6 | Building status center | subsystem health lights, overdue counts |
| 7 | Twin tree | expandable hierarchy (floor→room→equipment), breadcrumb |
| 8 | Location detail | assets at this node, add asset |
| 9 | Asset list | filter by category, criticality badge |
| 10 | Asset detail | identification, technical, lifecycle, criticality, tabs |
| 11 | Asset history timeline | merged inspections/faults/WOs/parts/cost |
| 12 | QR scan | CameraX viewfinder, torch, manual code entry fallback |
| 13 | Checklist runner | dynamic items, pass/fail/NA, numeric, photo, voice, signature |
| 14 | Report fault | priority, description, photo/video/voice, asset prefilled |
| 15 | Work order list | my/team toggle, status filter, due-date sort |
| 16 | Work order detail | parts, labor, attachments, status timeline |
| 17 | Complete work order | labor hours, parts used, evidence, signature |
| 18 | PM calendar | month/week view of scheduled maintenance |
| 19 | Map | clustered pins, nearby, navigate, technician tracking |
| 20 | Inventory list | stock levels, low-stock highlight |
| 21 | Issue/return parts | scan part, qty, link to WO |
| 22 | Contractor list / detail | rating, SLA, contracts, certs |
| 23 | HSE incident report | type selector, severity, evidence |
| 24 | HSE incident detail / CAPA | RCA, actions, follow-up |
| 25 | Compliance dashboard | due/overdue items, expiry alerts |
| 26 | Utility entry / analytics | reading entry, trend charts |
| 27 | Document browser | type filter, version history, full-text search |
| 28 | Reports | pick type/scope/format → generate → download |
| 29 | Notifications center | grouped by type, mark read |
| 30 | Admin: users/roles | RBAC matrix |
| 31 | Admin: asset categories & fields | metadata editor (no-code extensibility) |
| 32 | Admin: checklist template builder | drag items, set response types |
| 33 | Settings | sync, language, theme, offline storage, logout |
| 34 | Sync status / conflicts | pending ops, conflict resolution UI |

## 4. Key wireframes (ASCII)

### Building list
```
┌─────────────────────────────────────┐
│ ☰  Buildings            🔍   ⚙  ●Sync│
│ [Search buildings...............]    │
│ [All ▾] [Status ▾] [Sort ▾]  [🗺 Map]│
├─────────────────────────────────────┤
│ 🟢 Tower A           ASSETS 142      │
│    King Fahd Rd          ⚠ 3 open    │
│    Last insp: 2d ago        ›        │
├─────────────────────────────────────┤
│ 🔴 Mall B            ASSETS 310      │
│    Olaya St             ⚠ 11 open    │
│    Last insp: 21d ago       ›        │
├─────────────────────────────────────┤
│ 🟡 Clinic C          ASSETS  58      │
│    ...                                │
└─────────────────────────────────────┘
  [🏠]  [🏢]  [🗺]  [🧰]  [⋯]      (＋Scan)
```

### Asset detail
```
┌─────────────────────────────────────┐
│ ‹  Diesel Generator #2        ⋮      │
│ 🔴 CRITICAL   ● In service           │
│ ┌───────────────────────────────┐   │
│ │  [photo]   GEN-A-0002          │   │
│ │            CAT · 3512C · 1500kVA│  │
│ └───────────────────────────────┘   │
│ [Info][Tech][Lifecycle][History]    │
│ Manufacturer  Caterpillar           │
│ Serial        7XK01234              │
│ Warranty      ends 2026-09 ⚠        │
│ Remaining life 6.2 yrs              │
├─────────────────────────────────────┤
│ [🩺 Inspect] [⚠ Report fault] [📷]  │
└─────────────────────────────────────┘
```

### Checklist runner (dynamic)
```
┌─────────────────────────────────────┐
│ ‹  Monthly PM — Generator   3/12 ▓▓░ │
│ Oil level adequate?                  │
│   ( ✓ Pass ) ( ✗ Fail ) ( N/A )     │
│ Coolant temperature (°C)             │
│   [  78.5      ]   ⚠ max 80          │
│ Attach photo of control panel  📷+   │
│ Notes [.........................]    │
│                          [🎤 voice]  │
├─────────────────────────────────────┤
│   ‹ Prev            Next ›   [Save]   │
└─────────────────────────────────────┘
```

### Manager dashboard
```
┌─────────────────────────────────────┐
│ Manager · 85 buildings        ●Sync  │
│ ┌Health 87┐ ┌PM 92%┐ ┌Crit 4┐ ┌Cost┐│
│ │  ◔◔◔    │ │ ████ │ │ 🔴   │ │ ▁▃▅ ││
│ └─────────┘ └──────┘ └──────┘ └────┘ │
│ Critical faults (4)                  │
│  🔴 Fire pump — Mall B    2h ago  ›  │
│  🔴 Elevator 3 — Tower A  5h ago  ›  │
│ Overdue inspections (12)        ›    │
│ Contractor performance          ›    │
└─────────────────────────────────────┘
```

## 5. Interaction principles for the field

- **Scan-first:** the FAB is always "Scan QR" → 1 tap to the right asset.
- **Optimistic UI:** every action saves locally and shows immediately; the sync pill reflects state.
- **Evidence is one tap:** camera/voice are inline in checklist items, not separate flows.
- **Glove/sunlight mode:** larger targets + high-contrast toggle in settings.
- **Never lose work:** drafts auto-persist to Room on every field change.
- **Localization:** English + Arabic at launch (RTL mirrored layouts).

A clickable HTML wireframe preview can be generated under `cafm_platform/diagrams/` (mirrors the
existing `android/design-preview.html` pattern in this repo).
