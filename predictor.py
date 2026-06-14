"""
Scalper-style next-candle color predictor for BTC 5-minute candles.

Given a list of recent *closed* candles (oldest -> newest), this module runs a
small ensemble of classic technical-analysis signals (EMA trend, EMA slope,
MACD histogram + slope, RSI momentum + mean-reversion, rate-of-change, last
candle body, price vs. EMA50, and volume confirmation) and combines them into
a single weighted score. The sign of the score is the predicted color of the
NEXT candle (green = bullish, red = bearish); the magnitude is a 0..1
confidence.

IMPORTANT / honest note: the color of the very next 5-minute candle is, in
practice, close to a coin flip. No indicator set can predict it reliably. This
is a disciplined, reproducible heuristic — not a guarantee of profit.

Each candle is a dict: {"time", "open", "high", "low", "close", "volume"}.
"""

from __future__ import annotations

import math
from typing import Dict, List


# ---------------------------------------------------------------------------
# Indicator math helpers (pure Python, no numpy dependency)
# ---------------------------------------------------------------------------
def ema(values: List[float], period: int) -> List[float]:
    """Exponential moving average; returns a list the same length as values."""
    if not values:
        return []
    k = 2.0 / (period + 1.0)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1.0 - k))
    return out


def sma(values: List[float], period: int) -> float:
    """Simple moving average of the trailing `period` values."""
    if not values:
        return 0.0
    window = values[-period:]
    return sum(window) / len(window)


