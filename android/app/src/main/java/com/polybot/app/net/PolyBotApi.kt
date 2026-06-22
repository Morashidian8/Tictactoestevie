package com.polybot.app.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

// --- wire models (match polybot/api.py snapshot + config) ------------------ //

@Serializable
data class PortfolioDto(
    @SerialName("starting_balance") val startingBalance: Double = 0.0,
    val balance: Double = 0.0,
    val equity: Double = 0.0,
    @SerialName("realised_pnl") val realisedPnl: Double = 0.0,
    val trades: Int = 0,
    val wins: Int = 0,
    val losses: Int = 0,
    @SerialName("win_rate") val winRate: Double = 0.0,
)

@Serializable
data class RiskDto(
    val killed: Boolean = false,
    @SerialName("consecutive_losses") val consecutiveLosses: Int = 0,
)

@Serializable
data class WalletDto(val id: String? = null, val rotations: Int = 0)

@Serializable
data class CandleDto(val color: String = "none", val close: Double = 0.0)

@Serializable
data class TradeDto(
    val signal: String = "up",
    val stake: Double = 0.0,
    val won: Boolean? = null,
    val pnl: Double = 0.0,
)

@Serializable
data class Snapshot(
    val running: Boolean = false,
    val configured: Boolean = false,
    val portfolio: PortfolioDto? = null,
    val risk: RiskDto? = null,
    @SerialName("halt_reason") val haltReason: String? = null,
    val wallet: WalletDto? = null,
    @SerialName("last_candle") val lastCandle: CandleDto? = null,
    @SerialName("recent_trades") val recentTrades: List<TradeDto> = emptyList(),
)

@Serializable
data class RiskConfigDto(
    @SerialName("max_stake_per_trade") val maxStakePerTrade: Double? = null,
    @SerialName("max_daily_loss") val maxDailyLoss: Double? = null,
    @SerialName("daily_profit_target") val dailyProfitTarget: Double? = null,
    @SerialName("max_consecutive_losses") val maxConsecutiveLosses: Int? = null,
)

@Serializable
data class BotConfigDto(
    val strategy: String = "same_color",
    @SerialName("min_streak") val minStreak: Int = 1,
    val invert: Boolean = false,
    val sizing: String = "martingale",
    @SerialName("base_stake") val baseStake: Double = 1.0,
    @SerialName("max_steps") val maxSteps: Int = 6,
    @SerialName("starting_balance") val startingBalance: Double = 100.0,
    @SerialName("stake_jitter") val stakeJitter: Double = 0.0,
    @SerialName("rotate_wallet") val rotateWallet: Boolean = true,
    val risk: RiskConfigDto = RiskConfigDto(),
    @SerialName("tick_seconds") val tickSeconds: Double = 1.0,
)

/**
 * Client for the PolyBot control API (polybot/api.py). REST calls are suspending;
 * [snapshots] opens the /ws WebSocket and emits live state as a Flow.
 */
class PolyBotApi(@Volatile var baseUrl: String) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    private val jsonMedia = "application/json".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)      // keep WS open
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private fun url(path: String) = baseUrl.trimEnd('/') + path

    private suspend fun post(path: String, body: String?): Snapshot = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(url(path))
            .post((body ?: "").toRequestBody(jsonMedia))
            .build()
        call(req)
    }

    suspend fun start(config: BotConfigDto): Snapshot = post("/start", json.encodeToString(config))
    suspend fun stop(): Snapshot = post("/stop", null)
    suspend fun reset(): Snapshot = post("/reset", null)
    suspend fun kill(): Snapshot = post("/kill", null)

    suspend fun status(): Snapshot = withContext(Dispatchers.IO) {
        call(Request.Builder().url(url("/status")).get().build())
    }

    private fun call(req: Request): Snapshot {
        client.newCall(req).execute().use { resp: Response ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw RuntimeException("HTTP ${resp.code}: $text")
            return json.decodeFromString(text)
        }
    }

    fun snapshots(): Flow<Snapshot> = callbackFlow {
        val wsUrl = baseUrl.trimEnd('/').replaceFirst("http", "ws") + "/ws"
        val listener = object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { json.decodeFromString<Snapshot>(text) }.getOrNull()?.let { trySend(it) }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                close(t)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                close()
            }
        }
        val ws = client.newWebSocket(Request.Builder().url(wsUrl).build(), listener)
        awaitClose { ws.cancel() }
    }
}
