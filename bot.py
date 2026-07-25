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

# --- Breakout-fade alerts (docs/research/btc-5m-patterns.md, "RULE 1") --------
# When a 5-minute CLOSE breaks beyond the highest/lowest close of the previous
# BREAKOUT_LOOKBACK candles while volatility is expanding, bet that the NEXT
# window closes the other way. Measured out-of-sample on 162k real 5m candles
# with a chronological holdout:
#     close-only levels, close-to-close target, vol filter -> 56.0%  (z=+8.5)
#     close-only levels, no vol filter                     -> 54.2%  (z=+8.5)
# The close-only form is used because it needs nothing but a series of closing
# prices, which is all any Polymarket-compatible feed can give us.
#
# STRATEGY selects which alerts run: "alternation" (legacy), "breakout", or
# "both" (default). Set STRATEGY=alternation to restore the old behaviour.
STRATEGY = os.environ.get("STRATEGY", "both").strip().lower()
BREAKOUT_LOOKBACK = int(os.environ.get("BREAKOUT_LOOKBACK", "20"))
BREAKOUT_VOL_FILTER = os.environ.get("BREAKOUT_VOL_FILTER", "1").strip() not in ("0", "false", "no")
BREAKOUT_VOL_TH = float(os.environ.get("BREAKOUT_VOL_TH", "0.8884"))
# Candles of history the rule needs: 100 for the slow volatility window, plus
# the lookback, plus slack.
BREAKOUT_HISTORY = 100 + BREAKOUT_LOOKBACK + 10
# Minimum seconds between breakout alerts (0 = alert on every signal, which is
# what the research measures — consecutive signals are genuinely separate bets).
BREAKOUT_COOLDOWN = int(os.environ.get("BREAKOUT_COOLDOWN", "0"))
# Price feed for the breakout rule:
#   "chainlink" - Chainlink BTC/USD via a public Polygon RPC (what Polymarket
#                 settles on; matches the market exactly)
#   "binance"   - spot closes; a DIFFERENT feed, so levels drift from settlement
BREAKOUT_FEED = os.environ.get("BREAKOUT_FEED", "chainlink").strip().lower()
POLYGON_RPC = os.environ.get("POLYGON_RPC", "https://polygon-rpc.com").strip()
# Chainlink BTC/USD aggregator proxy on Polygon PoS.
CHAINLINK_BTC_USD = os.environ.get(
    "CHAINLINK_BTC_USD", "0xc907E116054Ad103354f2D350FD2514433D57F6f").strip()

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


def _parse_str_map(s):
    out = {}
    for part in (s or "").split(","):
        if ":" in part:
            k, v = part.split(":", 1)
            k, v = k.strip(), v.strip()
            if k:
                out[k] = v
    return out


# Human labels for each monitor key (shown on the menu buttons). THRESHOLD_LABELS
# lets the workflow name each monitor (e.g. distinguish coins that share a
# timeframe); it overrides these built-in fallbacks.
INTERVAL_LABELS = {
    "1m": "۱ دقیقه‌ای",
    "5m": "۵ دقیقه‌ای",
    "15m": "۱۵ دقیقه‌ای",
    "1h": "۱ ساعته",
}
THRESHOLD_LABELS = _parse_str_map(os.environ.get("THRESHOLD_LABELS", ""))

# The key identifying THIS monitor for the threshold store and the menu. It is
# decoupled from INTERVAL (the Binance kline interval) so two monitors can share
# a timeframe (e.g. BTC 5m and SOL 5m) without colliding on one threshold.
MONITOR_KEY = os.environ.get("MONITOR_KEY", "").strip() or INTERVAL


def interval_label(iv):
    return THRESHOLD_LABELS.get(iv) or INTERVAL_LABELS.get(iv, iv)


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
    if monitor is not None and monitor.key == iv:
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
        if monitor is not None and monitor.key == iv:
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
# Persistent Telegram menu (a reply keyboard that stays under the text box)
# ---------------------------------------------------------------------------
MENU_STATUS = "📊 وضعیت"
MENU_REFRESH = "🔄 منو"