def rsi(values: List[float], period: int = 14) -> List[float]:
    """Wilder's RSI; returns a list the same length as values (padded with 50)."""
    n = len(values)
    if n < period + 1:
        return [50.0] * n
    deltas = [values[i] - values[i - 1] for i in range(1, n)]
    avg_gain = sum(max(d, 0.0) for d in deltas[:period]) / period
    avg_loss = sum(-min(d, 0.0) for d in deltas[:period]) / period

    out = [50.0] * period  # pad the warm-up region

    def _rsi(g: float, l: float) -> float:
        if l == 0:
            return 100.0
        rs = g / l
        return 100.0 - 100.0 / (1.0 + rs)

    out.append(_rsi(avg_gain, avg_loss))
    for d in deltas[period:]:
        gain = max(d, 0.0)
        loss = -min(d, 0.0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out.append(_rsi(avg_gain, avg_loss))
    return out


def macd(values: List[float]):
    """Return (macd_line, signal_line, histogram), each same length as values."""
    e12 = ema(values, 12)
    e26 = ema(values, 26)
    macd_line = [a - b for a, b in zip(e12, e26)]
    signal = ema(macd_line, 9)
    hist = [m - s for m, s in zip(macd_line, signal)]
    return macd_line, signal, hist


def atr(highs, lows, closes, period: int = 14) -> float:
    """Average True Range over the trailing `period` candles."""
    trs = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    if not trs:
        return max(closes[-1] * 1e-4, 1e-9)
    window = trs[-period:]
    val = sum(window) / len(window)
    # Never return 0 — it is used as a denominator for normalization.
    return val if val > 0 else max(closes[-1] * 1e-4, 1e-9)


def _tanh(x: float) -> float:
    # Clamp to avoid overflow for extreme inputs.
    if x > 20:
        return 1.0
    if x < -20:
        return -1.0
    return math.tanh(x)


# ---------------------------------------------------------------------------
# The predictor
# ---------------------------------------------------------------------------
# (signal_name, weight). Weights reflect how much trust a scalper would put in
# each signal for a very-short-horizon call.
WEIGHTS = {
    "ema_trend": 1.5,      # fast EMA above/below slow EMA
    "ema_slope": 1.0,      # is the fast EMA turning up or down
    "macd_hist": 1.2,      # MACD histogram sign/size
    "macd_slope": 0.8,     # is the histogram expanding or contracting
    "rsi_mom": 1.0,        # RSI distance from 50 (momentum)
    "rsi_revert": 0.6,     # fade overbought/oversold extremes
    "roc": 0.8,            # short rate-of-change
    "last_body": 0.5,      # continuation of the last candle's body
    "vs_ema50": 0.7,       # price above/below the slower EMA50 baseline
    "volume": 0.5,         # volume confirmation of the last move
}

MIN_CANDLES = 30


def predict(candles: List[Dict]) -> Dict:
    """
    Predict the color of the NEXT candle.

    Returns a dict:
        {
          "direction": +1 (green) | -1 (red),
          "confidence": float in [0, 1],
          "score": signed weighted score in [-1, 1],
          "signals": {name: contribution in [-1, 1]},
        }
    """
    closes = [float(c["close"]) for c in candles]
    opens = [float(c["open"]) for c in candles]
    highs = [float(c["high"]) for c in candles]
    lows = [float(c["low"]) for c in candles]
    vols = [float(c.get("volume", 0.0) or 0.0) for c in candles]

    if len(closes) < MIN_CANDLES:
        # Not enough history for a meaningful read — fall back to the last
        # candle's direction (weak continuation), default green on a flat.
        last_dir = 1 if closes[-1] >= opens[-1] else -1
        return {
            "direction": last_dir,
            "confidence": 0.0,
            "score": 0.0,
            "signals": {},
            "note": "insufficient history",
        }

    a = atr(highs, lows, closes, 14)
    price = closes[-1]

    ema9 = ema(closes, 9)
    ema21 = ema(closes, 21)
    ema50 = ema(closes, 50) if len(closes) >= 50 else ema(closes, max(2, len(closes) // 2))
    rsi14 = rsi(closes, 14)
    _, _, hist = macd(closes)

    signals: Dict[str, float] = {}

    # 1) Fast vs slow EMA — the dominant short-term trend reading.
    signals["ema_trend"] = _tanh((ema9[-1] - ema21[-1]) / a)

    # 2) Slope of the fast EMA over the last few candles.
    slope_ref = ema9[-4] if len(ema9) >= 4 else ema9[0]
    signals["ema_slope"] = _tanh((ema9[-1] - slope_ref) / a)

    # 3) MACD histogram sign & magnitude.
    signals["macd_hist"] = _tanh(hist[-1] / (0.5 * a))

    # 4) Is the histogram expanding (momentum building) or fading?
    hist_prev = hist[-2] if len(hist) >= 2 else hist[-1]
    signals["macd_slope"] = _tanh((hist[-1] - hist_prev) / (0.3 * a))

    # 5) RSI momentum: distance from the neutral 50 line.
    signals["rsi_mom"] = max(-1.0, min(1.0, (rsi14[-1] - 50.0) / 25.0))

    # 6) RSI mean-reversion: fade extreme overbought/oversold for a scalp.
    r = rsi14[-1]
    if r >= 70:
        signals["rsi_revert"] = -min(1.0, (r - 70.0) / 20.0)
    elif r <= 30:
        signals["rsi_revert"] = min(1.0, (30.0 - r) / 20.0)
    else:
        signals["rsi_revert"] = 0.0

    # 7) Short rate-of-change over the last ~3 candles.
    ref = closes[-4] if len(closes) >= 4 else closes[0]
    signals["roc"] = _tanh((price - ref) / (2.0 * a))

    # 8) Last candle body — weak continuation bias.
    signals["last_body"] = _tanh((closes[-1] - opens[-1]) / a)

    # 9) Price relative to the slower EMA50 baseline.
    signals["vs_ema50"] = _tanh((price - ema50[-1]) / (2.0 * a))

    # 10) Volume confirmation: an above-average-volume candle reinforces its
    #     own direction; below-average volume mutes it.
    avg_vol = sma(vols, 20)
    if avg_vol > 0:
        vol_ratio = max(-1.0, min(1.0, (vols[-1] / avg_vol) - 1.0))
    else:
        vol_ratio = 0.0
    body_dir = 1.0 if closes[-1] >= opens[-1] else -1.0
    signals["volume"] = body_dir * abs(vol_ratio)

    # Combine into a single normalized score in [-1, 1].
    total = sum(WEIGHTS[name] * signals[name] for name in signals)
    max_total = sum(WEIGHTS[name] for name in signals)
    score = total / max_total if max_total else 0.0

    if score > 0:
        direction = 1
    elif score < 0:
        direction = -1
    else:
        # Exact tie: lean on the dominant trend, then the last body.
        direction = 1 if signals["ema_trend"] >= 0 else -1

    return {
        "direction": direction,
        "confidence": abs(score),
        "score": score,
        "signals": signals,
    }


def explain(result: Dict) -> str:
    """Human-readable breakdown of a prediction (for /status and debugging)."""
    if not result.get("signals"):
        return result.get("note", "no signals")
    lines = []
    for name, val in result["signals"].items():
        bar = "🟢" if val > 0 else ("🔴" if val < 0 else "⚪️")
        lines.append(f"{name}: {val:+.2f} {bar} (w={WEIGHTS[name]})")
    lines.append(f"score={result['score']:+.3f} conf={result['confidence']:.2f}")
    return "\n".join(lines)
