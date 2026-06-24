package io.facilityos.app.data

import io.facilityos.app.core.database.AssetEntity
import io.facilityos.app.core.database.BuildingEntity
import io.facilityos.app.core.database.ChecklistTemplateEntity
import io.facilityos.app.core.database.FaultEntity
import io.facilityos.app.core.model.Asset
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.model.BuildingStatus
import io.facilityos.app.core.model.ChecklistTemplate
import io.facilityos.app.core.model.Criticality
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.FaultStatus
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.SyncState

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
    syncState = syncState.toEnum(SyncState.PENDING),
)
