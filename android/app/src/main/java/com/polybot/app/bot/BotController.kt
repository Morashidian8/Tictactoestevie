package com.polybot.app.bot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Which built-in strategy + how to size it. Edited on the Strategy screen. */
data class StrategyConfig(
    val followLastColor: Boolean = true,   // true: red->red, green->green; false: fade
    val minStreak: Int = 1,
    val useMartingale: Boolean = true,
    val baseStake: Double = 1.0,
    val maxSteps: Int = 6,
    val startingBalance: Double = 100.0,
    val tickMillis: Long = 1_000,          // demo speed (one candle per second)
)

data class BotUiState(
    val running: Boolean = false,
    val startingBalance: Double = 100.0,
    val balance: Double = 100.0,
    val equity: Double = 100.0,
    val realisedPnl: Double = 0.0,
    val wins: Int = 0,
    val losses: Int = 0,
    val winRate: Double = 0.0,
    val martingaleStep: Int = 0,
    val lastColor: Color = Color.NONE,
    val lastPrice: Double = 0.0,
    val recentTrades: List<Trade> = emptyList(),
    val config: StrategyConfig = StrategyConfig(),
)

/**
 * Drives the paper-trading demo: every tick it pulls a synthetic candle, feeds
 * the engine, and republishes a [BotUiState]. PAPER MODE ONLY — no real money.
 */
class BotController : ViewModel() {

    private val _state = MutableStateFlow(BotUiState())
    val state: StateFlow<BotUiState> = _state.asStateFlow()

    private var loop: Job? = null
    private var engine: TradingEngine? = null
    private var feed: CandleFeed? = null

    fun updateConfig(transform: (StrategyConfig) -> StrategyConfig) {
        _state.update { it.copy(config = transform(it.config)) }
    }

    fun start() {
        if (_state.value.running) return
        val cfg = _state.value.config

        val strategy = SameColorStrategy(minStreak = cfg.minStreak, invert = !cfg.followLastColor)
        val sizer = if (cfg.useMartingale) {
            MartingaleSizer(baseStake = cfg.baseStake, maxSteps = cfg.maxSteps)
        } else {
            FixedSizer(cfg.baseStake)
        }
        val portfolio = Portfolio(cfg.startingBalance)
        val engine = TradingEngine(strategy, sizer, portfolio).also { this.engine = it }
        val sizerRef = sizer
        feed = SyntheticCandleFeed()

        _state.update {
            BotUiState(
                running = true,
                startingBalance = cfg.startingBalance,
                balance = cfg.startingBalance,
                equity = cfg.startingBalance,
                config = cfg,
            )
        }

        loop = viewModelScope.launch {
            while (_state.value.running) {
                val candle = feed!!.next()
                engine.onCandle(candle)
                val p = engine.portfolio
                _state.update {
                    it.copy(
                        balance = p.balance,
                        equity = p.equity,
                        realisedPnl = p.realisedPnl,
                        wins = p.wins,
                        losses = p.losses,
                        winRate = p.winRate,
                        martingaleStep = (sizerRef as? MartingaleSizer)?.step ?: 0,
                        lastColor = candle.color,
                        lastPrice = candle.close,
                        recentTrades = p.trades.takeLast(12).asReversed(),
                    )
                }
                if (p.equity <= 0.01) {       // wiped out — stop honestly
                    _state.update { it.copy(running = false) }
                    break
                }
                delay(cfg.tickMillis)
            }
        }
    }

    fun stop() {
        loop?.cancel()
        loop = null
        _state.update { it.copy(running = false) }
    }

    fun reset() {
        stop()
        _state.update { BotUiState(config = it.config) }
    }
}
