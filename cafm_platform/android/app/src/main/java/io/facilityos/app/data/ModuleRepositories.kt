package io.facilityos.app.data

import io.facilityos.app.core.database.ComplianceDao
import io.facilityos.app.core.database.HseDao
import io.facilityos.app.core.database.SparePartDao
import io.facilityos.app.core.database.UtilityDao
import io.facilityos.app.core.database.WorkOrderDao
import io.facilityos.app.core.database.FaultDao
import io.facilityos.app.core.model.ComplianceItem
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.HseIncident
import io.facilityos.app.core.model.SparePart
import io.facilityos.app.core.model.UtilityReading
import io.facilityos.app.core.model.WorkOrder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

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
class InventoryRepository @Inject constructor(private val dao: SparePartDao) {
    fun observe(): Flow<List<SparePart>> = dao.observeAll().map { list -> list.map { it.toModel() } }
}

@Singleton
class HseRepository @Inject constructor(private val dao: HseDao) {
    fun observe(): Flow<List<HseIncident>> = dao.observeAll().map { list -> list.map { it.toModel() } }
}

@Singleton
class ComplianceRepository @Inject constructor(private val dao: ComplianceDao) {
    fun observe(): Flow<List<ComplianceItem>> = dao.observeAll().map { list -> list.map { it.toModel() } }
}

@Singleton
class UtilityRepository @Inject constructor(private val dao: UtilityDao) {
    fun observe(): Flow<List<UtilityReading>> = dao.observeAll().map { list -> list.map { it.toModel() } }
}