def _menu_keyboard():
    """Always-visible quick keyboard: one آستانه button per timeframe + status."""
    rows = [[f"🎚 آستانه {interval_label(iv)}"] for iv in THRESHOLD_INTERVALS]
    rows.append([MENU_STATUS, MENU_REFRESH])
    return {
        "keyboard": [[{"text": t} for t in row] for row in rows],
        "resize_keyboard": True,
        "is_persistent": True,
    }


def send_menu(chat_id, text):
    return _tg("sendMessage", {
        "chat_id": chat_id, "text": text, "parse_mode": "HTML",
        "reply_markup": _menu_keyboard(),
    })


def set_bot_commands():
    """Register slash commands so they show in Telegram's "/" and Menu button."""
    _tg("setMyCommands", {"commands": [
        {"command": "threshold", "description": "تغییر آستانهٔ هشدار (۲ تا ۷ تناوب)"},
        {"command": "status", "description": "وضعیت و آستانهٔ فعلی"},
        {"command": "menu", "description": "نمایش منوی سریع"},
        {"command": "start", "description": "شروع / راهنما"},
    ]})


def start_text():
    return (
        "✅ ربات فعال شد.\n"
        "کندل‌های بیت‌کوین را ۲۴ ساعته بررسی می‌کنم و هنگام تناوبِ جهتِ کندل‌ها "
        "به شما خبر می‌دهم.\n\n"
        f"آستانهٔ فعلی — {_threshold_summary()}\n\n"
        "🎚 برای تغییرِ سریعِ آستانه از دکمه‌های پایین استفاده کن "
        "(یا دستورِ /threshold)."
    )


def interval_from_menu_text(text):
    """Match a '🎚 آستانه <label>' menu button back to its interval key.

    Uses exact equality (not substring) because one label can contain another —
    e.g. '۵ دقیقه‌ای' is a substring of '۱۵ دقیقه‌ای'.
    """
    for i in THRESHOLD_INTERVALS:
        if text == f"🎚 آستانه {interval_label(i)}":
            return i
    return None


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
# Breakout-fade strategy (RULE 1 of docs/research/btc-5m-patterns.md)
# ---------------------------------------------------------------------------
# Price feed. Polymarket's BTC Up/Down markets settle on Chainlink BTC/USD, so
# the levels must come from that same feed — Binance is a different feed and its
# levels drift from settlement. Chainlink is read with a single eth_call
# (latestRoundData(), selector 0xfeaf968c) against a public Polygon RPC, which
# needs no API key and no web3 dependency.
CHAINLINK_DECIMALS = 8
_LATEST_ROUND_DATA = "0xfeaf968c"


def fetch_chainlink_btc():
    """Return (price_usd, updated_at_unix) from Chainlink BTC/USD on Polygon."""
    payload = {
        "jsonrpc": "2.0", "id": 1, "method": "eth_call",
        "params": [{"to": CHAINLINK_BTC_USD, "data": _LATEST_ROUND_DATA}, "latest"],
    }
    resp = requests.post(POLYGON_RPC, json=payload, timeout=15,
                         headers={"User-Agent": "btc-candle-alert-bot/1.0"})
    resp.raise_for_status()
    body = resp.json()
    if "error" in body:
        raise RuntimeError(f"RPC error: {body['error']}")
    raw = body.get("result", "")
    if not raw.startswith("0x") or len(raw) < 2 + 64 * 5:
        raise RuntimeError(f"unexpected latestRoundData result: {raw[:80]}")
    words = [raw[2 + 64 * i: 2 + 64 * (i + 1)] for i in range(5)]
    answer = int(words[1], 16)
    if answer >= 1 << 255:  # int256 two's complement
        answer -= 1 << 256
    updated_at = int(words[3], 16)
    return answer / (10 ** CHAINLINK_DECIMALS), updated_at


def fetch_binance_btc():
    """Fallback feed: last traded price from Binance spot."""
    last_err = None
    for host in BINANCE_HOSTS:
        try:
            r = requests.get(f"{host}/api/v3/ticker/price",
                             params={"symbol": "BTCUSDT"}, timeout=15,
                             headers={"User-Agent": "btc-candle-alert-bot/1.0"})
            r.raise_for_status()
            return float(r.json()["price"]), int(time.time())
        except Exception as exc:  # noqa: BLE001 - try the next host
            last_err = exc
    raise last_err if last_err else RuntimeError("all Binance hosts failed")


