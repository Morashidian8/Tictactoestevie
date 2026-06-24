package io.facilityos.app.feature.modules

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.designsystem.component.complianceColor
import io.facilityos.app.core.model.ComplianceItem
import io.facilityos.app.data.ComplianceRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class ComplianceViewModel @Inject constructor(repository: ComplianceRepository) : ViewModel() {
    val items: StateFlow<List<ComplianceItem>> =
        repository.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

private val dateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

@Composable
fun ComplianceScreen(onBack: () -> Unit, viewModel: ComplianceViewModel = hiltViewModel()) {
    val items by viewModel.items.collectAsStateWithLifecycle()

    ModuleScaffold("Fire Compliance", onBack) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(items, key = { it.id }) { c ->
                Card(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(c.deviceType, fontWeight = FontWeight.SemiBold)
                            Text(
                                "Next: ${c.nextInspection?.let { dateFmt.format(Date(it)) } ?: "—"} · " +
                                    "Cert: ${c.certExpiry?.let { dateFmt.format(Date(it)) } ?: "—"}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        StatusBadge(c.status.name.replace('_', ' '), complianceColor(c.status))
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(text: String, color: Color) {
    Box(
        Modifier.background(color, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}
