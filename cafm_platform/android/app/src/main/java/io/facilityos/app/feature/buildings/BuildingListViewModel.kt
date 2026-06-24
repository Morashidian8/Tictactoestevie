package io.facilityos.app.feature.buildings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.database.SyncDao
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.model.SyncState
import io.facilityos.app.data.BuildingRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BuildingListUiState(
    val query: String = "",
    val buildings: List<Building> = emptyList(),
    val pendingCount: Int = 0,
    val syncState: SyncState = SyncState.SYNCED,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class BuildingListViewModel @Inject constructor(
    private val repository: BuildingRepository,
    syncDao: SyncDao,
) : ViewModel() {

    private val query = MutableStateFlow("")

    val state: StateFlow<BuildingListUiState> =
        combine(
            query,
            query.flatMapLatest { repository.observe(it) },
            syncDao.pendingCount(),
        ) { q, buildings, pending ->
            BuildingListUiState(
                query = q,
                buildings = buildings,
                pendingCount = pending,
                syncState = if (pending > 0) SyncState.PENDING else SyncState.SYNCED,
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BuildingListUiState())

    init {
        viewModelScope.launch { repository.refresh() }
    }

    fun onQueryChange(value: String) {
        query.value = value
    }
}
