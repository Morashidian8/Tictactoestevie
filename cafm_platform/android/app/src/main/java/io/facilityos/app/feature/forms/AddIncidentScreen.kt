package io.facilityos.app.feature.forms

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Building
import io.facilityos.app.core.model.hseTypeFa
import io.facilityos.app.data.BuildingRepository
import io.facilityos.app.data.HseRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddIncidentViewModel @Inject constructor(
    private val repository: HseRepository,
    buildingRepository: BuildingRepository,
) : ViewModel() {
    val buildings: StateFlow<List<Building>> =
        buildingRepository.observe("").stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun submit(buildingId: String, type: String, severity: String, description: String, onDone: () -> Unit) {
        viewModelScope.launch {
            repository.add(buildingId, type, severity, description)
            onDone()
        }
    }
}

private val incidentTypes =
    listOf("near_miss", "unsafe_act", "unsafe_condition", "accident", "property_damage")
private val severities = listOf("کم", "متوسط", "زیاد")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddIncidentScreen(onDone: () -> Unit, viewModel: AddIncidentViewModel = hiltViewModel()) {
    val buildings by viewModel.buildings.collectAsStateWithLifecycle()
    var buildingId by remember { mutableStateOf<String?>(null) }
    var type by remember { mutableStateOf(incidentTypes.first()) }
    var severity by remember { mutableStateOf(severities[1]) }
    var description by remember { mutableStateOf("") }

    FormScaffold(title = "ثبت حادثهٔ HSE", onBack = onDone) {
        Text("ساختمان")
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), Arrangement.spacedBy(8.dp)) {
            buildings.forEach { b ->
                FilterChip(
                    selected = buildingId == b.id,
                    onClick = { buildingId = b.id },
                    label = { Text(b.name) },
                )
            }
        }
        Text("نوع حادثه")
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), Arrangement.spacedBy(8.dp)) {
            incidentTypes.forEach { t ->
                FilterChip(selected = type == t, onClick = { type = t }, label = { Text(hseTypeFa(t)) })
            }
        }
        Text("شدت")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            severities.forEach { s ->
                FilterChip(selected = severity == s, onClick = { severity = s }, label = { Text(s) })
            }
        }
        OutlinedTextField(
            description, { description = it },
            label = { Text("شرح حادثه") }, modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                val b = buildingId
                if (b != null && description.isNotBlank()) {
                    viewModel.submit(b, type, severity, description.trim(), onDone)
                }
            },
            enabled = buildingId != null && description.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("ثبت حادثه")
        }
    }
}
