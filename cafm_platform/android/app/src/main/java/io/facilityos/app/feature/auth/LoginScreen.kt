package io.facilityos.app.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.lifecycle.HiltViewModel
import io.facilityos.app.core.data.SessionStore
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val session: SessionStore,
) : ViewModel() {
    val existingUser: StateFlow<String?> =
        session.userName.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun login(name: String, role: String, onLoggedIn: () -> Unit) {
        viewModelScope.launch {
            session.signIn(name, role)
            onLoggedIn()
        }
    }
}

private val roles = listOf("مدیر سیستم", "مدیر", "سرپرست", "تکنسین", "مشاهده‌گر")

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(onLoggedIn: () -> Unit, viewModel: LoginViewModel = hiltViewModel()) {
    val existing by viewModel.existingUser.collectAsStateWithLifecycle()
    var name by remember { mutableStateOf("") }
    var role by remember { mutableStateOf(roles[3]) }

    // Skip login if a user is already signed in.
    LaunchedEffect(existing) {
        if (!existing.isNullOrBlank()) onLoggedIn()
    }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("سامانه نگهداری و تعمیرات", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            "ورود (حالت آفلاین — احراز هویت واقعی در نسخهٔ کامل)",
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp, bottom = 24.dp),
        )
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("نام کاربر") },
            modifier = Modifier.fillMaxWidth(),
        )
        Text("نقش", modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 4.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            roles.forEach { r ->
                FilterChip(selected = role == r, onClick = { role = r }, label = { Text(r) })
            }
        }
        Button(
            onClick = { if (name.isNotBlank()) viewModel.login(name.trim(), role, onLoggedIn) },
            enabled = name.isNotBlank(),
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
        ) {
            Text("ورود")
        }
    }
}
