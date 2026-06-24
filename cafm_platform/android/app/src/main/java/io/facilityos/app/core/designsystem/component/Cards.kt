package io.facilityos.app.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.facilityos.app.core.designsystem.theme.StatusColors
import io.facilityos.app.core.model.ComplianceStatus
import io.facilityos.app.core.model.NotificationSeverity

/** Compact KPI tile for dashboards. */
@Composable
fun KpiCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    sub: String? = null,
) {
    Card(modifier = modifier.height(96.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text(
                value,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = accent ?: MaterialTheme.colorScheme.onSurface,
            )
            Text(label, style = MaterialTheme.typography.bodySmall)
            if (sub != null) {
                Text(sub, style = MaterialTheme.typography.labelSmall, color = StatusColors.Unknown)
            }
        }
    }
}

fun complianceColor(status: ComplianceStatus): Color = when (status) {
    ComplianceStatus.COMPLIANT -> StatusColors.Ok
    ComplianceStatus.DUE_SOON -> StatusColors.Attention
    ComplianceStatus.OVERDUE -> StatusColors.Critical
    ComplianceStatus.NON_COMPLIANT -> StatusColors.Critical
}

fun severityColor(severity: NotificationSeverity): Color = when (severity) {
    NotificationSeverity.CRITICAL -> StatusColors.Critical
    NotificationSeverity.WARNING -> StatusColors.Attention
    NotificationSeverity.INFO -> StatusColors.Unknown
}

/** Thin horizontal bar for simple utility/consumption charts. */
@Composable
fun BarRow(label: String, fraction: Float, value: String, color: Color) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text("$label   $value", style = MaterialTheme.typography.bodySmall)
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .padding(top = 2.dp)
                .background(StatusColors.Unknown.copy(alpha = 0.25f), RoundedCornerShape(50)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction.coerceIn(0.02f, 1f))
                    .height(8.dp)
                    .background(color, RoundedCornerShape(50)),
            )
        }
    }
}
