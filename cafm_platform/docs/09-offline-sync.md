# 09 — Offline Synchronization Architecture

The app must work **fully offline** — inspections, maintenance, asset data, photos — and reconcile
automatically when connectivity returns. This is the most important architectural property for
field use.

## 1. Principles

1. **Local-first:** Room (SQLite, SQLCipher-encrypted) is the device's source of truth. The UI
   never waits on the network; repositories read/write Room and the sync engine moves deltas.
2. **Server is system of record:** server assigns authoritative sequence numbers and resolves
   conflicts; device IDs are client-generated UUIDs so records exist before they reach the server.
3. **Idempotent operations:** every mutation has a client `op_id`; replays are no-ops.
4. **Bounded working set:** a device syncs only the buildings/assets the user is permitted and
   recently used, plus pinned favorites — not the whole org.

## 2. Data flow

```
  WRITE (offline)                         READ (offline)
  UI → Repo → Room (commit)               UI → Repo → Room (instant)
            → enqueue sync_operation

  SYNC (online, WorkManager)
  1. PUSH local ops      → POST /sync/push   (idempotent on op_id)
  2. resolve conflicts   → field merge or user prompt
  3. PULL server deltas  → GET /sync/pull?since=<cursor>
  4. apply to Room       → emit Flow → UI refresh
  5. upload media        → presigned PUT, then commit
```

## 3. Change tracking (server)

A single append-only `change_log` (partitioned by month) records every committed change with a
monotonic `seq`. `GET /sync/pull?since=<seq>` streams forward-only deltas scoped to the user's
permitted buildings. The client persists the last `seq` as its cursor. This avoids per-table
"updated_at" scanning and gives a clean, resumable cursor.

## 4. Push protocol

```
POST /sync/push
{ "ops": [
  { "op_id":"uuid", "entity_type":"inspection", "entity_id":"uuid",
    "op":"insert", "base_version":0, "payload":{...} },
  { "op_id":"uuid", "entity_type":"work_order", "entity_id":"uuid",
    "op":"update", "base_version":7, "payload":{ "status":"completed", ... } }
]}
→ { "results": [
  { "op_id":"...", "status":"applied",  "server_version":1 },
  { "op_id":"...", "status":"conflict", "server_version":9, "server_payload":{...} }
]}
```
- Each op applied in its own transaction; `op_id` deduped via `sync_operation`.
- `base_version` mismatch → `conflict` with current server state returned.

## 5. Conflict resolution

| Scenario | Strategy |
|----------|----------|
| Two devices edit **different fields** of one record | **Field-level last-writer-wins merge** (per-field timestamps) → auto-resolved |
| Same field edited on both | LWW by server-received time; loser surfaced in conflict log |
| Append-only children (inspection responses, stock txns, audit) | **No conflict** — always insert (CRDT-grow-only set) |
| Delete vs update | **Tombstone wins** unless update is a status-forward transition; flagged if ambiguous |
| Status state-machine (WO/fault) | Server validates legal transitions; illegal → `rejected`, user re-resolves |
| Sequence/number allocation (wo_number) | Server-authoritative; client shows temp number until assigned |

Unresolvable conflicts appear in the **Sync status / conflicts** screen (screen #34) for the user
to pick a winner — rare by design because most field writes are appends or disjoint fields.

## 6. Media sync

- Photos/voice captured offline are written to local storage; a `media_asset` row (status
  `pending`) and its `op_id` are queued.
- On sync: `POST /media/presign` → direct presigned `PUT` to object storage → `POST /commit`.
- Records can reference not-yet-uploaded media; the server tolerates `pending` media and reconciles
  when the binary arrives. Uploads are chunked/resumable and prefer Wi-Fi/charging via WorkManager
  constraints.

## 7. Initial & incremental hydration

- **First login:** bulk download of permitted buildings, their twins, assets, active templates,
  open WOs/faults, and reference data (categories, parts catalog) via paged endpoints; sets cursor.
- **Steady state:** periodic + event-triggered (FCM "data available") delta pulls keep the device
  current with minimal bandwidth.
- **Eviction:** least-recently-used buildings' detail data can be evicted under storage pressure
  (re-fetched on demand).

## 8. Guarantees & edge cases

- **No lost work:** drafts persist on every keystroke; ops survive app kill/restart (WorkManager
  is durable).
- **Clock skew:** server timestamps are authoritative for ordering; device clocks only for UX.
- **Partial sync failure:** per-op results mean one bad op doesn't block the batch.
- **Schema evolution:** payloads are versioned; the server upcasts old client payloads.
- **Bandwidth:** deltas are gzip'd; media deferred to Wi-Fi; pull is paged with `has_more`.
