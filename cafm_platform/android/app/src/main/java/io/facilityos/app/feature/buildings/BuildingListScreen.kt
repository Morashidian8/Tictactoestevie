package io.facilityos.app.feature.buildings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.facilityos.app.core.designsystem.component.StatusDot
import io.facilityos.app.core.designsystem.component.SyncPill
import io.facilityos.app.core.model.Building

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuildingListScreen(
    onBuildingClick: (String) -> Unit,
    onScanClick: () -> Unit,
    viewModel: BuildingListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ساختمان‌ها") },
                actions = {
                    SyncPill(state = state.syncState, pendingCount = state.pendingCount)
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onScanClick,
                icon = { Icon(Icons.Default.QrCodeScanner, contentDescription = null) },
                text = { Text("اسکن") },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                label = { Text("جستجوی ساختمان‌ها") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(12.dp),
            )
            LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(state.buildings, key = { it.id }) { building ->
                    BuildingRow(building) { onBuildingClick(building.id) }
                }
            }
        }
    }
}

@Composable
private fun BuildingRow(building: Building, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            StatusDot(building.status)
            Column(Modifier.weight(1f)) {
                Text(building.name, fontWeight = FontWeight.SemiBold)
                if (building.address != null) {
                    Text(building.address, style = MaterialTheme.typography.bodySmall)
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${building.assetCount} تجهیز", style = MaterialTheme.typography.bodySmall)
                if (building.openFaults > 0) {
                    Text(
                        "⚠ ${building.openFaults} باز",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
