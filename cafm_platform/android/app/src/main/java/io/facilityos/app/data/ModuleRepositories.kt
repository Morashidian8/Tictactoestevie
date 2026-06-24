package io.facilityos.app.data

import io.facilityos.app.core.database.ComplianceDao
import io.facilityos.app.core.database.FaultDao
import io.facilityos.app.core.database.HseDao
import io.facilityos.app.core.database.HseIncidentEntity
import io.facilityos.app.core.database.SparePartDao
import io.facilityos.app.core.database.SparePartEntity
import io.facilityos.app.core.database.SyncDao
import io.facilityos.app.core.database.SyncOperationEntity
import io.facilityos.app.core.database.UtilityDao
import io.facilityos.app.core.database.UtilityReadingEntity
import io.facilityos.app.core.database.WorkOrderDao
import io.facilityos.app.core.model.ComplianceItem
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.HseIncident
import io.facilityos.app.core.model.SparePart
import io.facilityos.app.core.model.UtilityReading
import io.facilityos.app.core.model.WorkOrder
import io.facilityos.app.core.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Queue an idempotent offline op and kick a (no-op while offline) sync. */
private suspend fun SyncDao.queue(
    scheduler: SyncScheduler,
    entityType: String,
    entityId: String,
    op: String,
    payload: String,
) {
    enqueue(
        SyncOperationEntity(
            opId = UUID.randomUUID().toString(),
            entityType = entityType,
            entityId = entityId,
            op = op,
            payload = payload,
            baseVersion = 0,
            status = "pending",
            createdAt = System.currentTimeMillis(),
        ),
    )
    scheduler.syncNow()
}

@Singleton
class WorkRepository @Inject constructor(
    private val workOrderDao: WorkOrderDao,
    private val faultDao: FaultDao,
) {
    fun observeWorkOrders(): Flow<List<WorkOrder>> =
        workOrderDao.observeAll().map { list -> list.map { it.toModel() } }

    fun observeFaults(): Flow<List<Fault>> =
        faultDao.observeAll().map { list -> list.map { it.toModel() } }
}

@Singleton
class InventoryRepository @Inject constructor(
    private val dao: SparePartDao,
    private val syncDao: SyncDao,
    private val scheduler: SyncScheduler,
) {
    fun observe(): Flow<List<SparePart>> = dao.observeAll().map { list -> list.map { it.toModel() } }

    suspend fun addPart(
        partNumber: String,
        description: String,
        qty: Double,
        minQty: Double,
        location: String,
        unitCost: Double,
    ) {
        val entity = SparePartEntity(
            id = UUID.randomUUID().toString(),
            partNumber = partNumber,
            description = description,
            qty = qty,
            minQty = minQty,
            location = location,
            unitCost = unitCost,
        )
        dao.upsertAll(listOf(entity))
        syncDao.queue(scheduler, "spare_part", entity.id, "insert", "{\"partNumber\":\"$partNumber\"}")
    }
}

@Singleton
class HseRepository @Inject constructor(
    private val dao: HseDao,
    private val syncDao: SyncDao,
    private val scheduler: SyncScheduler,
) {
    fun observe(): Flow<List<HseIncident>> = dao.observeAll().map { list -> list.map { it.toModel() } }

    suspend fun add(buildingId: String, type: String, severity: String, description: String) {
        val entity = HseIncidentEntity(
            id = UUID.randomUUID().toString(),
            buildingId = buildingId,
            type = type,
            severity = severity,
            description = description,
            status = "open",
            occurredAt = System.currentTimeMillis(),
        )
        dao.upsertAll(listOf(entity))
        syncDao.queue(scheduler, "hse_incident", entity.id, "insert", "{\"type\":\"$type\"}")
    }
}

@Singleton
class ComplianceRepository @Inject constructor(private val dao: ComplianceDao) {
    fun observe(): Flow<List<ComplianceItem>> = dao.observeAll().map { list -> list.map { it.toModel() } }
}

@Singleton
class UtilityRepository @Inject constructor(
    private val dao: UtilityDao,
    private val syncDao: SyncDao,
    private val scheduler: SyncScheduler,
) {
    fun observe(): Flow<List<UtilityReading>> = dao.observeAll().map { list -> list.map { it.toModel() } }

    suspend fun add(
        buildingId: String,
        utility: String,
        periodLabel: String,
        consumption: Double,
        cost: Double,
    ) {
        val entity = UtilityReadingEntity(
            id = UUID.randomUUID().toString(),
            buildingId = buildingId,
            utility = utility,
            periodLabel = periodLabel,
            consumption = consumption,
            cost = cost,
        )
        dao.upsertAll(listOf(entity))
        syncDao.queue(scheduler, "utility_reading", entity.id, "insert", "{\"utility\":\"$utility\"}")
    }
}
