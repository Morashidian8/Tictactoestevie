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
import io.facilityos.app.core.model.faLabel
import io.facilityos.app.core.model.toFaDigits
import io.facilityos.app.core.model.workOrderTypeFa
import io.facilityos.app.data.DashboardData

private data class Kpi(val label: String, val value: String, val accent: androidx.compose.ui.graphics.Color? = null, val sub: String? = null)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: DashboardViewModel = hiltViewModel()) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    val role by viewModel.role.collectAsStateWithLifecycle()

    Scaffold(topBar = { TopAppBar(title = { Text("داشبورد") }) }) { padding ->
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
                            label = { Text(roleFa(r)) },
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
                item { SectionHeader("خرابی‌های بحرانی (${data.criticalFaults})".toFaDigits()) }
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
                item { SectionHeader("دستورکارهای باز (${data.openWorkOrders.size})".toFaDigits()) }
                items(data.openWorkOrders, key = { it.id }) { wo ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text("${wo.woNumber} · ${wo.title}".toFaDigits(), fontWeight = FontWeight.SemiBold)
                            Text(
                                "${workOrderTypeFa(wo.type)} · ${wo.status.faLabel()}",
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
            Kpi("دستورکارهای باز", d.openWorkOrders.size.toString()),
            Kpi("معوق", d.overdueWorkOrders.toString(), if (d.overdueWorkOrders > 0) red else green),
            Kpi("خرابی‌های باز", d.openFaults.toString()),
            Kpi("بحرانی", d.criticalFaults.toString(), if (d.criticalFaults > 0) red else green),
        )
        DashboardRole.SUPERVISOR -> listOf(
            Kpi("دستورکارهای باز", d.openWorkOrders.size.toString()),
            Kpi("بازرسی معوق", d.overdueInspections.toString(), if (d.overdueInspections > 0) amber else green),
            Kpi("خرابی‌های باز", d.openFaults.toString()),
            Kpi("تطابق PM", "${d.pmCompliancePct}%", if (d.pmCompliancePct >= 90) green else amber),
        )
        DashboardRole.MANAGER -> listOf(
            Kpi("سلامت دارایی", d.assetHealthScore.toString(), healthColor(d.assetHealthScore), "از ۱۰۰"),
            Kpi("تطابق PM", "${d.pmCompliancePct}%", if (d.pmCompliancePct >= 90) green else amber),
            Kpi("خرابی بحرانی", d.criticalFaults.toString(), if (d.criticalFaults > 0) red else green),
            Kpi("در دسترس بودن", "${d.availabilityPct}%", if (d.availabilityPct >= 95) green else amber),
            Kpi("ساختمان‌ها", d.buildings.toString()),
            Kpi("تجهیزات", d.assets.toString()),
        )
        DashboardRole.EXECUTIVE -> listOf(
            Kpi("ارزش دارایی", money(d.assetValueEstimate)),
            Kpi("هزینهٔ نگهداری", money(d.maintenanceCost), sub = "تکمیل‌شده"),
            Kpi("هزینهٔ معوق", money(d.deferredCost), amber, "دستورکار باز"),
            Kpi("در دسترس بودن", "${d.availabilityPct}%"),
            Kpi("MTBF", d.mtbfDays?.let { "${it.toInt()} روز" } ?: "—"),
            Kpi("MTTR", d.mttrHours?.let { "${it.toInt()} ساعت" } ?: "—"),
            Kpi("امتیاز ریسک", d.riskScore.toString(), if (d.riskScore >= 40) red else green),
            Kpi("سلامت", d.assetHealthScore.toString(), healthColor(d.assetHealthScore)),
        )
    }
}

private fun roleFa(role: DashboardRole): String = when (role) {
    DashboardRole.TECHNICIAN -> "تکنسین"
    DashboardRole.SUPERVISOR -> "سرپرست"
    DashboardRole.MANAGER -> "مدیر"
    DashboardRole.EXECUTIVE -> "مدیرعامل"
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
