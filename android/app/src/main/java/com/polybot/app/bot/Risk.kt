package com.polybot.app.bot

/**
 * Safety layer — a Kotlin port of `polybot/risk.py` and `polybot/wallet.py`.
 * Sits below the strategy: even a buggy strategy/sizer can't place a bet the
 * RiskManager rejects. Runs in the in-app paper demo exactly like the backend.
 */

const val DAY_SECONDS = 86_400L

data class RiskLimits(
    val maxStakePerTrade: Double? = null,
    val maxDailyLoss: Double? = null,
    val dailyProfitTarget: Double? = null,
    val minBalance: Double = 0.0,
    val maxTradesPerWindow: Int? = null,
    val windowSeconds: Long = 60,
    val maxConsecutiveLosses: Int? = null,
    val daySeconds: Long = DAY_SECONDS,
)

data class RiskDecision(val allowed: Boolean, val stake: Double, val reason: String? = null)

class RiskManager(private val limits: RiskLimits) {
    var killed: Boolean = false
        private set

    private var dayStart: Long? = null
    private var dayPnl: Double = 0.0
    private var consecutiveLosses: Int = 0
    private val tradeTimes = ArrayDeque<Long>()

    fun tripKillSwitch() { killed = true }
    fun resetKillSwitch() { killed = false }

    val dailyPnl: Double get() = dayPnl

    private fun rollDay(now: Long) {
        val boundary = now - (now % limits.daySeconds)
        if (dayStart == null || boundary > dayStart!!) {
            dayStart = boundary
            dayPnl = 0.0
        }
    }

    fun preTrade(now: Long, balance: Double, proposedStake: Double): RiskDecision {
        rollDay(now)
        if (killed) return RiskDecision(false, 0.0, "kill_switch")
        if (balance <= limits.minBalance) return RiskDecision(false, 0.0, "min_balance")
        limits.maxDailyLoss?.let { if (dayPnl <= -it) return RiskDecision(false, 0.0, "daily_loss") }
        limits.dailyProfitTarget?.let { if (dayPnl >= it) return RiskDecision(false, 0.0, "daily_profit_target") }
        limits.maxConsecutiveLosses?.let {
            if (consecutiveLosses >= it) return RiskDecision(false, 0.0, "max_consecutive_losses")
        }
        pruneWindow(now)
        limits.maxTradesPerWindow?.let {
            if (tradeTimes.size >= it) return RiskDecision(false, 0.0, "rate_limit")
        }
        var stake = proposedStake
        limits.maxStakePerTrade?.let { stake = minOf(stake, it) }
        stake = minOf(stake, balance)
        if (stake <= 0) return RiskDecision(false, 0.0, "min_balance")
        return RiskDecision(true, stake, null)
    }

    fun registerTrade(now: Long) {
        pruneWindow(now)
        tradeTimes.addLast(now)
    }

    fun postSettlement(now: Long, pnl: Double) {
        rollDay(now)
        dayPnl += pnl
        when {
            pnl < 0 -> consecutiveLosses += 1
            pnl > 0 -> consecutiveLosses = 0
        }
    }

    private fun pruneWindow(now: Long) {
        val cutoff = now - limits.windowSeconds
        while (tradeTimes.isNotEmpty() && tradeTimes.first() <= cutoff) tradeTimes.removeFirst()
    }
}

// --- Wallet rotation ------------------------------------------------------ //

data class Wallet(val id: String, val openedAt: Long, var dayPnl: Double = 0.0)

class WalletManager(
    private val dailyProfitCap: Double? = null,
    private val daySeconds: Long = DAY_SECONDS,
    private val prefix: String = "w",
) {
    private var seq = 0
    private var dayStart: Long? = null
    var current: Wallet? = null
        private set

    val rotations: Int get() = maxOf(0, seq - 1)

    private fun newWallet(now: Long): Wallet {
        seq += 1
        val w = Wallet(id = "$prefix${seq.toString().padStart(4, '0')}", openedAt = now)
        current = w
        return w
    }

    fun advance(now: Long): Wallet? {
        val boundary = now - (now % daySeconds)
        if (current == null) { dayStart = boundary; return newWallet(now) }
        if (boundary > (dayStart ?: 0)) { dayStart = boundary; return newWallet(now) }
        return null
    }

    fun record(now: Long, pnl: Double): Wallet? {
        if (current == null) advance(now)
        current!!.dayPnl += pnl
        if (dailyProfitCap != null && current!!.dayPnl >= dailyProfitCap) return newWallet(now)
        return null
    }
}
