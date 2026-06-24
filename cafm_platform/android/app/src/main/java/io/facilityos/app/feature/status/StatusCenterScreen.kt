package io.facilityos.app.feature.status

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.facilityos.app.core.designsystem.component.StatusDot
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.model.BuildingStatus

/**
 * Live building status center — a subsystem health light grid per building, computed offline.
 * Subsystem lights are derived deterministically from the building's status and open-fault count
 * (a real build maps each subsystem to its assets' fault/PM state).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusCenterScreen(viewModel: StatusCenterViewModel = hiltViewModel()) {
    val buildings by viewModel.buildings.collectAsStateWithLifecycle()

    Scaffold(topBar = { TopAppBar(title = { Text("Building Status Center") }) }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(buildings, key = { it.id }) { b -> BuildingStatusCard(b) }
        }
    }
}

@Composable
private fun BuildingStatusCard(b: Building) {
    val critical = b.status == BuildingStatus.CRITICAL || b.openFaults >= 3
    val attention = b.status == BuildingStatus.PARTIAL || b.openFaults in 1..2

    val subsystems = listOf(
        "Elevators" to if (critical) BuildingStatus.CRITICAL else BuildingStatus.OPERATIONAL,
        "Generators" to BuildingStatus.OPERATIONAL,
        "Mechanical" to if (attention) BuildingStatus.PARTIAL else BuildingStatus.OPERATIONAL,
        "Fire alarm" to if (critical) BuildingStatus.CRITICAL else BuildingStatus.OPERATIONAL,
        "PM compliance" to if (attention) BuildingStatus.PARTIAL else BuildingStatus.OPERATIONAL,
        "Inspections" to if (b.lastInspectionAt != null &&
            b.lastInspectionAt < System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000
        ) BuildingStatus.CRITICAL else BuildingStatus.OPERATIONAL,
    )

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                StatusDot(b.status)
                Text(b.name, fontWeight = FontWeight.SemiBold)
                Text(
                    "   ${b.openFaults} open",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (b.openFaults > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            subsystems.chunked(2).forEach { row ->
                Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    row.forEach { (name, st) ->
                        Row(Modifier.weight(1f), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            StatusDot(st)
                            Text(name, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
