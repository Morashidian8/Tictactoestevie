package io.facilityos.app.core.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import io.facilityos.app.core.model.ChecklistItemDef
import io.facilityos.app.core.model.InspectionResponse

@Entity(tableName = "building")
data class BuildingEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val address: String?,
    val lat: Double?,
    val lng: Double?,
    val floorsCount: Int?,
    val assetCount: Int,
    val openFaults: Int,
    val lastInspectionAt: Long?,
    val status: String,
)

@Entity(
    tableName = "asset",
    indices = [Index("buildingId"), Index(value = ["qrUid"], unique = true)],
)
data class AssetEntity(
    @PrimaryKey val id: String,
    val buildingId: String,
    val categoryName: String,
    val name: String,
    val assetCode: String,
    val qrUid: String?,
    val manufacturer: String?,
    val model: String?,
    val serialNo: String?,
    val criticality: String,
    val warrantyEnd: Long?,
    val statusLabel: String,
)

@Entity(tableName = "checklist_template")
data class ChecklistTemplateEntity(
    @PrimaryKey val id: String,
    val name: String,
    val frequency: String,
    val categoryName: String?,
    val items: List<ChecklistItemDef>,
)

@Entity(tableName = "inspection")
data class InspectionEntity(
    @PrimaryKey val id: String,
    val templateId: String,
    val assetId: String,
    val status: String,
    val startedAt: Long,
    val completedAt: Long?,
    val responses: List<InspectionResponse>,
    val syncState: String,
)

@Entity(tableName = "fault", indices = [Index("assetId"), Index("status")])
data class FaultEntity(
    @PrimaryKey val id: String,
    val assetId: String,
    val title: String,
    val priority: String,
    val status: String,
    val reportedAt: Long,
    val syncState: String,
)

@Entity(tableName = "work_order", indices = [Index("status")])
data class WorkOrderEntity(
    @PrimaryKey val id: String,
    val woNumber: String,
    val type: String,
    val title: String,
    val status: String,
    val assetId: String?,
    val dueDate: Long?,
)

/**
 * Outbound offline mutation queue. Each row is an idempotent operation (keyed by [opId])
 * awaiting push to the server (see docs/09-offline-sync.md).
 */
@Entity(tableName = "sync_operation", indices = [Index("status")])
data class SyncOperationEntity(
    @PrimaryKey val opId: String,
    val entityType: String,
    val entityId: String,
    val op: String,            // insert | update | delete
    val payload: String,       // JSON body
    val baseVersion: Int,
    val status: String,        // pending | applied | conflict | rejected
    val createdAt: Long,
)

/** Single-row table holding the server change-log cursor for delta pulls. */
@Entity(tableName = "sync_cursor")
data class SyncCursorEntity(
    @PrimaryKey val id: Int = 0,
    val cursor: Long,
)
