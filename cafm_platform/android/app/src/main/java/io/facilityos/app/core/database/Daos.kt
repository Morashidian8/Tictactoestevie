package io.facilityos.app.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface BuildingDao {
    @Query(
        "SELECT * FROM building " +
            "WHERE name LIKE '%' || :query || '%' OR code LIKE '%' || :query || '%' " +
            "ORDER BY name",
    )
    fun observe(query: String): Flow<List<BuildingEntity>>

    @Query("SELECT * FROM building WHERE id = :id")
    fun observeById(id: String): Flow<BuildingEntity?>

    @Upsert
    suspend fun upsertAll(items: List<BuildingEntity>)
}

@Dao
interface AssetDao {
    @Query("SELECT * FROM asset WHERE buildingId = :buildingId ORDER BY name")
    fun observeForBuilding(buildingId: String): Flow<List<AssetEntity>>

    @Query("SELECT * FROM asset WHERE id = :id")
    fun observeById(id: String): Flow<AssetEntity?>

    @Query("SELECT * FROM asset WHERE qrUid = :qrUid LIMIT 1")
    suspend fun findByQr(qrUid: String): AssetEntity?

    @Upsert
    suspend fun upsertAll(items: List<AssetEntity>)
}

@Dao
interface InspectionDao {
    @Query("SELECT * FROM checklist_template WHERE id = :id")
    suspend fun template(id: String): ChecklistTemplateEntity?

    @Query("SELECT * FROM checklist_template WHERE categoryName = :category")
    suspend fun templatesForCategory(category: String): List<ChecklistTemplateEntity>

    @Upsert
    suspend fun upsertTemplates(items: List<ChecklistTemplateEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInspection(inspection: InspectionEntity)

    @Query("SELECT * FROM inspection WHERE assetId = :assetId ORDER BY startedAt DESC")
    fun observeForAsset(assetId: String): Flow<List<InspectionEntity>>
}

@Dao
interface FaultDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(fault: FaultEntity)

    @Query("SELECT * FROM fault WHERE assetId = :assetId ORDER BY reportedAt DESC")
    fun observeForAsset(assetId: String): Flow<List<FaultEntity>>

    @Upsert
    suspend fun upsertAll(items: List<FaultEntity>)
}

@Dao
interface WorkOrderDao {
    @Query("SELECT * FROM work_order WHERE status != 'CLOSED' ORDER BY dueDate")
    fun observeOpen(): Flow<List<WorkOrderEntity>>

    @Upsert
    suspend fun upsertAll(items: List<WorkOrderEntity>)
}

@Dao
interface SyncDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(op: SyncOperationEntity)

    @Query("SELECT * FROM sync_operation WHERE status = 'pending' ORDER BY createdAt LIMIT :limit")
    suspend fun pending(limit: Int = 100): List<SyncOperationEntity>

    @Query("SELECT COUNT(*) FROM sync_operation WHERE status = 'pending'")
    fun pendingCount(): Flow<Int>

    @Query("UPDATE sync_operation SET status = :status WHERE opId = :opId")
    suspend fun mark(opId: String, status: String)

    @Query("SELECT cursor FROM sync_cursor WHERE id = 0")
    suspend fun cursor(): Long?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun setCursor(cursor: SyncCursorEntity)
}
