package com.polybot.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.polybot.app.bot.BotUiState
import com.polybot.app.bot.Signal
import com.polybot.app.bot.Trade
import com.polybot.app.ui.theme.Green
import com.polybot.app.ui.theme.PolyBotTheme
import com.polybot.app.ui.theme.Red
import com.polybot.app.bot.Color as CandleColor

@Composable
fun DashboardScreen(
    state: BotUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PaperModeBanner()

        EquityCard(state)

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCard("Win rate", "${(state.winRate * 100).format(0)}%", Modifier.weight(1f))
            StatCard("W / L", "${state.wins} / ${state.losses}", Modifier.weight(1f))
            StatCard("Martingale", "x${state.martingaleStep}", Modifier.weight(1f))
        }

        ControlRow(running = state.running, onStart = onStart, onStop = onStop, onReset = onReset)

        Text("Recent trades", style = MaterialTheme.typography.titleMedium)
        if (state.recentTrades.isEmpty()) {
            Text(
                "No trades yet — press Start.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.recentTrades) { TradeRow(it) }
            }
        }
    }
}

@Composable
private fun PaperModeBanner() {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f)),
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(
            "PAPER MODE — simulated money. No real funds at risk.",
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun EquityCard(state: BotUiState) {
    val pnlColor = if (state.realisedPnl >= 0) Green else Red
    Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Equity", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "$${state.equity.format(2)}",
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${if (state.realisedPnl >= 0) "+" else ""}$${state.realisedPnl.format(2)} PnL",
                    color = pnlColor,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.size(12.dp))
                Text(
                    "from $${state.startingBalance.format(0)}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ColorDot(state.lastColor)
                Spacer(Modifier.size(8.dp))
                Text(
                    if (state.lastPrice > 0) "Last candle  •  BTC $${state.lastPrice.format(0)}"
                    else "Waiting for first candle…",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(shape = RoundedCornerShape(14.dp), modifier = modifier) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ControlRow(running: Boolean, onStart: () -> Unit, onStop: () -> Unit, onReset: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        if (running) {
            Button(onClick = onStop, modifier = Modifier.weight(1f)) { Text("Stop") }
        } else {
            Button(onClick = onStart, modifier = Modifier.weight(1f)) { Text("Start") }
        }
        OutlinedButton(onClick = onReset, modifier = Modifier.weight(1f)) { Text("Reset") }
    }
}

@Composable
private fun TradeRow(trade: Trade) {
    val isUp = trade.signal == Signal.UP
    val sideColor = if (isUp) Green else Red
    Card(shape = RoundedCornerShape(12.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(sideColor.copy(alpha = 0.18f))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Text(if (isUp) "UP" else "DOWN", color = sideColor, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }
            Spacer(Modifier.size(12.dp))
            Text("$${trade.stake.format(2)}", fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            val status = when (trade.won) {
                true -> "WON  +$${trade.pnl.format(2)}"
                false -> "LOST  $${trade.pnl.format(2)}"
                null -> "OPEN"
            }
            val statusColor = when (trade.won) {
                true -> Green
                false -> Red
                null -> MaterialTheme.colorScheme.onSurfaceVariant
            }
            Text(status, color = statusColor, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ColorDot(color: CandleColor) {
    val c = when (color) {
        CandleColor.GREEN -> Green
        CandleColor.RED -> Red
        CandleColor.NONE -> Color.Gray
    }
    Box(Modifier.size(12.dp).clip(CircleShape).background(c))
}

private fun Double.format(digits: Int): String = "%,.${digits}f".format(this)

@Preview(showBackground = true, heightDp = 780)
@Composable
private fun DashboardPreview() {
    val demo = BotUiState(
        running = true,
        startingBalance = 100.0,
        balance = 96.0,
        equity = 112.40,
        realisedPnl = 12.40,
        wins = 7,
        losses = 5,
        winRate = 0.583,
        martingaleStep = 2,
        lastColor = CandleColor.RED,
        lastPrice = 64875.0,
        recentTrades = listOf(
            Trade(3, Signal.DOWN, 4.0, 1.95, won = true, pnl = 3.8),
            Trade(2, Signal.DOWN, 2.0, 1.95, won = false, pnl = -2.0),
            Trade(1, Signal.UP, 1.0, 1.95, won = true, pnl = 0.95),
        ),
    )
    PolyBotTheme(darkTheme = true) {
        DashboardScreen(demo, {}, {}, {})
    }
}
