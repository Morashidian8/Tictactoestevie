package io.facilityos.app.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.facilityos.app.core.designsystem.theme.StatusColors
import io.facilityos.app.core.model.BuildingStatus
import io.facilityos.app.core.model.Criticality
import io.facilityos.app.core.model.Priority
import io.facilityos.app.core.model.SyncState

/** Small colored dot for building / subsystem health. */
@Composable
fun StatusDot(status: BuildingStatus, modifier: Modifier = Modifier) {
    val color = when (status) {
        BuildingStatus.OPERATIONAL -> StatusColors.Ok
        BuildingStatus.PARTIAL -> StatusColors.Attention
        BuildingStatus.CRITICAL -> StatusColors.Critical
        BuildingStatus.CLOSED -> StatusColors.Unknown
    }
    Box(
        modifier
            .padding(end = 8.dp)
            .background(color, CircleShape)
            .padding(7.dp)
    )
}

@Composable
fun CriticalityChip(criticality: Criticality) {
    val color = when (criticality) {
        Criticality.CRITICAL -> StatusColors.Critical
        Criticality.HIGH -> Color(0xFFEF6C00)
        Criticality.MEDIUM -> StatusColors.Attention
        Criticality.LOW -> StatusColors.Unknown
    }
    Pill(text = criticality.name, color = color)
}

@Composable
fun PriorityChip(priority: Priority) {
    val color = when (priority) {
        Priority.CRITICAL -> StatusColors.Critical
        Priority.HIGH -> Color(0xFFEF6C00)
        Priority.MEDIUM -> StatusColors.Attention
        Priority.LOW -> StatusColors.Unknown
    }
    Pill(text = priority.name, color = color)
}

/** Global sync indicator (Synced / Pending N / Offline). */
@Composable
fun SyncPill(state: SyncState, pendingCount: Int) {
    val (label, color) = when (state) {
        SyncState.SYNCED -> "Synced" to StatusColors.Ok
        SyncState.PENDING -> "Pending $pendingCount" to StatusColors.Attention
        SyncState.ERROR -> "Offline" to StatusColors.Unknown
    }
    Pill(text = label, color = color)
}

@Composable
private fun Pill(text: String, color: Color) {
    Box(
        Modifier
            .background(color, RoundedCornerShape(50))
            .padding(PaddingValues(horizontal = 10.dp, vertical = 3.dp))
    ) {
        Text(text, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}
