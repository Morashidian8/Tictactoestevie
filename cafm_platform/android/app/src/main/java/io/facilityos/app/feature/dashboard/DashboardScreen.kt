package io.facilityos.app.feature.dashboard

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import io.facilityos.app.core.designsystem.component.KpiCard
import io.facilityos.app.core.designsystem.component.PriorityChip
import io.facilityos.app.core.designsystem.theme.StatusColors
import io.facilityos.app.data.DashboardData

private data class Kpi(val label: String, val value: String, val accent: androidx.compose.ui.graphics.Color? = null, val sub: String? = null)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: DashboardViewModel = hiltViewModel()) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    val role by viewModel.role.collectAsStateWithLifecycle()

    Scaffold(topBar = { TopAppBar(title = { Text("Dashboard") }) }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    DashboardRole.entries.forEach { r ->
                        FilterChip(
                            selected = role == r,
                            onClick = { viewModel.selectRole(r) },
                            label = { Text(r.name.lowercase().replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
            }

            val kpis = kpisFor(role, data)
            kpis.chunked(2).forEach { pair ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        pair.forEach { k ->
                            KpiCard(k.label, k.value, Modifier.weight(1f), k.accent, k.sub)
                        }
                        if (pair.size == 1) androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                    }
                }
            }

            if (data.criticalFaults > 0) {
                item { SectionHeader("Critical faults (${data.criticalFaults})") }
                items(data.topFaults, key = { it.id }) { f ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(
                            Modifier.fillMaxWidth().padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(f.title)
                            PriorityChip(f.priority)
                        }
                    }
                }
            }

            if (role == DashboardRole.TECHNICIAN || role == DashboardRole.SUPERVISOR) {
                item { SectionHeader("Open work orders (${data.openWorkOrders.size})") }
                items(data.openWorkOrders, key = { it.id }) { wo ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text("${wo.woNumber} · ${wo.title}", fontWeight = FontWeight.SemiBold)
                            Text(
                                "${wo.type.uppercase()} · ${wo.status.name.lowercase()}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(top = 8.dp),
    )
}

private fun kpisFor(role: DashboardRole, d: DashboardData): List<Kpi> {
    val red = StatusColors.Critical
    val green = StatusColors.Ok
    val amber = StatusColors.Attention
    return when (role) {
        DashboardRole.TECHNICIAN -> listOf(
            Kpi("Open work orders", d.openWorkOrders.size.toString()),
            Kpi("Overdue", d.overdueWorkOrders.toString(), if (d.overdueWorkOrders > 0) red else green),
            Kpi("Open faults", d.openFaults.toString()),
            Kpi("Critical", d.criticalFaults.toString(), if (d.criticalFaults > 0) red else green),
        )
        DashboardRole.SUPERVISOR -> listOf(
            Kpi("Open work orders", d.openWorkOrders.size.toString()),
            Kpi("Overdue insp.", d.overdueInspections.toString(), if (d.overdueInspections > 0) amber else green),
            Kpi("Open faults", d.openFaults.toString()),
            Kpi("PM compliance", "${d.pmCompliancePct}%", if (d.pmCompliancePct >= 90) green else amber),
        )
        DashboardRole.MANAGER -> listOf(
            Kpi("Asset health", d.assetHealthScore.toString(), healthColor(d.assetHealthScore), "/ 100"),
            Kpi("PM compliance", "${d.pmCompliancePct}%", if (d.pmCompliancePct >= 90) green else amber),
            Kpi("Critical faults", d.criticalFaults.toString(), if (d.criticalFaults > 0) red else green),
            Kpi("Availability", "${d.availabilityPct}%", if (d.availabilityPct >= 95) green else amber),
            Kpi("Buildings", d.buildings.toString()),
            Kpi("Assets", d.assets.toString()),
        )
        DashboardRole.EXECUTIVE -> listOf(
            Kpi("Asset value", money(d.assetValueEstimate)),
            Kpi("Maint. cost", money(d.maintenanceCost), sub = "completed"),
            Kpi("Deferred cost", money(d.deferredCost), amber, "open WOs"),
            Kpi("Availability", "${d.availabilityPct}%"),
            Kpi("MTBF", d.mtbfDays?.let { "${it.toInt()}d" } ?: "—"),
            Kpi("MTTR", d.mttrHours?.let { "${it.toInt()}h" } ?: "—"),
            Kpi("Risk score", d.riskScore.toString(), if (d.riskScore >= 40) red else green),
            Kpi("Health", d.assetHealthScore.toString(), healthColor(d.assetHealthScore)),
        )
    }
}

private fun healthColor(score: Int) = when {
    score >= 85 -> StatusColors.Ok
    score >= 60 -> StatusColors.Attention
    else -> StatusColors.Critical
}

private fun money(v: Double): String = when {
    v >= 1_000_000 -> "$%.1fM".format(v / 1_000_000)
    v >= 1_000 -> "$%.0fk".format(v / 1_000)
    else -> "$%.0f".format(v)
}
