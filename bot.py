"""
Bitcoin 5-minute candle alternation alert bot (Telegram).

Watches BTCUSDT 5-minute candles from Binance 24/7. When candle direction
(green = bullish / red = bearish) alternates for several candles in a row,
it sends a Telegram alert on the candle that completes the streak.

Data source: Binance public market-data API (no API key required).
"""

import os
import json
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

# Data source: "binance" (spot candles) or "polymarket" (BTC Up/Down 5m series).
SOURCE = os.environ.get("SOURCE", "binance").strip().lower()

PRODUCT = os.environ.get("PRODUCT", "BTCUSDT").strip()
GRANULARITY = int(os.environ.get("GRANULARITY", "300"))  # 5 minutes
INTERVAL = os.environ.get("INTERVAL", "5m").strip()  # Binance kline interval
# Human label for the timeframe, shown in the alert so different monitors
# (e.g. 5m vs 15m) are never confused.
TF_LABEL = os.environ.get("TF_LABEL", "").strip()
# Number of alternating candles required to fire the alert.
ALTERNATION_THRESHOLD = int(os.environ.get("ALTERNATION_THRESHOLD", "5"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "20"))

# --- Polymarket (BTC Up/Down 5-minute recurring market) config ---
# Each 5-minute window is a separate market whose slug ends with the window's
# unix start time, e.g. btc-updown-5m-1781198700. We follow the series by
# building each window's slug and reading its resolved Up/Down outcome.
GAMMA_URL = "https://gamma-api.polymarket.com/events"
POLY_SLUG_PREFIX = os.environ.get("POLY_SLUG_PREFIX", "btc-updown-5m").strip()
POLY_LOOKBACK = int(os.environ.get("POLY_LOOKBACK", "12"))  # windows to scan

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
    candle (Up => green, Down => red) so the alternation logic is unchanged.
    """
    now = time.time()
    # Most recently ENDED window start (a window [ts, ts+300] ends at ts+300).
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
                headers={"User-Agent": "btc-candle-alert-bot/1.0"},
            )
            resp.raise_for_status()
            events = resp.json()
        except requests.RequestException as exc:
            log.warning("Polymarket fetch failed for %s: %s", slug, exc)
            continue
        direction = _poly_event_direction(events)
        if direction is None:
            continue  # window not found or not yet resolved
        # Encode the direction as open/close so candle_direction() works.
        c_open, c_close = (0.0, 1.0) if direction > 0 else (1.0, 0.0)
        candles.append(
            {
                "time": ts,
                "open": c_open,
                "close": c_close,
                "low": 0.0,
                "high": 1.0,
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
                params={"symbol": PRODUCT, "interval": INTERVAL, "limit": 50},
                timeout=15,
                headers={"User-Agent": "btc-candle-alert-bot/1.0"},
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

        # Alert on EVERY new candle while the alternating run meets the
        # threshold, so a sustained back-and-forth keeps notifying instead of
        # firing only once. (process_new_candle runs once per closed candle.)
        if streak >= ALTERNATION_THRESHOLD:
            self._send_alert(candle, streak)

    def _send_alert(self, candle, streak: int):
        when = datetime.fromtimestamp(candle["time"], tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
        pattern = " ".join(
            {1: "🟢", -1: "🔴", 0: "⚪️"}[d] for d in self.directions[-streak:]
        )
        flips = streak - 1  # number of color changes (تناوب)
        minutes = max(1, GRANULARITY // 60)
        tf = TF_LABEL or f"{minutes} دقیقه‌ای"
        if SOURCE == "polymarket":
            source_line = f"منبع: <b>Polymarket — BTC Up/Down</b>\n"
            detail_line = f"آخرین نتیجه: {dir_label(self.directions[-1])}"
        else:
            source_line = f"نماد: <b>{PRODUCT}</b> (Binance)\n"
            detail_line = f"قیمت بسته‌شدن: <b>${candle['close']:,.2f}</b>"
        text = (
            f"🚨 <b>هشدار تناوب — تایم‌فریم {tf}</b> 🚨\n\n"
            f"<b>{flips}</b> بار تناوب (تغییر رنگ) پشت سر هم رخ داده — "
            f"یعنی <b>{streak}</b> کندل <b>{minutes} دقیقه‌ای</b> متوالی "
            "جهت‌شان یک‌درمیان عوض شده (سبز/قرمز).\n\n"
            f"الگو: {pattern}\n"
            f"{source_line}"
            f"کندل بسته‌شده: {when}\n"
            f"{detail_line}"
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
                    "Primed with %d candles from %s. Last pattern: %s",
                    len(self.directions),
                    SOURCE,
                    " ".join(
                        {1: "🟢", -1: "🔴", 0: "⚪️"}[d]
                        for d in self.directions[-10:]
                    ),
                )
            else:
                log.warning(
                    "Primed with 0 candles from %s — no closed/resolved data "
                    "returned yet.",
                    SOURCE,
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
                        "کندل‌های ۵ دقیقه‌ای بیت‌کوین (Binance) را ۲۴ ساعته "
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
