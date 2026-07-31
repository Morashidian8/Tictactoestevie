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
from datetime import datetime, timedelta, timezone

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
# Where a chat id discovered from /start is remembered. Without this the id is
# lost on every restart, and because Telegram only replays *unread* updates the
# bot then stays mute until the user happens to message it again — which is
# exactly when an alert would be missed.
CHAT_ID_FILE = os.environ.get("CHAT_ID_FILE", ".chat_id")


def load_chat_id():
    """Chat id from the environment, else the one remembered from /start."""
    if TELEGRAM_CHAT_ID:
        return TELEGRAM_CHAT_ID
    try:
        with open(CHAT_ID_FILE) as f:
            return f.read().strip()
    except OSError:
        return ""


def save_chat_id(chat_id):
    if not chat_id or TELEGRAM_CHAT_ID:
        return
    try:
        with open(CHAT_ID_FILE, "w") as f:
            f.write(str(chat_id))
    except OSError as exc:
        log.warning("Could not persist chat_id: %s", exc)

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
# Seconds to wait past a window boundary before sampling, so the oracle has
# published the closing price. Small, because every second of delay is a second
# the market spends pricing in the move we are trying to fade.
BOUNDARY_LAG = float(os.environ.get("BOUNDARY_LAG", "2"))
# Missed windows tolerated before the stored close series is treated as broken
# and rebuilt. One or two is a hiccup; more leaves a hole that would be read as
# a single enormous candle.
GAP_TOLERANCE = int(os.environ.get("GAP_TOLERANCE", "2"))

# --- RULES 2 and 3: the other two mean-reversion edges -----------------------
# Both are stated in terms of close-to-close moves, because that is all the
# settlement feed gives us — and it is also exactly what Polymarket settles on.
# Re-measured in that form on the same 162k candles (test split, close-to-close):
#   RULE 2  3 same-direction moves + an oversized move:
#           2.0x -> 55.7% (15/day)   2.5x -> 56.7% (10/day)   3.0x -> 56.8% (8/day)
#   RULE 3  a run of N same-direction moves:
#           N=3 -> 53.0% (68/day)    N=6 -> 54.1% (7/day)     N=7 -> 54.2% (3/day)
# RULE 3 at N=3 is barely above the ~52% break-even once a spread is paid, so the
# default is the longer, stronger run.
RULE2_ENABLED = os.environ.get("RULE2", "1").strip() not in ("0", "false", "no")
RULE2_MULT = float(os.environ.get("RULE2_MULT", "2.0"))
RULE3_ENABLED = os.environ.get("RULE3", "1").strip() not in ("0", "false", "no")
RULE3_RUN = int(os.environ.get("RULE3_RUN", "6"))
# RULE 4 — the user's own AABA pattern: two same-direction moves, one opposite,
# then back to the original direction; bet the next move continues it.
# MEASURED AND IT DOES NOT WORK: 50.7% on train but 48.8% out-of-sample
# (n=6,000, z=-1.83) — below a coin flip, and no better than the 50.6% you get
# after any single candle with no pattern at all. It is alerted on request and
# labelled honestly so it is never mistaken for the validated rules.
RULE4_ENABLED = os.environ.get("RULE4", "1").strip() not in ("0", "false", "no")
# RULE 5 — measure the stretch directly instead of inferring it from candle
# shapes: if price has net-travelled more than RULE5_MULT times the recent
# median move over the last 4 candles, fade that travel.
#   5.7x -> 55.6% out-of-sample (n=5,831, z=+8.47), ~31 signals/day, and the
#   effect is monotone across thresholds (4.0x 54.1% .. 7.0x 55.6%).
# 44% of its signals are ones rules 1-3 never see, and those alone hold 54.3%
# (n=2,748, z=+4.46). It contradicts the other rules in 8 cases out of 6,542 —
# it widens coverage rather than fighting them, and when they agree the combined
# accuracy is the highest in the system at 56.7%.
RULE5_ENABLED = os.environ.get("RULE5", "1").strip() not in ("0", "false", "no")
RULE5_MULT = float(os.environ.get("RULE5_MULT", "5.7"))
RULE5_SPAN = int(os.environ.get("RULE5_SPAN", "4"))

# Seconds before a window closes to send a provisional heads-up, so there is
# time to be ready when the window opens. Measured on 1-minute data: a signal
# computed a full minute early matches the final one 67.9% of the time and the
# DIRECTION essentially never flips (3 cases in 28,090); the rest are signals
# that appear or vanish in the final seconds. 0 disables the pre-alert.
PREALERT_SECONDS = int(os.environ.get("PREALERT_SECONDS", "30"))
# How many past signal outcomes to keep, and how many to show in each alert.
HISTORY_KEEP = 40
HISTORY_SHOW = int(os.environ.get("HISTORY_SHOW", "20"))
# Rules 1,2,3,5 are the measured mean-reversion edges; rule 4 is the user's own
# AABA pattern, which tested at 48.8% out-of-sample. Their results are reported
# in separate blocks so a 49% rule can never quietly drag down — or be flattered
# by — the average of the rules that do work.
MINE_RULES = ("۴",)
# Price feed for the breakout rule:
#   "chainlink" - Chainlink BTC/USD via a public Polygon RPC (what Polymarket
#                 settles on; matches the market exactly)
#   "binance"   - spot closes; a DIFFERENT feed, so levels drift from settlement
BREAKOUT_FEED = os.environ.get("BREAKOUT_FEED", "chainlink").strip().lower()
# Public Polygon RPCs, tried in order. Endpoints come and go — polygon-rpc.com
# started returning 401 — so several are listed and the first that answers is
# remembered for subsequent polls. Override with a comma-separated POLYGON_RPC.
POLYGON_RPCS = [u.strip() for u in os.environ.get(
    "POLYGON_RPC",
    "https://polygon-bor-rpc.publicnode.com,"
    "https://polygon.llamarpc.com,"
    "https://polygon.drpc.org,"
    "https://1rpc.io/matic,"
    "https://polygon-mainnet.public.blastapi.io,"
    "https://polygon.blockpi.network/v1/rpc/public,"
    "https://polygon-rpc.com",
).split(",") if u.strip()]
# Chainlink BTC/USD aggregator proxy on Polygon PoS.
CHAINLINK_BTC_USD = os.environ.get(
    "CHAINLINK_BTC_USD", "0xc907E116054Ad103354f2D350FD2514433D57F6f").strip()
