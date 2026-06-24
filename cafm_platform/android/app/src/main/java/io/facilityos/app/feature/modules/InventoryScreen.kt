package io.facilityos.app.feature.modules

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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.designsystem.theme.StatusColors
import io.facilityos.app.core.model.SparePart
import io.facilityos.app.data.InventoryRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class InventoryViewModel @Inject constructor(repository: InventoryRepository) : ViewModel() {
    val parts: StateFlow<List<SparePart>> =
        repository.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryScreen(onBack: () -> Unit, viewModel: InventoryViewModel = hiltViewModel()) {
    val parts by viewModel.parts.collectAsStateWithLifecycle()
    val lowCount = parts.count { it.lowStock }

    ModuleScaffold("قطعات یدکی و انبار", onBack) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (lowCount > 0) {
                item {
                    Text(
                        "⚠ $lowCount قلم زیر حد سفارش مجدد",
                        color = StatusColors.Critical,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            items(parts, key = { it.id }) { p ->
                Card(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(p.description, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${p.partNumber} · ${p.location}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Text(
                            "${p.qty.toInt()} / حداقل ${p.minQty.toInt()}",
                            color = if (p.lowStock) StatusColors.Critical else StatusColors.Ok,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

/** Shared scaffold for the More submodule screens (top bar + back). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModuleScaffold(
    title: String,
    onBack: () -> Unit,
    content: @Composable (androidx.compose.foundation.layout.PaddingValues) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
            )
        },
        content = content,
    )
}
