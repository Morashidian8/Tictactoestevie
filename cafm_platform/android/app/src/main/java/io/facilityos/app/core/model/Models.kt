package io.facilityos.app.core.model

import kotlinx.serialization.Serializable

/** Overall building health (drives the status light on the building list/center). */
enum class BuildingStatus { OPERATIONAL, PARTIAL, CRITICAL, CLOSED }

/** Asset criticality rating (see docs/02 asset_criticality). */
enum class Criticality { CRITICAL, HIGH, MEDIUM, LOW }

enum class Priority { CRITICAL, HIGH, MEDIUM, LOW }

/** Corrective-maintenance lifecycle. */
enum class FaultStatus { OPEN, ASSIGNED, IN_PROGRESS, WAITING_PARTS, COMPLETED, CLOSED }

enum class WorkOrderStatus {
    DRAFT, SCHEDULED, ASSIGNED, IN_PROGRESS, ON_HOLD, COMPLETED, CLOSED, CANCELLED
}

/** Response type of a dynamic checklist item. */
enum class ResponseType { PASS_FAIL_NA, NUMERIC, TEXT, PHOTO, SIGNATURE }

/** Local sync state for any field-writable record. */
enum class SyncState { SYNCED, PENDING, ERROR }

data class Building(
    val id: String,
    val code: String,
    val name: String,
    val address: String?,
    val lat: Double?,
    val lng: Double?,
    val floorsCount: Int?,
    val assetCount: Int,
    val openFaults: Int,
    val lastInspectionAt: Long?,
    val status: BuildingStatus,
)

data class Asset(
    val id: String,
    val buildingId: String,
    val categoryName: String,
    val name: String,
    val assetCode: String,
    val qrUid: String?,
    val manufacturer: String?,
    val model: String?,
    val serialNo: String?,
    val criticality: Criticality,
    val warrantyEnd: Long?,
    val statusLabel: String,
)

/** A reusable inspection form definition. */
data class ChecklistTemplate(
    val id: String,
    val name: String,
    val frequency: String,
    val items: List<ChecklistItemDef>,
)

@Serializable
data class ChecklistItemDef(
    val id: String,
    val order: Int,
    val prompt: String,
    val responseType: ResponseType,
    val unit: String? = null,
    val minValue: Double? = null,
    val maxValue: Double? = null,
    val required: Boolean = true,
)

/** One recorded answer in an inspection run. */
@Serializable
data class InspectionResponse(
    val itemId: String,
    val result: String? = null,       // pass|fail|na
    val valueNum: Double? = null,
    val valueText: String? = null,
    val note: String? = null,
)

data class Fault(
    val id: String,
    val assetId: String,
    val title: String,
    val priority: Priority,
    val status: FaultStatus,
    val reportedAt: Long,
    val syncState: SyncState,
)

data class WorkOrder(
    val id: String,
    val woNumber: String,
    val type: String,
    val title: String,
    val status: WorkOrderStatus,
    val assetId: String?,
    val dueDate: Long?,
)
