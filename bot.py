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

import threshold_store

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

# --- User-adjustable alternation threshold (from Telegram) ---------------------
# The user-facing unit is "تناوب" (a color flip). A run of `streak` candles has
# `streak - 1` flips, so a flip-threshold of F fires when `streak >= F + 1`.
# Allowed range the user can pick from Telegram: 2..7 flips.
THRESHOLD_MIN = 2
THRESHOLD_MAX = 7


def _parse_int_map(s):
    out = {}
    for part in (s or "").split(","):
        part = part.strip()
        if ":" in part:
            k, v = part.split(":", 1)
            try:
                out[k.strip()] = int(v.strip())
            except ValueError:
                pass
    return out


# Timeframes the /threshold picker offers, and their default flip-thresholds
# (used for display until the store has an override). Flips = candles - 1.
THRESHOLD_INTERVALS = [
    x.strip()
    for x in os.environ.get("THRESHOLD_INTERVALS", "5m,15m").split(",")
    if x.strip()
]
THRESHOLD_DEFAULTS = _parse_int_map(os.environ.get("THRESHOLD_DEFAULTS", "5m:4,15m:3"))
INTERVAL_LABELS = {
    "1m": "۱ دقیقه‌ای",
    "5m": "۵ دقیقه‌ای",
    "15m": "۱۵ دقیقه‌ای",
    "1h": "۱ ساعته",
}


def interval_label(iv):
    return INTERVAL_LABELS.get(iv, iv)


def default_flips(iv):
    """The fallback flip-threshold for an interval when the store has none."""
    return THRESHOLD_DEFAULTS.get(iv, max(1, ALTERNATION_THRESHOLD - 1))


def current_flips(iv):
    """The active flip-threshold for an interval: store override or default."""
    v = threshold_store.get(iv)
    return v if v is not None else default_flips(iv)

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


def _tg(method: str, payload: dict) -> bool:
    """POST a Telegram API method, logging failures. Returns True on 200."""
    try:
        resp = requests.post(f"{TELEGRAM_API}/{method}", json=payload, timeout=15)
        if resp.status_code != 200:
            log.error("Telegram %s failed: %s", method, resp.text[:200])
            return False
        return True
    except requests.RequestException as exc:
        log.error("Telegram %s error: %s", method, exc)
        return False


def send_keyboard(chat_id, text, keyboard):
    return _tg("sendMessage", {
        "chat_id": chat_id, "text": text, "parse_mode": "HTML",
        "reply_markup": {"inline_keyboard": keyboard},
    })


def edit_keyboard(chat_id, message_id, text, keyboard):
    return _tg("editMessageText", {
        "chat_id": chat_id, "message_id": message_id, "text": text,
        "parse_mode": "HTML", "reply_markup": {"inline_keyboard": keyboard},
    })


def answer_callback(cq_id, text=None):
    payload = {"callback_query_id": cq_id}
    if text:
        payload["text"] = text
    return _tg("answerCallbackQuery", payload)


# ---------------------------------------------------------------------------
# /threshold Telegram control (pick 2..7 تناوب per timeframe)
# ---------------------------------------------------------------------------
def _interval_keyboard():
    return [
        [{"text": f"{interval_label(iv)} — فعلی: {current_flips(iv)} تناوب",
          "callback_data": f"thrpick:{iv}"}]
        for iv in THRESHOLD_INTERVALS
    ]


def _number_keyboard(iv):
    cur = current_flips(iv)
    row = [
        {"text": (f"✅ {n}" if n == cur else str(n)), "callback_data": f"thrset:{iv}:{n}"}
        for n in range(THRESHOLD_MIN, THRESHOLD_MAX + 1)
    ]
    rows = [row]
    if len(THRESHOLD_INTERVALS) > 1:
        rows.append([{"text": "◀️ بازگشت", "callback_data": "thrback"}])
    return rows


