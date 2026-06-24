package io.facilityos.app.feature.buildings

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Asset
import io.facilityos.app.core.model.Building
import io.facilityos.app.data.AssetRepository
import io.facilityos.app.data.BuildingRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BuildingDetailUiState(
    val building: Building? = null,
    val assets: List<Asset> = emptyList(),
)

@HiltViewModel
class BuildingDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    buildingRepository: BuildingRepository,
    assetRepository: AssetRepository,
) : ViewModel() {

    private val buildingId: String = checkNotNull(savedStateHandle["buildingId"])

    val state: StateFlow<BuildingDetailUiState> =
        combine(
            buildingRepository.observeById(buildingId),
            assetRepository.observeForBuilding(buildingId),
        ) { building, assets ->
            BuildingDetailUiState(building = building, assets = assets)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BuildingDetailUiState())

    init {
        viewModelScope.launch { assetRepository.refresh(buildingId) }
    }
}
