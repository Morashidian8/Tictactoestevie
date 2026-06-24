package io.facilityos.app.feature.assets

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Asset
import io.facilityos.app.core.model.Fault
import io.facilityos.app.data.AssetRepository
import io.facilityos.app.data.FaultRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class AssetDetailUiState(
    val asset: Asset? = null,
    val faults: List<Fault> = emptyList(),
)

@HiltViewModel
class AssetDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    assetRepository: AssetRepository,
    private val faultRepository: FaultRepository,
) : ViewModel() {

    val assetId: String = checkNotNull(savedStateHandle["assetId"])

    /** Template the Inspect action launches. A full build offers a frequency picker. */
    val defaultTemplateId: String = "tmpl-monthly-generic"

    val state: StateFlow<AssetDetailUiState> =
        combine(
            assetRepository.observeById(assetId),
            faultRepository.observeForAsset(assetId),
        ) { asset, faults ->
            AssetDetailUiState(asset = asset, faults = faults)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AssetDetailUiState())

    fun reportFault(title: String) {
        faultRepository.reportFaultAsync(viewModelScope, assetId, title)
    }
}
