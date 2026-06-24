package io.facilityos.app.feature.scan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.data.AssetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ScanUiState(
    val code: String = "",
    val resolving: Boolean = false,
    val notFound: Boolean = false,
)

@HiltViewModel
class ScanViewModel @Inject constructor(
    private val assetRepository: AssetRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ScanUiState())
    val state: StateFlow<ScanUiState> = _state.asStateFlow()

    fun onCodeChange(value: String) = _state.update { it.copy(code = value, notFound = false) }

    /** Resolve a scanned/typed QR to an asset id. CameraX + ML Kit feed [onCodeChange]. */
    fun resolve(onResolved: (String) -> Unit) {
        val code = _state.value.code.trim()
        if (code.isEmpty()) return
        _state.update { it.copy(resolving = true, notFound = false) }
        viewModelScope.launch {
            val asset = assetRepository.resolveQr(code)
            _state.update { it.copy(resolving = false, notFound = asset == null) }
            if (asset != null) onResolved(asset.id)
        }
    }
}
