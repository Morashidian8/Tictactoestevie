package io.facilityos.app.feature.inspections

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.model.ChecklistItemDef
import io.facilityos.app.core.model.ChecklistTemplate
import io.facilityos.app.core.model.InspectionResponse
import io.facilityos.app.core.model.ResponseType
import io.facilityos.app.data.InspectionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChecklistUiState(
    val template: ChecklistTemplate? = null,
    val responses: Map<String, InspectionResponse> = emptyMap(),
    val submitting: Boolean = false,
    val submitted: Boolean = false,
)

@HiltViewModel
class ChecklistRunnerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: InspectionRepository,
) : ViewModel() {

    private val templateId: String = checkNotNull(savedStateHandle["templateId"])
    private val assetId: String = checkNotNull(savedStateHandle["assetId"])

    private val _state = MutableStateFlow(ChecklistUiState())
    val state: StateFlow<ChecklistUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val template = repository.template(templateId) ?: demoTemplate()
            _state.update { it.copy(template = template) }
        }
    }

    fun setResult(itemId: String, result: String) = update(itemId) { it.copy(result = result) }

    fun setNumeric(itemId: String, value: String) =
        update(itemId) { it.copy(valueNum = value.toDoubleOrNull()) }

    fun setText(itemId: String, value: String) = update(itemId) { it.copy(valueText = value) }

    private fun update(itemId: String, block: (InspectionResponse) -> InspectionResponse) {
        _state.update { state ->
            val current = state.responses[itemId] ?: InspectionResponse(itemId = itemId)
            state.copy(responses = state.responses + (itemId to block(current)))
        }
    }

    fun submit() {
        val template = _state.value.template ?: return
        _state.update { it.copy(submitting = true) }
        viewModelScope.launch {
            repository.submit(
                templateId = template.id,
                assetId = assetId,
                responses = _state.value.responses.values.toList(),
            )
            _state.update { it.copy(submitting = false, submitted = true) }
        }
    }

    /** Local fallback so the runner is usable without a backend during development. */
    private fun demoTemplate() = ChecklistTemplate(
        id = templateId,
        name = "نگهداری پیشگیرانهٔ ماهانه — عمومی",
        frequency = "monthly",
        items = listOf(
            ChecklistItemDef("i1", 1, "وضعیت کلی قابل قبول است؟", ResponseType.PASS_FAIL_NA),
            ChecklistItemDef("i2", 2, "دمای کارکرد", ResponseType.NUMERIC, unit = "°C", maxValue = 80.0),
            ChecklistItemDef("i3", 3, "توضیحات", ResponseType.TEXT, required = false),
        ),
    )
}
