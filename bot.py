"""
Bitcoin 5-minute candle alternation alert bot (Telegram).

Watches BTC-USD 5-minute candles from Coinbase 24/7. When candle direction
(green = bullish / red = bearish) alternates for several candles in a row,
it sends a Telegram alert on the candle that completes the streak.

Data source: Coinbase Exchange public API (no API key required).
"""

import os
import time
import threading
import logging
from datetime import datetime, timezone

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

PRODUCT = os.environ.get("PRODUCT", "BTC-USD").strip()
GRANULARITY = int(os.environ.get("GRANULARITY", "300"))  # 5 minutes
# Number of alternating candles required to fire the alert.
# Default 6 => "more than 5 candles alternated, alert on the 6th".
ALTERNATION_THRESHOLD = int(os.environ.get("ALTERNATION_THRESHOLD", "6"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "20"))

COINBASE_URL = f"https://api.exchange.coinbase.com/products/{PRODUCT}/candles"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("btc-bot")


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
# Coinbase candle fetching
# ---------------------------------------------------------------------------
def fetch_candles():
    """
    Return a list of closed candles oldest -> newest.

    Coinbase returns rows of [time, low, high, open, close, volume],
    newest first. We drop the most recent row because it is the
    still-forming (not yet closed) candle.
    """
    resp = requests.get(
        COINBASE_URL,
        params={"granularity": GRANULARITY},
        timeout=15,
        headers={"User-Agent": "btc-candle-alert-bot/1.0"},
    )
    resp.raise_for_status()
    rows = resp.json()  # newest first
    if not isinstance(rows, list) or not rows:
        return []

    now = time.time()
    candles = []
    for t, low, high, c_open, c_close, vol in rows:
        # Keep only candles whose window has fully elapsed.
        if t + GRANULARITY <= now:
            candles.append(
                {
                    "time": int(t),
                    "open": float(c_open),
                    "close": float(c_close),
                    "low": float(low),
                    "high": float(high),
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
# Monitoring loop
# ---------------------------------------------------------------------------
class Monitor:
    def __init__(self, chat_id: str):
        self.chat_id = chat_id
        self.last_candle_time = 0
        self.directions = []  # directions of recent candles (oldest->newest)
        self.alerted_for_streak = False

    def _alternation_streak(self) -> int:
        """Length of the trailing run of strictly alternating directions."""
        d = self.directions
        if not d:
            return 0
        streak = 1
        for i in range(len(d) - 1, 0, -1):
            cur, prev = d[i], d[i - 1]
            # Alternation requires non-flat candles in opposite directions.
            if cur != 0 and prev != 0 and cur == -prev:
                streak += 1
            else:
                break
        return streak

    def process_new_candle(self, candle):
        direction = candle_direction(candle)
        self.directions.append(direction)
        # Keep memory bounded.
        if len(self.directions) > 50:
            self.directions = self.directions[-50:]

        streak = self._alternation_streak()
        log.info(
            "New candle %s | %s | O=%.2f C=%.2f | alternation streak=%d",
            datetime.fromtimestamp(candle["time"], tz=timezone.utc).strftime(
                "%Y-%m-%d %H:%M UTC"
            ),
            dir_label(direction),
            candle["open"],
            candle["close"],
            streak,
        )

        if streak >= ALTERNATION_THRESHOLD:
            if not self.alerted_for_streak:
                self._send_alert(candle, streak)
                self.alerted_for_streak = True
        else:
            # Streak broken; allow alerting again next time.
            self.alerted_for_streak = False

    def _send_alert(self, candle, streak: int):
        when = datetime.fromtimestamp(candle["time"], tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        pattern = " ".join(
            {1: "🟢", -1: "🔴", 0: "⚪️"}[d] for d in self.directions[-streak:]
        )
        text = (
            "🚨 <b>هشدار تناوب کندل بیت‌کوین</b> 🚨\n\n"
            f"تعداد <b>{streak}</b> کندل ۵ دقیقه‌ای پشت سر هم جهت‌شان "
            "متناوب (سبز/قرمز) شده است.\n\n"
            f"الگو: {pattern}\n"
            f"نماد: <b>{PRODUCT}</b> (Coinbase)\n"
            f"کندل بسته‌شده: {when}\n"
            f"قیمت بسته‌شدن: <b>${candle['close']:,.2f}</b>"
        )
        log.info("ALERT fired (streak=%d).", streak)
        send_message(self.chat_id, text)

    def run(self, max_runtime=None):
        # Prime history without alerting on past data.
        started = time.time()
        try:
            initial = fetch_candles()
            if initial:
                self.directions = [candle_direction(c) for c in initial[-20:]]
                self.last_candle_time = initial[-1]["time"]
                log.info(
                    "Primed with %d candles. Last close=$%.2f",
                    len(self.directions),
                    initial[-1]["close"],
                )
        except Exception as exc:
            log.error("Initial fetch failed: %s", exc)

        backoff = POLL_SECONDS
        while True:
            if max_runtime is not None and time.time() - started >= max_runtime:
                log.info("Max runtime (%ss) reached; exiting cleanly.", max_runtime)
                return
            try:
                candles = fetch_candles()
                new = [c for c in candles if c["time"] > self.last_candle_time]
                for candle in new:
                    self.last_candle_time = candle["time"]
                    self.process_new_candle(candle)
                backoff = POLL_SECONDS
            except Exception as exc:
                log.error("Poll error: %s", exc)
                backoff = min(backoff * 2, 300)
            time.sleep(backoff)


# ---------------------------------------------------------------------------
# Telegram command listener (auto-captures chat_id, /start, /status)
# ---------------------------------------------------------------------------
def command_listener(monitor: Monitor):
    """Long-poll getUpdates so users can /start the bot and grab chat_id."""
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
                text = (msg.get("text") or "").strip()

                if not monitor.chat_id:
                    monitor.chat_id = chat_id
                    log.info("Captured chat_id: %s", chat_id)

                if text.startswith("/start"):
                    send_message(
                        chat_id,
                        "✅ ربات فعال شد.\n"
                        "کندل‌های ۵ دقیقه‌ای بیت‌کوین (Coinbase) را ۲۴ ساعته "
                        "بررسی می‌کنم و هنگام تناوب جهت کندل‌ها به شما خبر می‌دهم.\n"
                        f"آستانه هشدار: {ALTERNATION_THRESHOLD} کندل متناوب.",
                    )
                elif text.startswith("/status"):
                    streak = monitor._alternation_streak()
                    last = (
                        dir_label(monitor.directions[-1])
                        if monitor.directions
                        else "—"
                    )
                    send_message(
                        chat_id,
                        f"📊 وضعیت:\nآخرین کندل: {last}\n"
                        f"طول تناوب فعلی: {streak}\n"
                        f"آستانه هشدار: {ALTERNATION_THRESHOLD}",
                    )
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

    monitor = Monitor(TELEGRAM_CHAT_ID)

    listener = threading.Thread(
        target=command_listener, args=(monitor,), daemon=True
    )
    listener.start()

    log.info(
        "Starting BTC candle alternation bot | product=%s granularity=%ds "
        "threshold=%d",
        PRODUCT,
        GRANULARITY,
        ALTERNATION_THRESHOLD,
    )
    monitor.run()


if __name__ == "__main__":
    main()
