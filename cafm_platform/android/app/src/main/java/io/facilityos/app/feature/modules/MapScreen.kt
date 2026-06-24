package io.facilityos.app.feature.modules

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.designsystem.component.StatusDot
import io.facilityos.app.core.model.Building
import io.facilityos.app.data.BuildingRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class MapViewModel @Inject constructor(repository: BuildingRepository) : ViewModel() {
    val buildings: StateFlow<List<Building>> =
        repository.observe("").stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

@Composable
fun MapScreen(
    onBuildingClick: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: MapViewModel = hiltViewModel(),
) {
    val buildings by viewModel.buildings.collectAsStateWithLifecycle()

    ModuleScaffold("Map", onBack) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    "Offline mode: an interactive Google Maps / MapLibre view with clustering and " +
                        "navigation mounts here when online. Buildings and their coordinates below.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            items(buildings, key = { it.id }) { b ->
                Card(Modifier.fillMaxWidth().clickable { onBuildingClick(b.id) }) {
                    Row(
                        Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        StatusDot(b.status)
                        Column(Modifier.weight(1f)) {
                            Text(b.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                b.lat?.let { lat -> "%.4f, %.4f".format(lat, b.lng ?: 0.0) }
                                    ?: "No GPS",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}
