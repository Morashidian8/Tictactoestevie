package io.facilityos.app.feature.work

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.WorkOrder
import io.facilityos.app.data.WorkRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class WorkViewModel @Inject constructor(
    repository: WorkRepository,
) : ViewModel() {
    val workOrders: StateFlow<List<WorkOrder>> =
        repository.observeWorkOrders().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val faults: StateFlow<List<Fault>> =
        repository.observeFaults().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