def fetch_spot_price():
    if BREAKOUT_FEED == "binance":
        return fetch_binance_btc()
    return fetch_chainlink_btc()


def _stdev(values):
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return (sum((v - mean) ** 2 for v in values) / (n - 1)) ** 0.5


def breakout_signal(closes, lookback=None, vol_filter=None, vol_th=None):
    """
    Evaluate RULE 1 on a series of 5-minute closing prices (oldest -> newest).

    Returns None when no signal, otherwise a dict describing the bet:
      bet    "up" | "down"   — the direction to back for the NEXT window
      level  the 20-close high/low that was broken
      ratio  vol20/vol100 (None when the filter is off or history is short)

    The last element of `closes` must be the just-closed window. Levels use the
    `lookback` closes BEFORE it — including the current close would make a break
    arithmetically impossible.
    """
    lookback = BREAKOUT_LOOKBACK if lookback is None else lookback
    vol_filter = BREAKOUT_VOL_FILTER if vol_filter is None else vol_filter
    vol_th = BREAKOUT_VOL_TH if vol_th is None else vol_th

    if len(closes) < lookback + 2:
        return None
    cur = closes[-1]
    window = closes[-(lookback + 1):-1]
    hi, lo = max(window), min(window)
    if cur > hi:
        bet, level, kind = "down", hi, "up"
    elif cur < lo:
        bet, level, kind = "up", lo, "down"
    else:
        return None

    ratio = None
    if vol_filter:
        # Needs 101 closes for 100 returns; skip the filter until history fills.
        if len(closes) >= 101:
            tail = closes[-101:]  # only the slow window matters — keep this O(1)
            rets = [(tail[i] - tail[i - 1]) / tail[i - 1]
                    for i in range(1, len(tail)) if tail[i - 1]]
            slow = _stdev(rets)
            if slow <= 0:
                return None
            ratio = _stdev(rets[-20:]) / slow
            if ratio < vol_th:
                return None
    return {"bet": bet, "level": level, "kind": kind, "close": cur, "ratio": ratio}


# ---------------------------------------------------------------------------
# Monitoring loop
# ---------------------------------------------------------------------------
class Monitor:
    def __init__(self, chat_id: str):
        self.chat_id = chat_id
        self.last_candle_time = 0
        self.directions = []  # directions of recent candles (oldest->newest)
        self.key = MONITOR_KEY  # store/menu identity (may differ from INTERVAL)
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
            v = threshold_store.get(self.key)
        except Exception as exc:  # never let the store break the monitor
            log.warning("threshold refresh failed: %s", exc)
            return
        if v is not None and THRESHOLD_MIN <= v <= THRESHOLD_MAX and v != self.flip_threshold:
            log.info("Threshold(%s): %d -> %d تناوب (from store).",
                     self.key, self.flip_threshold, v)
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


