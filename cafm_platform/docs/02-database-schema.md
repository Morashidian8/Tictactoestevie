# 02 — Database Schema (PostgreSQL)

PostgreSQL 15+ with **PostGIS** (geospatial), **pg_trgm** (fuzzy search), and native
partitioning for high-volume tables. All tables carry `org_id` (multi-tenant) and audit columns.

> Conventions: UUID PKs (`gen_random_uuid()`), `created_at/updated_at timestamptz`,
> `created_by/updated_by`, soft delete via `deleted_at`, optimistic locking via `version int`,
> and `op_id uuid` on field-writable tables for idempotent offline sync.

## 0. Common columns (applied to every table unless noted)

```sql
-- pseudo-mixin, repeated per table
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES org(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES app_user(id),
  updated_by  uuid REFERENCES app_user(id),
  deleted_at  timestamptz,
  version     int NOT NULL DEFAULT 0
```

## 1. Tenancy, identity & RBAC

```sql
CREATE TABLE org (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'standard',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  email citext NOT NULL,
  full_name text NOT NULL,
  phone text,
  password_hash text,                 -- if not delegating fully to IdP
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret text,                    -- encrypted at rest
  status text NOT NULL DEFAULT 'active',  -- active|suspended|invited
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE role (              -- Administrator, Supervisor, Manager, Technician, Viewer (+custom)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, name)
);

CREATE TABLE permission (        -- e.g. asset.read, workorder.assign, hse.incident.create
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text
);

CREATE TABLE role_permission (
  role_id uuid REFERENCES role(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES permission(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_role (
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE,
  role_id uuid REFERENCES role(id) ON DELETE CASCADE,
  -- optional scoping: a supervisor for specific buildings only
  building_id uuid REFERENCES building(id),
  PRIMARY KEY (user_id, role_id, building_id)
);
```

## 2. Buildings & Digital Building Twin

```sql
CREATE TABLE building (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  code text NOT NULL,
  name text NOT NULL,
  address text,
  geom geography(Point, 4326),         -- PostGIS GPS point
  floors_count int,
  height_m numeric(8,2),
  construction_year int,
  land_area_m2 numeric(12,2),
  built_up_area_m2 numeric(12,2),
  occupancy_type text,
  units_count int,
  manager_user_id uuid REFERENCES app_user(id),
  owner_name text,
  utility_info jsonb NOT NULL DEFAULT '{}',
  emergency_contacts jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'operational',  -- operational|partial|critical|closed
  -- audit/version columns...
  UNIQUE (org_id, code)
);
CREATE INDEX idx_building_geom ON building USING gist (geom);
CREATE INDEX idx_building_name_trgm ON building USING gin (name gin_trgm_ops);

-- Self-referencing hierarchy: Building → Floor → Room → sub-zone → ...
CREATE TABLE location_node (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  building_id uuid NOT NULL REFERENCES building(id),
  parent_id uuid REFERENCES location_node(id),
  node_type text NOT NULL,             -- floor|room|zone|shaft|roof|equipment_room ...
  name text NOT NULL,
  code text,
  path ltree,                          -- materialized path for fast subtree queries
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX idx_locnode_path ON location_node USING gist (path);
CREATE INDEX idx_locnode_building ON location_node (building_id);
```

## 3. Assets (metadata-driven, extensible)

