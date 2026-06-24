package io.facilityos.app.core.network

import io.facilityos.app.core.database.AssetEntity
import io.facilityos.app.core.database.BuildingEntity
import io.facilityos.app.core.database.ChecklistTemplateEntity
import io.facilityos.app.core.model.ChecklistItemDef
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// --- Auth -------------------------------------------------------------------

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("mfa_required") val mfaRequired: Boolean = false,
)

// --- Resource DTOs ----------------------------------------------------------

@Serializable
data class BuildingDto(
    val id: String,
    val code: String,
    val name: String,
    val address: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerialName("floors_count") val floorsCount: Int? = null,
    @SerialName("asset_count") val assetCount: Int = 0,
    @SerialName("open_faults") val openFaults: Int = 0,
    @SerialName("last_inspection_at") val lastInspectionAt: Long? = null,
    val status: String = "OPERATIONAL",
)

@Serializable
data class AssetDto(
    val id: String,
    @SerialName("building_id") val buildingId: String,
    @SerialName("category_name") val categoryName: String,
    val name: String,
    @SerialName("asset_code") val assetCode: String,
    @SerialName("qr_uid") val qrUid: String? = null,
    val manufacturer: String? = null,
    val model: String? = null,
    @SerialName("serial_no") val serialNo: String? = null,
    val criticality: String = "MEDIUM",
    @SerialName("warranty_end") val warrantyEnd: Long? = null,
    @SerialName("status_label") val statusLabel: String = "In service",
)

@Serializable
data class ChecklistTemplateDto(
    val id: String,
    val name: String,
    val frequency: String,
    @SerialName("category_name") val categoryName: String? = null,
    val items: List<ChecklistItemDef> = emptyList(),
)

// --- Sync protocol ----------------------------------------------------------

@Serializable
data class SyncOp(
    @SerialName("op_id") val opId: String,
    @SerialName("entity_type") val entityType: String,
    @SerialName("entity_id") val entityId: String,
    val op: String,
    @SerialName("base_version") val baseVersion: Int,
    val payload: String,
)

@Serializable
data class SyncPushRequest(val ops: List<SyncOp>)

@Serializable
data class SyncOpResult(
    @SerialName("op_id") val opId: String,
    val status: String, // applied | conflict | rejected
    @SerialName("server_version") val serverVersion: Int = 0,
)

@Serializable
data class SyncPushResponse(val results: List<SyncOpResult>)

@Serializable
data class ChangeDto(
    @SerialName("entity_type") val entityType: String,
    @SerialName("entity_id") val entityId: String,
    val op: String,
    val payload: String,
    val seq: Long,
)

@Serializable
data class SyncPullResponse(
    val changes: List<ChangeDto>,
    @SerialName("next_cursor") val nextCursor: Long,
    @SerialName("has_more") val hasMore: Boolean,
)

// --- Mappers DTO -> Entity --------------------------------------------------

fun BuildingDto.toEntity() = BuildingEntity(
    id = id, code = code, name = name, address = address, lat = lat, lng = lng,
    floorsCount = floorsCount, assetCount = assetCount, openFaults = openFaults,
    lastInspectionAt = lastInspectionAt, status = status,
)

fun AssetDto.toEntity() = AssetEntity(
    id = id, buildingId = buildingId, categoryName = categoryName, name = name,
    assetCode = assetCode, qrUid = qrUid, manufacturer = manufacturer, model = model,
    serialNo = serialNo, criticality = criticality, warrantyEnd = warrantyEnd,
    statusLabel = statusLabel,
)

fun ChecklistTemplateDto.toEntity() = ChecklistTemplateEntity(
    id = id, name = name, frequency = frequency, categoryName = categoryName, items = items,
)
