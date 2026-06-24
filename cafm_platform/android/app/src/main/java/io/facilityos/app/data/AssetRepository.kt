package io.facilityos.app.data

import io.facilityos.app.core.config.AppConfig
import io.facilityos.app.core.database.AssetDao
import io.facilityos.app.core.model.Asset
import io.facilityos.app.core.network.FacilityApi
import io.facilityos.app.core.network.toEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AssetRepository @Inject constructor(
    private val dao: AssetDao,
    private val api: FacilityApi,
    private val config: AppConfig,
) {
    fun observeForBuilding(buildingId: String): Flow<List<Asset>> =
        dao.observeForBuilding(buildingId).map { list -> list.map { it.toModel() } }

    fun observeById(id: String): Flow<Asset?> =
        dao.observeById(id).map { it?.toModel() }

    /** Resolve a scanned QR locally; fall back to the network only when remote sync is enabled. */
    suspend fun resolveQr(qrUid: String): Asset? {
        dao.findByQr(qrUid)?.let { return it.toModel() }
        if (!config.remoteSyncEnabled) return null
        return runCatching {
            val dto = api.assetByQr(qrUid)
            dao.upsertAll(listOf(dto.toEntity()))
            dto.toEntity().toModel()
        }.getOrNull()
    }

    suspend fun refresh(buildingId: String): Result<Unit> = runCatching {
        if (!config.remoteSyncEnabled) return@runCatching
        dao.upsertAll(api.assets(buildingId).map { it.toEntity() })
    }
}