```sql
-- Category tree is data → new asset types need no code change.
CREATE TABLE asset_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  parent_id uuid REFERENCES asset_category(id),
  name text NOT NULL,                  -- "Vertical Transportation", "Fire Protection" ...
  code text,
  icon text
);

-- Typed custom attributes attached to a category (or a checklist template).
CREATE TABLE custom_field_def (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  owner_type text NOT NULL,            -- 'asset_category' | 'checklist_template'
  owner_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  data_type text NOT NULL,             -- text|number|date|bool|enum|reference
  unit text,
  enum_options jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (owner_type, owner_id, key)
);

CREATE TABLE asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  building_id uuid NOT NULL REFERENCES building(id),
  location_node_id uuid REFERENCES location_node(id),
  category_id uuid NOT NULL REFERENCES asset_category(id),
  parent_asset_id uuid REFERENCES asset(id),       -- sub-assets (e.g. battery in UPS)
  name text NOT NULL,
  asset_code text NOT NULL,
  asset_tag text,
  qr_uid text UNIQUE,                  -- value embedded in the QR/barcode
  manufacturer text,
  model text,
  serial_no text,
  -- lifecycle
  purchase_date date,
  install_date date,
  warranty_start date,
  warranty_end date,
  expected_life_years int,
  -- criticality (see asset_criticality for the scoring breakdown)
  criticality text,                    -- critical|high|medium|low
  status text NOT NULL DEFAULT 'in_service', -- in_service|down|standby|retired
  -- typed attributes per category, validated against custom_field_def
  attributes jsonb NOT NULL DEFAULT '{}',
  UNIQUE (org_id, asset_code)
);
CREATE INDEX idx_asset_building ON asset (building_id);
CREATE INDEX idx_asset_category ON asset (category_id);
CREATE INDEX idx_asset_attr ON asset USING gin (attributes jsonb_path_ops);
CREATE INDEX idx_asset_name_trgm ON asset USING gin (name gin_trgm_ops);

CREATE TABLE asset_criticality (
  asset_id uuid PRIMARY KEY REFERENCES asset(id),
  org_id uuid NOT NULL,
  safety_impact int, operational_impact int, financial_impact int, failure_frequency int,
  score numeric(5,2),                  -- computed composite
  rating text                          -- critical|high|medium|low
);
```

## 4. Media & documents (polymorphic attachments + DMS)

```sql
CREATE TABLE media_asset (             -- photos/videos/voice; binary lives in object storage
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  owner_type text NOT NULL,            -- 'asset'|'building'|'inspection_item'|'fault'|'incident'...
  owner_id uuid NOT NULL,
  kind text NOT NULL,                  -- photo|video|voice|drone|thumbnail
  storage_key text NOT NULL,           -- S3 object key
  mime text, bytes bigint, width int, height int, duration_ms int,
  captured_at timestamptz,
  geom geography(Point,4326),          -- where the photo was taken
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_owner ON media_asset (owner_type, owner_id);

CREATE TABLE document (                -- DMS: manuals, drawings, contracts, certs
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  owner_type text, owner_id uuid,      -- attached to building/asset/contractor...
  doc_type text NOT NULL,              -- manual|drawing_arch|drawing_elec|contract|certificate|license
  title text NOT NULL,
  current_version_id uuid,
  approval_status text DEFAULT 'draft',-- draft|in_review|approved|rejected
  expires_at date,                     -- drives expiry alerts
  tsv tsvector                         -- full-text search
);
CREATE INDEX idx_document_tsv ON document USING gin (tsv);

CREATE TABLE document_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id),
  version_no int NOT NULL,
  storage_key text NOT NULL,
  uploaded_by uuid REFERENCES app_user(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (document_id, version_no)
);
```

## 5. Inspections (dynamic checklist engine)

```sql
CREATE TABLE checklist_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  name text NOT NULL,
  category_id uuid REFERENCES asset_category(id),  -- which assets it applies to
  frequency text,                      -- daily|weekly|monthly|quarterly|semiannual|annual
  is_active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1
);

CREATE TABLE checklist_item_def (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES checklist_template(id),
  sort_order int NOT NULL,
  prompt text NOT NULL,
  response_type text NOT NULL,         -- pass_fail_na|numeric|text|photo|video|voice|signature
  unit text, min_value numeric, max_value numeric,  -- for numeric bounds/alerts
  required boolean NOT NULL DEFAULT true,
  evidence_required boolean NOT NULL DEFAULT false
);

CREATE TABLE inspection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  template_id uuid NOT NULL REFERENCES checklist_template(id),
  asset_id uuid REFERENCES asset(id),
  building_id uuid REFERENCES building(id),
  performed_by uuid REFERENCES app_user(id),
  status text NOT NULL DEFAULT 'in_progress', -- in_progress|completed|failed
  started_at timestamptz, completed_at timestamptz,
  signature_storage_key text,
  result_summary text,                 -- pass|fail|partial
  op_id uuid                           -- idempotent offline create
);

CREATE TABLE inspection_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspection(id) ON DELETE CASCADE,
  item_def_id uuid NOT NULL REFERENCES checklist_item_def(id),
  value_bool boolean, value_num numeric, value_text text,
  result text,                         -- pass|fail|na
  note text
  -- evidence via media_asset(owner_type='inspection_response')
);
```

