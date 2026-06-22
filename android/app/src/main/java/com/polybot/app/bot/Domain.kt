package com.polybot.app.bot

import kotlin.math.pow

/**
 * Self-contained paper-trading engine — a Kotlin port of the Python `polybot`
 * core, so the app runs and shows live trades without a backend. The same
 * concepts will later be served by the FastAPI backend over the network.
 */

enum class Color { GREEN, RED, NONE }

enum class Signal {
    UP, DOWN, NONE;

    fun opposite(): Signal = when (this) {
        UP -> DOWN
        DOWN -> UP
        NONE -> NONE
    }

    companion object {
        fun fromColor(c: Color): Signal = when (c) {
            Color.GREEN -> UP
            Color.RED -> DOWN
            Color.NONE -> NONE
        }
    }
}

data class Candle(
    val openTime: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
) {
    val color: Color
        get() = when {
            close > open -> Color.GREEN
            close < open -> Color.RED
            else -> Color.NONE
        }
}

/** Length of the current run of identical, non-flat colours ending at the last candle. */
fun sameColorStreak(candles: List<Candle>): Int {
    if (candles.isEmpty()) return 0
    val last = candles.last().color
    if (last == Color.NONE) return 0
    var streak = 0
    for (c in candles.asReversed()) {
        if (c.color == last) streak++ else break
    }
    return streak
}

// --- Strategy ------------------------------------------------------------- //

interface Strategy {
    val name: String
    fun decide(candles: List<Candle>): Signal
}

/** Bet the next candle matches the last (red->down, green->up). */
class SameColorStrategy(
    private val minStreak: Int = 1,
    private val invert: Boolean = false,
) : Strategy {
    override val name = if (invert) "fade_last_color" else "follow_last_color"

    override fun decide(candles: List<Candle>): Signal {
        if (candles.isEmpty()) return Signal.NONE
        if (sameColorStreak(candles) < minStreak) return Signal.NONE
        val s = Signal.fromColor(candles.last().color)
        return if (invert) s.opposite() else s
    }
}

// --- Sizing --------------------------------------------------------------- //

interface Sizer {
    fun nextStake(balance: Double, lastWon: Boolean?): Double
}

class FixedSizer(private val stake: Double) : Sizer {
    override fun nextStake(balance: Double, lastWon: Boolean?) = minOf(stake, balance)
}

/** Double the stake after every loss; reset to base after a win. Capped for safety. */
class MartingaleSizer(
    private val baseStake: Double,
    private val multiplier: Double = 2.0,
    private val maxSteps: Int = 6,
    private val maxStake: Double? = null,
) : Sizer {
    var step: Int = 0
        private set

    override fun nextStake(balance: Double, lastWon: Boolean?): Double {
        when (lastWon) {
            true -> step = 0
            false -> step = minOf(step + 1, maxSteps)
            null -> { /* first bet */ }
        }
        var stake = baseStake * multiplier.pow(step)
        if (maxStake != null) stake = minOf(stake, maxStake)
        return minOf(stake, balance)
    }
}

// --- Portfolio & execution ------------------------------------------------ //

data class Trade(
    val candleOpenTime: Long,
    val signal: Signal,
    val stake: Double,
    val payoutMultiple: Double,
    var won: Boolean? = null,
    var pnl: Double = 0.0,
) {
    val resolved: Boolean get() = won != null
}

class Portfolio(val startingBalance: Double) {
    var balance: Double = startingBalance
        private set
    val trades: MutableList<Trade> = mutableListOf()

    fun openTrade(t: Trade) {
        require(t.stake <= balance + 1e-9) { "stake exceeds balance" }
        balance -= t.stake
        trades.add(t)
    }

    fun settle(t: Trade, won: Boolean) {
        check(!t.resolved) { "trade already settled" }
        t.won = won
        if (won) {
            val gross = t.stake * t.payoutMultiple
            t.pnl = gross - t.stake
            balance += gross
        } else {
            t.pnl = -t.stake
        }
    }

    val resolved get() = trades.filter { it.resolved }
    val wins get() = resolved.count { it.won == true }
    val losses get() = resolved.count { it.won == false }
    val openStake get() = trades.filter { !it.resolved }.sumOf { it.stake }
    val equity get() = balance + openStake
    val realisedPnl get() = resolved.sumOf { it.pnl }
    val winRate get() = if (resolved.isNotEmpty()) wins.toDouble() / resolved.size else 0.0
}

/** Simulated execution: a directional bet wins if the candle closed that way. */
class PaperExecutor(val payoutMultiple: Double = 1.95) {
    fun resolve(signal: Signal, outcome: Candle): Boolean = when (outcome.color) {
        Color.GREEN -> signal == Signal.UP
        Color.RED -> signal == Signal.DOWN
        Color.NONE -> false
    }
}

/** Ties strategy + sizing + execution + portfolio together, one bet per candle. */
class TradingEngine(
    private val strategy: Strategy,
    private val sizer: Sizer,
    val portfolio: Portfolio,
    private val executor: PaperExecutor = PaperExecutor(),
    private val risk: RiskManager? = null,
    private val wallet: WalletManager? = null,
    private val stakeJitter: Double = 0.0,
    private val rng: kotlin.random.Random = kotlin.random.Random.Default,
    private val minStake: Double = 1e-6,
) {
    private val history = mutableListOf<Candle>()
    private var pending: Trade? = null
    private var pendingSignal: Signal = Signal.NONE
    private var lastWon: Boolean? = null

    var lastHaltReason: String? = null
        private set

    fun onCandle(candle: Candle) {
        pending?.let { trade ->
            val won = executor.resolve(pendingSignal, candle)
            portfolio.settle(trade, won)
            lastWon = won
            pending = null
            risk?.postSettlement(candle.openTime, trade.pnl)
            wallet?.record(candle.openTime, trade.pnl)
        }

        history.add(candle)
        val nextOpenTime = candle.openTime + 1
        wallet?.advance(nextOpenTime)

        val signal = strategy.decide(history)
        if (signal == Signal.NONE) return

        var stake = sizer.nextStake(portfolio.balance, lastWon)
        if (stakeJitter > 0.0) stake *= 1.0 + rng.nextDouble(-stakeJitter, stakeJitter)
        stake = minOf(stake, portfolio.balance)

        risk?.let {
            val decision = it.preTrade(nextOpenTime, portfolio.balance, stake)
            if (!decision.allowed) { lastHaltReason = decision.reason; return }
            stake = decision.stake
        }
        if (stake < minStake) return

        val trade = Trade(
            candleOpenTime = nextOpenTime,
            signal = signal,
            stake = stake,
            payoutMultiple = executor.payoutMultiple,
        )
        portfolio.openTrade(trade)
        risk?.registerTrade(nextOpenTime)
        pending = trade
        pendingSignal = signal
    }
}
