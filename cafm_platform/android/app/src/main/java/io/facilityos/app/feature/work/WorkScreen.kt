package io.facilityos.app.feature.work

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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.facilityos.app.core.designsystem.component.PriorityChip
import io.facilityos.app.core.model.Fault
import io.facilityos.app.core.model.WorkOrder
import io.facilityos.app.core.model.faLabel
import io.facilityos.app.core.model.toFaDigits
import io.facilityos.app.core.model.workOrderTypeFa

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkScreen(viewModel: WorkViewModel = hiltViewModel()) {
    val workOrders by viewModel.workOrders.collectAsStateWithLifecycle()
    val faults by viewModel.faults.collectAsStateWithLifecycle()
    var tab by remember { mutableIntStateOf(0) }

    Scaffold(topBar = { TopAppBar(title = { Text("کارهای من") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("دستورکارها (${workOrders.size})".toFaDigits()) })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("خرابی‌ها (${faults.size})".toFaDigits()) })
            }
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (tab == 0) {
                    items(workOrders, key = { it.id }) { WorkOrderRow(it) }
                } else {
                    items(faults, key = { it.id }) { FaultRow(it) }
                }
            }
        }
    }
}

@Composable
private fun WorkOrderRow(wo: WorkOrder) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text("${wo.woNumber} · ${wo.title}".toFaDigits(), fontWeight = FontWeight.SemiBold)
            Text(
                "${workOrderTypeFa(wo.type)} · ${wo.status.faLabel()}",
                style = MaterialTheme.typography.bodySmall,
            )
            wo.cost?.let { Text("تخمین %.0f$".format(it).toFaDigits(), style = MaterialTheme.typography.labelSmall) }
        }
    }
}

@Composable
private fun FaultRow(f: Fault) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(f.title, fontWeight = FontWeight.SemiBold)
                Text(
                    f.status.faLabel(),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            PriorityChip(f.priority)
        }
    }
}
