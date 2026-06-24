package io.facilityos.app.data

import io.facilityos.app.core.database.AssetDao
import io.facilityos.app.core.database.BuildingDao
import io.facilityos.app.core.database.FaultDao
import io.facilityos.app.core.database.WorkOrderDao
import io.facilityos.app.core.model.Criticality
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.WorkOrder
import io.facilityos.app.core.model.WorkOrderStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import javax.inject.Inject
import javax.inject.Singleton

/** Everything the four role dashboards and the executive KPIs need, computed live from Room. */
data class DashboardData(
    val buildings: Int = 0,
    val assets: Int = 0,
    val openFaults: Int = 0,
    val criticalFaults: Int = 0,
    val overdueInspections: Int = 0,
    val overdueWorkOrders: Int = 0,
    val pmCompliancePct: Int = 100,
    val assetHealthScore: Int = 100,
    val availabilityPct: Int = 100,
    val mttrHours: Double? = null,
    val mtbfDays: Double? = null,
    val riskScore: Int = 0,
    val maintenanceCost: Double = 0.0,
    val deferredCost: Double = 0.0,
    val assetValueEstimate: Double = 0.0,
    val topFaults: List<Fault> = emptyList(),
    val openWorkOrders: List<WorkOrder> = emptyList(),
)

@Singleton
class DashboardRepository @Inject constructor(
    private val buildingDao: BuildingDao,
    private val assetDao: AssetDao,
    private val faultDao: FaultDao,
    private val workOrderDao: WorkOrderDao,
) {
    fun observe(): Flow<DashboardData> = combine(
        buildingDao.observe(""),
        assetDao.observeAll(),
        faultDao.observeAll(),
        workOrderDao.observeAll(),
    ) { buildings, assets, faults, workOrders ->
        val now = System.currentTimeMillis()
        val day = 24 * 60 * 60 * 1000L

        val openFaults = faults.filter {
            it.status != FaultStatus.CLOSED.name && it.status != FaultStatus.COMPLETED.name
        }
        val critical = openFaults.filter { it.priority == Priority.CRITICAL.name }
        val downAssets = assets.count { it.statusLabel.equals("Down", ignoreCase = true) }
        val inService = assets.size - downAssets

        val overdueInspections = buildings.count {
            it.lastInspectionAt != null && it.lastInspectionAt < now - 30 * day
        }

        val pmWorkOrders = workOrders.filter { it.type == "pm" }
        val pmDone = pmWorkOrders.count {
            it.status == WorkOrderStatus.COMPLETED.name || it.status == WorkOrderStatus.CLOSED.name
        }
        val pmCompliance = if (pmWorkOrders.isNotEmpty()) pmDone * 100 / pmWorkOrders.size else 100

        val terminal = setOf(
            WorkOrderStatus.COMPLETED.name, WorkOrderStatus.CLOSED.name, WorkOrderStatus.CANCELLED.name,
        )
        val overdueWorkOrders = workOrders.count {
            it.dueDate != null && it.dueDate < now && it.status !in terminal
        }

        val resolved = faults.mapNotNull { f -> f.resolvedAt?.let { it - f.reportedAt } }
        val mttrHours = if (resolved.isNotEmpty()) resolved.average() / (60 * 60 * 1000) else null
        val mtbfDays = if (faults.isNotEmpty()) assets.size * 90.0 / faults.size else null

        val health = (100 - (critical.size * 5 + (openFaults.size - critical.size) * 2 +
            overdueInspections + downAssets * 3)).coerceIn(0, 100)
        val availability = if (assets.isNotEmpty()) inService * 100 / assets.size else 100
        val risk = (critical.size * 20 + overdueWorkOrders * 5).coerceAtMost(100)

        val maintenanceCost = workOrders
            .filter { it.status == WorkOrderStatus.COMPLETED.name || it.status == WorkOrderStatus.CLOSED.name }
            .sumOf { it.cost ?: 0.0 }
        val deferredCost = workOrders.filter { it.status !in terminal }.sumOf { it.cost ?: 0.0 }
        val assetValue = assets.sumOf { a ->
            when (a.criticality) {
                Criticality.CRITICAL.name -> 200_000.0
                Criticality.HIGH.name -> 80_000.0
                Criticality.MEDIUM.name -> 30_000.0
                else -> 10_000.0
            }
        }

        val priorityRank = mapOf(
            Priority.CRITICAL.name to 0, Priority.HIGH.name to 1,
            Priority.MEDIUM.name to 2, Priority.LOW.name to 3,
        )
        val topFaults = openFaults
            .sortedWith(compareBy({ priorityRank[it.priority] ?: 9 }, { -it.reportedAt }))
            .take(5)
            .map { it.toModel() }
        val openWos = workOrders.filter { it.status !in terminal }.take(8).map { it.toModel() }

        DashboardData(
            buildings = buildings.size,
            assets = assets.size,
            openFaults = openFaults.size,
            criticalFaults = critical.size,
            overdueInspections = overdueInspections,
            overdueWorkOrders = overdueWorkOrders,
            pmCompliancePct = pmCompliance,
            assetHealthScore = health,
            availabilityPct = availability,
            mttrHours = mttrHours,
            mtbfDays = mtbfDays,
            riskScore = risk,
            maintenanceCost = maintenanceCost,
            deferredCost = deferredCost,
            assetValueEstimate = assetValue,
            topFaults = topFaults,
            openWorkOrders = openWos,
        )
    }
}
