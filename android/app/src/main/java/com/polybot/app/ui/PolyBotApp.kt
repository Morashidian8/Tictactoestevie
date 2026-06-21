package com.polybot.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.polybot.app.bot.BotController

private enum class Tab(val label: String, val icon: ImageVector) {
    Dashboard("Dashboard", Icons.Filled.ShowChart),
    Strategy("Strategy", Icons.Filled.Tune),
}

@Composable
fun PolyBotApp(controller: BotController = viewModel()) {
    var tab by remember { mutableStateOf(Tab.Dashboard) }
    val state by controller.state.collectAsStateWithLifecycle()

    Scaffold(
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
                onStart = controller::start,
                onStop = controller::stop,
                onReset = controller::reset,
                modifier = Modifier.padding(padding),
            )
            Tab.Strategy -> StrategyScreen(
                config = state.config,
                running = state.running,
                onChange = controller::updateConfig,
                modifier = Modifier.padding(padding),
            )
        }
    }
}
