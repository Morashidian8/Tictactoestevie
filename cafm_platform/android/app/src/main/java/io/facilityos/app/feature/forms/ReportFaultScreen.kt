package io.facilityos.app.feature.forms

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.Priority
import io.facilityos.app.data.FaultRepository
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ReportFaultViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: FaultRepository,
) : ViewModel() {
    private val assetId: String = checkNotNull(savedStateHandle["assetId"])

    fun submit(title: String, priority: Priority, onDone: () -> Unit) {
        viewModelScope.launch {
            repository.add(assetId, title, priority)
            onDone()
        }
    }
}

private val priorityLabels = listOf(
    Priority.CRITICAL to "بحرانی",
    Priority.HIGH to "بالا",
    Priority.MEDIUM to "متوسط",
    Priority.LOW to "پایین",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportFaultScreen(
    onDone: () -> Unit,
    viewModel: ReportFaultViewModel = hiltViewModel(),
) {
    var title by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf(Priority.MEDIUM) }

    FormScaffold(title = "ثبت خرابی", onBack = onDone) {
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("شرح خرابی") },
            modifier = Modifier.fillMaxWidth(),
        )
        Text("اولویت")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            priorityLabels.forEach { (p, label) ->
                FilterChip(
                    selected = priority == p,
                    onClick = { priority = p },
                    label = { Text(label) },
                )
            }
        }
        Button(
            onClick = { if (title.isNotBlank()) viewModel.submit(title.trim(), priority, onDone) },
            enabled = title.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("ثبت خرابی")
        }
    }
}
