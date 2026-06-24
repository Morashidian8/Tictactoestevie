package io.facilityos.app.feature.status

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Building
import io.facilityos.app.data.BuildingRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class StatusCenterViewModel @Inject constructor(
    repository: BuildingRepository,
) : ViewModel() {
    val buildings: StateFlow<List<Building>> =
        repository.observe("").stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
