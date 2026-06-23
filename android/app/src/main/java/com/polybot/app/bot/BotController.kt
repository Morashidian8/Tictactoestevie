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
    // --- safety layer (0 / off disables a limit) ---
    val maxStakePerTrade: Double = 0.0,    // hard cap per bet
    val dailyLossCap: Double = 0.0,        // halt for the "day" after losing this much
    val dailyProfitTarget: Double = 0.0,   // stop / rotate once this profit is reached
    val maxConsecutiveLosses: Int = 0,     // circuit breaker
    val stakeJitter: Double = 0.15,        // randomise stake +/- this fraction
    val rotateWallet: Boolean = true,      // privacy: rotate wallet on new day / profit cap
    val runMinutes: Double = 0.0,          // optional auto-stop after N minutes (0 = manual only)
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
    // --- safety state ---
    val killed: Boolean = false,
    val haltReason: String? = null,
    val walletId: String = "—",
    val walletRotations: Int = 0,
    // --- connection (remote mode) ---
    val serverUrl: String = "http://10.0.2.2:8000",
    val connected: Boolean = false,
)

/** Common surface the UI drives, implemented by the local and remote controllers. */
interface BotControl {
    val state: StateFlow<BotUiState>
    fun updateConfig(transform: (StrategyConfig) -> StrategyConfig)
    fun start()
    fun stop()
    fun reset()
    fun killSwitch()
    fun setServerUrl(url: String) {}
}

/**
 * Drives the paper-trading demo: every tick it pulls a synthetic candle, feeds
 * the engine, and republishes a [BotUiState]. PAPER MODE ONLY — no real money.
 */
class BotController : ViewModel(), BotControl {

    private val _state = MutableStateFlow(BotUiState())
    override val state: StateFlow<BotUiState> = _state.asStateFlow()

    private var loop: Job? = null
    private var engine: TradingEngine? = null
    private var feed: CandleFeed? = null
    private var risk: RiskManager? = null

    // "Day" length on the demo clock (candles step 300s), shortened so daily
    // resets and wallet rotation are visible within a short demo run.
    private val demoDaySeconds = 3_600L

    override fun updateConfig(transform: (StrategyConfig) -> StrategyConfig) {
        _state.update { it.copy(config = transform(it.config)) }
    }

    /** Panic stop — blocks all new bets immediately until restarted. */
    override fun killSwitch() {
        risk?.tripKillSwitch()
        _state.update { it.copy(killed = true, haltReason = "kill_switch") }
    }

    override fun start() {
        if (_state.value.running) return
        val cfg = _state.value.config

        val strategy = SameColorStrategy(minStreak = cfg.minStreak, invert = !cfg.followLastColor)
        val sizer = if (cfg.useMartingale) {
            MartingaleSizer(baseStake = cfg.baseStake, maxSteps = cfg.maxSteps)
        } else {
            FixedSizer(cfg.baseStake)
        }
        val portfolio = Portfolio(cfg.startingBalance)

        val riskManager = RiskManager(
            RiskLimits(
                maxStakePerTrade = cfg.maxStakePerTrade.takeIf { it > 0 },
                maxDailyLoss = cfg.dailyLossCap.takeIf { it > 0 },
                dailyProfitTarget = cfg.dailyProfitTarget.takeIf { it > 0 },
                maxConsecutiveLosses = cfg.maxConsecutiveLosses.takeIf { it > 0 },
                daySeconds = demoDaySeconds,
            )
        ).also { this.risk = it }
        val walletManager = if (cfg.rotateWallet) {
            WalletManager(
                dailyProfitCap = cfg.dailyProfitTarget.takeIf { it > 0 },
                daySeconds = demoDaySeconds,
            )
        } else null

        val engine = TradingEngine(
            strategy = strategy,
            sizer = sizer,
            portfolio = portfolio,
            risk = riskManager,
            wallet = walletManager,
            stakeJitter = cfg.stakeJitter,
        ).also { this.engine = it }
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

        val deadline = if (cfg.runMinutes > 0) {
            System.currentTimeMillis() + (cfg.runMinutes * 60_000).toLong()
        } else null

        loop = viewModelScope.launch {
            while (_state.value.running) {
                if (deadline != null && System.currentTimeMillis() >= deadline) {
                    _state.update { it.copy(running = false, haltReason = "duration_reached") }
                    break
                }
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
                        killed = riskManager.killed,
                        haltReason = engine.lastHaltReason,
                        walletId = walletManager?.current?.id ?: "—",
                        walletRotations = walletManager?.rotations ?: 0,
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

    override fun stop() {
        loop?.cancel()
        loop = null
        _state.update { it.copy(running = false) }
    }

    override fun reset() {
        stop()
        _state.update { BotUiState(config = it.config, serverUrl = it.serverUrl) }
    }
}
