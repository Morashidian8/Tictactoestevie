package io.facilityos.app.feature.modules

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.designsystem.theme.StatusColors
import io.facilityos.app.core.designsystem.component.BarRow
import io.facilityos.app.core.model.UtilityReading
import io.facilityos.app.core.model.utilityFa
import io.facilityos.app.data.UtilityRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class UtilitiesViewModel @Inject constructor(repository: UtilityRepository) : ViewModel() {
    val readings: StateFlow<List<UtilityReading>> =
        repository.observe().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

@Composable
fun UtilitiesScreen(
    onBack: () -> Unit,
    onAdd: () -> Unit,
    viewModel: UtilitiesViewModel = hiltViewModel(),
) {
    val readings by viewModel.readings.collectAsStateWithLifecycle()

    // Portfolio totals per utility per month.
    val byUtility = readings.groupBy { it.utility }

    ModuleScaffold("مدیریت انرژی و مصارف", onBack, onAdd = onAdd) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            byUtility.forEach { (utility, list) ->
                val byMonth = list.groupBy { it.periodLabel }
                    .mapValues { e -> e.value.sumOf { it.consumption } }
                    .toSortedMap()
                val max = byMonth.values.maxOrNull() ?: 1.0
                val totalCost = list.sumOf { it.cost }
                val color = if (utility == "electricity") StatusColors.Attention else StatusColors.Ok

                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                utilityFa(utility),
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                "هزینهٔ کل: %.0f$".format(totalCost),
                                style = MaterialTheme.typography.bodySmall,
                            )
                            byMonth.forEach { (month, value) ->
                                BarRow(
                                    label = month,
                                    fraction = (value / max).toFloat(),
                                    value = "%.0f".format(value),
                                    color = color,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
