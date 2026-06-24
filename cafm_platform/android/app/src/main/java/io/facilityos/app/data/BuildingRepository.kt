package io.facilityos.app.data

import io.facilityos.app.core.database.BuildingDao
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.network.FacilityApi
import io.facilityos.app.core.network.toEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Offline-first: the UI always observes Room; [refresh] pulls the network and updates the cache.
 */
@Singleton
class BuildingRepository @Inject constructor(
    private val dao: BuildingDao,
    private val api: FacilityApi,
) {
    fun observe(query: String): Flow<List<Building>> =
        dao.observe(query).map { list -> list.map { it.toModel() } }

    fun observeById(id: String): Flow<Building?> =
        dao.observeById(id).map { it?.toModel() }

    suspend fun refresh(): Result<Unit> = runCatching {
        dao.upsertAll(api.buildings().map { it.toEntity() })
    }
}