# If every Polygon RPC is unreachable, use Binance rather than stop sampling.
# The alert says which feed produced the signal so the mismatch is never hidden.
BREAKOUT_FALLBACK = os.environ.get("BREAKOUT_FALLBACK", "1").strip() not in ("0", "false", "no")

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
MENU_SCORE = "🎯 کارنامه"


def _menu_keyboard():
    """Always-visible quick keyboard: one آستانه button per timeframe + status."""
    rows = [[f"🎚 آستانه {interval_label(iv)}"] for iv in THRESHOLD_INTERVALS]
    rows.append([MENU_SCORE, MENU_STATUS])
    rows.append([MENU_REFRESH])
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
        {"command": "score", "description": "کارنامهٔ سیگنال‌ها (برد/باخت واقعی)"},
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


_rpc_idx = 0  # index of the last RPC that answered, tried first next time


def _chainlink_call(url):
    payload = {
        "jsonrpc": "2.0", "id": 1, "method": "eth_call",
        "params": [{"to": CHAINLINK_BTC_USD, "data": _LATEST_ROUND_DATA}, "latest"],
    }
    resp = requests.post(url, json=payload, timeout=15,
                         headers={"User-Agent": "btc-candle-alert-bot/1.0",
                                  "Content-Type": "application/json"})
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
    price = answer / (10 ** CHAINLINK_DECIMALS)
    if price <= 0:
        raise RuntimeError(f"non-positive Chainlink answer: {price}")
    return price, int(words[3], 16)


def fetch_chainlink_btc():
    """
    Return (price_usd, updated_at_unix) from Chainlink BTC/USD on Polygon.

    Public RPCs rate-limit, disappear, or start demanding an API key (401), so
    every configured endpoint is tried before giving up, starting with whichever
    one answered last.
    """
    global _rpc_idx
    errors = []
    n = len(POLYGON_RPCS)
    for k in range(n):
        i = (_rpc_idx + k) % n
        url = POLYGON_RPCS[i]
        try:
            result = _chainlink_call(url)
            if k:
                log.info("Chainlink: switched to RPC %s", url)
            _rpc_idx = i
            return result
        except Exception as exc:  # noqa: BLE001 - try the next endpoint
            errors.append(f"{url}: {str(exc)[:80]}")
    raise RuntimeError("all Polygon RPCs failed -> " + " | ".join(errors))


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
    """
    Return (price, updated_at, feed_used).

    Chainlink is preferred because Polymarket settles on it. If every RPC is
    down, fall back to Binance rather than losing the candle entirely — but say
    which feed was used, since Binance levels drift from settlement.
    """
    if BREAKOUT_FEED == "binance":
        return (*fetch_binance_btc(), "binance")
    try:
        return (*fetch_chainlink_btc(), "chainlink")
    except Exception as exc:  # noqa: BLE001 - degrade instead of going silent
        if not BREAKOUT_FALLBACK:
            raise
        log.warning("Chainlink unavailable (%s); falling back to Binance.",
                    str(exc)[:160])
        return (*fetch_binance_btc(), "binance-fallback")


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


# --- Clock helpers ----------------------------------------------------------
# Polymarket labels its BTC Up/Down windows in US Eastern time, and the user
# reads them on a phone set to Tehran, so an alert that only says UTC cannot be
# matched against the market you are about to buy. Both are shown instead.
try:
    from zoneinfo import ZoneInfo
    _ET = ZoneInfo("America/New_York")
except Exception:  # noqa: BLE001 - Termux may ship without the tz database
    _ET = None

TEHRAN = timezone(timedelta(hours=3, minutes=30))  # Iran dropped DST in 2022


def _nth_weekday_utc(year, month, weekday, nth, utc_hour):
    """UTC timestamp of the nth `weekday` (0=Mon) of a month, at utc_hour."""
    d = datetime(year, month, 1, utc_hour, tzinfo=timezone.utc)
    d += timedelta(days=(weekday - d.weekday()) % 7 + 7 * (nth - 1))
    return d.timestamp()


def et_time(ts):
    """Datetime in US Eastern — via zoneinfo, else the DST rules by hand."""
    if _ET is not None:
        return datetime.fromtimestamp(ts, _ET)
    year = datetime.fromtimestamp(ts, tz=timezone.utc).year
    # DST: 2nd Sunday of March 02:00 EST (07:00 UTC) .. 1st Sunday of November
    # 02:00 EDT (06:00 UTC).
    start = _nth_weekday_utc(year, 3, 6, 2, 7)
    end = _nth_weekday_utc(year, 11, 6, 1, 6)
    offset = -4 if start <= ts < end else -5
    return datetime.fromtimestamp(ts, timezone(timedelta(hours=offset)))


def _moves(closes):
    """Close-to-close moves; their sign is the candle colour Polymarket settles."""
    return [closes[i] - closes[i - 1] for i in range(1, len(closes))]


