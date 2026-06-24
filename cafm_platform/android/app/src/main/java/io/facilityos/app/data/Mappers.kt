package io.facilityos.app.data

import io.facilityos.app.core.database.AssetEntity
import io.facilityos.app.core.database.BuildingEntity
import io.facilityos.app.core.database.ChecklistTemplateEntity
import io.facilityos.app.core.database.ComplianceItemEntity
import io.facilityos.app.core.database.FaultEntity
import io.facilityos.app.core.database.HseIncidentEntity
import io.facilityos.app.core.database.SparePartEntity
import io.facilityos.app.core.database.UtilityReadingEntity
import io.facilityos.app.core.database.WorkOrderEntity
import io.facilityos.app.core.model.Asset
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.model.BuildingStatus
import io.facilityos.app.core.model.ChecklistTemplate
import io.facilityos.app.core.model.ComplianceItem
import io.facilityos.app.core.model.ComplianceStatus
import io.facilityos.app.core.model.Criticality
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.HseIncident
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.SparePart
import io.facilityos.app.core.model.SyncState
import io.facilityos.app.core.model.UtilityReading
import io.facilityos.app.core.model.WorkOrder
import io.facilityos.app.core.model.WorkOrderStatus

private inline fun <reified T : Enum<T>> String.toEnum(default: T): T =
    enumValues<T>().firstOrNull { it.name.equals(this, ignoreCase = true) } ?: default

fun BuildingEntity.toModel() = Building(
    id = id, code = code, name = name, address = address, lat = lat, lng = lng,
    floorsCount = floorsCount, assetCount = assetCount, openFaults = openFaults,
    lastInspectionAt = lastInspectionAt,
    status = status.toEnum(BuildingStatus.OPERATIONAL),
)

fun AssetEntity.toModel() = Asset(
    id = id, buildingId = buildingId, categoryName = categoryName, name = name,
    assetCode = assetCode, qrUid = qrUid, manufacturer = manufacturer, model = model,
    serialNo = serialNo, criticality = criticality.toEnum(Criticality.MEDIUM),
    warrantyEnd = warrantyEnd, statusLabel = statusLabel,
)

fun ChecklistTemplateEntity.toModel() = ChecklistTemplate(
    id = id, name = name, frequency = frequency, items = items.sortedBy { it.order },
)

fun FaultEntity.toModel() = Fault(
    id = id, assetId = assetId, title = title,
    priority = priority.toEnum(Priority.MEDIUM),
    status = status.toEnum(FaultStatus.OPEN),
    reportedAt = reportedAt,
    resolvedAt = resolvedAt,
    syncState = syncState.toEnum(SyncState.PENDING),
)

fun WorkOrderEntity.toModel() = WorkOrder(
    id = id, woNumber = woNumber, type = type, title = title,
    status = status.toEnum(WorkOrderStatus.SCHEDULED),
    assetId = assetId, dueDate = dueDate, cost = cost,
)

fun SparePartEntity.toModel() = SparePart(
    id = id, partNumber = partNumber, description = description,
    qty = qty, minQty = minQty, location = location, unitCost = unitCost,
)

fun HseIncidentEntity.toModel() = HseIncident(
    id = id, buildingId = buildingId, type = type, severity = severity,
    description = description, status = status, occurredAt = occurredAt,
)

fun ComplianceItemEntity.toModel() = ComplianceItem(
    id = id, assetId = assetId, deviceType = deviceType,
    nextInspection = nextInspection, certExpiry = certExpiry,
    status = status.toEnum(ComplianceStatus.COMPLIANT),
)

fun UtilityReadingEntity.toModel() = UtilityReading(
    id = id, buildingId = buildingId, utility = utility,
    periodLabel = periodLabel, consumption = consumption, cost = cost,
)