class BreakoutMonitor:
    """
    Sample the settlement feed once per 5-minute boundary, keep a rolling series
    of closes, and alert when RULE 1 fires.

    The close of window [T, T+300) is the feed's price at T+300, so the sample
    taken just after a boundary IS that window's close — and the bet it implies
    is on the window that has only just opened, which is exactly the market the
    user can still buy into.
    """

    STATE_FILE = os.environ.get("BREAKOUT_STATE", "breakout_closes.json")

    def __init__(self, chat_id: str):
        self.chat_id = chat_id
        self.closes = []          # 5-minute closing prices, oldest -> newest
        self.last_window = 0      # start of the most recent window we closed
        self.last_alert = 0.0
        self.seeded_from = None   # feed used to backfill history, if any
        self._load()

    # -- persistence: survive a Termux restart without losing 11h of history --
    def _load(self):
        try:
            with open(self.STATE_FILE) as f:
                s = json.load(f)
            self.closes = [float(x) for x in s.get("closes", [])][-BREAKOUT_HISTORY:]
            self.last_window = int(s.get("last_window", 0))
            if self.closes:
                log.info("Breakout: restored %d closes from %s",
                         len(self.closes), self.STATE_FILE)
        except FileNotFoundError:
            pass
        except Exception as exc:  # noqa: BLE001 - corrupt state must not be fatal
            log.warning("Breakout: could not read %s: %s", self.STATE_FILE, exc)

    def _save(self):
        try:
            with open(self.STATE_FILE, "w") as f:
                json.dump({"closes": self.closes[-BREAKOUT_HISTORY:],
                           "last_window": self.last_window}, f)
        except Exception as exc:  # noqa: BLE001 - disk issues must not be fatal
            log.warning("Breakout: could not write %s: %s", self.STATE_FILE, exc)

    def _seed(self):
        """
        Backfill history so the rule is usable immediately.

        The Chainlink feed cannot be queried for 5-minute history without
        walking hundreds of on-chain rounds, so Binance 5m closes are used to
        prime the series. They are a *different* feed, but only the SHAPE of the
        recent series matters (rolling extremes and a volatility ratio), and the
        seeded values age out of the window within ~11 hours of live sampling.
        """
        if len(self.closes) >= BREAKOUT_LOOKBACK + 2:
            return
        try:
            rows = None
            for host in BINANCE_HOSTS:
                try:
                    r = requests.get(f"{host}/api/v3/klines",
                                     params={"symbol": "BTCUSDT", "interval": "5m",
                                             "limit": BREAKOUT_HISTORY},
                                     timeout=20,
                                     headers={"User-Agent": "btc-candle-alert-bot/1.0"})
                    r.raise_for_status()
                    rows = r.json()
                    break
                except requests.RequestException as exc:
                    log.warning("Breakout seed: %s failed: %s", host, exc)
            if not rows:
                return
            now = time.time()
            closed = [row for row in rows if int(row[6]) / 1000.0 <= now]
            self.closes = [float(row[4]) for row in closed][-BREAKOUT_HISTORY:]
            if closed:
                self.last_window = int(closed[-1][0]) // 1000 // GRANULARITY * GRANULARITY
            self.seeded_from = "binance"
            log.info("Breakout: seeded %d closes from Binance (levels refine as "
                     "live %s samples replace them).", len(self.closes), BREAKOUT_FEED)
            self._save()
        except Exception as exc:  # noqa: BLE001 - seeding is best-effort
            log.warning("Breakout: seeding failed: %s", exc)

    def _alert(self, sig, window_start):
        if BREAKOUT_COOLDOWN and time.time() - self.last_alert < BREAKOUT_COOLDOWN:
            log.info("Breakout: signal suppressed by cooldown.")
            return
        self.last_alert = time.time()
        bet_fa = "🟢 بالا (Up)" if sig["bet"] == "up" else "🔴 پایین (Down)"
        broke = "بالاتر از سقف" if sig["kind"] == "up" else "پایین‌تر از کف"
        opens = datetime.fromtimestamp(window_start, tz=timezone.utc)
        ends = datetime.fromtimestamp(window_start + GRANULARITY, tz=timezone.utc)
        ratio = (f"{sig['ratio']:.2f}" if sig["ratio"] is not None
                 else "—  (هنوز تاریخچهٔ کافی نیست؛ فیلترِ نوسان غیرفعال)")
        seed_note = ("\n⚠️ بخشی از تاریخچه از Binance پر شده — تا چند ساعت آینده "
                     "با دادهٔ زندهٔ فید جایگزین می‌شود."
                     if self.seeded_from and len(self.closes) < BREAKOUT_HISTORY else "")
        text = (
            "🎯 <b>سیگنالِ شکست — روی کندلِ بعدی شرط ببند</b>\n\n"
            f"جهتِ پیشنهادی: <b>{bet_fa}</b>\n\n"
            f"قیمت <b>${sig['close']:,.2f}</b> بست، یعنی {broke} "
            f"{BREAKOUT_LOOKBACK} کندلِ اخیر (<b>${sig['level']:,.2f}</b>).\n"
            f"نسبتِ نوسان: {ratio}\n"
            f"فید: <b>{BREAKOUT_FEED}</b>\n\n"
            f"پنجرهٔ شرط: {opens:%H:%M} تا {ends:%H:%M} UTC\n\n"
            "دقتِ تاریخی این قانون <b>۵۶٪</b> است (نه بیشتر). "
            "اگر پلی‌مارکت این سمت را بالای <b>۵۵ سنت</b> می‌فروشد، وارد نشو."
        )
        log.info("Breakout ALERT: bet=%s close=%.2f level=%.2f",
                 sig["bet"], sig["close"], sig["level"])
        send_message(self.chat_id, text)

    def _on_window_close(self, window_start, price):
        self.closes.append(price)
        if len(self.closes) > BREAKOUT_HISTORY:
            self.closes = self.closes[-BREAKOUT_HISTORY:]
        self.last_window = window_start
        self._save()
        sig = breakout_signal(self.closes)
        log.info("Breakout: window %s closed at %.2f (%d closes) -> %s",
                 datetime.fromtimestamp(window_start, tz=timezone.utc).strftime("%H:%M"),
                 price, len(self.closes), sig["bet"] if sig else "no signal")
        if sig:
            self._alert(sig, window_start + GRANULARITY)

    def run(self, max_runtime=None):
        started = time.time()
        self._seed()
        backoff = POLL_SECONDS
        while True:
            if max_runtime is not None and time.time() - started >= max_runtime:
                log.info("Breakout: max runtime reached; exiting.")
                return
            try:
                now = time.time()
                # The window that has most recently ENDED.
                ended = (int(now) // GRANULARITY - 1) * GRANULARITY
                if ended > self.last_window:
                    price, updated = fetch_spot_price()
                    # A stale oracle answer would misprice the close; skip it and
                    # retry on the next poll rather than record a bad candle.
                    if updated and now - updated > 2 * GRANULARITY:
                        log.warning("Breakout: %s price is %ds stale; skipping.",
                                    BREAKOUT_FEED, int(now - updated))
                    else:
                        self._on_window_close(ended, price)
                backoff = POLL_SECONDS
            except Exception as exc:  # noqa: BLE001 - keep the 24/7 loop alive
                log.error("Breakout poll error: %s", exc)
                backoff = min(backoff * 2, 300)
            time.sleep(backoff)


# ---------------------------------------------------------------------------
# Telegram command listener (auto-captures chat_id, /start, /status)
# ---------------------------------------------------------------------------
def command_listener(monitor: Monitor):
    """Long-poll getUpdates so users can /start the bot and grab chat_id."""
    # Register the slash-command list (shows in Telegram's "/" and Menu button)
    # and attach the always-visible quick keyboard so the threshold is one tap
    # away without typing.
    try:
        set_bot_commands()
        if monitor.chat_id:
            send_menu(
                monitor.chat_id,
                "🎚 منوی سریع آماده شد — برای عوض‌کردنِ آستانه، دکمهٔ آستانهٔ "
                "تایم‌فریمِ دلخواه را از پایین بزن.",
            )
    except Exception as exc:
        log.warning("menu/setup init failed: %s", exc)
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
                    send_menu(chat_id, start_text())
                elif text.startswith("/menu") or text == MENU_REFRESH:
                    send_menu(chat_id, "منوی سریع آماده است — از دکمه‌های پایین استفاده کن.")
                elif text.startswith("🎚 آستانه"):
                    # Quick-menu tap: jump straight to that timeframe's numbers.
                    iv = interval_from_menu_text(text)
                    if iv:
                        send_keyboard(
                            chat_id,
                            f"🎚 آستانهٔ {interval_label(iv)} — تعداد تناوب (۲ تا ۷):",
                            _number_keyboard(iv),
                        )
                    else:
                        prompt, kb = _threshold_prompt()
                        send_keyboard(chat_id, prompt, kb)
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
                elif text.startswith("/status") or text == MENU_STATUS:
                    streak = monitor._alternation_streak()
                    last = (
                        dir_label(monitor.directions[-1])
                        if monitor.directions
                        else "—"
                    )
                    send_message(
                        chat_id,
                        f"📊 وضعیت ({interval_label(monitor.key)}):\n"
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

    if STRATEGY in ("breakout", "both"):
        breakout = BreakoutMonitor(TELEGRAM_CHAT_ID)
        log.info(
            "Breakout-fade alerts ON | feed=%s lookback=%d vol_filter=%s",
            BREAKOUT_FEED, BREAKOUT_LOOKBACK, BREAKOUT_VOL_FILTER,
        )
        threading.Thread(target=breakout.run, daemon=True).start()

    if STRATEGY == "breakout":
        # Only the breakout alerts were requested; park the main thread on it
        # instead of also running the alternation monitor.
        while True:
            time.sleep(3600)

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
