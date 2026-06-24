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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import io.facilityos.app.core.designsystem.component.CriticalityChip
import io.facilityos.app.core.model.Asset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuildingDetailScreen(
    onAssetClick: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: BuildingDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.building?.name ?: "Building") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            state.building?.let { b ->
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Code ${b.code}", style = MaterialTheme.typography.bodySmall)
                            Text("${b.floorsCount ?: "-"} floors · ${b.assetCount} assets")
                            Text(
                                "${b.openFaults} open faults",
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
                item {
                    Text(
                        "Assets",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
            items(state.assets, key = { it.id }) { asset ->
                AssetRow(asset) { onAssetClick(asset.id) }
            }
        }
    }
}

@Composable
private fun AssetRow(asset: Asset, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(asset.name, fontWeight = FontWeight.SemiBold)
                Text(
                    "${asset.categoryName} · ${asset.assetCode}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            CriticalityChip(asset.criticality)
        }
    }
}
