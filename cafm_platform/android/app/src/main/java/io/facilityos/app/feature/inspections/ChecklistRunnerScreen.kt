package io.facilityos.app.feature.inspections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.facilityos.app.core.model.ChecklistItemDef
import io.facilityos.app.core.model.InspectionResponse
import io.facilityos.app.core.model.ResponseType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChecklistRunnerScreen(
    onDone: () -> Unit,
    viewModel: ChecklistRunnerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.submitted) {
        if (state.submitted) onDone()
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(state.template?.name ?: "Inspection") }) },
        bottomBar = {
            Button(
                onClick = viewModel::submit,
                enabled = !state.submitting && state.template != null,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            ) {
                Text(if (state.submitting) "Saving…" else "Complete inspection")
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.template?.items ?: emptyList(), key = { it.id }) { item ->
                ChecklistItemCard(
                    item = item,
                    response = state.responses[item.id],
                    onResult = { viewModel.setResult(item.id, it) },
                    onNumeric = { viewModel.setNumeric(item.id, it) },
                    onText = { viewModel.setText(item.id, it) },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChecklistItemCard(
    item: ChecklistItemDef,
    response: InspectionResponse?,
    onResult: (String) -> Unit,
    onNumeric: (String) -> Unit,
    onText: (String) -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(item.prompt, fontWeight = FontWeight.SemiBold)
            when (item.responseType) {
                ResponseType.PASS_FAIL_NA -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("pass", "fail", "na").forEach { option ->
                            FilterChip(
                                selected = response?.result == option,
                                onClick = { onResult(option) },
                                label = { Text(option.uppercase()) },
                            )
                        }
                    }
                }
                ResponseType.NUMERIC -> {
                    OutlinedTextField(
                        value = response?.valueNum?.toString() ?: "",
                        onValueChange = onNumeric,
                        label = { Text(item.unit ?: "Value") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    item.maxValue?.let { Text("Max $it", style = androidx.compose.material3.MaterialTheme.typography.bodySmall) }
                }
                ResponseType.TEXT -> {
                    OutlinedTextField(
                        value = response?.valueText ?: "",
                        onValueChange = onText,
                        label = { Text("Notes") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                ResponseType.PHOTO, ResponseType.SIGNATURE -> {
                    Text(
                        "${item.responseType.name} capture — wired to CameraX in a full build",
                        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
