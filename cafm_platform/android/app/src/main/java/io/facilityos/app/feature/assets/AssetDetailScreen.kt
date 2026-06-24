package io.facilityos.app.feature.assets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ReportProblem
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import io.facilityos.app.core.designsystem.component.CriticalityChip
import io.facilityos.app.core.designsystem.component.PriorityChip

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssetDetailScreen(
    onInspect: (templateId: String, assetId: String) -> Unit,
    onReportFault: (assetId: String) -> Unit,
    onBack: () -> Unit,
    viewModel: AssetDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val asset = state.asset

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(asset?.name ?: "تجهیز") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (asset != null) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            CriticalityChip(asset.criticality)
                            Text(asset.statusLabel, style = MaterialTheme.typography.bodySmall)
                        }
                        Text(asset.assetCode, fontWeight = FontWeight.SemiBold)
                        Text(
                            listOfNotNull(asset.manufacturer, asset.model).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        asset.serialNo?.let { Text("شماره سریال $it", style = MaterialTheme.typography.bodySmall) }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(
                        onClick = { onInspect(viewModel.defaultTemplateId, viewModel.assetId) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Default.Build, contentDescription = null)
                        Text("  بازرسی")
                    }
                    OutlinedButton(
                        onClick = { onReportFault(viewModel.assetId) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Default.ReportProblem, contentDescription = null)
                        Text("  ثبت خرابی")
                    }
                }

                if (state.faults.isNotEmpty()) {
                    Text("خرابی‌های باز", style = MaterialTheme.typography.titleMedium)
                    state.faults.forEach { fault ->
                        Card(Modifier.fillMaxWidth()) {
                            Row(
                                Modifier.fillMaxWidth().padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(fault.title)
                                PriorityChip(fault.priority)
                            }
                        }
                    }
                }
            }
        }
    }
}
