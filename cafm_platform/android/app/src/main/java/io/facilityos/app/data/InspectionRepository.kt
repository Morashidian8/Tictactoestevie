package io.facilityos.app.data

import io.facilityos.app.core.config.AppConfig
import io.facilityos.app.core.database.InspectionDao
import io.facilityos.app.core.database.InspectionEntity
import io.facilityos.app.core.database.SyncDao
import io.facilityos.app.core.database.SyncOperationEntity
import io.facilityos.app.core.model.ChecklistTemplate
import io.facilityos.app.core.model.InspectionResponse
import io.facilityos.app.core.model.SyncState
import io.facilityos.app.core.network.FacilityApi
import io.facilityos.app.core.network.toEntity
import io.facilityos.app.core.sync.SyncScheduler
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class InspectionPayload(
    val id: String,
    val templateId: String,
    val assetId: String,
    val startedAt: Long,
    val completedAt: Long,
    val responses: List<InspectionResponse>,
    val inspectorFirstName: String,
    val inspectorLastName: String,
    val inspectorNationalId: String,
    val inspectorPosition: String,
)

/** Inspector identity captured before each checklist. */
data class Inspector(
    val firstName: String,
    val lastName: String,
    val nationalId: String,
    val position: String,
)

/**
 * The inspection hot path. Completing an inspection writes to Room immediately (optimistic UI)
 * and enqueues an idempotent sync operation; the worker pushes it when connectivity allows.
 * Nothing here blocks on the network — the field never waits (docs/09-offline-sync.md).
 */
@Singleton
class InspectionRepository @Inject constructor(
    private val dao: InspectionDao,
    private val syncDao: SyncDao,
    private val api: FacilityApi,
    private val scheduler: SyncScheduler,
    private val json: Json,
    private val config: AppConfig,
) {
    /** Load a template from cache; fetch + cache from network on a miss (online mode only). */
    suspend fun template(id: String): ChecklistTemplate? {
        dao.template(id)?.let { return it.toModel() }
        if (!config.remoteSyncEnabled) return null
        return runCatching {
            val entity = api.template(id).toEntity()
            dao.upsertTemplates(listOf(entity))
            entity.toModel()
        }.getOrNull()
    }

    suspend fun submit(
        templateId: String,
        assetId: String,
        responses: List<InspectionResponse>,
        inspector: Inspector,
    ): String {
        val now = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()
        val opId = UUID.randomUUID().toString()

        dao.insertInspection(
            InspectionEntity(
                id = id,
                templateId = templateId,
                assetId = assetId,
                status = "completed",
                startedAt = now,
                completedAt = now,
                responses = responses,
                inspectorFirstName = inspector.firstName,
                inspectorLastName = inspector.lastName,
                inspectorNationalId = inspector.nationalId,
                inspectorPosition = inspector.position,
                syncState = SyncState.PENDING.name,
            ),
        )

        val payload = json.encodeToString(
            InspectionPayload.serializer(),
            InspectionPayload(
                id, templateId, assetId, now, now, responses,
                inspector.firstName, inspector.lastName, inspector.nationalId, inspector.position,
            ),
        )
        syncDao.enqueue(
            SyncOperationEntity(
                opId = opId,
                entityType = "inspection",
                entityId = id,
                op = "insert",
                payload = payload,
                baseVersion = 0,
                status = "pending",
                createdAt = now,
            ),
        )
        scheduler.syncNow()
        return id
    }
}