def _threshold_prompt():
    if len(THRESHOLD_INTERVALS) == 1:
        iv = THRESHOLD_INTERVALS[0]
        return (f"🎚 آستانهٔ هشدارِ {interval_label(iv)} را انتخاب کن "
                f"(تعداد تناوب، ۲ تا ۷):"), _number_keyboard(iv)
    return "🎚 کدام تایم‌فریم؟ آستانهٔ هشدار (تعداد تناوب) را عوض کن:", _interval_keyboard()


def _threshold_summary():
    return " ؛ ".join(
        f"{interval_label(iv)}: {current_flips(iv)} تناوب" for iv in THRESHOLD_INTERVALS
    )


def apply_threshold(chat_id, monitor, iv, n):
    """Validate, persist, confirm, and apply a picked threshold immediately."""
    if iv not in THRESHOLD_INTERVALS:
        send_message(chat_id, f"تایم‌فریمِ نامعتبر: {iv}")
        return
    if not (THRESHOLD_MIN <= n <= THRESHOLD_MAX):
        send_message(chat_id, f"آستانه باید بین {THRESHOLD_MIN} تا {THRESHOLD_MAX} تناوب باشد.")
        return
    ok = threshold_store.set(iv, n)
    if monitor is not None and monitor.interval == iv:
        monitor.flip_threshold = n
    note = "" if ok else "\n⚠️ ذخیرهٔ ماندگار ناموفق بود؛ فقط تا ری‌استارتِ بعدی می‌ماند."
    send_message(
        chat_id,
        f"✅ آستانهٔ هشدارِ <b>{interval_label(iv)}</b> روی <b>{n}</b> تناوب تنظیم شد.\n"
        f"یعنی وقتی <b>{n}</b> بار پشت‌سرهم رنگ عوض شد ({n + 1} کندلِ متوالی) هشدار می‌دهد.{note}",
    )


def handle_callback(monitor, cq):
    """Handle an inline-keyboard tap from the /threshold menu."""
    data = cq.get("data", "")
    cq_id = cq.get("id")
    m = cq.get("message") or {}
    chat = str(m.get("chat", {}).get("id", ""))
    mid = m.get("message_id")
    if data.startswith("thrpick:"):
        iv = data.split(":", 1)[1]
        edit_keyboard(chat, mid,
                      f"🎚 آستانهٔ {interval_label(iv)} — تعداد تناوب (۲ تا ۷):",
                      _number_keyboard(iv))
        answer_callback(cq_id)
    elif data == "thrback":
        edit_keyboard(chat, mid, "🎚 کدام تایم‌فریم؟", _interval_keyboard())
        answer_callback(cq_id)
    elif data.startswith("thrset:"):
        try:
            _, iv, n = data.split(":")
            n = int(n)
        except ValueError:
            answer_callback(cq_id, "خطا")
            return
        if iv not in THRESHOLD_INTERVALS or not (THRESHOLD_MIN <= n <= THRESHOLD_MAX):
            answer_callback(cq_id, "خارج از بازهٔ ۲ تا ۷")
            return
        ok = threshold_store.set(iv, n)
        if monitor is not None and monitor.interval == iv:
            monitor.flip_threshold = n
        answer_callback(cq_id, f"{interval_label(iv)} = {n} تناوب ✅")
        note = "" if ok else "\n⚠️ ذخیرهٔ ماندگار ناموفق بود؛ فقط تا ری‌استارتِ بعدی می‌ماند."
        edit_keyboard(
            chat, mid,
            f"✅ آستانهٔ هشدارِ <b>{interval_label(iv)}</b> روی <b>{n}</b> تناوب تنظیم شد.\n"
            f"یعنی وقتی <b>{n}</b> بار پشت‌سرهم رنگ عوض شد ({n + 1} کندلِ متوالی) هشدار می‌دهد.{note}",
            [],
        )
    else:
        answer_callback(cq_id)


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


