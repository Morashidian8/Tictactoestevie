package io.facilityos.app.feature.forms

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.data.InventoryRepository
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddPartViewModel @Inject constructor(
    private val repository: InventoryRepository,
) : ViewModel() {
    fun submit(
        partNumber: String,
        description: String,
        qty: Double,
        minQty: Double,
        location: String,
        unitCost: Double,
        onDone: () -> Unit,
    ) {
        viewModelScope.launch {
            repository.addPart(partNumber, description, qty, minQty, location, unitCost)
            onDone()
        }
    }
}

@Composable
fun AddPartScreen(onDone: () -> Unit, viewModel: AddPartViewModel = hiltViewModel()) {
    var partNumber by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf("") }
    var minQty by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var unitCost by remember { mutableStateOf("") }

    val valid = partNumber.isNotBlank() && description.isNotBlank()

    FormScaffold(title = "افزودن قطعه", onBack = onDone) {
        OutlinedTextField(partNumber, { partNumber = it }, label = { Text("کد قطعه") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(description, { description = it }, label = { Text("شرح قطعه") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            qty, { qty = it }, label = { Text("موجودی") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            minQty, { minQty = it }, label = { Text("حداقل موجودی") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(location, { location = it }, label = { Text("محل نگهداری") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            unitCost, { unitCost = it }, label = { Text("قیمت واحد") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                viewModel.submit(
                    partNumber.trim(), description.trim(),
                    qty.toDoubleOrNull() ?: 0.0, minQty.toDoubleOrNull() ?: 0.0,
                    location.trim(), unitCost.toDoubleOrNull() ?: 0.0, onDone,
                )
            },
            enabled = valid,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("ذخیره")
        }
    }
}
