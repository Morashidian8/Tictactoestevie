package io.facilityos.app.data

import io.facilityos.app.core.database.FaultDao
import io.facilityos.app.core.database.FaultEntity
import io.facilityos.app.core.database.SyncDao
import io.facilityos.app.core.database.SyncOperationEntity
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.SyncState
import io.facilityos.app.core.sync.SyncScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class FaultPayload(
    val id: String,
    val assetId: String,
    val title: String,
    val priority: String,
    val status: String,
    val reportedAt: Long,
)

@Singleton
class FaultRepository @Inject constructor(
    private val dao: FaultDao,
    private val syncDao: SyncDao,
    private val scheduler: SyncScheduler,
    private val json: Json,
) {
    fun observeForAsset(assetId: String): Flow<List<Fault>> =
        dao.observeForAsset(assetId).map { list -> list.map { it.toModel() } }

    /** Offline-first fault creation: write locally, queue a sync op, kick a sync. */
    suspend fun add(
        assetId: String,
        title: String,
        priority: Priority = Priority.MEDIUM,
    ): String {
        val now = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()

        dao.insert(
            FaultEntity(
                id = id,
                assetId = assetId,
                title = title,
                priority = priority.name,
                status = FaultStatus.OPEN.name,
                reportedAt = now,
                syncState = SyncState.PENDING.name,
            ),
        )
        syncDao.enqueue(
            SyncOperationEntity(
                opId = UUID.randomUUID().toString(),
                entityType = "fault",
                entityId = id,
                op = "insert",
                payload = json.encodeToString(
                    FaultPayload.serializer(),
                    FaultPayload(id, assetId, title, priority.name, FaultStatus.OPEN.name, now),
                ),
                baseVersion = 0,
                status = "pending",
                createdAt = now,
            ),
        )
        scheduler.syncNow()
        return id
    }

    fun reportFaultAsync(
        scope: CoroutineScope,
        assetId: String,
        title: String,
        priority: Priority = Priority.MEDIUM,
    ) = scope.launch { add(assetId, title, priority) }
}
