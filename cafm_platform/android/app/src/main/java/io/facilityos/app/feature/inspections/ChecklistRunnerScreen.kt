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
        topBar = { TopAppBar(title = { Text(state.template?.name ?: "بازرسی") }) },
        bottomBar = {
            Button(
                onClick = viewModel::submit,
                enabled = !state.submitting && state.template != null,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            ) {
                Text(if (state.submitting) "در حال ذخیره…" else "تکمیل بازرسی")
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
                        val labels = listOf("pass" to "تأیید", "fail" to "رد", "na" to "نامربوط")
                        labels.forEach { (option, label) ->
                            FilterChip(
                                selected = response?.result == option,
                                onClick = { onResult(option) },
                                label = { Text(label) },
                            )
                        }
                    }
                }
                ResponseType.NUMERIC -> {
                    OutlinedTextField(
                        value = response?.valueNum?.toString() ?: "",
                        onValueChange = onNumeric,
                        label = { Text(item.unit ?: "مقدار") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    item.maxValue?.let { Text("حداکثر $it", style = androidx.compose.material3.MaterialTheme.typography.bodySmall) }
                }
                ResponseType.TEXT -> {
                    OutlinedTextField(
                        value = response?.valueText ?: "",
                        onValueChange = onText,
                        label = { Text("توضیحات") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                ResponseType.PHOTO, ResponseType.SIGNATURE -> {
                    val kind = if (item.responseType == ResponseType.PHOTO) "عکس" else "امضای دیجیتال"
                    Text(
                        "ثبت $kind — در نسخهٔ کامل به دوربین متصل می‌شود",
                        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
