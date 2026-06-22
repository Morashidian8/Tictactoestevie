package com.polybot.app.bot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.polybot.app.net.BotConfigDto
import com.polybot.app.net.PolyBotApi
import com.polybot.app.net.RiskConfigDto
import com.polybot.app.net.Snapshot
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Drives the UI from the FastAPI backend instead of the in-app engine: REST for
 * commands, WebSocket for live state. Same [BotControl] surface as the local one.
 */
class RemoteBotController : ViewModel(), BotControl {

    private val _state = MutableStateFlow(BotUiState())
    override val state: StateFlow<BotUiState> = _state.asStateFlow()

    private val api = PolyBotApi(_state.value.serverUrl)
    private var wsJob: Job? = null

    override fun updateConfig(transform: (StrategyConfig) -> StrategyConfig) {
        _state.update { it.copy(config = transform(it.config)) }
    }

    override fun setServerUrl(url: String) {
        api.baseUrl = url
        _state.update { it.copy(serverUrl = url) }
    }

    override fun start() {
        val cfg = _state.value.config
        viewModelScope.launch {
            try {
                api.baseUrl = _state.value.serverUrl
                val snap = api.start(cfg.toDto())
                _state.update { it.applySnapshot(snap).copy(running = true, haltReason = null) }
                connect()
            } catch (e: Exception) {
                _state.update { it.copy(connected = false, haltReason = "connection error") }
            }
        }
    }

    override fun stop() = command { api.stop() }
    override fun reset() = command {
        val snap = api.reset()
        _state.update { it.applySnapshot(snap).copy(running = false) }
        snap
    }

    override fun killSwitch() {
        _state.update { it.copy(killed = true, haltReason = "kill_switch") }
        command { api.kill() }
    }

    private fun connect() {
        wsJob?.cancel()
        wsJob = viewModelScope.launch {
            api.snapshots()
                .catch { _state.update { s -> s.copy(connected = false) } }
                .collect { snap -> _state.update { it.applySnapshot(snap) } }
        }
    }

    private inline fun command(crossinline block: suspend () -> Snapshot) {
        viewModelScope.launch {
            runCatching { block() }
                .onSuccess { snap -> _state.update { it.applySnapshot(snap) } }
                .onFailure { _state.update { it.copy(haltReason = "connection error") } }
        }
    }

    override fun onCleared() {
        wsJob?.cancel()
        super.onCleared()
    }
}

// --- mapping --------------------------------------------------------------- //

private fun StrategyConfig.toDto(): BotConfigDto = BotConfigDto(
    strategy = "same_color",
    minStreak = minStreak,
    invert = !followLastColor,
    sizing = if (useMartingale) "martingale" else "fixed",
    baseStake = baseStake,
    maxSteps = maxSteps,
    startingBalance = startingBalance,
    stakeJitter = stakeJitter,
    rotateWallet = rotateWallet,
    risk = RiskConfigDto(
        maxStakePerTrade = maxStakePerTrade.takeIf { it > 0 },
        maxDailyLoss = dailyLossCap.takeIf { it > 0 },
        dailyProfitTarget = dailyProfitTarget.takeIf { it > 0 },
        maxConsecutiveLosses = maxConsecutiveLosses.takeIf { it > 0 },
    ),
)

private fun parseColor(c: String?): Color = when (c) {
    "green" -> Color.GREEN
    "red" -> Color.RED
    else -> Color.NONE
}

private fun BotUiState.applySnapshot(s: Snapshot): BotUiState {
    val p = s.portfolio
    return copy(
        running = s.running,
        connected = true,
        startingBalance = p?.startingBalance ?: startingBalance,
        balance = p?.balance ?: balance,
        equity = p?.equity ?: equity,
        realisedPnl = p?.realisedPnl ?: 0.0,
        wins = p?.wins ?: 0,
        losses = p?.losses ?: 0,
        winRate = p?.winRate ?: 0.0,
        lastColor = parseColor(s.lastCandle?.color),
        lastPrice = s.lastCandle?.close ?: 0.0,
        recentTrades = s.recentTrades.map {
            Trade(
                candleOpenTime = 0L,
                signal = if (it.signal == "up") Signal.UP else Signal.DOWN,
                stake = it.stake,
                payoutMultiple = 1.95,
                won = it.won,
                pnl = it.pnl,
            )
        },
        killed = s.risk?.killed ?: false,
        haltReason = s.haltReason,
        walletId = s.wallet?.id ?: "—",
        walletRotations = s.wallet?.rotations ?: 0,
    )
}
