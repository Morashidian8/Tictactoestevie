# 04 — API Design

REST + JSON over HTTPS, versioned at `/api/v1`. A dedicated **sync** surface (`/sync/*`) handles
the offline delta protocol. OpenAPI 3.1 is the contract of record; gRPC is an option for the
high-throughput sync stream at scale.

## 1. Conventions

- **Base:** `https://api.facilityos.io/api/v1`
- **Auth:** `Authorization: Bearer <JWT access>`. Access token ~15 min, refresh ~30 days, rotating.
- **Tenancy:** `org_id` is taken from the token claims, never from the client body.
- **Idempotency:** mutating requests accept `Idempotency-Key: <op_id uuid>`; replays return the
  original result. Essential for offline retries.
- **Pagination:** cursor-based — `?limit=50&cursor=<opaque>`; responses include `next_cursor`.
- **Filtering/sorting:** `?filter[status]=open&filter[building_id]=…&sort=-due_date`.
- **Errors:** RFC 9457 problem+json:
  ```json
  { "type":"https://facilityos.io/errors/validation","title":"Validation failed",
    "status":422,"detail":"reorder_level must be >= 0","errors":{"reorder_level":["min:0"]} }
  ```
- **Concurrency:** `ETag` / `If-Match` (maps to row `version`) → 412 on stale write.
- **Rate limits:** per-token token bucket; `429` with `Retry-After`.

## 2. Auth & identity

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | email+password → tokens (triggers MFA challenge if enabled) |
| POST | `/auth/mfa/verify` | submit TOTP → tokens |
| POST | `/auth/refresh` | rotate refresh → new access |
| POST | `/auth/logout` | revoke refresh token |
| GET  | `/me` | current user, roles, permissions, org settings |
| POST | `/devices` | register FCM token for push |

## 3. Core resource endpoints (representative)

Standard CRUD pattern `GET/POST/PATCH/DELETE` per resource; only notable ones listed.

### Buildings & twin
```
GET    /buildings                 ?filter[status]=&search=&bbox=minLng,minLat,maxLng,maxLat
GET    /buildings/{id}
GET    /buildings/{id}/tree       → full location_node hierarchy (nested)
GET    /buildings/{id}/status     → live status center payload (subsystem health lights)
POST   /buildings/{id}/locations  → add a location node
GET    /buildings/nearby          ?lat=&lng=&radius_m=  (PostGIS)
```

### Assets
```
GET    /assets                    ?filter[category_id]=&filter[building_id]=&search=
GET    /assets/{id}               → identification, technical, lifecycle, criticality
GET    /assets/{id}/history       → inspections, faults, work orders, parts, costs (merged timeline)
GET    /assets/by-qr/{qr_uid}     → resolve a scanned code to an asset (hot path)
POST   /assets                    Idempotency-Key required
PATCH  /assets/{id}               If-Match: "<version>"
GET    /asset-categories          → category tree
GET    /asset-categories/{id}/fields → custom field definitions (drives dynamic asset form)
```

### Inspections (dynamic forms)
```
GET    /checklist-templates       ?filter[category_id]=&filter[frequency]=
GET    /checklist-templates/{id}  → items + response types (renders the form)
POST   /inspections               { template_id, asset_id, responses[], op_id }
GET    /inspections/{id}
POST   /inspections/{id}/signature  multipart → stores signature image
```

### Maintenance
```
GET    /faults                    ?filter[status]=open&filter[priority]=critical
POST   /faults                    { asset_id, title, priority, media_ids[], op_id }
PATCH  /faults/{id}               status transitions (validated)
GET    /pm-plans                  ; POST /pm-plans ; POST /pm-plans/{id}/generate (manual run)
GET    /work-orders               ?filter[assigned_user_id]=me&filter[status]=
POST   /work-orders ; PATCH /work-orders/{id} ; POST /work-orders/{id}/complete
       { labor_hours, parts:[{part_id,qty}], evidence_media_ids[], signature, op_id }
```