## 6. Maintenance: faults (CM), PM plans, work orders

```sql
CREATE TABLE fault (                    -- corrective maintenance trigger
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  asset_id uuid REFERENCES asset(id),
  building_id uuid REFERENCES building(id),
  reported_by uuid REFERENCES app_user(id),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',  -- critical|high|medium|low
  status text NOT NULL DEFAULT 'open',
     -- open|assigned|in_progress|waiting_parts|completed|closed
  source text,                         -- manual|inspection|sensor
  reported_at timestamptz NOT NULL DEFAULT now(),
  op_id uuid
);

CREATE TABLE pm_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  asset_id uuid REFERENCES asset(id),
  category_id uuid REFERENCES asset_category(id),  -- plan can target a whole category
  template_id uuid REFERENCES checklist_template(id),
  trigger_type text NOT NULL,          -- calendar|meter
  interval_days int,                   -- calendar
  meter_field text, meter_interval numeric,        -- meter-based
  lead_time_days int NOT NULL DEFAULT 7,
  next_due_date date,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE work_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  wo_number text NOT NULL,             -- human-friendly, per-org sequence
  type text NOT NULL,                  -- pm|cm|inspection|project
  source_fault_id uuid REFERENCES fault(id),
  source_pm_plan_id uuid REFERENCES pm_plan(id),
  asset_id uuid REFERENCES asset(id),
  building_id uuid REFERENCES building(id),
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'scheduled',
     -- draft|scheduled|assigned|in_progress|on_hold|completed|closed|cancelled
  assigned_user_id uuid REFERENCES app_user(id),
  assigned_contractor_id uuid REFERENCES contractor(id),
  due_date date,
  labor_hours numeric(6,2),
  completion_notes text,
  completed_at timestamptz,
  op_id uuid,
  UNIQUE (org_id, wo_number)
);
CREATE INDEX idx_wo_status ON work_order (org_id, status);
CREATE INDEX idx_wo_assignee ON work_order (assigned_user_id, status);

CREATE TABLE work_order_part (          -- parts consumed by a WO
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_order(id),
  part_id uuid NOT NULL REFERENCES spare_part(id),
  qty numeric(12,3) NOT NULL,
  unit_cost numeric(12,2)
);
```

## 7. Inventory / spare parts

```sql
CREATE TABLE warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  name text NOT NULL, building_id uuid REFERENCES building(id)
);

CREATE TABLE spare_part (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  part_number text NOT NULL,
  description text,
  manufacturer text,
  unit_cost numeric(12,2),
  min_qty numeric(12,3) NOT NULL DEFAULT 0,
  reorder_level numeric(12,3) NOT NULL DEFAULT 0,
  UNIQUE (org_id, part_number)
);

CREATE TABLE part_stock (               -- qty per warehouse
  part_id uuid REFERENCES spare_part(id),
  warehouse_id uuid REFERENCES warehouse(id),
  qty numeric(12,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (part_id, warehouse_id)
);

CREATE TABLE part_compat (              -- which assets a part fits
  part_id uuid REFERENCES spare_part(id),
  category_id uuid REFERENCES asset_category(id),
  PRIMARY KEY (part_id, category_id)
);

CREATE TABLE stock_txn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  part_id uuid REFERENCES spare_part(id),
  warehouse_id uuid REFERENCES warehouse(id),
  txn_type text NOT NULL,              -- issue|return|transfer|count|receive
  qty numeric(12,3) NOT NULL,
  work_order_id uuid REFERENCES work_order(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_user(id)
);
```