def rule2_signal(closes, mult=None):
    """
    RULE 2 — three same-direction moves ending in an oversized one -> fade.

    "Oversized" is relative to the current regime: the move must exceed `mult`
    times the median absolute move of the last 100 candles. Direction-symmetric
    by construction; forcing a fixed side destroys the edge entirely.
    """
    mult = RULE2_MULT if mult is None else mult
    if len(closes) < 104:
        return None
    mv = _moves(closes[-104:])
    last3 = mv[-3:]
    if any(m == 0 for m in last3):
        return None
    if not (last3[0] > 0) == (last3[1] > 0) == (last3[2] > 0):
        return None
    ref = sorted(abs(m) for m in mv[-101:-1])
    med = ref[len(ref) // 2]
    if med <= 0 or abs(last3[-1]) <= mult * med:
        return None
    return {"bet": "down" if last3[-1] > 0 else "up",
            "move": last3[-1], "median": med, "times": abs(last3[-1]) / med}


def rule5_signal(closes, mult=None, span=None):
    """
    RULE 5 — fade an over-extended stretch.

    Net travel over the last `span` candles, measured in units of the recent
    median move; beyond `mult` units, bet against it. Unlike rules 2 and 3 this
    does not care how the move was shaped — only how far price actually got.
    """
    mult = RULE5_MULT if mult is None else mult
    span = RULE5_SPAN if span is None else span
    if len(closes) < 101 + span:
        return None
    net = closes[-1] - closes[-1 - span]
    if net == 0:
        return None
    ref = sorted(abs(m) for m in _moves(closes[-101:]))
    med = ref[len(ref) // 2]
    if med <= 0:
        return None
    times = abs(net) / med
    if times < mult:
        return None
    return {"bet": "down" if net > 0 else "up", "net": net,
            "median": med, "times": times}


def rule4_signal(closes):
    """
    RULE 4 — the AABA pattern: moves A A B A, bet the next move continues A.

    Kept because the user asked for it; see RULE4_ENABLED for the measurement
    showing it has no edge out-of-sample.
    """
    if len(closes) < 6:
        return None
    m = _moves(closes)[-4:]
    if any(x == 0 for x in m):
        return None
    a = m[0] > 0
    if not ((m[1] > 0) == a and (m[2] > 0) != a and (m[3] > 0) == a):
        return None
    return {"bet": "up" if a else "down"}


def rule3_signal(closes, run_len=None):
    """RULE 3 — a run of `run_len` same-direction moves -> fade the run."""
    run_len = RULE3_RUN if run_len is None else run_len
    if len(closes) < run_len + 2:
        return None
    mv = _moves(closes)
    tail = mv[-run_len:]
    if any(m == 0 for m in tail):
        return None
    up = tail[0] > 0
    if not all((m > 0) == up for m in tail):
        return None
    # Report the full run, which may be longer than the threshold.
    n = run_len
    while n < len(mv) and mv[-(n + 1)] != 0 and (mv[-(n + 1)] > 0) == up:
        n += 1
    return {"bet": "down" if up else "up", "run": n}


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

    def __init__(self, chat_id: str, chat_source=None):
        # TELEGRAM_CHAT_ID is often unset — the command listener discovers it
        # when the user sends /start, and stores it on the alternation Monitor.
        # Hold a reference to that object (not a copy of the string) so alerts
        # are not silently dropped for a session that started without an id.
        self._chat_id = chat_id
        self._chat_source = chat_source
        self.closes = []          # 5-minute closing prices, oldest -> newest
        self.last_window = 0      # start of the most recent window we closed
        self.last_alert = 0.0
        self.seeded_from = None   # feed used to backfill history, if any
        self.feed_used = BREAKOUT_FEED  # feed that produced the latest sample
        # Self-scoring: the bet just placed, and the running tally. A signal on
        # the window closing at price P is settled by the NEXT close, exactly the
        # way Polymarket settles it — so the bot can grade itself with no manual
        # bookkeeping and no guessing about what "would have" happened.
        self.pending = None       # {"bet","ref","window","rules"}
        self.score = {"n": 0, "wins": 0, "void": 0, "rules": {}, "since": None}
        # Outcomes of recent signals in the order they were sent — not grouped by
        # strategy. The run of losses at the tail is what decides which
        # martingale rung you are on, so it is surfaced explicitly.
        self.history = []         # [{"won": bool, "bet": str}], oldest first
        # Liveness bookkeeping so "it has been quiet for hours" can be answered
        # from Telegram — a silent market and a dead loop look identical
        # otherwise.
        self.last_sample = 0.0
        self.last_signal = 0.0
        self.last_error = ""
        self.err_count = 0
        self.windows_seen = 0
        self.pre_for = 0          # boundary a pre-alert has already been sent for
        self.gap_note = None      # (windows missed, when) after an outage
        self.backfilled = 0       # windows scored from replay, not from live alerts
        self._load()

    @property
    def chat_id(self):
        """The live chat id — picked up from /start if it was not configured."""
        if self._chat_source is not None and getattr(self._chat_source, "chat_id", ""):
            return self._chat_source.chat_id
        return self._chat_id

    # -- persistence: survive a Termux restart without losing 11h of history --
    def _load(self):
        try:
            with open(self.STATE_FILE) as f:
                s = json.load(f)
            self.closes = [float(x) for x in s.get("closes", [])][-BREAKOUT_HISTORY:]
            self.last_window = int(s.get("last_window", 0))
            self.pending = s.get("pending")
            if isinstance(s.get("score"), dict):
                self.score.update(s["score"])
            if isinstance(s.get("history"), list):
                self.history = s["history"][-HISTORY_KEEP:]
            self.backfilled = int(s.get("backfilled", 0))
            if self.closes:
                log.info("Breakout: restored %d closes from %s",
                         len(self.closes), self.STATE_FILE)
            self._drop_if_stale()
        except FileNotFoundError:
            pass
        except Exception as exc:  # noqa: BLE001 - corrupt state must not be fatal
            log.warning("Breakout: could not read %s: %s", self.STATE_FILE, exc)

    def _fetch_klines(self, limit):
        """Recent closed 5-minute candles as [(window_start, close)], oldest first."""
        for host in BINANCE_HOSTS:
            try:
                r = requests.get(f"{host}/api/v3/klines",
                                 params={"symbol": "BTCUSDT", "interval": "5m",
                                         "limit": min(limit, 1000)},
                                 timeout=25,
                                 headers={"User-Agent": "btc-candle-alert-bot/1.0"})
                r.raise_for_status()
                now = time.time()
                return [(int(x[0]) // 1000 // GRANULARITY * GRANULARITY, float(x[4]))
                        for x in r.json() if int(x[6]) / 1000.0 <= now]
            except requests.RequestException as exc:
                log.warning("klines: %s failed: %s", host, exc)
        return []

    def _backfill(self, missed):
        """
        Replay the windows lost to an outage from real candles.

        Losing connectivity for an hour would otherwise punch a hole in the
        scorecard, and the whole point of the scorecard is a continuous record.
        The candles themselves still exist, so the missed windows are replayed
        here: signals are recomputed and settled exactly as they would have been
        live. No Telegram message is sent for them — a five-minute signal is
        worthless once it is minutes old — they only feed the statistics, and
        are counted separately so the record stays honest about which results
        came from alerts you actually received.
        """
        kl = self._fetch_klines(missed + BREAKOUT_HISTORY + 5)
        if not kl:
            return False
        start = next((i for i, (t, _) in enumerate(kl) if t > self.last_window), None)
        if start is None or start == 0:
            return False          # our last window is not inside this range
        self.closes = [c for _, c in kl[:start]][-BREAKOUT_HISTORY:]
        n = 0
        for t, c in kl[start:]:
            self._on_window_close(t, c, replay=True)
            n += 1
        self.backfilled += n
        log.info("Breakout: backfilled %d missed windows from real candles "
                 "(scorecard stays continuous).", n)
        return True

    def _drop_if_stale(self, now=None):
        """
        Throw away the close series if it has a hole in it.

        Android kills Termux, the phone loses its connection, the process is
        restarted hours later — and the stored closes are then from before the
        gap. Appending today's price onto them turns the missing hours into one
        giant fake 5-minute move, which fires bogus signals immediately (a real
        occurrence: a $981 jump was read as one candle and alerted on the spot).
        Levels and volatility are only meaningful on a contiguous series, so a
        gap means the series must be rebuilt, not continued.

        The scorecard and signal history are NOT cleared — those are genuine past
        results and stay valid across an outage. Any bet still open IS dropped,
        because the candle that would have settled it never arrived.
        """
        if not self.closes or not self.last_window:
            return False
        now = time.time() if now is None else now
        missed = int((now - self.last_window) // GRANULARITY) - 1
        if missed <= GAP_TOLERANCE:
            return False
        log.warning("Breakout: %d windows missing (%.1f hours offline).",
                    missed, missed * GRANULARITY / 3600)
        self.pending = None       # the candle that would have settled it never came
        self.gap_note = (missed, now)
        if self._backfill(missed):
            return False          # history rebuilt AND scored; nothing else to do
        self.closes = []          # could not recover the candles — start clean
        return True

    def _save(self):
        try:
            with open(self.STATE_FILE, "w") as f:
                json.dump({"closes": self.closes[-BREAKOUT_HISTORY:],
                           "last_window": self.last_window,
                           "pending": self.pending,
                           "score": self.score,
                           "history": self.history[-HISTORY_KEEP:],
                           "backfilled": self.backfilled}, f)
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

    def _alert(self, hits, price, window_start, lag=0.0, settled=None):
        """
        hits: list of (rule_name, accuracy_label, bet, detail_line).

        All firing rules go in ONE message: they read the same series, so
        separate messages would just be noise — and when they agree, that
        agreement is itself the useful signal.
        """
        if BREAKOUT_COOLDOWN and time.time() - self.last_alert < BREAKOUT_COOLDOWN:
            log.info("Signal suppressed by cooldown.")
            return
        self.last_alert = time.time()
        o_et, e_et = et_time(window_start), et_time(window_start + GRANULARITY)
        o_ir = datetime.fromtimestamp(window_start, TEHRAN)
        e_ir = datetime.fromtimestamp(window_start + GRANULARITY, TEHRAN)
        bets = {h[2] for h in hits}
        if len(bets) == 1:
            bet = bets.pop()
            head = ("🟢 <b>بالا (Up)</b>" if bet == "up" else "🔴 <b>پایین (Down)</b>")
            agree = (f"\n✅ <b>هر {len(hits)} استراتژی هم‌نظرند</b> — سیگنالِ قوی‌تر."
                     if len(hits) > 1 else "")
        else:
            head = "⚠️ <b>استراتژی‌ها اختلافِ نظر دارند</b>"
            agree = "\n⚠️ جهت‌ها یکی نیست — بهتر است این نوبت را رد کنی."
        lines = "\n".join(
            f"• <b>{name}</b> ({acc}) → "
            f"{'🟢 بالا' if b == 'up' else '🔴 پایین'}\n   <i>{detail}</i>"
            for name, acc, b, detail in hits)
        seed_note = ("\n\n⚠️ بخشی از تاریخچه هنوز از Binance است و به‌تدریج با دادهٔ "
                     "زندهٔ فید جایگزین می‌شود."
                     if self.seeded_from and len(self.closes) < BREAKOUT_HISTORY else "")
        feed_note = ("  ⚠️ (Chainlink در دسترس نبود — با تسویهٔ پلی‌مارکت کمی فرق دارد)"
                     if self.feed_used == "binance-fallback" else "")
        prev_line = self.history_line()
        text = (
            f"🎯 <b>سیگنال — روی کندلِ بعدی شرط ببند</b>\n\n"
            f"جهتِ پیشنهادی: {head}{agree}\n\n"
            f"{lines}\n\n"
            f"قیمتِ بسته‌شدن: <b>${price:,.2f}</b>\n"
            f"فید: <b>{self.feed_used}</b>{feed_note}\n"
            f"⏱ پنجرهٔ شرط — همانی که در پلی‌مارکت می‌بینی:\n"
            f"   <b>{o_et:%I:%M}-{e_et:%I:%M%p} ET</b>   ({o_et:%b %d})\n"
            f"   به وقتِ تهران: <b>{o_ir:%H:%M} تا {e_ir:%H:%M}</b>\n"
            f"   این پنجره <b>همین الان</b> باز شد (تأخیرِ سیگنال: {lag:.0f} ثانیه)\n\n"
            "⚡️ <b>سریع وارد شو.</b> هرچه از پنجره بگذرد قیمت حرکت را در خود "
            "می‌خورد و لبه از بین می‌رود — قیمتِ ۵۰ سنتیِ ثانیه‌های اول تا دقیقهٔ "
            "چهارم می‌تواند ۸۰ سنت شود.\n\n"
            "دقتِ تاریخیِ این قانون‌ها <b>۵۳–۵۷٪</b> است (نه بیشتر). "
            "اگر پلی‌مارکت این سمت را بالای <b>۵۵ سنت</b> می‌فروشد، وارد نشو."
            f"{prev_line}{seed_note}"
        )
        log.info("ALERT: %s", " | ".join(f"{n}->{b}" for n, _, b, _ in hits))
        send_message(self.chat_id, text)

    def _settle(self, price):
        """
        Grade the previous signal against the close that just arrived.

        Polymarket settles a window by comparing its final price to the price at
        its start, so the bet recorded at the last close is settled by this one.
        An exactly unchanged price is a push and is counted separately rather
        than silently scored as a loss.
        """
        p = self.pending
        self.pending = None
        if not p:
            return None
        ref = p["ref"]
        if price == ref:
            self.score["void"] += 1
            log.info("Settled: VOID (price unchanged at %.2f)", price)
            return None
        won = (p["bet"] == "up") == (price > ref)
        self.score["n"] += 1
        self.score["wins"] += 1 if won else 0
        rules = p.get("rules", [])
        # "Whose" signal this was: the user's AABA rule fires alone often enough
        # that mixing it into one number would hide both its weakness and the
        # other rules' strength.
        mine = all(any(r.startswith(m) for m in MINE_RULES) for r in rules) if rules else False
        self.history.append({"won": won, "bet": p["bet"], "mine": mine})
        self.history = self.history[-HISTORY_KEEP:]
        for name in p.get("rules", []):
            r = self.score["rules"].setdefault(name, {"n": 0, "wins": 0})
            r["n"] += 1
            r["wins"] += 1 if won else 0
        if self.score["since"] is None:
            self.score["since"] = p["window"]
        log.info("Settled: %s bet %s | %.2f -> %.2f | overall %d/%d (%.1f%%)",
                 "WIN " if won else "LOSS", p["bet"], ref, price,
                 self.score["wins"], self.score["n"],
                 self.score["wins"] / self.score["n"] * 100)
        return won

    def loss_streak(self):
        """Losses at the tail of the history — i.e. the martingale rung you are on."""
        k = 0
        for h in reversed(self.history):
            if h["won"]:
                break
            k += 1
        return k

    def history_line(self):
        """
        Recent outcomes in the order the signals were SENT, not grouped by rule.

        The tail streak is spelled out because that, not the overall hit rate, is
        what determines the next stake under any martingale.
        """
        if not self.history:
            return ""
        recent = self.history[-HISTORY_SHOW:]
        seq = "".join("✅" if h["won"] else "❌" for h in recent)
        w = sum(1 for h in recent if h["won"])
        s = self.score
        overall = (f"  ·  کل: {s['wins']}/{s['n']} ({s['wins'] / s['n'] * 100:.0f}%)"
                   if s["n"] else "")
        out = (f"\n\n📋 <b>{len(recent)} سیگنالِ اخیر</b> (قدیمی → جدید):\n"
               f"{seq}\n<b>{w}</b> برد از {len(recent)}{overall}")
        k = self.loss_streak()
        if k >= 2:
            out += (f"\n🔴 <b>{k} باختِ پیاپی</b> — اگر مارتینگل می‌زنی، "
                    f"این ورود پلهٔ <b>{k + 1}</b> است.")
        elif k == 1:
            out += "\n🟡 سیگنالِ قبلی باخت — این ورود پلهٔ ۲ است."
        else:
            out += "\n🟢 سیگنالِ قبلی برد — از پلهٔ ۱ شروع کن."
        return out

    def health_report(self):
        """Is the loop alive, or is the market simply quiet? Answer both."""
        now = time.time()
        if not self.last_sample:
            return ("🩺 <b>سلامتِ موتورِ سیگنال</b>\n\n"
                    "⏳ هنوز هیچ کندلی نمونه‌برداری نشده — تازه بالا آمده. "
                    "تا حداکثر ۵ دقیقهٔ دیگر اولین نمونه باید ثبت شود.")
        age = now - self.last_sample
        # Samples land once per window; more than ~2 windows of silence means
        # the loop is stuck, not that the market is calm.
        ok = age < 2 * GRANULARITY
        head = ("✅ <b>سالم</b>" if ok else "❌ <b>گیر کرده</b>")
        lines = [f"🩺 <b>سلامتِ موتورِ سیگنال</b>\n", f"وضعیت: {head}",
                 f"آخرین کندلِ نمونه‌برداری‌شده: <b>{age/60:.1f}</b> دقیقه پیش "
                 f"(باید زیر ۵ باشد)",
                 f"کندل‌های در حافظه: <b>{len(self.closes)}</b> از {BREAKOUT_HISTORY}",
                 f"کلِ پنجره‌های پردازش‌شده: <b>{self.windows_seen}</b>",
                 f"فید: <b>{self.feed_used}</b>"]
        if self.last_signal:
            lines.append(f"آخرین سیگنال: <b>{(now - self.last_signal)/60:.0f}</b> دقیقه پیش")
        else:
            lines.append("آخرین سیگنال: هنوز هیچ")
        if self.gap_note:
            missed, when = self.gap_note
            lines.append(f"\n⚠️ آخرین قطعی: <b>{missed * GRANULARITY / 3600:.1f} ساعت</b> "
                         f"({missed} پنجره از دست رفت، "
                         f"{datetime.fromtimestamp(when, TEHRAN):%m-%d %H:%M})\n"
                         "تاریخچه دور ریخته و از نو ساخته شد — کارنامه دست‌نخورده ماند.")
        if self.err_count:
            lines.append(f"\n⚠️ خطاهای پیاپی: {self.err_count}\n<i>{self.last_error[:180]}</i>")
        if ok:
            lines.append("\nموتور زنده است. سکوتِ طولانی طبیعی است — طبق دادهٔ "
                         "تاریخی، ۵٪ مواقع بیش از ۲ ساعت و گاهی تا ۸ ساعت "
                         "فاصله می‌افتد، چون هر سه قانون فقط روی حرکت‌های "
                         "غیرعادی فعال می‌شوند.")
        else:
            lines.append("\nبیش از دو پنجره است که نمونه‌ای ثبت نشده. در ترموکس "
                         "بزن:\n<code>bash run_bot.sh stop &amp;&amp; bash run_bot.sh start</code>")
        return "\n".join(lines)

    def score_report(self):
        """Human-readable cumulative scorecard for the /score command."""
        s = self.score
        n, w = s["n"], s["wins"]
        if not n:
            pend = ("\n\nیک سیگنالِ باز هست که با کندلِ بعدی نتیجه‌اش مشخص می‌شود."
                    if self.pending else "")
            return ("🎯 <b>کارنامه</b>\n\nهنوز هیچ سیگنالی نتیجه نگرفته." + pend)
        acc = w / n * 100
        # 95% confidence interval on the win rate (normal approximation) — with
        # a handful of signals this band is huge, which is the point: it stops
        # an early streak from being read as a verdict.
        se = (acc * (100 - acc) / n) ** 0.5
        lo, hi = max(0.0, acc - 1.96 * se), min(100.0, acc + 1.96 * se)

        def block(title, rules, note):
            """One scoreboard for a set of rules, with its own confidence band."""
            tot = sum(r["n"] for k, r in s["rules"].items()
                      if any(k.startswith(p) for p in rules))
            won = sum(r["wins"] for k, r in s["rules"].items()
                      if any(k.startswith(p) for p in rules))
            out = [f"\n<b>{title}</b>"]
            if not tot:
                out.append("هنوز سیگنالی نداشته.")
                return out
            a = won / tot * 100
            e = (a * (100 - a) / tot) ** 0.5
            out.append(f"{won}/{tot} = <b>{a:.1f}%</b>  "
                       f"(بازهٔ ۹۵٪: {max(0, a - 1.96 * e):.0f}–{min(100, a + 1.96 * e):.0f}%)")
            for k, r in sorted(s["rules"].items()):
                if r["n"] and any(k.startswith(p) for p in rules):
                    out.append(f"  • {k}: {r['wins']}/{r['n']} "
                               f"({r['wins'] / r['n'] * 100:.0f}%)")
            if note:
                out.append(note)
            return out

        lines = [f"🎯 <b>کارنامهٔ واقعیِ سیگنال‌ها</b>\n",
                 f"مجموع: <b>{n}</b> سیگنال  ·  دقت <b>{acc:.1f}%</b>",
                 f"بازهٔ اطمینان ۹۵٪: <b>{lo:.0f}% تا {hi:.0f}%</b>"]
        if s["void"]:
            lines.append(f"بی‌نتیجه (قیمت تغییر نکرد): {s['void']}")
        if self.backfilled:
            lines.append(f"از این تعداد، <b>{self.backfilled}</b> مورد بازپخشِ "
                         "پنجره‌های قطعی است (نتیجه واقعی، ولی پیامش را نگرفتی)")
        if s["rules"]:
            others = tuple(k[0] for k in s["rules"] if not any(
                k.startswith(m) for m in MINE_RULES))
            lines += block("📈 استراتژی‌های آماری (۱، ۲، ۳، ۵)",
                           tuple(set(others)) or ("۱", "۲", "۳", "۵"), None)
            lines += block("🧪 استراتژیِ خودت (AABA)", MINE_RULES,
                           "  <i>روی ۱۹٬۶۵۶ موقعیتِ تاریخی ۴۸٫۸٪ اندازه‌گیری شد</i>")
        if self.history:
            recent = self.history[-HISTORY_SHOW:]
            seq = "".join("✅" if h["won"] else "❌" for h in recent)
            lines.append(f"\n<b>{len(recent)} سیگنالِ اخیر</b> (قدیمی → جدید):\n"
                         + "\n".join(seq[i:i + 10] for i in range(0, len(seq), 10)))
            k = self.loss_streak()
            if k:
                lines.append(f"🔴 رشتهٔ باختِ فعلی: <b>{k}</b>")
        if s["since"]:
            lines.append(f"\nاز {datetime.fromtimestamp(s['since'], TEHRAN):%Y-%m-%d %H:%M} "
                         "به وقتِ تهران")
        # The honest read: how many samples before the number means anything.
        if n < 100:
            lines.append(f"\n⚠️ با {n} نمونه هنوز نمی‌شود قضاوت کرد — برای تشخیصِ "
                         "لبهٔ ۵۶٪ از شانسِ ۵۰٪ حدود <b>۳۰۰</b> سیگنال لازم است.")
        elif lo > 52:
            lines.append("\n✅ حتی کفِ بازهٔ اطمینان بالای سربه‌سر است.")
        else:
            lines.append("\n⚠️ کفِ بازهٔ اطمینان هنوز زیرِ نقطهٔ سربه‌سر (~۵۲٪) است.")
        return "\n".join(lines)

    @staticmethod
    def evaluate(closes):
        """
        Run every enabled rule over a close series.

        Returns [(name, accuracy_label, bet, detail)]. Shared by the final alert
        and the pre-alert so the two can never drift apart.
        """
        hits = []
        sig = breakout_signal(closes)
        if sig:
            broke = "بالاتر از سقف" if sig["kind"] == "up" else "پایین‌تر از کف"
            ratio = f" · نسبتِ نوسان {sig['ratio']:.2f}" if sig["ratio"] is not None else ""
            hits.append(("۱) شکستِ ۲۰ کندلی", "۵۶٪", sig["bet"],
                         f"{broke} {BREAKOUT_LOOKBACK} کندلِ اخیر "
                         f"(${sig['level']:,.2f}){ratio}"))
        if RULE2_ENABLED:
            s2 = rule2_signal(closes)
            if s2:
                hits.append(("۲) ۳ حرکتِ هم‌جهت + حرکتِ بزرگ", "۵۶٪", s2["bet"],
                             f"حرکتِ آخر ${abs(s2['move']):,.0f} = "
                             f"{s2['times']:.1f}× حرکتِ معمولِ اخیر (${s2['median']:,.0f})"))
        if RULE3_ENABLED:
            s3 = rule3_signal(closes)
            if s3:
                hits.append(("۳) رشتهٔ هم‌جهت", "۵۴٪", s3["bet"],
                             f"{s3['run']} حرکتِ هم‌جهتِ پیاپی"))
        if RULE5_ENABLED:
            s5 = rule5_signal(closes)
            if s5:
                hits.append(("۵) کشیدگیِ ۴ کندلی", "۵۶٪", s5["bet"],
                             f"قیمت ${abs(s5['net']):,.0f} جابه‌جا شده = "
                             f"{s5['times']:.1f}× حرکتِ معمولِ اخیر (${s5['median']:,.0f})"))
        if RULE4_ENABLED:
            s4 = rule4_signal(closes)
            if s4:
                hits.append(("۴) الگوی AABA", "⚠️ ۴۹٪ — تست‌شده، لبه ندارد",
                             s4["bet"], "دو حرکتِ هم‌جهت، یکی مخالف، بازگشت به جهتِ اول"))
        return hits

    def _prealert(self, boundary, price):
        """
        Provisional heads-up shortly before the window closes.

        Direction is trustworthy — over 28,090 comparisons on 1-minute data a
        signal computed a minute early flipped direction 3 times — but ~13% of
        early signals disappear by the close, so this is explicitly labelled as
        not yet final.
        """
        hits = self.evaluate(self.closes + [price])
        if not hits:
            return
        bets = {h[2] for h in hits}
        if len(bets) != 1:
            return
        bet = bets.pop()
        o_et = et_time(boundary)
        o_ir = datetime.fromtimestamp(boundary, TEHRAN)
        names = "\n".join(f"• {n} ({acc})" for n, acc, _, _ in hits)
        left = max(0, int(boundary - time.time()))
        log.info("PRE-ALERT (%ds early): %s", left, bet)
        send_message(self.chat_id,
                     f"⏱ <b>پیش‌هشدار — تا {left} ثانیهٔ دیگر پنجره باز می‌شود</b>\n\n"
                     f"جهتِ احتمالی: "
                     f"{'🟢 <b>بالا (Up)</b>' if bet == 'up' else '🔴 <b>پایین (Down)</b>'}\n\n"
                     f"{names}\n\n"
                     f"پنجره: <b>{o_et:%I:%M%p ET}</b>  ·  تهران {o_ir:%H:%M}\n"
                     f"قیمتِ فعلی: ${price:,.2f}\n\n"
                     "🟡 <b>هنوز قطعی نیست</b> — قیمت تا لحظهٔ بسته‌شدن حرکت می‌کند. "
                     "حدود ۱۳٪ پیش‌هشدارها در ثانیه‌های آخر محو می‌شوند، ولی جهت "
                     "تقریباً هیچ‌وقت برعکس نمی‌شود. آماده باش؛ تأییدِ نهایی تا چند "
                     "ثانیهٔ دیگر می‌آید.")

    def _on_window_close(self, window_start, price, lag=0.0, replay=False):
        # Settle the previous signal BEFORE appending, so `ref` is compared with
        # the close that actually decided it.
        settled = self._settle(price)
        self.closes.append(price)
        if len(self.closes) > BREAKOUT_HISTORY:
            self.closes = self.closes[-BREAKOUT_HISTORY:]
        self.last_window = window_start
        self.windows_seen += 1
        if not replay:
            # During a replay these would claim the engine is live and that a
            # signal just fired, hiding a real stall behind backfilled data.
            self.last_sample = time.time()

        hits = self.evaluate(self.closes)

        log.info("%swindow %s closed at %.2f (%d closes) -> %s",
                 "[replay] " if replay else "",
                 datetime.fromtimestamp(window_start, tz=timezone.utc).strftime("%H:%M"),
                 price, len(self.closes),
                 ", ".join(f"{n}:{b}" for n, _, b, _ in hits) if hits else "no signal")
        if hits:
            if not replay:
                self.last_signal = time.time()
            bets = {h[2] for h in hits}
            if len(bets) == 1:
                self.pending = {"bet": bets.pop(), "ref": price,
                                "window": window_start + GRANULARITY,
                                "rules": [h[0] for h in hits]}
            if not replay:
                self._alert(hits, price, window_start + GRANULARITY, lag, settled)
        self._save()

    def run(self, max_runtime=None):
        """
        Sample right at each window boundary, not on a fixed interval.

        Latency is the whole game here: the bet has to be placed in the opening
        seconds of the 5-minute window, before the market has priced the move.
        A plain 20-second poll would deliver the alert up to 20s late — by which
        time the quote has already moved against you. So the loop sleeps until
        just after the boundary and samples immediately.
        """
        started = time.time()
        self._seed()
        fail = 0
        while True:
            if max_runtime is not None and time.time() - started >= max_runtime:
                log.info("Breakout: max runtime reached; exiting.")
                return
            now = time.time()
            ended = (int(now) // GRANULARITY - 1) * GRANULARITY
            if ended <= self.last_window:
                # Wait for the next boundary (+ a small margin so the oracle has
                # published the closing price), rather than busy-polling. When a
                # pre-alert is due first, stop there on the way.
                nxt = (int(now) // GRANULARITY + 1) * GRANULARITY
                if PREALERT_SECONDS and self.pre_for != nxt and now < nxt - PREALERT_SECONDS:
                    time.sleep(max(1.0, nxt - PREALERT_SECONDS - now))
                    self.pre_for = nxt
                    try:
                        p, _, feed = fetch_spot_price()
                        self.feed_used = feed
                        self._prealert(nxt, p)
                    except Exception as exc:  # noqa: BLE001 - never block the close
                        log.warning("Pre-alert skipped: %s", exc)
                    continue
                time.sleep(max(1.0, min(nxt + BOUNDARY_LAG - now, GRANULARITY)))
                continue
            try:
                price, updated, feed = fetch_spot_price()
                self.feed_used = feed
                # A stale oracle answer would misprice the close; retry shortly
                # rather than record a bad candle.
                if updated and time.time() - updated > 2 * GRANULARITY:
                    log.warning("Breakout: %s price is %ds stale; retrying.",
                                BREAKOUT_FEED, int(time.time() - updated))
                    time.sleep(5)
                    continue
                # A gap can also open while running — the phone sleeps, the
                # network drops — so check here too, not only at startup.
                if self._drop_if_stale():
                    self._seed()
                    self.last_window = ended
                    self._save()
                    continue
                lag = time.time() - (ended + GRANULARITY)
                self._on_window_close(ended, price, lag)
                fail = self.err_count = 0
                self.last_error = ""
            except Exception as exc:  # noqa: BLE001 - keep the 24/7 loop alive
                fail += 1
                self.err_count += 1
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.error("Breakout poll error: %s", exc)
                time.sleep(min(2 ** fail, 60))


# ---------------------------------------------------------------------------
# Telegram command listener (auto-captures chat_id, /start, /status)
# ---------------------------------------------------------------------------
class _OutageLog:
    """
    Collapse a burst of identical network failures into a readable summary.

    An unreachable network produced one ERROR line every 5 seconds, so a short
    outage filled the screen and hid the candle lines the user actually reads.
    """

    def __init__(self, every=300):
        self.n = 0
        self.first = 0.0
        self.last_report = 0.0
        self.every = every

    def fail(self, what):
        now = time.time()
        self.n += 1
        if self.n == 1:
            self.first = self.last_report = now
            log.error("%s — retrying quietly; further identical errors are "
                      "summarised, not repeated.", what)
        elif now - self.last_report >= self.every:
            self.last_report = now
            log.error("%s — still down after %.0f min (%d attempts).",
                      what, (now - self.first) / 60, self.n)

    def ok(self):
        if self.n:
            log.info("Telegram reachable again after %.0f min (%d failed attempts).",
                     (time.time() - self.first) / 60, self.n)
            self.n = 0


_net = _OutageLog()


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
                        save_chat_id(monitor.chat_id)
                    handle_callback(monitor, cq)
                    continue

                msg = update.get("message") or update.get("channel_post")
                if not msg:
                    continue
                chat_id = str(msg["chat"]["id"])
                text = (msg.get("text") or "").strip()

                if not monitor.chat_id:
                    monitor.chat_id = chat_id
                    save_chat_id(chat_id)
                    log.info("Captured chat_id: %s (remembered for restarts)", chat_id)

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
                elif text.startswith("/score") or text == MENU_SCORE:
                    bm = globals().get("BREAKOUT_MONITOR")
                    send_message(chat_id, bm.score_report() if bm else
                                 "🎯 کارنامه در دسترس نیست — هشدارهای شکست خاموش‌اند "
                                 "(STRATEGY را روی breakout یا both بگذار).")
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
                    bm = globals().get("BREAKOUT_MONITOR")
                    if bm:
                        send_message(chat_id, bm.health_report())
        except requests.RequestException as exc:
            # While the phone has no connection this fires every few seconds and
            # buries the signal-engine lines that actually matter. Collapse a run
            # of failures into one line, then a periodic count, and one line when
            # it recovers.
            _net.fail(f"Telegram unreachable ({type(exc).__name__})")
            time.sleep(5)
        except Exception as exc:
            log.error("Listener error: %s", exc)
            time.sleep(5)
        else:
            _net.ok()


def main():
    if not TELEGRAM_TOKEN:
        raise SystemExit(
            "TELEGRAM_TOKEN is not set. Create a bot via @BotFather and set it "
            "in your environment or .env file."
        )

    chat_id = load_chat_id()
    if chat_id and not TELEGRAM_CHAT_ID:
        log.info("Using chat_id %s remembered from a previous /start.", chat_id)
    monitor = Monitor(chat_id)

    listener = threading.Thread(
        target=command_listener, args=(monitor,), daemon=True
    )
    listener.start()

    if STRATEGY in ("breakout", "both"):
        breakout = BreakoutMonitor(chat_id, chat_source=monitor)
        # The command listener runs in its own thread and needs to reach the
        # monitor to answer /score.
        globals()["BREAKOUT_MONITOR"] = breakout
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
