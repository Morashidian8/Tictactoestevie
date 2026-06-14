"""
Bitcoin 5-minute next-candle COLOR PREDICTOR bot (Telegram) — STANDALONE.

This is a SEPARATE bot from bot.py (the alternation-alert bot). It does not
import from or modify bot.py in any way; run whichever one you want.

Acts like a short-term scalper: roughly one minute before each new BTCUSDT
5-minute candle opens, it runs a technical-analysis ensemble (see predictor.py)
and guesses whether that upcoming candle will close GREEN (🟢) or RED (🔴).

Control it from Telegram:
    /start   — begin predicting; one message ~1 minute before every 5m candle
    /stop    — stop predicting
    /status  — show whether it is running + the latest prediction breakdown
    /predict — fire a one-off prediction for the next candle right now

Each prediction message is intentionally minimal — just the candle's open time
and the predicted color, e.g.:  ۱۲:۰۵🟢

Honest note: the next candle's color is close to a coin flip; no analysis can
predict it reliably. This bot makes a disciplined, reproducible best guess.

Data source: Binance public market-data API (no API key required).

Run with its own token (recommended, so it is a different Telegram bot from the
alternation bot):
    PREDICT_TELEGRAM_TOKEN=...  python predict_bot.py
It also falls back to TELEGRAM_TOKEN if PREDICT_TELEGRAM_TOKEN is not set.
"""

import os
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
import state_store

# ---------------------------------------------------------------------------
# Configuration (uses its OWN env vars so it never clashes with bot.py)
# ---------------------------------------------------------------------------
# Prefer a dedicated token so this runs as a different Telegram bot. Falls back
# to TELEGRAM_TOKEN for convenience.
TELEGRAM_TOKEN = (
    os.environ.get("PREDICT_TELEGRAM_TOKEN", "").strip()
    or os.environ.get("TELEGRAM_TOKEN", "").strip()
)
TELEGRAM_CHAT_ID = (
    os.environ.get("PREDICT_TELEGRAM_CHAT_ID", "").strip()
    or os.environ.get("TELEGRAM_CHAT_ID", "").strip()
)

PRODUCT = os.environ.get("PREDICT_PRODUCT", "BTCUSDT").strip()
GRANULARITY = int(os.environ.get("PREDICT_GRANULARITY", "300"))  # 5 minutes
INTERVAL = os.environ.get("PREDICT_INTERVAL", "5m").strip()

# How many candles to pull for the indicators (more = smoother EMA50/MACD).
KLINES_LIMIT = int(os.environ.get("PREDICT_KLINES_LIMIT", "200"))

# How many seconds BEFORE the next candle opens to send the prediction.
LEAD_SECONDS = int(os.environ.get("PREDICT_LEAD_SECONDS", "60"))
# How often the scheduler wakes up to check whether it is prediction time.
TICK_SECONDS = int(os.environ.get("PREDICT_TICK_SECONDS", "3"))

# Start predicting immediately on launch (no /start needed). Useful for cloud
# hosts like GitHub Actions that restart the process periodically.
AUTOSTART = os.environ.get("PREDICT_AUTOSTART", "0").strip().lower() in (
    "1", "true", "yes", "on",
)
# Exit cleanly after this many seconds (0 = never). Lets a GitHub Actions job
# stay under the 6-hour limit; a queued successor then takes over.
MAX_RUNTIME_SECONDS = int(os.environ.get("PREDICT_MAX_RUNTIME_SECONDS", "0"))

# Timezone used for the HH:MM shown in the message (user-facing clock time).
DISPLAY_TZ = os.environ.get("PREDICT_DISPLAY_TZ", "Asia/Tehran").strip()
# Show Persian-Indic digits (۱۲:۰۵) instead of Latin (12:05).
PERSIAN_DIGITS = os.environ.get("PREDICT_PERSIAN_DIGITS", "1").strip().lower() in (
    "1", "true", "yes", "on",
)