## 8. Contractors, HSE, fire compliance, utilities

```sql
CREATE TABLE contractor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  name text NOT NULL, contact jsonb,
  rating numeric(3,2),                 -- rolling performance score
  sla_response_hours int
);

CREATE TABLE hse_incident (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  building_id uuid REFERENCES building(id),
  asset_id uuid REFERENCES asset(id),
  type text NOT NULL,                  -- near_miss|unsafe_act|unsafe_condition|accident|property_damage
  severity text, description text,
  reported_by uuid REFERENCES app_user(id),
  occurred_at timestamptz,
  status text NOT NULL DEFAULT 'open'  -- open|investigating|capa|closed
);

CREATE TABLE hse_capa (                 -- root cause + corrective/preventive actions
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES hse_incident(id),
  root_cause text, action text, action_type text,  -- corrective|preventive
  owner_user_id uuid REFERENCES app_user(id),
  due_date date, status text DEFAULT 'open'
);

CREATE TABLE compliance_item (          -- fire/safety devices tracked for compliance
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org(id),
  asset_id uuid REFERENCES asset(id),
  device_type text NOT NULL,           -- extinguisher|sprinkler|fire_door|damper|alarm...
  last_inspection_date date,
  next_inspection_date date,
  cert_expiry_date date,
  compliance_status text               -- compliant|due_soon|overdue|non_compliant
);

CREATE TABLE utility_reading (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  building_id uuid NOT NULL REFERENCES building(id),
  utility text NOT NULL,               -- electricity|water|gas|diesel
  reading_date date NOT NULL,
  consumption numeric(14,3),
  peak_demand numeric(14,3),
  cost numeric(14,2)
) PARTITION BY RANGE (reading_date);    -- monthly partitions
```

## 9. Sync, audit & notifications (high-volume → partitioned)

```sql
-- Single change-log feeding delta-pull (see 09-offline-sync.md)
CREATE TABLE change_log (
  seq bigserial PRIMARY KEY,           -- monotonic cursor
  org_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  op text NOT NULL,                    -- insert|update|delete
  payload jsonb,                       -- changed row snapshot
  changed_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (changed_at);
CREATE INDEX idx_changelog_org_seq ON change_log (org_id, seq);

-- Queued client operations (server-side mirror for dedupe/idempotency)
CREATE TABLE sync_operation (
  op_id uuid PRIMARY KEY,              -- client-generated; dedupe key
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  entity_type text NOT NULL, entity_id uuid,
  op text NOT NULL, payload jsonb,
  applied_at timestamptz, status text DEFAULT 'pending'  -- pending|applied|conflict|rejected
);

CREATE TABLE audit_event (             -- immutable; every mutation
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,                -- e.g. work_order.assign
  entity_type text, entity_id uuid,
  before jsonb, after jsonb,
  ip inet, user_agent text,
  at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (at);

CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES app_user(id),
  type text NOT NULL,                  -- pm_due|pm_overdue|inspection_failed|critical_fault|
                                       -- warranty_expiry|cert_expiry|low_stock
  title text, body text, data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## 10. Partitioning & retention strategy

| Table | Partition | Retention | Rationale |
|-------|-----------|-----------|-----------|
| `change_log` | monthly (`changed_at`) | 90 days hot, archive cold | sync cursor; old deltas irrelevant |
| `audit_event` | monthly (`at`) | 7 yrs (compliance) | immutable legal record |
| `utility_reading` | monthly (`reading_date`) | indefinite | time-series analytics |
| `media_asset` | none (metadata) | follows owner | binaries in object storage |
| `inspection_response`| consider monthly at >100M rows | indefinite | grows fastest |

Indexes are tenant-leading (`org_id, …`) so RLS + queries stay selective. See `10-scalability.md`
for the read-replica and sharding plan.
