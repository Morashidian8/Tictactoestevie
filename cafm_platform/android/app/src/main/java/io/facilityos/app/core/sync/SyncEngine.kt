package io.facilityos.app.core.sync

import io.facilityos.app.core.database.FacilityDatabase
import io.facilityos.app.core.database.SyncCursorEntity
import io.facilityos.app.core.network.AssetDto
import io.facilityos.app.core.network.BuildingDto
import io.facilityos.app.core.network.FacilityApi
import io.facilityos.app.core.network.SyncOp
import io.facilityos.app.core.network.SyncPushRequest
import io.facilityos.app.core.network.toEntity
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Two-phase offline sync (docs/09-offline-sync.md):
 *   1. PUSH queued local ops (idempotent on op_id) and reconcile their status.
 *   2. PULL server deltas since the stored cursor and apply them to Room.
 *
 * Errors are swallowed per-phase so a transient network failure simply retries next run;
 * the device keeps working from its local source of truth in the meantime.
 */
@Singleton
class SyncEngine @Inject constructor(
    private val api: FacilityApi,
    private val db: FacilityDatabase,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun sync(): Result<Unit> = runCatching {
        push()
        pull()
    }

    private suspend fun push() {
        val sync = db.syncDao()
        val pending = sync.pending()
        if (pending.isEmpty()) return

        val ops = pending.map {
            SyncOp(
                opId = it.opId,
                entityType = it.entityType,
                entityId = it.entityId,
                op = it.op,
                baseVersion = it.baseVersion,
                payload = it.payload,
            )
        }
        val response = api.syncPush(SyncPushRequest(ops))
        response.results.forEach { result ->
            // conflict/rejected ops are surfaced to the conflict UI in a full build.
            sync.mark(result.opId, result.status)
        }
    }

    private suspend fun pull() {
        val sync = db.syncDao()
        var cursor = sync.cursor() ?: 0L
        do {
            val page = api.syncPull(since = cursor)
            page.changes.forEach { applyChange(it.entityType, it.payload) }
            cursor = page.nextCursor
            sync.setCursor(SyncCursorEntity(cursor = cursor))
        } while (page.hasMore)
    }

    private suspend fun applyChange(entityType: String, payload: String) {
        when (entityType) {
            "building" ->
                db.buildingDao().upsertAll(listOf(json.decodeFromString<BuildingDto>(payload).toEntity()))
            "asset" ->
                db.assetDao().upsertAll(listOf(json.decodeFromString<AssetDto>(payload).toEntity()))
            // other entity types handled as the protocol grows
        }
    }
}
