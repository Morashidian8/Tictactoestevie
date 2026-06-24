package io.facilityos.app.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

/**
 * Local source of truth. In production this is opened with SQLCipher (encrypted at rest —
 * see docs/08-security.md). The UI always reads from here; the network only feeds sync.
 */
@Database(
    entities = [
        BuildingEntity::class,
        AssetEntity::class,
        ChecklistTemplateEntity::class,
        InspectionEntity::class,
        FaultEntity::class,
        WorkOrderEntity::class,
        SyncOperationEntity::class,
        SyncCursorEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class FacilityDatabase : RoomDatabase() {
    abstract fun buildingDao(): BuildingDao
    abstract fun assetDao(): AssetDao
    abstract fun inspectionDao(): InspectionDao
    abstract fun faultDao(): FaultDao
    abstract fun workOrderDao(): WorkOrderDao
    abstract fun syncDao(): SyncDao
}
