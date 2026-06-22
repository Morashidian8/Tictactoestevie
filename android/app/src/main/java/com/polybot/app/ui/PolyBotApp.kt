package com.polybot.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.polybot.app.bot.BotControl
import com.polybot.app.bot.BotController
import com.polybot.app.bot.RemoteBotController
import com.polybot.app.ui.theme.Green
import com.polybot.app.ui.theme.Red

private enum class Tab(val label: String, val icon: ImageVector) {
    Dashboard("Dashboard", Icons.Filled.ShowChart),
    Strategy("Strategy", Icons.Filled.Tune),
}

private enum class Mode { Local, Remote }

@Composable
fun PolyBotApp(
    local: BotController = viewModel(),
    remote: RemoteBotController = viewModel(),
) {
    var tab by remember { mutableStateOf(Tab.Dashboard) }
    var mode by remember { mutableStateOf(Mode.Local) }
    val control: BotControl = if (mode == Mode.Local) local else remote
    val state by control.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            ConnectionBar(
                mode = mode,
                onMode = { mode = it },
                serverUrl = state.serverUrl,
                connected = state.connected,
                onUrl = remote::setServerUrl,
            )
        },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = { Icon(t.icon, contentDescription = t.label) },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { padding ->
        when (tab) {
            Tab.Dashboard -> DashboardScreen(
                state = state,
                onStart = control::start,
                onStop = control::stop,
                onReset = control::reset,
                onKill = control::killSwitch,
                modifier = Modifier.padding(padding),
            )
            Tab.Strategy -> StrategyScreen(
                config = state.config,
                running = state.running,
                onChange = control::updateConfig,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun ConnectionBar(
    mode: Mode,
    onMode: (Mode) -> Unit,
    serverUrl: String,
    connected: Boolean,
    onUrl: (String) -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("PolyBot", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                FilterChip(
                    selected = mode == Mode.Local,
                    onClick = { onMode(Mode.Local) },
                    label = { Text("Local") },
                )
                FilterChip(
                    selected = mode == Mode.Remote,
                    onClick = { onMode(Mode.Remote) },
                    label = { Text("Server") },
                )
                if (mode == Mode.Remote) {
                    ConnDot(connected)
                }
            }
            if (mode == Mode.Remote) {
                var url by remember(serverUrl) { mutableStateOf(serverUrl) }
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it; onUrl(it) },
                    label = { Text("Server URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun ConnDot(connected: Boolean) {
    val color = if (connected) Green else Red
    Box(Modifier.size(10.dp).clip(CircleShape).background(color))
}
