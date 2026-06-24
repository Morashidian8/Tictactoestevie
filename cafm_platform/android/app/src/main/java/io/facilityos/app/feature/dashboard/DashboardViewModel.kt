package io.facilityos.app.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.data.DashboardData
import io.facilityos.app.data.DashboardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

enum class DashboardRole { TECHNICIAN, SUPERVISOR, MANAGER, EXECUTIVE }

@HiltViewModel
class DashboardViewModel @Inject constructor(
    repository: DashboardRepository,
) : ViewModel() {

    private val _role = MutableStateFlow(DashboardRole.MANAGER)
    val role: StateFlow<DashboardRole> = _role.asStateFlow()

    val data: StateFlow<DashboardData> =
        repository.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardData())

    fun selectRole(role: DashboardRole) {
        _role.value = role
    }
}