def candle_direction(candle, prev_close=None) -> int:
    """
    +1 green (bullish), -1 red (bearish).

    close > open -> green, close < open -> red. For a doji (close == open) we
    match how Binance/TradingView colour it: green if its close is >= the
    PREVIOUS candle's close, otherwise red (falls back to green when there is
    no previous candle to compare with).
    """
    o, c = candle["open"], candle["close"]
    if c > o:
        return 1
    if c < o:
        return -1
    if prev_close is None:
        return 1
    return 1 if c >= prev_close else -1


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
        self.interval = INTERVAL
        # Threshold in تناوب (flips). Env ALTERNATION_THRESHOLD is in candles, so
        # the equivalent flip count is candles - 1. A Telegram override replaces
        # this at runtime (and is loaded from the store on startup / refresh).
        self.flip_threshold = max(1, ALTERNATION_THRESHOLD - 1)
        self._last_thr_refresh = 0.0
        self.refresh_threshold(0.0, force=True)

    def refresh_threshold(self, now, force=False):
        """Pull the latest Telegram-set threshold from the store (throttled)."""
        if not force and now - self._last_thr_refresh < 60:
            return
        self._last_thr_refresh = now
        try:
            v = threshold_store.get(self.interval)
        except Exception as exc:  # never let the store break the monitor
            log.warning("threshold refresh failed: %s", exc)
            return
        if v is not None and THRESHOLD_MIN <= v <= THRESHOLD_MAX and v != self.flip_threshold:
            log.info("Threshold(%s): %d -> %d تناوب (from store).",
                     self.interval, self.flip_threshold, v)
            self.flip_threshold = v

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
        # Threshold is in تناوب (flips) = streak - 1, adjustable from Telegram.
        flips = streak - 1
        if flips >= self.flip_threshold:
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
                self.refresh_threshold(time.time())
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

                # Inline-keyboard taps from the /threshold menu.
                cq = update.get("callback_query")
                if cq:
                    if not monitor.chat_id:
                        monitor.chat_id = str(
                            (cq.get("message") or {}).get("chat", {}).get("id", "")
                        )
                    handle_callback(monitor, cq)
                    continue

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
                        "کندل‌های بیت‌کوین را ۲۴ ساعته بررسی می‌کنم و هنگام تناوبِ "
                        "جهتِ کندل‌ها به شما خبر می‌دهم.\n\n"
                        f"آستانهٔ فعلی — {_threshold_summary()}\n"
                        "برای تغییرِ آستانه (۲ تا ۷ تناوب): /threshold",
                    )
                elif text.startswith("/threshold") or text.startswith("/astane"):
                    parts = text.split()
                    # Shortcuts: "/threshold 5m 3" or (single-tf) "/threshold 3".
                    if (len(parts) == 3 and parts[2].lstrip("-").isdigit()):
                        apply_threshold(chat_id, monitor, parts[1], int(parts[2]))
                    elif (len(parts) == 2 and parts[1].isdigit()
                          and len(THRESHOLD_INTERVALS) == 1):
                        apply_threshold(chat_id, monitor,
                                        THRESHOLD_INTERVALS[0], int(parts[1]))
                    else:
                        prompt, kb = _threshold_prompt()
                        send_keyboard(chat_id, prompt, kb)
                elif text.startswith("/status"):
                    streak = monitor._alternation_streak()
                    last = (
                        dir_label(monitor.directions[-1])
                        if monitor.directions
                        else "—"
                    )
                    send_message(
                        chat_id,
                        f"📊 وضعیت ({interval_label(monitor.interval)}):\n"
                        f"آخرین کندل: {last}\n"
                        f"طول تناوب فعلی: {max(0, streak - 1)}\n"
                        f"آستانهٔ این مانیتور: {monitor.flip_threshold} تناوب\n\n"
                        f"همهٔ آستانه‌ها — {_threshold_summary()}\n"
                        "تغییر: /threshold",
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