### Inventory / contractors / HSE / compliance / utilities
```
GET    /spare-parts ; POST /stock-txns ; GET /spare-parts/low-stock
GET    /contractors ; GET /contractors/{id}/performance
GET    /hse/incidents ; POST /hse/incidents ; POST /hse/incidents/{id}/capa
GET    /compliance/items ?filter[compliance_status]=overdue
GET    /compliance/report          → async job (see reporting)
GET    /utilities/readings ; POST /utilities/readings
GET    /utilities/analytics       ?building_id=&utility=electricity&from=&to=&granularity=month
```

## 4. Media upload (direct-to-storage)

Avoid proxying large binaries through the API:
```
POST /media/presign   { owner_type, owner_id, kind, mime, bytes }
     → { media_id, upload_url (presigned PUT, ~15 min), storage_key }
PUT  <upload_url>      (client uploads bytes directly to S3/MinIO)
POST /media/{id}/commit  → marks uploaded, enqueues thumbnail/transcode job
```
On the device, the `media_id` is referenced locally before upload completes; sync tolerates
not-yet-uploaded media (status `pending`).

## 5. Dashboards & reporting

```
GET  /dashboards/technician   → today's tasks, overdue, assigned WOs, upcoming inspections
GET  /dashboards/supervisor   → team performance, open WOs, failed inspections, asset status
GET  /dashboards/manager      → asset health, PM compliance, critical faults, cost
GET  /dashboards/executive    → asset value, maint cost, deferred cost, availability, MTBF, MTTR, risk

POST /reports                 { type, scope:{building_id|asset_id|date_range}, format:pdf|xlsx }
     → 202 { job_id }
GET  /reports/{job_id}        → { status, download_url? }   (async; result in object storage)
```

## 6. Sync surface (offline protocol)

See `09-offline-sync.md` for semantics. Two endpoints:
```
GET  /sync/pull?since=<cursor>&entities=asset,work_order,...
     → { changes:[{entity_type,entity_id,op,payload,seq}], next_cursor, has_more }

POST /sync/push
     { ops:[ { op_id, entity_type, entity_id, op, base_version, payload } ] }
     → { results:[ { op_id, status: applied|conflict|rejected, server_version, server_payload? } ] }
```
- `pull` is a forward-only cursor over `change_log` scoped to the user's permitted buildings.
- `push` is transactional per op, idempotent on `op_id`, and returns conflicts with the server's
  current state so the client can merge.

## 7. AI / assistant (Phase 4)

```
POST /assistant/query   { text:"Show all overdue elevators" }
     → { intent, structured_filter, results[], answer_text }
GET  /assets/{id}/health-prediction   → { score, predicted_failure_window, drivers[] }
POST /vision/defect-detect            multipart image → { findings:[{label,confidence,bbox}] }
```

## 8. Webhooks (integration)

Outbound webhooks for ERP/BMS integration: `work_order.completed`, `fault.created`,
`compliance.overdue`, `inventory.low_stock`. Signed with HMAC; retried with backoff.

## 9. OpenAPI snippet (illustrative)

```yaml
openapi: 3.1.0
info: { title: FacilityOS API, version: "1.0.0" }
paths:
  /assets/by-qr/{qr_uid}:
    get:
      summary: Resolve a scanned QR to an asset
      parameters:
        - { name: qr_uid, in: path, required: true, schema: { type: string } }
      responses:
        "200": { description: OK, content: { application/json: { schema: { $ref: "#/components/schemas/Asset" }}}}
        "404": { description: Unknown code }
components:
  schemas:
    Asset:
      type: object
      required: [id, asset_code, category_id, building_id]
      properties:
        id: { type: string, format: uuid }
        asset_code: { type: string }
        name: { type: string }
        category_id: { type: string, format: uuid }
        building_id: { type: string, format: uuid }
        criticality: { type: string, enum: [critical, high, medium, low] }
        attributes: { type: object, additionalProperties: true }
        version: { type: integer }
```