# Binance market-data hosts, tried in order. data-api.binance.vision is the
# public market-data domain and is the most reliable from cloud/CI IPs (some
# regions geo-block api.binance.com with HTTP 451/403).
BINANCE_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "PREDICT_BINANCE_HOSTS",
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
log = logging.getLogger("btc-predict-bot")


# ---------------------------------------------------------------------------
# Telegram helper
# ---------------------------------------------------------------------------
def send_message(chat_id: str, text: str) -> bool:
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
# Candle fetching (Binance klines, with volume, oldest -> newest)
# ---------------------------------------------------------------------------
def fetch_candles():
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
        if close_time <= now:  # only fully closed candles
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
    candles = fetch_candles()
    if not candles:
        raise RuntimeError("no candles returned from data source")
    result = predict(candles)
    emoji = "🟢" if result["direction"] > 0 else "🔴"
    label = f"{format_candle_time(target_open)}{emoji}"
    return label, result


def predict_and_send(state: State, target_open: int):
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
        "Scheduler ready | interval=%ds | lead=%ds before each candle open. "
        "(autostart=%s, max_runtime=%ss)",
        GRANULARITY,
        LEAD_SECONDS,
        AUTOSTART,
        MAX_RUNTIME_SECONDS,
    )
    started = time.time()
    while True:
        if MAX_RUNTIME_SECONDS and time.time() - started >= MAX_RUNTIME_SECONDS:
            log.info("Max runtime reached; exiting cleanly for a fresh run.")
            return
        if not state.active:
            time.sleep(TICK_SECONDS)
            continue

        now = time.time()
        target_open = (int(now // GRANULARITY) + 1) * GRANULARITY  # next candle
        fire_at = target_open - LEAD_SECONDS

        with state.lock:
            already = state.last_predicted_open == target_open
        if not already and now >= fire_at:
            with state.lock:
                state.last_predicted_open = target_open
            predict_and_send(state, target_open)

        time.sleep(TICK_SECONDS)


# ---------------------------------------------------------------------------
# Telegram command listener
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
                    state_store.save(state.active, chat_id)

                if text.startswith("/start"):
                    state.chat_id = chat_id
                    with state.lock:
                        state.active = True
                    state_store.save(True, chat_id)  # persist across restarts
                    send_message(chat_id, START_TEXT)
                    log.info("Activated by /start (chat_id=%s).", chat_id)
                    # Instant feedback: predict the upcoming candle right away,
                    # then the scheduler keeps firing ~1 min before each candle.
                    now = time.time()
                    target_open = (int(now // GRANULARITY) + 1) * GRANULARITY
                    with state.lock:
                        state.last_predicted_open = target_open  # avoid a dup
                    if not predict_and_send(state, target_open):
                        send_message(
                            chat_id,
                            "⚠️ فعال شدم، اما دریافت دادهٔ بایننس همین لحظه ناموفق "
                            "بود. سر کندل بعدی دوباره تلاش می‌کنم.",
                        )

                elif text.startswith("/stop"):
                    with state.lock:
                        state.active = False
                    state_store.save(False, state.chat_id)  # persist OFF
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
                        parts.append(
                            "\nجزئیات تحلیل آخر:\n<code>" + explain(result) + "</code>"
                        )
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
            "No token set. Create a bot via @BotFather and set "
            "PREDICT_TELEGRAM_TOKEN (or TELEGRAM_TOKEN) in your environment "
            "or .env file."
        )

    state = State(TELEGRAM_CHAT_ID)
    # Restore the on/off state + chat id persisted by a previous run, so the
    # bot keeps running across cloud restarts and a user's /stop sticks until
    # they send /start again.
    remote = state_store.load()
    if remote is not None:
        state.active = bool(remote.get("active", AUTOSTART))
        if remote.get("chat_id"):
            state.chat_id = str(remote["chat_id"])
        log.info(
            "Loaded persisted state: active=%s, chat_id=%s.",
            state.active,
            "set" if state.chat_id else "none",
        )
    elif AUTOSTART:
        state.active = True
        log.info("No persisted state; AUTOSTART on — active from launch.")

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
