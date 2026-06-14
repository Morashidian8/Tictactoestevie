"""
Bitcoin 5-minute next-candle COLOR PREDICTOR bot (Telegram).

Acts like a short-term scalper: roughly one minute before each new BTCUSDT
5-minute candle opens, it runs a technical-analysis ensemble (see predictor.py)
and guesses whether that upcoming candle will close GREEN (🟢) or RED (🔴).

Control it from Telegram:
    /start  — begin predicting; one message ~1 minute before every 5m candle
    /stop   — stop predicting
    /status — show whether it is running + the latest prediction breakdown
    /predict — fire a one-off prediction for the next candle right now

Each prediction message is intentionally minimal — just the candle's open time
and the predicted color, e.g.:  ۱۲:۰۵🟢

Honest note: the next candle's color is close to a coin flip; no analysis can
predict it reliably. This bot makes a disciplined, reproducible best guess.

Data source: Binance public market-data API (no API key required).
"""

import os
import json
import time
import threading
import logging
from datetime import datetime, timezone

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - py<3.9 fallback
    ZoneInfo = None

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from predictor import predict, explain

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

# Data source: "binance" (spot candles) or "polymarket" (BTC Up/Down 5m series).
SOURCE = os.environ.get("SOURCE", "binance").strip().lower()

PRODUCT = os.environ.get("PRODUCT", "BTCUSDT").strip()
GRANULARITY = int(os.environ.get("GRANULARITY", "300"))  # 5 minutes
INTERVAL = os.environ.get("INTERVAL", "5m").strip()  # Binance kline interval

# How many candles to pull for the indicators (more = smoother EMA50/MACD).
KLINES_LIMIT = int(os.environ.get("KLINES_LIMIT", "200"))

# How many seconds BEFORE the next candle opens to send the prediction.
LEAD_SECONDS = int(os.environ.get("LEAD_SECONDS", "60"))
# How often the scheduler wakes up to check whether it is prediction time.
TICK_SECONDS = int(os.environ.get("TICK_SECONDS", "3"))

# Timezone used for the HH:MM shown in the message (user-facing clock time).
DISPLAY_TZ = os.environ.get("DISPLAY_TZ", "Asia/Tehran").strip()
# Show Persian-Indic digits (۱۲:۰۵) instead of Latin (12:05).
PERSIAN_DIGITS = os.environ.get("PERSIAN_DIGITS", "1").strip().lower() in (
    "1", "true", "yes", "on",
)

# --- Polymarket (BTC Up/Down 5-minute recurring market) config ---
GAMMA_URL = "https://gamma-api.polymarket.com/events"
POLY_SLUG_PREFIX = os.environ.get("POLY_SLUG_PREFIX", "btc-updown-5m").strip()
POLY_LOOKBACK = int(os.environ.get("POLY_LOOKBACK", "60"))  # windows to scan

# Binance market-data hosts, tried in order. data-api.binance.vision is the
# public market-data domain and is the most reliable from cloud/CI IPs (some
# regions geo-block api.binance.com with HTTP 451).
BINANCE_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "BINANCE_HOSTS",
        "https://data-api.binance.vision,"
        "https://api.binance.com,"
        "https://api-gcp.binance.com,"
        "https://api1.binance.com,"
        "https://api2.binance.com",
    ).split(",")
    if h.strip()
]
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("btc-predictor")


# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------
def send_message(chat_id: str, text: str) -> bool:
    """Send a Telegram message. Returns True on success."""
    if not chat_id:
        log.warning("No chat_id set; cannot send message.")
        return False
    try:
        resp = requests.post(
            f"{TELEGRAM_API}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=15,
        )
        if resp.status_code != 200:
            log.error("Telegram sendMessage failed: %s", resp.text)
            return False
        return True
    except requests.RequestException as exc:
        log.error("Telegram send error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Candle fetching (Binance spot candles or Polymarket Up/Down series)
# ---------------------------------------------------------------------------
def fetch_candles():
    """Return closed candles oldest -> newest from the configured SOURCE."""
    if SOURCE == "polymarket":
        return fetch_candles_polymarket()
    return fetch_candles_binance()


def _poly_parse_list(value):
    """Gamma returns some fields as JSON-encoded strings; normalize to list."""
    if value is None:
        return None
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return None
    return None


def _poly_event_direction(events):
    """
    +1 (Up), -1 (Down), or None if the market is missing or not yet resolved.
    Reads the resolved outcome of a Polymarket BTC Up/Down event.
    """
    if not isinstance(events, list) or not events:
        return None
    markets = events[0].get("markets") or []
    if not markets:
        return None
    market = markets[0]
    outcomes = _poly_parse_list(market.get("outcomes"))
    prices = _poly_parse_list(market.get("outcomePrices"))
    if not outcomes or not prices or len(outcomes) != len(prices):
        return None
    try:
        pvals = [float(p) for p in prices]
    except (TypeError, ValueError):
        return None
    top = max(pvals)
    if top < 0.99:  # not resolved yet (still a live probability)
        return None
    winner = str(outcomes[pvals.index(top)]).strip().lower()
    if winner in ("up", "yes"):
        return 1
    if winner in ("down", "no"):
        return -1
    return None


def fetch_candles_polymarket():
    """
    Follow the Polymarket BTC Up/Down 5-minute series.

    Each 5-minute window is its own market with slug
    "<POLY_SLUG_PREFIX>-<window_start_unix>". We scan the last POLY_LOOKBACK
    *ended* windows, read each resolved Up/Down outcome, and turn it into a
    candle (Up => green, Down => red).
    """
    now = time.time()
    last_ended_start = (int(now // GRANULARITY) - 1) * GRANULARITY
    candles = []
    for k in range(POLY_LOOKBACK - 1, -1, -1):
        ts = last_ended_start - k * GRANULARITY
        slug = f"{POLY_SLUG_PREFIX}-{ts}"
        try:
            resp = requests.get(
                GAMMA_URL,
                params={"slug": slug},
                timeout=15,
                headers={"User-Agent": "btc-candle-predictor/1.0"},
            )
            resp.raise_for_status()
            events = resp.json()
        except requests.RequestException as exc:
            log.warning("Polymarket fetch failed for %s: %s", slug, exc)
            continue
        direction = _poly_event_direction(events)
        if direction is None:
            continue  # window not found or not yet resolved
        c_open, c_close = (0.0, 1.0) if direction > 0 else (1.0, 0.0)
        candles.append(
            {
                "time": ts,
                "open": c_open,
                "close": c_close,
                "low": 0.0,
                "high": 1.0,
                "volume": 1.0,
            }
        )
    candles.sort(key=lambda c: c["time"])  # oldest -> newest
    return candles


def fetch_candles_binance():
    """
    Return a list of closed candles oldest -> newest, from Binance.

    Binance /api/v3/klines returns rows (oldest first) of:
    [openTime(ms), open, high, low, close, volume, closeTime(ms), ...].
    The last row is the still-forming candle; we keep only candles whose
    closeTime has already passed. Several hosts are tried in order so a
    geo-blocked endpoint (HTTP 451) falls back to a working one.
    """
    rows = None
    last_err = None
    for host in BINANCE_HOSTS:
        try:
            resp = requests.get(
                f"{host}/api/v3/klines",
                params={"symbol": PRODUCT, "interval": INTERVAL, "limit": KLINES_LIMIT},
                timeout=15,
                headers={"User-Agent": "btc-candle-predictor/1.0"},
            )
            resp.raise_for_status()
            rows = resp.json()
            break
        except requests.RequestException as exc:
            last_err = exc
            log.warning("Binance host %s failed: %s", host, exc)
            continue
    if rows is None:
        raise last_err if last_err else RuntimeError("All Binance hosts failed")
    if not isinstance(rows, list) or not rows:
        return []

    now = time.time()
    candles = []
    for row in rows:
        open_time = int(row[0]) / 1000.0
        close_time = int(row[6]) / 1000.0
        # Keep only candles whose window has fully closed.
        if close_time <= now:
            candles.append(
                {
                    "time": int(open_time),
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "volume": float(row[5]),
                }
            )
    candles.sort(key=lambda c: c["time"])  # oldest -> newest
    return candles


def candle_direction(candle) -> int:
    """+1 green (bullish), -1 red (bearish), 0 doji (flat)."""
    if candle["close"] > candle["open"]:
        return 1
    if candle["close"] < candle["open"]:
        return -1
    return 0


def dir_label(d: int) -> str:
    return {1: "🟢 سبز", -1: "🔴 قرمز", 0: "⚪️ خنثی"}[d]


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
_PERSIAN_MAP = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def _to_persian(text: str) -> str:
    return text.translate(_PERSIAN_MAP) if PERSIAN_DIGITS else text


def format_candle_time(open_unix: int) -> str:
    """HH:MM of a candle's open time in the configured display timezone."""
    tz = None
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo(DISPLAY_TZ)
        except Exception:
            tz = None
    dt = datetime.fromtimestamp(open_unix, tz=tz or timezone.utc)
    return _to_persian(dt.strftime("%H:%M"))


# ---------------------------------------------------------------------------
# Shared state between the scheduler and the Telegram command listener
# ---------------------------------------------------------------------------
class State:
    def __init__(self, chat_id: str):
        self.chat_id = chat_id
        self.active = False
        self.last_predicted_open = 0
        self.last_result = None
        self.last_prediction_label = None  # e.g. "۱۲:۰۵🟢"
        self.lock = threading.Lock()


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------
def make_prediction(target_open: int):
    """Fetch candles, run the predictor, and return (label, result)."""
    candles = fetch_candles()
    if not candles:
        raise RuntimeError("no candles returned from data source")
    result = predict(candles)
    emoji = "🟢" if result["direction"] > 0 else "🔴"
    label = f"{format_candle_time(target_open)}{emoji}"
    return label, result


def predict_and_send(state: State, target_open: int):
    """Run a prediction for the candle opening at target_open and notify."""
    try:
        label, result = make_prediction(target_open)
    except Exception as exc:
        log.error("Prediction failed: %s", exc)
        return False
    with state.lock:
        state.last_result = result
        state.last_prediction_label = label
    log.info(
        "Prediction for candle %s -> %s (conf=%.2f score=%+.3f)",
        datetime.fromtimestamp(target_open, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        ),
        label,
        result.get("confidence", 0.0),
        result.get("score", 0.0),
    )
    return send_message(state.chat_id, label)


# ---------------------------------------------------------------------------
# Scheduler loop — predicts LEAD_SECONDS before each 5-minute candle opens
# ---------------------------------------------------------------------------
def run_scheduler(state: State):
    log.info(
        "Scheduler ready | interval=%ds | lead=%ds before each candle open.",
        GRANULARITY,
        LEAD_SECONDS,
    )
    while True:
        if not state.active:
            time.sleep(TICK_SECONDS)
            continue

        now = time.time()
        # The next candle that has not opened yet.
        target_open = (int(now // GRANULARITY) + 1) * GRANULARITY
        fire_at = target_open - LEAD_SECONDS

        # Fire once we are inside the lead window and have not already
        # predicted this particular candle.
        with state.lock:
            already = state.last_predicted_open == target_open
        if not already and now >= fire_at:
            with state.lock:
                state.last_predicted_open = target_open
            predict_and_send(state, target_open)

        time.sleep(TICK_SECONDS)


# ---------------------------------------------------------------------------
# Telegram command listener (auto-captures chat_id, /start, /stop, /status)
# ---------------------------------------------------------------------------
START_TEXT = (
    "✅ ربات پیش‌بینی رنگ کندل فعال شد.\n"
    "حدود <b>۱ دقیقه قبل</b> از باز شدن هر کندل <b>۵ دقیقه‌ای</b> بیت‌کوین، "
    "حدس می‌زنم کندل بعدی سبز 🟢 یا قرمز 🔴 بسته می‌شود و فقط ساعت + رنگ را "
    "برایت می‌فرستم. مثال: <code>۱۲:۰۵🟢</code>\n\n"
    "برای توقف: /stop\n"
    "وضعیت و جزئیات تحلیل: /status\n"
    "پیش‌بینی فوری کندل بعدی: /predict\n\n"
    "⚠️ توجه: رنگ کندل بعدی عملاً نزدیک به شیر یا خط است؛ این فقط بهترین "
    "حدس مبتنی بر تحلیل تکنیکال است، نه تضمین سود."
)


def command_listener(state: State):
    """Long-poll getUpdates for /start, /stop, /status, /predict."""
    offset = None
    while True:
        try:
            resp = requests.get(
                f"{TELEGRAM_API}/getUpdates",
                params={"timeout": 50, "offset": offset},
                timeout=60,
            )
            data = resp.json()
            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message") or update.get("channel_post")
                if not msg:
                    continue
                chat_id = str(msg["chat"]["id"])
                text = (msg.get("text") or "").strip().lower()

                if not state.chat_id:
                    state.chat_id = chat_id
                    log.info("Captured chat_id: %s", chat_id)

                if text.startswith("/start"):
                    state.chat_id = chat_id
                    with state.lock:
                        state.active = True
                        state.last_predicted_open = 0  # allow immediate fire
                    send_message(chat_id, START_TEXT)
                    log.info("Activated by /start (chat_id=%s).", chat_id)

                elif text.startswith("/stop"):
                    with state.lock:
                        state.active = False
                    send_message(
                        chat_id,
                        "⏹ متوقف شد. دیگر پیش‌بینی نمی‌فرستم.\n"
                        "برای شروع دوباره: /start",
                    )
                    log.info("Stopped by /stop (chat_id=%s).", chat_id)

                elif text.startswith("/status"):
                    with state.lock:
                        running = state.active
                        last = state.last_prediction_label
                        result = state.last_result
                    state_line = "🟢 فعال" if running else "🔴 متوقف"
                    parts = [f"📊 وضعیت ربات: {state_line}"]
                    if last:
                        parts.append(f"آخرین پیش‌بینی: <b>{last}</b>")
                    if result:
                        parts.append("\nجزئیات تحلیل آخر:\n<code>" + explain(result) + "</code>")
                    send_message(chat_id, "\n".join(parts))

                elif text.startswith("/predict"):
                    now = time.time()
                    target_open = (int(now // GRANULARITY) + 1) * GRANULARITY
                    send_message(chat_id, "⏳ در حال تحلیل کندل بعدی...")
                    ok = predict_and_send(state, target_open)
                    if not ok:
                        send_message(chat_id, "⚠️ دریافت داده یا ارسال ناموفق بود.")
        except requests.RequestException as exc:
            log.error("getUpdates error: %s", exc)
            time.sleep(5)
        except Exception as exc:
            log.error("Listener error: %s", exc)
            time.sleep(5)


def main():
    if not TELEGRAM_TOKEN:
        raise SystemExit(
            "TELEGRAM_TOKEN is not set. Create a bot via @BotFather and set it "
            "in your environment or .env file."
        )

    state = State(TELEGRAM_CHAT_ID)

    listener = threading.Thread(
        target=command_listener, args=(state,), daemon=True
    )
    listener.start()

    log.info(
        "Starting BTC next-candle color predictor | product=%s interval=%s "
        "lead=%ds tz=%s",
        PRODUCT,
        INTERVAL,
        LEAD_SECONDS,
        DISPLAY_TZ,
    )
    run_scheduler(state)


if __name__ == "__main__":
    main()
