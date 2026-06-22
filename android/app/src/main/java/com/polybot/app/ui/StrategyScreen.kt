package com.polybot.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.polybot.app.bot.StrategyConfig
import com.polybot.app.ui.theme.PolyBotTheme

@Composable
fun StrategyScreen(
    config: StrategyConfig,
    running: Boolean,
    onChange: ((StrategyConfig) -> StrategyConfig) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Strategy", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)

        if (running) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Text(
                    "Stop the bot to change the strategy.",
                    Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        SettingCard("Direction rule") {
            Text(
                if (config.followLastColor)
                    "Follow the last candle: red closed → bet DOWN, green → bet UP."
                else
                    "Fade the last candle: red closed → bet UP, green → bet DOWN.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = config.followLastColor,
                    onClick = { onChange { it.copy(followLastColor = true) } },
                    label = { Text("Follow") },
                    enabled = !running,
                )
                FilterChip(
                    selected = !config.followLastColor,
                    onClick = { onChange { it.copy(followLastColor = false) } },
                    label = { Text("Fade") },
                    enabled = !running,
                )
            }
        }

        SettingCard("Trigger: minimum streak = ${config.minStreak}") {
            Text(
                "Only act after this many same-colour candles in a row.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Slider(
                value = config.minStreak.toFloat(),
                onValueChange = { onChange { c -> c.copy(minStreak = it.toInt()) } },
                valueRange = 1f..6f,
                steps = 4,
                enabled = !running,
            )
        }

        SettingCard("Position sizing") {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Martingale (double on loss)", fontWeight = FontWeight.SemiBold)
                    Text(
                        "⚠️ High risk — a losing streak can wipe the balance.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Switch(
                    checked = config.useMartingale,
                    onCheckedChange = { onChange { c -> c.copy(useMartingale = it) } },
                    enabled = !running,
                )
            }
            if (config.useMartingale) {
                Text(
                    "Max doublings: ${config.maxSteps}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Slider(
                    value = config.maxSteps.toFloat(),
                    onValueChange = { onChange { c -> c.copy(maxSteps = it.toInt()) } },
                    valueRange = 2f..10f,
                    steps = 7,
                    enabled = !running,
                )
            }
        }

        SettingCard("Stakes") {
            Text(
                "How many dollars to trade with.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            NumberField(
                label = "Amount per trade ($)",
                value = config.baseStake,
                enabled = !running,
                onValue = { v -> onChange { it.copy(baseStake = v) } },
            )
            NumberField(
                label = "Starting balance ($)",
                value = config.startingBalance,
                enabled = !running,
                onValue = { v -> onChange { it.copy(startingBalance = v) } },
            )
        }
    }
}

/** A numeric text field bound to a Double in the config; keeps a local text buffer
 *  so partial input (empty / trailing dot) doesn't fight the user. */
@Composable
private fun NumberField(
    label: String,
    value: Double,
    enabled: Boolean,
    onValue: (Double) -> Unit,
) {
    var text by remember {
        mutableStateOf(if (value % 1.0 == 0.0) value.toInt().toString() else value.toString())
    }
    OutlinedTextField(
        value = text,
        onValueChange = { raw ->
            val cleaned = raw.filter { it.isDigit() || it == '.' }
            text = cleaned
            cleaned.toDoubleOrNull()?.let { if (it > 0) onValue(it) }
        },
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun SettingCard(title: String, content: @Composable () -> Unit) {
    Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            content()
        }
    }
}

@Preview(showBackground = true, heightDp = 900)
@Composable
private fun StrategyPreview() {
    PolyBotTheme(darkTheme = true) {
        StrategyScreen(config = StrategyConfig(), running = false, onChange = {})
    }
}
