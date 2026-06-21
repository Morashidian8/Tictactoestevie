package com.polybot.app.bot

import kotlin.random.Random

/**
 * A candle source. The demo uses a synthetic random-walk generator so the app
 * is fully self-contained; a future implementation will stream real BTC candles
 * from the backend / Binance.
 */
interface CandleFeed {
    fun next(): Candle
}

class SyntheticCandleFeed(
    startPrice: Double = 65_000.0,
    seed: Long = System.currentTimeMillis(),
    private val intervalSeconds: Long = 300,
    private val volatility: Double = 60.0,
) : CandleFeed {
    private val rng = Random(seed)
    private var price = startPrice
    private var time = 0L

    override fun next(): Candle {
        val open = price
        val close = open + rng.nextDouble(-volatility, volatility)
        val high = maxOf(open, close) + rng.nextDouble(0.0, volatility / 2)
        val low = minOf(open, close) - rng.nextDouble(0.0, volatility / 2)
        price = close
        val c = Candle(openTime = time, open = open, high = high, low = low, close = close)
        time += intervalSeconds
        return c
    }
}
