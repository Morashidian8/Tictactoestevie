package io.facilityos.app.feature.forms

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.model.utilityFa
import io.facilityos.app.data.BuildingRepository
import io.facilityos.app.data.UtilityRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddReadingViewModel @Inject constructor(
    private val repository: UtilityRepository,
    buildingRepository: BuildingRepository,
) : ViewModel() {
    val buildings: StateFlow<List<Building>> =
        buildingRepository.observe("").stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun submit(
        buildingId: String,
        utility: String,
        period: String,
        consumption: Double,
        cost: Double,
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            repository.add(buildingId, utility, period, consumption, cost)
            onDone()
        }
    }
}

private val utilityCodes = listOf("electricity", "water", "gas", "diesel")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddReadingScreen(onDone: () -> Unit, viewModel: AddReadingViewModel = hiltViewModel()) {
    val buildings by viewModel.buildings.collectAsStateWithLifecycle()
    var buildingId by remember { mutableStateOf<String?>(null) }
    var utility by remember { mutableStateOf(utilityCodes.first()) }
    var period by remember { mutableStateOf("") }
    var consumption by remember { mutableStateOf("") }
    var cost by remember { mutableStateOf("") }

    val valid = buildingId != null && period.isNotBlank() && consumption.toDoubleOrNull() != null

    FormScaffold(title = "ثبت قرائت کنتور", onBack = onDone) {
        Text("ساختمان")
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), Arrangement.spacedBy(8.dp)) {
            buildings.forEach { b ->
                FilterChip(selected = buildingId == b.id, onClick = { buildingId = b.id }, label = { Text(b.name) })
            }
        }
        Text("نوع انرژی")
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), Arrangement.spacedBy(8.dp)) {
            utilityCodes.forEach { u ->
                FilterChip(selected = utility == u, onClick = { utility = u }, label = { Text(utilityFa(u)) })
            }
        }
        OutlinedTextField(period, { period = it }, label = { Text("دوره (مثلاً ۱۴۰۵/۰۴)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            consumption, { consumption = it }, label = { Text("مصرف") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            cost, { cost = it }, label = { Text("هزینه") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                val b = buildingId
                if (b != null) {
                    viewModel.submit(
                        b, utility, period.trim(),
                        consumption.toDoubleOrNull() ?: 0.0, cost.toDoubleOrNull() ?: 0.0, onDone,
                    )
                }
            },
            enabled = valid,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("ذخیره")
        }
    }
}
