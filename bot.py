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

# --- Heartbeat ---------------------------------------------------------------
# A process that is alive is not the same as a process that is working. The one
# failure the supervisor in run_bot.sh cannot see is a wedged loop: the thread
# blocks forever on a socket, or the phone suspends mid-sleep, and bot.py sits
# there as a healthy-looking pid producing nothing. So the working loops stamp a
# file every pass; anything outside the process can then ask "when did this last
# actually do something?" instead of "does the pid exist?".
HEARTBEAT_FILE = os.environ.get("HEARTBEAT_FILE", ".bot.heartbeat")


def beat(what="loop", window=0):
    """
    Record that a working loop just came round. Never raises.

    `window` is the last window the loop actually PROCESSED, and it is the more
    important of the two numbers. The loop turns every few seconds even when it
    is only waiting for the next boundary, so a timestamp alone proves nothing
    beyond "the thread is scheduled". A loop that has gone round ten thousand
    times without processing a window — a marker stuck in the future, a boundary
    condition that never becomes true — beats perfectly while sending nothing,
    which is indistinguishable from health at exactly the moment it matters.
    """
    try:
        with open(HEARTBEAT_FILE, "w") as f:
            f.write(f"{time.time():.0f} {what} {int(window)}\n")
    except OSError:
        pass

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
# Turned OFF by default at the user's request: with it silent, the measured
# rules can be judged on their own record instead of through an average a
# 49% rule is dragging around. Nothing was removed — RULE4=1 in .env brings
# it back, and its past results stay in the scorecard.
RULE4_ENABLED = os.environ.get("RULE4", "0").strip() not in ("0", "false", "no")
# RULE 5 — measure the stretch directly instead of inferring it from candle
# shapes: if price has net-travelled more than RULE5_MULT times the recent
# median move over the last 4 candles, fade that travel.
#   5.7x -> 55.6% out-of-sample (n=5,831, z=+8.47), ~31 signals/day, and the
#   effect is monotone across thresholds (4.0x 54.1% .. 7.0x 55.6%).
# 44% of its signals are ones rules 1-3 never see, and those alone hold 54.3%
# (n=2,748, z=+4.46). It contradicts the other rules in 8 cases out of 6,542 —
# it widens coverage rather than fighting them, and when they agree the combined
# accuracy is the highest in the system at 56.7%.
# RULE 7 — close outside a Bollinger band with RSI already at an extreme, fade
# it. Came out of a 1,083-condition sweep as the only survivor; independently
# rewritten and re-measured before being trusted: 56.15% over 6,522 signals,
# 57.64% on the held-out half, positive in all six chronological blocks
# (53.1-59.2), 986 signals no other rule sees at 55.68%, and 0 of 300
# shuffled-label runs came near it (best 51.9%).
#
# It votes with rules 1/2/3/5 rather than standing apart, because it agreed with
# them on every one of the 3,684 windows where both fired — zero vetoes in a
# year — so a separate ladder would only split the same bet in two. Merged, the
# year returns $59,460 instead of $56,060 at a $20 base AND drops the worst
# drawdown from $2,040 to $1,720.
# RULE 6 — the user's own AABA pattern, but INVERTED and gated on RSI. The
# pattern alone is 48.8% (see RULE4_ENABLED); completed while RSI(7) is already
# overbought it becomes 57.2% betting DOWN, because at that point the pattern
# marks exhaustion rather than continuation. Verified over a year: 1,396
# signals, all six chronological blocks positive, and — the reason it earns a
# slot — 706 of those fire when no other rule sees anything, scoring 57.9%.
# One direction only: the mirror condition (RSI <= 30, bet up) is 50.07%.
RULE6_ENABLED = os.environ.get("RULE6", "1").strip() not in ("0", "false", "no")
RULE6_RSI_HI = float(os.environ.get("RULE6_RSI_HI", "70"))
RULE7_ENABLED = os.environ.get("RULE7", "1").strip() not in ("0", "false", "no")
RULE7_BB_N = int(os.environ.get("RULE7_BB_N", "20"))
RULE7_BB_SD = float(os.environ.get("RULE7_BB_SD", "2.0"))
RULE7_RSI_N = int(os.environ.get("RULE7_RSI_N", "7"))
RULE7_RSI_HI = float(os.environ.get("RULE7_RSI_HI", "80"))
RULE7_RSI_LO = float(os.environ.get("RULE7_RSI_LO", "20"))
# RULE 8 — fade price that has drifted far from its own 20-candle average.
#
# Found by sweeping 181 candidate rules across eight families (oscillators,
# trend, channels, candlesticks, market structure, volume, statistical,
# multi-timeframe) over 105,121 real candles, with discovery on the train half
# only, a 300-occurrence floor, Bonferroni over the candidate count, and an
# empirical null from shuffling the candle labels — which turned out to be the
# STRICTER bar (z=3.92 against Bonferroni's 3.28).
#
# It is the only survivor that sees something rules 1-7 do not. Those seven fire
# on just 21.4% of windows; this one adds 19,610 windows a year they never look
# at, and settles 52.41% there — train 52.5%, test 52.2%, and positive in five
# of six blocks across the year. Shuffling the labels 200 times never beat it.
#
# Defined on closes alone, deliberately: the monitor keeps no highs or lows, so
# an ATR version could not run here. The median absolute move is the same
# convention rules 2 and 5 already use, and the ATR and close-only forms score
# within a few percent of each other.
#
# The edge is THIN — 52.4% against a 50% break-even. It survives every control
# but it has half the margin of rule 6, and a two-cent fill cost erases it.
RULE8_ENABLED = os.environ.get("RULE8", "1").strip() not in ("0", "false", "no")
RULE8_MA = int(os.environ.get("RULE8_MA", "20"))
RULE8_MULT = float(os.environ.get("RULE8_MULT", "3.5"))
RULE5_ENABLED = os.environ.get("RULE5", "1").strip() not in ("0", "false", "no")
RULE5_MULT = float(os.environ.get("RULE5_MULT", "5.7"))
RULE5_SPAN = int(os.environ.get("RULE5_SPAN", "4"))
# GOLDEN ENTRY — not another rule, a quality tier over the existing ones.
# When at least GOLDEN_RULES of the statistical rules agree AND the 4-candle
# stretch is at least GOLDEN_MULT, out-of-sample accuracy reaches 58.3%
# (n=636, z=+4.20) — the highest anything in this research has produced.
# It passed every stress test: positive in all 6 chronological blocks
# (52.7%–57.9%), symmetric across both directions (57.3% up / 59.4% down), and
# 0 of 200 shuffled-label runs reached it (best random run 54.9%).
# Only ~3.6 fire per day, which is the point — it marks the few worth acting on.
GOLDEN_RULES = int(os.environ.get("GOLDEN_RULES", "3"))
GOLDEN_MULT = float(os.environ.get("GOLDEN_MULT", "9"))

# Seconds before a window closes to send a provisional heads-up, so there is
# time to be ready when the window opens. Measured on 1-minute data: a signal
# computed a full minute early matches the final one 67.9% of the time and the
# DIRECTION essentially never flips (3 cases in 28,090); the rest are signals
# that appear or vanish in the final seconds. 0 disables the pre-alert.
# A settled move smaller than this fraction of the recent median move is called
# a push instead of a win or a loss — see BreakoutMonitor._settle. 0.02 catches
# about 1.5% of windows; those are ties in all but name, and grading them was
# putting fictitious wins on the scorecard.
SETTLE_DEADBAND = float(os.environ.get("SETTLE_DEADBAND", "0.05"))
# Absolute floor for that band, in dollars. Measured against Polymarket's own
# numbers the feed sits about $1 away at the same instant, so the move this bot
# computes can be a couple of dollars off the one the market settles on. Below
# that, a verdict here says nothing about the verdict there.
SETTLE_FLOOR = float(os.environ.get("SETTLE_FLOOR", "3"))
# Depth of the martingale ladder being followed, for display only. Without it
# the message reports a raw losing streak — "پلهٔ ۵" on a three-rung ladder,
# which is not a rung at all, it is two busts and a fresh start.
LADDER_RUNGS = int(os.environ.get("LADDER_RUNGS", "3"))
# Polymarket up/down watcher: how early to read the quote, and how long after
# the close to wait for the market to publish its resolution.
ODDS_LEAD = int(os.environ.get("ODDS_LEAD", "15"))
ODDS_SETTLE = int(os.environ.get("ODDS_SETTLE_WAIT", "45"))
ODDS_SHOW = int(os.environ.get("ODDS_SHOW", "18"))   # windows listed per report
# How far past the window's open to keep retrying. The connection to Polymarket
# drops in and out on this network, so one attempt decides nothing.
ODDS_GRACE = int(os.environ.get("ODDS_GRACE", "40"))
# Stake shown with each signal. STAKE_MODE=flat keeps every bet the same size;
# "martingale" doubles after a loss up to LADDER_RUNGS. Flat is the default
# because on the low-frequency streams it returned more profit per dollar of
# drawdown (rule 6: 10.6 against 8.1) and recovers from a bad run in half the
# bets.
STAKE_BASE = float(os.environ.get("STAKE_BASE", "20"))
STAKE_MODE = os.environ.get("STAKE_MODE", "flat").strip().lower()
# A Chainlink round older than this at sample time is not the close of the
# window that just ended — it is an older price being re-served. Grading a
# window on two such samples produces a verdict the market does not share.
FEED_MAX_AGE = int(os.environ.get("FEED_MAX_AGE", "60"))
PREALERT_SECONDS = int(os.environ.get("PREALERT_SECONDS", "30"))
# Seconds before the close at which to look, largest first. 60 gives time to
# open the app; 30 says whether it survived; the close is the real signal.
# One stage is not enough — 30 seconds is not long enough to reach the account,
# and a single early warning cannot be trusted on its own because ~13% of early
# signals are gone by the close.
PREALERT_STAGES = sorted(
    {int(x) for x in os.environ.get("PREALERT_STAGES", "60,30").split(",")
     if x.strip().isdigit() and int(x) > 0}, reverse=True)
# PREALERT_SECONDS=0 still means "no pre-alerts at all" — it was the old switch
# and someone's .env may well still hold it.
if PREALERT_SECONDS == 0:
    PREALERT_STAGES = []
# How many past signal outcomes to keep, and how many to show in each alert.
HISTORY_KEEP = 40
HISTORY_SHOW = int(os.environ.get("HISTORY_SHOW", "20"))
# Full per-signal log (time, side, rules, outcome, whether you were told). Kept
# much longer than the ✅❌ strip because it is what /missed and /log read.
SIGNALS_KEEP = int(os.environ.get("SIGNALS_KEEP", "300"))
# Most recent missed signals listed in the catch-up message after an outage.
MISSED_SHOW = int(os.environ.get("MISSED_SHOW", "15"))
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


def _stake_label():
    return "حجمِ ثابت" if STAKE_MODE != "martingale" else f"مارتینگل تا {LADDER_RUNGS} پله"


def code_version():
    """
    Which commit this process is actually running.

    Printed at startup and shown in /status: after a `git pull` it is otherwise
    impossible to tell from the outside whether the running process picked the
    new code up or an old one is still alive, which has caused real confusion.
    """
    try:
        import subprocess
        here = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run(["git", "-C", here, "log", "-1", "--format=%h %cd",
                              "--date=format:%m-%d %H:%M"],
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "unknown"
    except Exception:  # noqa: BLE001 - a missing git must never block startup
        return "unknown"


def _git(*args, timeout=30):
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    return subprocess.run(["git", "-C", here, *args],
                          capture_output=True, text=True, timeout=timeout)


# The commit this PROCESS loaded, captured once at import. Comparing it with
# what is on disk is the only way to tell a stale process from a current one —
# and a stale process is invisible from the outside, which is exactly how a
# phone kept running week-old rules while every file on disk was up to date.
RUNNING_VERSION = code_version()


def git_pull():
    """
    Pull the branch this checkout is on. Returns (ok, output, moved).

    `moved` is decided by comparing the commit sha before and after rather than
    by grepping for "Already up to date" — that string is localised and has
    caused a pointless restart before. A detached HEAD falls back to main.
    """
    before = _git("rev-parse", "HEAD").stdout.strip()
    branch = _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if not branch or branch == "HEAD":
        branch = "main"
    r = _git("pull", "origin", branch, timeout=120)
    after = _git("rev-parse", "HEAD").stdout.strip()
    out = (r.stdout + r.stderr).strip()[-600:] or "(no output)"
    return r.returncode == 0, out, bool(before and after and before != after)


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
    """
    Send text with an inline keyboard, falling back to plain text.

    Telegram rejects the WHOLE request when the markup is malformed, so a bad
    keyboard used to mean the user tapped a button and got nothing at all —
    no text, no error, no clue. The content matters more than the buttons, so
    if the markup is refused the message still goes out without it.
    """
    if _tg("sendMessage", {
            "chat_id": chat_id, "text": text, "parse_mode": "HTML",
            "reply_markup": {"inline_keyboard": keyboard}}):
        return True
    log.warning("Keyboard rejected; sending the text on its own.")
    return send_message(chat_id, text)


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
    if data.startswith("odds:"):
        w = globals().get("ODDS_WATCHER")
        what = data.split(":", 1)[1]
        if not w:
            answer_callback(cq_id, "در دسترس نیست")
        elif what == "all":
            import polymarket_collector as pmc
            edit_keyboard(chat, mid, pmc.report_text(html=True), _odds_keyboard())
            answer_callback(cq_id)
        else:
            edit_keyboard(chat, mid, w.window_report(int(what)), _odds_keyboard())
            answer_callback(cq_id)
        return
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
MENU_WHY = "🔍 چرا سیگنال نیست"
MENU_REFRESH = "🔄 منو"
MENU_SCORE = "🎯 کارنامه"
MENU_UPDATE = "⬆️ به‌روزرسانی"
MENU_MISSED = "📋 سابقه"
MENU_LAST = "🔍 ۶ ساعت اخیر"
MENU_ODDS = "📈 بالا/پایین"


def _odds_keyboard():
    """
    Ranges, so a different window is one tap away instead of a typed number.

    Returns the bare row list, like every other keyboard here — send_keyboard
    and edit_keyboard add the "inline_keyboard" wrapper themselves. Returning
    the wrapper too nested it twice, Telegram rejected the whole request, and
    the button answered with silence.
    """
    return [
        [{"text": "۱ ساعت", "callback_data": "odds:1"},
         {"text": "۳ ساعت", "callback_data": "odds:3"},
         {"text": "۶ ساعت", "callback_data": "odds:6"}],
        [{"text": "۱۲ ساعت", "callback_data": "odds:12"},
         {"text": "۲۴ ساعت", "callback_data": "odds:24"},
         {"text": "📊 همه", "callback_data": "odds:all"}],
    ]


def _menu_keyboard():
    """Always-visible quick keyboard: one آستانه button per timeframe + status."""
    rows = [[f"🎚 آستانه {interval_label(iv)}"] for iv in THRESHOLD_INTERVALS]
    rows.append([MENU_SCORE, MENU_MISSED])
    rows.append([MENU_LAST, MENU_ODDS])
    rows.append([MENU_STATUS, MENU_REFRESH, MENU_UPDATE])
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
        {"command": "why", "description": "چرا سیگنالی نیست؟ فاصله تا شلیکِ هر قانون"},
        {"command": "missed", "description": "سابقهٔ سیگنال‌ها با ساعت و نتیجه"},
        {"command": "last", "description": "سیگنال‌های N ساعتِ گذشته (پیش‌فرض ۶)"},
        {"command": "check", "description": "قیمت‌های تسویه برای مقایسه با پلی‌مارکت"},
        {"command": "odds", "description": "گزارشِ بالا/پایین — بعدش عدد بزن: /odds 1"},
        {"command": "oddscollect", "description": "روشن/خاموش کردنِ جمع‌آوریِ بی‌صدا"},
        {"command": "oddsdebug", "description": "چرا بالا/پایین چیزی جمع نمی‌کند؟"},
        {"command": "oddsfill", "description": "بازیابیِ پنجره‌های جاافتاده (پیش‌فرض ۲۴ ساعت)"},
        {"command": "oddstest", "description": "آیا جمع‌آوری کامل و درست است؟"},
        {"command": "oddsreport", "description": "جمع‌بندیِ بالا/پایین به تفکیکِ ساعت"},
        {"command": "menu", "description": "نمایش منوی سریع"},
        {"command": "update", "description": "دریافت آخرین نسخه و ری‌استارت"},
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


def _pstdev(values):
    """Population standard deviation — what Bollinger bands are defined on."""
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return (sum((v - mean) ** 2 for v in values) / n) ** 0.5


def rsi(closes, period=RULE7_RSI_N):
    """Wilder's RSI of the last close. None until there is enough history."""
    if len(closes) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    ag, al = gains / period, losses / period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (period - 1) + max(d, 0.0)) / period
        al = (al * (period - 1) + max(-d, 0.0)) / period
    if al == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + ag / al)


def rule6_signal(closes):
    """
    RULE 6 — AABA completed while RSI(7) is overbought -> fade it.

    Deliberately one-sided. The pattern's owner expected continuation; the data
    says the opposite, and only on the overbought side.
    """
    if rule4_signal(closes) is None:
        return None
    r = rsi(closes)
    if r is None or r < RULE6_RSI_HI:
        return None
    return {"bet": "down", "rsi": r}


def rule7_signal(closes):
    """
    RULE 7 — closed outside the Bollinger band with RSI already extreme -> fade.

    Both halves are needed: piercing the band alone is ordinary, and RSI alone
    is ordinary. Together they mark a move that is stretched on two independent
    measures at once, and that is what reverts.
    """
    if len(closes) < max(RULE7_BB_N, RULE7_RSI_N + 1) + 1:
        return None
    r = rsi(closes)
    if r is None:
        return None
    window = closes[-RULE7_BB_N:]
    mid = sum(window) / RULE7_BB_N
    sd = _pstdev(window)
    if sd <= 0:
        return None
    cur = closes[-1]
    if cur > mid + RULE7_BB_SD * sd and r >= RULE7_RSI_HI:
        return {"bet": "down", "rsi": r, "band": mid + RULE7_BB_SD * sd}
    if cur < mid - RULE7_BB_SD * sd and r <= RULE7_RSI_LO:
        return {"bet": "up", "rsi": r, "band": mid - RULE7_BB_SD * sd}
    return None


def _favourite(up, down):
    """
    Which side the market is charging more for. "tie" only when they are equal.

    This existed inline as `"down" if down < up`, which inside the else branch —
    where up <= down is already known — can never be true. Every window with
    DOWN as the favourite was therefore filed as a tie, and since the reader
    drops ties, roughly half of all collected windows vanished from the report
    and from every statistic computed over it.
    """
    if up > down:
        return "up"
    if down > up:
        return "down"
    return "tie"


def favourite_of(row):
    """
    The favourite recomputed from the stored prices, never read from the file.

    Rows written before the bug above carry a wrong `favourite`, and the prices
    beside them are correct — so deriving it on read repairs the whole history
    without rewriting a single stored row.
    """
    up, down = row.get("up"), row.get("down")
    if up is None or down is None:
        return row.get("favourite")
    return _favourite(up, down)


def breakout_depth_note(depth):
    """
    One line telling the user what this particular break is worth.

    Returns (mark, label, accuracy, sample) or None when there is not enough
    history to measure the depth — in which case the alert says nothing rather
    than guessing, because a missing hint is honest and a made-up one is not.
    """
    if depth is None:
        return None
    for floor, mark, label, acc, n in BREAKOUT_DEPTH_TIERS:
        if depth >= floor:
            return mark, label, acc, n
    return None



def rule1_entry(sig, accompanied):
    """
    Rule 1's line in the alert, or None when the break is too shallow to bet.

    `accompanied` says whether any other rule fired on this same window, and it
    decides what happens to a sub-0.5x break:

      alone       -> None. Nothing is emitted; measured 50.23% over 1,732
                     signals, which is a coin wearing a rule's name.
      accompanied -> emitted with a red warning. The window is being carried by
                     the other rules anyway, so suppressing it would only hide
                     from the reader that rule 1's contribution here is worthless.

    Measured over the last year on the live configuration, dropping the alone
    case removes 1,741 signals and flags 751: accuracy 53.86% -> 54.18%, worst
    drawdown $1,780 -> $1,360, and at a fixed $2,000 risk budget the base it can
    carry goes $22 -> $29 and the year's profit $69,416 -> $85,853.
    """
    if not sig:
        return None
    depth = sig.get("depth")
    shallow = depth is not None and depth < BREAKOUT_DEPTH_MIN
    if shallow and not accompanied:
        return None

    broke = "بالاتر از سقف" if sig["kind"] == "up" else "پایین‌تر از کف"
    ratio = f" · نسبتِ نوسان {sig['ratio']:.2f}" if sig["ratio"] is not None else ""
    note = breakout_depth_note(depth)
    if note:
        mark, label, acc, n = note
        # The mark rides on the accuracy label, not the rule name: the scorecard
        # keys rules by the first character of the name, so prefixing the name
        # would file every rule 1 signal under an emoji. The label reaches the
        # pre-alert too, which prints only the name and the accuracy — and the
        # 60-second warning is exactly where knowing the break is shallow matters
        # most.
        acc_label = f"{mark} {acc}"
        depth_line = (f"\n  {mark} <b>عمقِ شکست: {depth:.1f}× حرکتِ معمول</b> — "
                      f"{label} · تاریخی {acc} روی {n} نمونه")
        if shallow:
            depth_line += ("\n  ⚠️ <b>زیرِ ۰٫۵× است — خطرناک.</b> این شکست به‌تنهایی "
                           "ارزشِ شرط ندارد؛ فقط چون قانون‌های دیگر هم شلیک "
                           "کرده‌اند نمایش داده می‌شود.")
        elif label == "قوی":
            # Said out loud because the tier looks stronger than its evidence:
            # 56.93% vs 54.78% is z=+1.84, which does not clear 1.96.
            depth_line += "\n  <i>برتریِ این سطح هنوز قطعی نیست (z=+۱٫۸۴)</i>"
    else:
        # No depth means fewer than 101 closes, which means the volatility filter
        # did not run either — the two need the same history. Printing the
        # measured rule's 56% here was the worst kind of wrong: the number was
        # right for a rule that was not the one firing. Say what is missing.
        acc_label = "⏳ نامعلوم"
        depth_line = ("\n  ⏳ <b>عمقِ شکست هنوز اندازه‌گیری نشده</b> — تاریخچه "
                      "کامل نیست. فیلترِ نوسان هم اعمال نشده، پس این سیگنال "
                      "همان قانونِ ۵۶٪ نیست و ضعیف‌تر است. /status را ببین.")
    return ("۱) شکستِ ۲۰ کندلی", acc_label, sig["bet"],
            f"{broke} {BREAKOUT_LOOKBACK} کندلِ اخیر "
            f"(${sig['level']:,.2f}){ratio}{depth_line}")



def rule8_signal(closes, ma=None, mult=None):
    """
    RULE 8 — price far from its own 20-candle average -> fade it.

    Distance is measured in median absolute moves, so the threshold means the
    same thing in a busy hour and a quiet one. Both directions, because the
    measurement found both sides real: above the average bet down, below it up.
    """
    ma = RULE8_MA if ma is None else ma
    mult = RULE8_MULT if mult is None else mult
    if len(closes) < 101 + ma:
        return None
    avg = sum(closes[-ma:]) / ma
    ref = sorted(abs(m) for m in _moves(closes[-101:]))
    med = ref[len(ref) // 2]
    if med <= 0:
        return None
    gap = closes[-1] - avg
    times = abs(gap) / med
    if times < mult:
        return None
    return {"bet": "down" if gap > 0 else "up", "avg": avg,
            "gap": gap, "median": med, "times": times}


def breakout_signal(closes, lookback=None, vol_filter=None, vol_th=None):
    """
    Evaluate RULE 1 on a series of 5-minute closing prices (oldest -> newest).

    Returns None when no signal, otherwise a dict describing the bet:
      bet    "up" | "down"   — the direction to back for the NEXT window
      level  the 20-close high/low that was broken
      ratio  vol20/vol100 (None when the filter is off or history is short)
      depth  how far past the level the close landed, in median moves
      median the median absolute move of the last 100 candles

    `depth` is the one number that separates a rule 1 signal worth taking from
    one that is not. Measured over 11,165 signals in the last year: a break of
    less than half a median move settles at 50.56% — an interval that contains
    50, i.e. a coin — while a break of three or more settles at 56.87%.

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
    # Depth of the break, in median moves. Uses the same upper-median convention
    # as rules 2 and 5 so the "x median move" on every alert means one thing.
    depth = median = None
    if len(closes) >= 101:
        ref = sorted(abs(m) for m in _moves(closes[-101:]))
        median = ref[len(ref) // 2]
        if median > 0:
            depth = abs(cur - level) / median

    return {"bet": bet, "level": level, "kind": kind, "close": cur,
            "ratio": ratio, "depth": depth, "median": median}


# Measured on the last 365 days, 11,165 rule 1 signals, close-to-close. The
# bands are where the data actually breaks, not round numbers: 1.5x and 2x are
# indistinguishable from each other (54.78% vs 54.55%), so offering them as
# separate tiers would be inventing precision that is not there.
BREAKOUT_DEPTH_TIERS = (
    (3.0, "🟢", "قوی", "۵۶٫۹٪", "۲٬۵۶۱"),
    (0.5, "🟡", "معمولی", "۵۴٫۸٪", "۶٬۱۲۴"),
    (0.0, "🔴", "خطرناک", "۵۰٫۶٪", "۲٬۴۷۹"),
)

# Below this the break is not a break. Those 2,479 signals settle at 50.63%
# [48.7-52.6] — an interval that contains 50, i.e. a coin — and 70% of them fire
# when no other rule does, where they are 50.23%. Rule 1 is therefore dropped
# below the floor when it is ALONE, and merely flagged when other rules are
# already carrying the window.
#
# Only two tiers exist above the floor, not four. Sliced finer the bands are
# 0.5-1x 54.41%, 1-2x 55.41%, 2-3x 54.17%, 3-5x 57.35%, 5x+ 56.36% — every
# confidence interval overlapping every other, and not even monotonic. Offering
# four labels would be inventing a precision the data does not contain.
BREAKOUT_DEPTH_MIN = float(os.environ.get("BREAKOUT_DEPTH_MIN", "0.5"))

# Closes needed before rule 1 is the rule that was measured: 101 gives the 100
# returns the volatility filter and the depth median are both built on. Below
# this the rule still fires arithmetically, but with no filter and no depth —
# which is a different, unmeasured rule wearing the same name.
BREAKOUT_FULL_HISTORY = 101


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
            beat("alternation")
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
        # Every signal ever fired, with its time, side, rules, outcome — and
        # whether the alert actually REACHED Telegram. That last flag is the
        # point: a signal produced during an outage, or one whose send failed,
        # is not lost, it is queued and reported as soon as there is a network.
        self.signals = []         # [{"t","bet","rules","won","mine","told","replay"}]
        # Liveness bookkeeping so "it has been quiet for hours" can be answered
        # from Telegram — a silent market and a dead loop look identical
        # otherwise.
        self.last_sample = 0.0
        self.last_signal = 0.0
        self.last_error = ""
        self.err_count = 0
        self.windows_seen = 0
        self.pre_done = set()     # (boundary, stage) pre-alerts already sent
        self.pre_bet = {}         # boundary -> side promised by the last stage
        self.gap_note = None      # (windows missed, when) after an outage
        # An outage whose backfill has not succeeded yet. Persisted, because the
        # retry may only work several restarts later and _seed() destroys the
        # only other record of where the hole was.
        self.recover_from = None
        self.recover_to = None
        self.feed_age = None      # seconds since the sampled round was published
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
            if isinstance(s.get("signals"), list):
                self.signals = s["signals"][-SIGNALS_KEEP:]
            self.backfilled = int(s.get("backfilled", 0))
            self.recover_from = s.get("recover_from") or None
            self.recover_to = s.get("recover_to") or None
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

    def _backfill(self, missed, until=None, restore=False):
        """
        Replay the windows lost to an outage from real candles.

        Losing connectivity for an hour would otherwise punch a hole in the
        scorecard, and the whole point of the scorecard is a continuous record.
        The candles themselves still exist, so the missed windows are replayed
        here: signals are recomputed and settled exactly as they would have been
        live. Individual alerts are NOT re-sent — a five-minute signal is
        worthless once it is minutes old and acting on one would be a mistake —
        but a single summary of everything that happened during the outage IS
        sent, so nothing silently disappears from view. Replayed results are
        counted separately so the record stays honest about which outcomes came
        from alerts actually received.
        """
        kl = self._fetch_klines(missed + BREAKOUT_HISTORY + 5)
        if not kl:
            return False
        start = next((i for i, (t, _) in enumerate(kl) if t > self.last_window), None)
        if start is None or start == 0:
            return False          # our last window is not inside this range
        windows = [(t, c) for t, c in kl[start:] if until is None or t <= until]
        if not windows:
            return False
        # A short gap must be SCORED without disturbing the live series. These
        # candles come from a different feed than the live sampler, and splicing
        # one into the other fabricates a move the size of the gap between the
        # two feeds. Scoring is safe either way: a replayed window's reference
        # and settle price both come from the SAME fetched series, so the
        # direction it settles on is right whatever the offset.
        snapshot = (list(self.closes), self.last_window)
        self.closes = [c for _, c in kl[:start]][-BREAKOUT_HISTORY:]
        n = 0
        for t, c in windows:
            # Replayed windows log their signals into self.signals with
            # told=False, so the catch-up below is just a flush of that queue.
            self._on_window_close(t, c, replay=True)
            n += 1
        if restore:
            self.closes, self.last_window = snapshot
            self.pending = None   # its settling candle never arrived, and never will
        self.backfilled += n
        log.info("Breakout: backfilled %d missed windows from real candles "
                 "(scorecard stays continuous).", n)
        hours = missed * GRANULARITY / 3600
        head = (f"📡 <b>دوباره وصل شدم</b>\n"
                f"{hours:.1f} ساعت قطع بودم ({missed} پنجره) — "
                f"{n} پنجره بازپخش و امتیازدهی شد.\n")
        if not self.flush_untold(head):
            if not self.untold():
                send_message(self.chat_id, head + "\nدر این مدت هیچ سیگنالی نبود.")
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
        # The loop wakes just after a boundary and closes `(now//G - 1)*G`, so
        # last_window trails `now` by two windows even in perfect health and
        # `missed` reads 1 with nothing lost at all. Only the excess is real.
        skipped = missed - 1
        if skipped <= 0:
            return False                      # healthy — say nothing
        # The window about to be processed normally is not part of the gap.
        end = int(now // GRANULARITY * GRANULARITY) - 2 * GRANULARITY

        if skipped <= GAP_TOLERANCE:
            # Short enough that the levels are still meaningful, so the close
            # series is kept — but the windows are still SCORED and reported.
            # A hole in the record is a hole whatever its size.
            if not self._backfill(skipped, until=end, restore=True):
                self._remember_gap(end)
            return False

        log.warning("Breakout: %d windows missing (%.1f hours offline).",
                    skipped, skipped * GRANULARITY / 3600)
        self.pending = None       # the candle that would have settled it never came
        self.gap_note = (skipped, now)
        if self._backfill(missed):
            self.recover_from = self.recover_to = None
            return False          # history rebuilt AND scored; nothing else to do
        # Could not reach the candles right now — which at startup is the NORMAL
        # case, because the process comes up before the phone's network does.
        # Remember the hole: _seed() is about to move last_window to the present
        # and erase the only other record of it. Seven hours went unreported
        # exactly this way.
        self._remember_gap(end)
        self.closes = []          # could not recover the candles — start clean
        return True

    def _remember_gap(self, end):
        """Park an unrecovered gap so the loop can try again on a live network."""
        self.recover_from, self.recover_to = self.last_window, end
        log.warning("Breakout: backfill failed; will retry %s .. %s",
                    self.recover_from, self.recover_to)

    def _retry_recovery(self):
        """
        Try again to replay an outage whose first backfill attempt failed.

        Called from the loop, where the network is demonstrably working — the
        loop only reaches it after a successful price read. Without this, a
        single failed fetch in the first second of the process costs every
        window of the outage, with no error and no second chance. Seven hours
        vanished exactly that way.
        """
        if not self.recover_from:
            return
        skipped = int((self.recover_to - self.recover_from) // GRANULARITY)
        if skipped <= 0:
            self.recover_from = self.recover_to = None
            return
        if skipped + BREAKOUT_HISTORY + 5 > 1000:
            hours = skipped * GRANULARITY / 3600
            send_message(self.chat_id,
                         f"\u26a0\ufe0f <b>{hours:.0f} \u0633\u0627\u0639\u062a \u0642\u0637\u0639\u06cc "
                         "\u0642\u0627\u0628\u0644\u0650 \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc \u0646\u06cc\u0633\u062a</b>")
            self.recover_from = self.recover_to = None
            self._save()
            return
        saved, self.last_window = self.last_window, self.recover_from
        ok = self._backfill(skipped, until=self.recover_to, restore=True)
        self.last_window = saved
        if ok:
            log.info("Breakout: recovered the outage on retry.")
            self.recover_from = self.recover_to = None
            self._save()

    def _save(self):
        try:
            with open(self.STATE_FILE, "w") as f:
                json.dump({"closes": self.closes[-BREAKOUT_HISTORY:],
                           "last_window": self.last_window,
                           "pending": self.pending,
                           "score": self.score,
                           "history": self.history[-HISTORY_KEEP:],
                           "signals": self.signals[-SIGNALS_KEEP:],
                           "backfilled": self.backfilled,
                           "recover_from": self.recover_from,
                           "recover_to": self.recover_to}, f)
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
        # Rule 1 can be COMPUTED from 22 closes, but the rule that was MEASURED —
        # the one whose 56% is printed on every alert — includes the volatility
        # filter and the depth tier, and both need 101 closes for 100 returns.
        # This guard used to stop at BREAKOUT_LOOKBACK + 2, i.e. the bare minimum
        # to take a max and a min, so after any rebuild the bot decided it had
        # "enough" history at 22 and stopped seeding. It then spent the next eight
        # hours firing an unfiltered, undepthed rule under the measured rule's
        # name. The threshold has to be what the rule needs, not what it tolerates.
        if len(self.closes) >= BREAKOUT_FULL_HISTORY:
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
                seeded_window = (int(closed[-1][0]) // 1000
                                 // GRANULARITY * GRANULARITY)
                # Only ever forward. Seeding used to run exclusively on a series
                # too short to have a meaningful last_window, so assigning it was
                # safe; now that it also runs at 22-100 closes it can meet a
                # restored state that is AHEAD of Binance's last closed kline.
                # Moving the marker back would make the loop re-process windows
                # it has already alerted and scored — the same signal twice.
                self.last_window = max(self.last_window, seeded_window)
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
        bets = {h[2] for h in hits}
        if len(bets) == 1:
            bet = bets.pop()
            head = ("🟢 <b>بالا (Up)</b>" if bet == "up" else "🔴 <b>پایین (Down)</b>")
            agree = (f"  ✅ {len(hits)} استراتژی هم‌نظر" if len(hits) > 1 else "")
        else:
            head = "⚠️ <b>اختلافِ نظر — رد کن</b>"
            agree = ""
        lines = "\n".join(
            f"• <b>{name}</b> ({acc}) → {'🟢' if b == 'up' else '🔴'}\n  <i>{detail}</i>"
            for name, acc, b, detail in hits)
        warn = ""
        if self.feed_used == "binance-fallback":
            warn += "\n⚠️ فید: Binance (Chainlink در دسترس نبود)"
        if self.seeded_from and len(self.closes) < BREAKOUT_HISTORY:
            warn += "\n⚠️ تاریخچه هنوز کامل نیست"
        # This alert belongs to one track: the user's AABA rule fires on its own
        # cadence, so showing the statistical rules' streak next to it would put
        # the martingale on the wrong rung.
        mine = all(h[0][0] in MINE_RULES for h in hits)
        golden = any(h[0].startswith("🏆") for h in hits)
        prev = self._prev_result_line(window_start)
        text = (
            prev
            + ("🏆 <b>ورودِ طلایی (۵۸٪)</b>\n" if golden else "")
            + f"🎯 {head}{agree}\n\n"
            f"{lines}\n\n"
            f"⏱ <b>{o_et:%I:%M}-{e_et:%I:%M%p} ET</b>  ({o_et:%b %d})  ·  "
            f"+{lag:.0f}s\n"
            f"💵 ${price:,.2f}\n"
            f"💰 مبلغ: <b>${self.suggested_stake(mine):,.0f}</b> ({_stake_label()})\n"
            f"⚡️ زیرِ ۵۵ سنت وارد شو، وگرنه رد کن."
            f"{warn}"
            + self.history_line(mine)
        )
        log.info("ALERT: %s", " | ".join(f"{n}->{b}" for n, _, b, _ in hits))
        ok = send_message(self.chat_id, text)
        # Mark the just-logged signal as delivered — or leave it queued, so a
        # send that failed (no network, Telegram down) is reported later rather
        # than vanishing.
        if self.signals and self.signals[-1]["t"] == window_start:
            self.signals[-1]["told"] = ok
        if not ok:
            log.warning("Alert not delivered; queued for the catch-up report.")

    @staticmethod
    def _side_label(side):
        return "🟢 بالا" if side == "up" else "🔴 پایین"

    def suggested_stake(self, mine=None):
        """What to bet on this signal, given the staking mode in force."""
        if STAKE_MODE != "martingale":
            return STAKE_BASE
        rung = self.loss_streak(mine) % LADDER_RUNGS if LADDER_RUNGS else 0
        return STAKE_BASE * 2 ** rung

    def check_report(self, count=10):
        """
        The last settled windows as reference -> settlement, for comparing with
        Polymarket's own "Price to beat" and "Final price".

        Built because a window this bot scored as a win settled DOWN on the
        market. Arguing about which is right is pointless; putting the two pairs
        of numbers side by side answers it in one glance, and if they disagree
        the price feed is the thing to fix, not the rules.
        """
        rows = [r for r in self.signals
                if r.get("ref") is not None][-count:]
        if not rows:
            return ("هنوز پنجرهٔ تسویه‌شده‌ای با قیمت ثبت نشده. "
                    "بعد از چند سیگنالِ بعدی دوباره بزن.")
        out = ["🔎 <b>قیمت‌هایی که من دیدم</b>",
               "<i>با Price to beat و Final price در پلی‌مارکت مقایسه کن.</i>", ""]
        for r in rows:
            mark = ("⚪️" if r.get("void") else "✅" if r["won"] else "❌")
            # The full range, labelled exactly the way Polymarket labels it —
            # a bare "12:35" was read as the 12:30-12:35 market and the two
            # screenshots compared different windows.
            out.append(f"{mark} <b>{et_time(r['t']):%I:%M}-"
                       f"{et_time(r['t'] + GRANULARITY):%I:%M%p ET}</b> "
                       f"{'🟢' if r['bet'] == 'up' else '🔴'}\n"
                       f"   Price to beat <code>{r['ref']:,.2f}</code>\n"
                       f"   Final price   <code>{r['settle']:,.2f}</code>  "
                       f"({r['delta']:+,.2f})")
        out.append("\n<i>اگر این عددها با پلی‌مارکت فرق دارند، مشکل از فیدِ "
                   "قیمت است نه از قانون‌ها — همان را بگو تا عوضش کنم.</i>")
        return "\n".join(out)

    def _deadband(self):
        """
        Smallest move worth calling a result, in dollars.

        Scaled to the current regime rather than fixed: $2 is nothing in a busy
        hour and is most of a candle at 4am. Falls back to a small absolute
        floor until there is enough history to measure the regime.
        """
        mv = [abs(m) for m in _moves(self.closes[-101:])] if len(self.closes) > 20 else []
        if not mv:
            return 0.0
        med = sorted(mv)[len(mv) // 2]
        return max(med * SETTLE_DEADBAND, SETTLE_FLOOR)

    def _prev_result_line(self, this_window):
        """
        How the last resolved signal went, with its time.

        Read from the signal log rather than from the bet that just settled: a
        signal fires at T and settles at T+1, and if T+1 is quiet there is no
        alert to carry the result, so it would never be seen. Walking the log
        back means the answer is always the genuinely last one — and the time
        stamp makes clear it is the past, not the bet being offered now.
        """
        for row in reversed(self.signals):
            if row["t"] == this_window:
                continue
            if row["won"] is None and not row.get("void"):
                continue
            if row.get("void"):
                # Say it rather than skip it: silence here reads as "the last
                # signal never resolved", which is a different and worse story.
                d = row.get("delta")
                near = (f"  <i>(قیمت فقط {abs(d):,.2f}$ "
                        f"{'بالا' if d > 0 else 'پایین'} رفت — زیرِ آستانه)</i>"
                        if d is not None else "")
                return (f"<b>سیگنالِ قبلی</b> ({et_time(row['t']):%I:%M%p}): "
                        f"⚪️ خیلی نزدیک — بی‌نتیجه{near}\n")
            mark = "✅ برد" if row["won"] else "❌ باخت"
            # The numbers go in the message: a result you cannot check is a
            # result you cannot trust, and one four-cent "win" cost more
            # confidence than every correct call had built.
            #
            # But NEVER as a signed dollar figure next to the word "won". This
            # is the price MOVE, not money, and "برد (-$28.96)" was read as
            # "won, minus twenty-nine dollars" — a losing trade announced as a
            # win. It is spelled out instead: which way the price went, and by
            # how much, with no sign to misread.
            d = row.get("delta")
            amount = (f"  <i>(قیمت {abs(d):,.2f}$ "
                      f"{'بالا' if d > 0 else 'پایین'} رفت)</i>"
                      if d is not None else "")
            # Both prices, so the line can be held against Polymarket's own
            # "Price to beat" and "Final price" without trusting anything here.
            pair = ""
            if row.get("ref") is not None:
                pair = (f"\n   <i>{row['ref']:,.2f} → {row['settle']:,.2f}</i>")
            return (f"<b>سیگنالِ قبلی</b> ({et_time(row['t']):%I:%M%p}): "
                    f"{mark}{amount}{pair}\n")
        return ""

    def _settle(self, price):
        """
        Grade the previous signal against the close that just arrived.

        Polymarket settles a window by comparing its final price to the price at
        its start, so the bet recorded at the last close is settled by this one.

        Moves too small to be real are NOT graded. A window once closed four
        cents above its reference and was recorded as a win — on a typical
        5-minute move of about $52, four cents is 0.08% of a normal candle, far
        inside the slack between when this bot samples the oracle (boundary + a
        couple of seconds) and whichever round the market settles against. The
        arithmetic was right and the answer was meaningless. Anything under
        SETTLE_DEADBAND of the recent median move is now a push, which costs
        about 1.5% of windows and buys a scorecard that can be trusted.
        """
        p = self.pending
        self.pending = None
        if not p:
            return None
        ref = p["ref"]
        delta = price - ref
        if abs(delta) <= self._deadband():
            self.score["void"] += 1
            for row in reversed(self.signals):
                if row["t"] == p["window"]:
                    row["void"] = True
                    row["delta"] = delta
                    row["ref"], row["settle"] = ref, price
                    break
            log.info("Settled: VOID (%.2f -> %.2f, delta %+.2f is inside the "
                     "dead band)", ref, price, delta)
            return None
        won = (p["bet"] == "up") == (price > ref)
        self.score["n"] += 1
        self.score["wins"] += 1 if won else 0
        rules = p.get("rules", [])
        # "Whose" signal this was: the user's AABA rule fires alone often enough
        # that mixing it into one number would hide both its weakness and the
        # other rules' strength.
        mine = self._is_mine(rules)
        for row in reversed(self.signals):   # the row opened for this very bet
            if row["t"] == p["window"]:
                row["won"] = won
                row["delta"] = delta
                row["ref"], row["settle"] = ref, price
                break
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

    @staticmethod
    def _is_mine(rules):
        """True when every rule behind a signal is one of the user's own."""
        return (all(any(r.startswith(m) for m in MINE_RULES) for r in rules)
                if rules else False)

    # -- the signal log: what fired, what it did, and whether you were told ----
    @staticmethod
    def _signal_lines(rows):
        """
        Two lines per signal: outcome/time/side, then the strategies by name.

        Bare rule numbers were unreadable — "(۱,۲,۵)" says nothing about what
        fired — so each row spells the strategies out the way the live alert
        does. Rows written before this change only stored numbers, and those
        still render, just without the name.
        """
        out = []
        for r in rows:
            if r.get("void"):
                mark = "⚪️ بی‌نتیجه"
            elif r.get("unscored"):
                # A signal recovered from a gap, read-only. Its outcome is NOT
                # shown: settling it would mean comparing two closes from the
                # fetched feed, and on a window that moves a couple of dollars
                # the two feeds routinely disagree on the sign. "Open" would be
                # a lie — it is finished, we simply decline to grade it.
                mark = "📡 نرسیده"
            elif r["won"] is None:
                mark = "⏳ باز"
            else:
                mark = "✅ برد" if r["won"] else "❌ باخت"
            side = "🟢 بالا" if r["bet"] == "up" else "🔴 پایین"
            names = r.get("rules") or []
            out.append(f"{mark}  ·  <b>{et_time(r['t']):%I:%M%p}</b>  ·  {side}\n"
                       f"   <i>{' · '.join(names)}</i>")
        return out

    @classmethod
    def _chunks(cls, head, rows, foot="", per=12):
        """
        Split a signal list into messages Telegram will accept.

        Now that every row names its strategies, a long list runs past the
        4096-character limit and the whole message is silently rejected — which
        is exactly the "it said nothing" failure this feature exists to end.
        """
        out = []
        for i in range(0, len(rows), per):
            part = cls._signal_lines(rows[i:i + per])
            more = (f"\n<i>(بخش {i // per + 1} از "
                    f"{(len(rows) - 1) // per + 1})</i>" if len(rows) > per else "")
            out.append((head if i == 0 else "") + "\n".join(part) + more
                       + (foot if i + per >= len(rows) else ""))
        return out

    def _send_rows(self, head, rows, foot=""):
        """Send a chunked report. True only if every part got through."""
        ok = True
        for part in self._chunks(head, rows, foot):
            ok = send_message(self.chat_id, part) and ok
        return ok

    def scan_recent(self, hours=6):
        """
        Re-run the rules over the last `hours` of real candles, read-only.

        Nothing is scored or stored: this answers "what would you have sent me
        today?" without touching the scorecard, so it can be run as often as
        wanted. Each signal is settled against the close that actually followed
        it, exactly as Polymarket would.
        """
        want = max(1, int(hours * 3600 // GRANULARITY))
        kl = self._fetch_klines(want + BREAKOUT_HISTORY + 5)
        if len(kl) < BREAKOUT_HISTORY + 2:
            return None, 0, {}
        rows = []
        first = max(BREAKOUT_HISTORY, len(kl) - want)
        # "No rule-1 signal in six hours — how?" is a fair question, and the
        # answer is almost always that the level WAS broken and the volatility
        # filter threw the break away. Count both so the report can say so
        # instead of looking broken.
        stats = {"breaks": 0, "filtered": 0}
        for i in range(first, len(kl)):
            closes = [c for _, c in kl[:i + 1]]
            if breakout_signal(closes, vol_filter=False):
                stats["breaks"] += 1
                if not breakout_signal(closes):
                    stats["filtered"] += 1
            hits = self.evaluate(closes)
            if not hits:
                continue
            bets = {h[2] for h in hits}
            if len(bets) != 1:
                continue          # rules disagreed; no bet was implied
            bet, ref = bets.pop(), kl[i][1]
            nxt = kl[i + 1][1] if i + 1 < len(kl) else None
            row = {"t": kl[i][0] + GRANULARITY, "bet": bet,
                   "rules": [h[0] for h in hits], "won": None, "told": True}
            if nxt is not None:
                if nxt == ref:
                    row["void"] = True
                else:
                    row["won"] = (bet == "up") == (nxt > ref)
            rows.append(row)
        seen = [c for _, c in kl[first:]]
        stats["hi"], stats["lo"] = max(seen), min(seen)
        stats["range"] = (stats["hi"] - stats["lo"]) / stats["lo"] * 100
        return rows, len(kl) - first, stats

    def scan_report(self, hours=6):
        """/last — send the read-only scan of the recent past to Telegram."""
        rows, windows, stats = self.scan_recent(hours)
        if rows is None:
            return send_message(self.chat_id,
                                "❌ کندل‌های گذشته را نتوانستم بگیرم — نت یا "
                                "دسترسی به Binance مشکل دارد. بعداً دوباره امتحان کن.")
        # Why the engine stayed quiet, in numbers — expected ~14 signals per 6h,
        # so a much smaller count needs an explanation, not a shrug.
        why = (f"📐 دامنهٔ قیمت: ${stats['lo']:,.0f} تا ${stats['hi']:,.0f} "
               f"({stats['range']:.2f}%)\n"
               f"🚧 سقف/کفِ ۲۰ کندلی <b>{stats['breaks']}</b> بار شکسته شد"
               + (f" — ولی <b>{stats['filtered']}</b> تا را فیلترِ نوسان رد کرد "
                  "(نوسان کم بود)" if stats["filtered"] else "") + "\n")
        if not rows:
            return send_message(
                self.chat_id,
                f"🔍 <b>{hours} ساعتِ گذشته</b> ({windows} پنجره)\n\n" + why +
                "\nهیچ سیگنالی در این بازه نبود — قانون‌ها فقط روی حرکت‌های "
                "غیرعادی فعال می‌شوند و سکوت طبیعی است.")
        n = sum(1 for r in rows if r["won"] is not None)
        w = sum(1 for r in rows if r["won"])
        head = (f"🔍 <b>سیگنال‌های {hours} ساعتِ گذشته</b> — تست\n"
                f"{windows} پنجره بررسی شد  ·  <b>{len(rows)}</b> سیگنال"
                + (f"  ·  {w}/{n} برد" if n else "") + "\n" + why + "\n")
        foot = ("\n\n<i>این‌ها گذشته‌اند و امتیازی هم ثبت نشد — فقط برای اینکه "
                "ببینی موتور چه می‌دیده. قیمت‌ها از Binance است، پس ممکن است "
                "یکی‌دو مورد با Chainlink فرق کند.</i>")
        return self._send_rows(head, rows, foot)

    def untold(self):
        """
        Settled signals the user was never actually shown.

        Two ways a signal ends up here: it fired while the phone was offline and
        was recovered by the replay, or the Telegram send itself failed. Both are
        "you did not see this", and both must eventually be reported — that was
        the whole complaint that led to this queue existing.
        """
        return [r for r in self.signals
                if not r.get("told") and (r["won"] is not None or r.get("void"))]

    def flush_untold(self, head=None):
        """
        Report everything queued, then mark it reported — but only if the send
        actually succeeded, so a failed catch-up is retried instead of lost.
        """
        rows = self.untold()
        if not rows:
            return False
        # EVERY row. Capping at fifteen while marking ALL of them told meant a
        # seven-hour outage reported a fraction of itself and silently discarded
        # the rest. _send_rows already splits into as many messages as needed.
        shown = rows
        w = sum(1 for r in rows if r["won"])
        n = sum(1 for r in rows if r["won"] is not None)
        head = ((head or "📡 <b>سیگنال‌های جاافتاده</b>\n")
                + f"\n📋 <b>{len(rows)} سیگنال</b>"
                + (f" — {w}/{n} برد" if n else "")
                + (f"  (۱۵ موردِ آخر نشان داده می‌شود)"
                   if len(rows) > len(shown) else "") + ":\n\n")
        foot = ("\n\n<i>ساعت‌ها ET است و همه مربوط به گذشته‌اند — "
                "برای ورود نیست، فقط برای آمار.</i>")
        if not self._send_rows(head, shown, foot):
            log.warning("Catch-up report could not be delivered; will retry.")
            return False
        for r in rows:
            r["told"] = True
        self._save()
        return True

    def missed_report(self, count=HISTORY_SHOW):
        """/missed — the last signals with times and outcomes, always available."""
        rows = self.signals[-count:]
        if not rows:
            return send_message(self.chat_id,
                                "📋 <b>سابقهٔ سیگنال‌ها</b>\n\nهنوز سیگنالی ثبت نشده.")
        n = sum(1 for r in rows if r["won"] is not None)
        w = sum(1 for r in rows if r["won"])
        never = sum(1 for r in self.signals if not r.get("told"))
        head = (f"📋 <b>{len(rows)} سیگنالِ اخیر</b> (قدیمی → جدید)\n"
                + (f"{w}/{n} برد\n" if n else "") + "\n")
        foot = (("\n\n📡 در بالا یعنی پیامش به تلگرام نرسیده بود "
                 f"({never} مورد)." if never else "")
                + "\n<i>ساعت‌ها ET، شروعِ همان پنجره.</i>")
        # Mark the ones that never reached Telegram, so "did I miss anything?"
        # has a visible answer instead of needing to be asked again.
        marked = [dict(r, bet=r["bet"]) for r in rows]
        for r in marked:
            if not r.get("told"):
                r["rules"] = list(r.get("rules") or []) + ["📡 پیامش نرسیده بود"]
        return self._send_rows(head, marked, foot)

    def _track(self, mine):
        """History for one track: the user's AABA rule, or the statistical ones."""
        return [h for h in self.history if h.get("mine", False) == mine]

    def loss_streak(self, mine=None):
        """
        Losses at the tail — i.e. which martingale rung the next entry sits on.

        Restricted to one track when `mine` is given: a losing run on the AABA
        rule says nothing about the stake for a rule-1 signal, so mixing them
        would put you on the wrong rung.
        """
        hist = self.history if mine is None else self._track(mine)
        k = 0
        for h in reversed(hist):
            if h["won"]:
                break
            k += 1
        return k

    def history_line(self, mine=None):
        """
        Recent outcomes for the track this alert belongs to, oldest first.

        The tail streak is spelled out because that — not the overall hit rate —
        is what sets the next stake under any martingale.
        """
        hist = self.history if mine is None else self._track(mine)
        if not hist:
            return ""
        recent = hist[-HISTORY_SHOW:]
        seq = "".join("✅" if h["won"] else "❌" for h in recent)
        w = sum(1 for h in recent if h["won"])
        # Totals come from the signal log, which keeps far more rows than the
        # ✅❌ strip — the old "کل" was quietly capped at 40 and read as lifetime.
        pool = [r for r in self.signals if r["won"] is not None
                and (mine is None or r.get("mine", False) == mine)] or hist
        tot = len(pool)
        won = sum(1 for r in pool if r["won"])
        label = ("AABA" if mine else "آماری") if mine is not None else "همه"
        # Both ends are labelled: a bare run of 20 ticks gives no clue which end
        # is the oldest, and reading it backwards inverts the streak that decides
        # the next stake. Chunked in fives so the eye can count them.
        seq = " ".join(seq[i:i + 5] for i in range(0, len(seq), 5))
        out = (f"\n\n📋 <b>{label}</b> — {len(recent)} سیگنالِ اخیر:\n"
               f"قدیمی‌ترین ⬅️ {seq} ➡️ آخرین\n"
               f"<b>{w}</b>/{len(recent)}  ·  کل: {won}/{tot} "
               f"({won / tot * 100:.0f}%)")
        k = self.loss_streak(mine)
        # Report the rung on the ladder actually being played, plus how many
        # busts that streak already contains — a run of 7 losses is not "rung 8",
        # it is two blown cycles and a rung 2.
        rung = k % LADDER_RUNGS + 1 if LADDER_RUNGS else k + 1
        busts = k // LADDER_RUNGS if LADDER_RUNGS else 0
        dot = "🔴" if rung >= LADDER_RUNGS else "🟡" if rung > 1 else "🟢"
        out += f"\n{dot} پلهٔ <b>{rung}</b> از {LADDER_RUNGS}"
        if busts:
            out += (f"  ·  ⚠️ {busts} بار سقفِ پله خورده "
                    f"({k} باختِ پیاپی)")
        return out

    def why_report(self):
        """
        Why is there no signal right now — with the distance to each trigger.

        "No signal" and "broken" look identical from the outside, and the only
        way anyone could tell them apart was to send me the log. This answers it
        on the phone: for every rule, how far price is from firing it. A rule
        that is $6 away is a quiet market; a rule that reports nonsense is a bug.

        The volatility ratio gets its own line because it is the one gate that
        rejects a break silently — twice in one evening, on breaks that had
        genuinely happened — and nothing in the log says so.
        """
        cl = self.closes
        n = len(cl)
        L = [f"🔍 <b>چرا سیگنالی نیست؟</b>\n",
             f"کندل در حافظه: <b>{n}</b>  ·  آخرین قیمت: <b>${cl[-1]:,.2f}</b>"
             if n else "هنوز هیچ کندلی نیست."]
        if n < BREAKOUT_LOOKBACK + 2:
            L.append("تاریخچه برای هیچ قانونی کافی نیست.")
            return "\n".join(L)

        win = cl[-(BREAKOUT_LOOKBACK + 1):-1]
        hi, lo, cur = max(win), min(win), cl[-1]
        L.append(f"\n<b>۱) شکستِ ۲۰ کندلی</b>")
        L.append(f"  سقف ${hi:,.2f} · کف ${lo:,.2f}")
        if cur > hi or cur < lo:
            L.append(f"  ✅ شکست رخ داده ({'بالای سقف' if cur > hi else 'زیرِ کف'})")
        else:
            L.append(f"  ⏳ تا شکست: <b>${min(hi - cur, cur - lo):,.2f}</b> "
                     f"(بالا ${hi - cur:,.2f} · پایین ${cur - lo:,.2f})")
        if BREAKOUT_VOL_FILTER:
            if n >= 101:
                rets = [(cl[i] - cl[i - 1]) / cl[i - 1]
                        for i in range(len(cl) - 100, len(cl)) if cl[i - 1]]
                slow = _stdev(rets)
                ratio = _stdev(rets[-20:]) / slow if slow > 0 else 0.0
                ok = ratio >= BREAKOUT_VOL_TH
                L.append(f"  فیلترِ نوسان: <b>{ratio:.2f}</b> "
                         f"(باید ≥ {BREAKOUT_VOL_TH:.2f}) "
                         f"{'✅ باز' if ok else '⛔️ بسته — شکست هم باشد رد می‌شود'}")
            else:
                L.append(f"  فیلترِ نوسان: ⏳ به ۱۰۱ کندل نیاز دارد ({n} هست)")

        mv = _moves(cl)
        if n >= 104:
            ref = sorted(abs(m) for m in mv[-101:-1])
            med = ref[len(ref) // 2]
            last = mv[-1]
            same3 = (len(mv) >= 3 and all(m != 0 for m in mv[-3:])
                     and (mv[-3] > 0) == (mv[-2] > 0) == (mv[-1] > 0))
            L.append(f"\n<b>۲) حرکتِ بزرگ پس از ۳ هم‌جهت</b>")
            L.append(f"  ۳ حرکتِ هم‌جهت: {'✅' if same3 else '❌'}  ·  "
                     f"حرکتِ آخر ${abs(last):,.2f} از ${RULE2_MULT * med:,.2f} لازم")
        # run length, whatever it is
        run, up = 0, None
        for m in reversed(mv):
            if m == 0:
                break
            if up is None:
                up = m > 0
            elif (m > 0) != up:
                break
            run += 1
        L.append(f"\n<b>۳) رشتهٔ هم‌جهت</b>")
        L.append(f"  رشتهٔ فعلی: <b>{run}</b> از {RULE3_RUN} لازم")
        if n >= 101 + RULE5_SPAN:
            ref = sorted(abs(m) for m in _moves(cl[-101:]))
            med = ref[len(ref) // 2]
            net = cl[-1] - cl[-1 - RULE5_SPAN]
            t = abs(net) / med if med > 0 else 0
            L.append(f"\n<b>۵) کشیدگی در {RULE5_SPAN} کندل</b>")
            L.append(f"  حرکتِ خالص ${abs(net):,.2f} = <b>{t:.1f}×</b> "
                     f"از {RULE5_MULT:.1f}× لازم")
        if RULE8_ENABLED and n >= 101 + RULE8_MA:
            avg = sum(cl[-RULE8_MA:]) / RULE8_MA
            ref = sorted(abs(m) for m in _moves(cl[-101:]))
            med = ref[len(ref) // 2]
            t = abs(cl[-1] - avg) / med if med > 0 else 0
            L.append(f"\n<b>۸) فاصله از میانگینِ {RULE8_MA} کندلی</b>")
            L.append(f"  ${abs(cl[-1] - avg):,.2f} = <b>{t:.1f}×</b> "
                     f"از {RULE8_MULT:.1f}× لازم")
        hits = self.evaluate(cl)
        # Kept out of the f-string: a newline inside an f-string expression is
        # only legal from Python 3.12, and Termux ships whatever it ships.
        verdict = (f"✅ همین حالا {len(hits)} قانون فعال است" if hits
                   else "❌ هیچ قانونی فعال نیست — بازار آرام است")
        L.append("\n" + verdict)
        return "\n".join(L)

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
                 f"کندل‌های در حافظه: <b>{len(self.closes)}</b> از {BREAKOUT_HISTORY}",]
        if len(self.closes) < BREAKOUT_FULL_HISTORY:
            short = BREAKOUT_FULL_HISTORY - len(self.closes)
            lines.append(
                f"⚠️ <b>زیرِ {BREAKOUT_FULL_HISTORY} کندل</b> — فیلترِ نوسان و "
                f"عمقِ شکست هیچ‌کدام کار نمی‌کنند. {short} کندلِ دیگر لازم است "
                f"(≈{short * GRANULARITY / 3600:.1f} ساعت اگر تاریخچه از "
                f"بایننس نیاید). سیگنال‌های قانونِ ۱ تا آن موقع ضعیف‌ترند.")
        if self.seeded_from:
            lines.append(f"تاریخچهٔ اولیه از: <b>{self.seeded_from}</b>")
        lines += [
                 f"کلِ پنجره‌های پردازش‌شده: <b>{self.windows_seen}</b>",
                 f"فید: <b>{self.feed_used}</b>",
                 f"نسخهٔ کد: <b>{RUNNING_VERSION}</b>  ·  سابقه: {HISTORY_SHOW}"]
        if code_version() != RUNNING_VERSION:
            lines.append(f"♻️ <b>روی دیسک نسخهٔ تازه‌تری هست</b> "
                         f"({code_version()}) — /update بزن تا اجرا شود.")
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
        active = ["۱", "۲" if RULE2_ENABLED else "", "۳" if RULE3_ENABLED else "",
                  "۴" if RULE4_ENABLED else "", "۵" if RULE5_ENABLED else "",
                  "۶" if RULE6_ENABLED else "", "۷" if RULE7_ENABLED else ""]
        lines.append("قانون‌های فعال: <b>" + "، ".join(a for a in active if a) + "</b>"
                     + ("" if RULE4_ENABLED else "  (۴ خاموش است)"))
        if self.untold():
            lines.append(f"📡 <b>{len(self.untold())}</b> سیگنالِ گزارش‌نشده در صف — /missed")
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
            lines += block("📈 استراتژی‌های آماری (۱، ۲، ۳، ۵، ۶، ۷)",
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
        # Rule 1 is evaluated now but decided LAST: whether a shallow break is
        # dropped or merely flagged depends on whether anything else fired, and
        # that is not known until the other rules have run.
        sig = breakout_signal(closes)
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
        if RULE6_ENABLED:
            s6 = rule6_signal(closes)
            if s6:
                hits.append(("۶) AABA در اشباعِ خرید", "۵۷٪", s6["bet"],
                             f"الگوی AABA کامل شد و RSI={s6['rsi']:.0f} — "
                             "نشانهٔ خستگی، نه ادامه"))
        if RULE7_ENABLED:
            s7 = rule7_signal(closes)
            if s7:
                hits.append(("۷) باندِ بولینگر + RSI", "۵۶٪", s7["bet"],
                             f"بسته‌شدن بیرونِ باند (${s7['band']:,.0f}) "
                             f"با RSI={s7['rsi']:.0f}"))
        # Rule 1 last, and first in the list. It goes to the FRONT because the
        # scorecard and the golden tier both read `hits` in order, and rule 1 has
        # always been the opening line of an alert.
        entry = rule1_entry(sig, accompanied=bool(hits))
        if entry:
            hits.insert(0, entry)
        # Rule 8 fills the silence and nothing else. It was measured only on the
        # windows where rules 1-7 say nothing, so letting it speak over them
        # would be claiming an edge that was never tested — and it is the
        # thinnest of the set, so it must never dilute a stronger call.
        if RULE8_ENABLED and not hits:
            s8 = rule8_signal(closes)
            if s8:
                hits.append(("۸) کشیدگی از میانگینِ ۲۰ کندلی", "۵۲٪", s8["bet"],
                             f"قیمت ${abs(s8['gap']):,.0f} از میانگینِ ۲۰ کندلی "
                             f"(${s8['avg']:,.2f}) فاصله دارد = "
                             f"{s8['times']:.1f}× حرکتِ معمول"
                             f"\n  <i>لبهٔ نازک — روی ۱۹٬۶۱۰ نمونه ۵۲٫۴٪، و "
                             f"سربه‌سر ۵۰٪ است</i>"))
        # Quality tier: enough statistical rules pointing the same way, on a
        # genuinely over-extended move. Rule 4 is excluded — it has no edge, so
        # letting it vote would dilute the very thing this tier measures.
        strong = [h for h in hits if not any(h[0].startswith(m) for m in MINE_RULES)]
        if (len(strong) >= GOLDEN_RULES
                and len({h[2] for h in strong}) == 1
                and rule5_signal(closes, mult=GOLDEN_MULT)):
            hits.insert(0, ("🏆 ورودِ طلایی", "۵۸٪ — بهترین ترکیبِ سیستم",
                            strong[0][2],
                            f"{len(strong)} قانونِ هم‌نظر + کشیدگیِ شدید (≥{GOLDEN_MULT:.0f}×)"))
        if RULE4_ENABLED:
            s4 = rule4_signal(closes)
            if s4:
                hits.append(("۴) الگوی AABA", "⚠️ ۴۹٪ — تست‌شده، لبه ندارد",
                             s4["bet"], "دو حرکتِ هم‌جهت، یکی مخالف، بازگشت به جهتِ اول"))
        return hits

    def _prealert(self, boundary, price, stage):
        """
        Staged heads-up before the window closes: warn, then confirm.

        One 30-second warning was not usable — half a minute is not enough to
        open the app and find the market. So the first look comes a minute out
        and the second confirms it, which also fixes the other half of the
        problem: an early signal is not final. Over 28,090 comparisons on
        1-minute data the DIRECTION of an early signal flipped 3 times, but ~13%
        of them vanish before the close, so the first message can only ever mean
        "get ready", never "enter".
        """
        hits = self.evaluate(self.closes + [price])
        bets = {h[2] for h in hits} if hits else set()
        bet = bets.pop() if len(bets) == 1 else None
        left = max(0, int(boundary - time.time()))
        prev = self.pre_bet.get(boundary)
        first = stage == PREALERT_STAGES[0]

        if bet is None:
            # Nothing now. Only worth a message if something was promised.
            if prev:
                self.pre_bet[boundary] = None
                log.info("PRE-ALERT cancelled at %ds", left)
                send_message(self.chat_id,
                             f"❌ <b>لغو شد</b> — پیش‌هشدارِ {self._side_label(prev)} دیگر "
                             f"برقرار نیست ({left} ثانیه مانده).\n"
                             "<i>وارد نشو. حدود ۱۳٪ سیگنال‌های زودهنگام تا "
                             "بسته‌شدنِ کندل از بین می‌روند.</i>")
            return

        self.pre_bet[boundary] = bet
        o_et = et_time(boundary)
        arrow = "🟢 <b>بالا</b>" if bet == "up" else "🔴 <b>پایین</b>"
        names = "\n".join(f"• {n} <i>({acc})</i>" for n, acc, _, _ in hits)
        log.info("PRE-ALERT stage %ds: %s", left, bet)
        if first or prev is None:
            head = (f"⏰ <b>{left} ثانیه تا باز شدنِ پنجره</b>\n"
                    "🟡 <b>آماده باش</b> — هنوز قطعی نیست، وارد نشو.\n")
            foot = f"\n\n<i>{PREALERT_STAGES[-1]} ثانیهٔ دیگر تایید یا لغو می‌کنم.</i>"
        elif prev == bet:
            head = (f"✅ <b>تایید شد</b> — {left} ثانیه تا باز شدن.\n"
                    "الان برو داخلِ حساب و آماده شو.\n")
            foot = "\n\n<i>سیگنالِ نهایی سرِ باز شدنِ پنجره می‌آید.</i>"
        else:
            head = (f"🔄 <b>جهت عوض شد</b> — {left} ثانیه تا باز شدن.\n"
                    f"قبلاً {self._side_label(prev)} بود، حالا:\n")
            foot = "\n\n<i>سیگنالِ نهایی سرِ باز شدنِ پنجره می‌آید.</i>"
        send_message(self.chat_id,
                     head + f"\n{arrow}\n{names}\n\n"
                     f"پنجره: <b>{o_et:%I:%M%p ET}</b>  ·  ${price:,.2f}" + foot)

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

        # A pre-alert that was CONFIRMED and then evaporated used to end in
        # silence. The stages run at 60s and 30s and nothing runs between the
        # last stage and the boundary, so when the signal died in those final
        # seconds the user was left holding "go to your account now" with no
        # follow-up. The bot's own measurement says this happens to about 13% of
        # early signals, so silence is the wrong answer often enough to matter.
        if not replay:
            promised = self.pre_bet.pop(window_start + GRANULARITY, None)
            if promised:
                sides = {h[2] for h in hits} if hits else set()
                actual = sides.pop() if len(sides) == 1 else None
                if actual is None:
                    log.info("PRE-ALERT %s did not survive the close.", promised)
                    send_message(
                        self.chat_id,
                        f"❌ <b>لغو شد</b> — پیش‌هشدارِ "
                        f"{self._side_label(promised)} تا بسته‌شدنِ کندل دوام "
                        "نیاورد.\n<i>وارد نشو. حدود ۱۳٪ سیگنال‌های زودهنگام "
                        "در ثانیه‌های آخر از بین می‌روند.</i>")

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
                rules = [h[0] for h in hits]
                bet = bets.pop()
                self.pending = {"bet": bet, "ref": price,
                                "window": window_start + GRANULARITY,
                                "rules": rules, "ref_age": self.feed_age}
                # Log it before trying to send: if the send fails, or we are
                # replaying an outage, the row is already there waiting to be
                # reported, and nothing depends on Telegram having worked.
                self.signals.append({
                    "t": window_start + GRANULARITY, "bet": bet,
                    "rules": list(rules),
                    "won": None, "mine": self._is_mine(rules),
                    "told": False, "replay": bool(replay)})
                self.signals = self.signals[-SIGNALS_KEEP:]
            if not replay:
                self._alert(hits, price, window_start + GRANULARITY, lag, settled)
        self._save()
        # `settled` is the outcome of the PREVIOUS window's signal, which is what
        # the caller needs when replaying a run of windows in order.
        return hits, settled

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
            # Stamped at the TOP of the pass, before any network call, so the
            # heartbeat means "the loop is turning" and not "the network is up".
            # A network outage is already handled by the retry below; only a
            # wedge should look like a wedge.
            beat("breakout", self.last_window)
            now = time.time()
            ended = (int(now) // GRANULARITY - 1) * GRANULARITY
            if ended <= self.last_window:
                # Wait for the next boundary (+ a small margin so the oracle has
                # published the closing price), rather than busy-polling. When a
                # pre-alert is due first, stop there on the way.
                nxt = (int(now) // GRANULARITY + 1) * GRANULARITY
                # Stop at each pre-alert stage on the way to the boundary. Stages
                # run largest-first, so the "get ready" message lands before the
                # "confirmed" one and there is time to reach the account.
                due = next((s for s in PREALERT_STAGES
                            if (nxt, s) not in self.pre_done and now < nxt - s), None)
                if due is not None:
                    time.sleep(max(0.5, nxt - due - now))
                    self.pre_done.add((nxt, due))
                    # Keep the set from growing forever; only the current
                    # boundary's entries can still matter.
                    self.pre_done = {(b, s) for b, s in self.pre_done if b >= nxt}
                    self.pre_bet = {b: v for b, v in self.pre_bet.items() if b >= nxt}
                    try:
                        p, _, feed = fetch_spot_price()
                        self.feed_used = feed
                        self._prealert(nxt, p, due)
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
                self.feed_age = (time.time() - updated) if updated else None
                self._on_window_close(ended, price, lag)
                # Anything the user was never shown — a send that failed, a
                # window replayed after an outage — goes out now that there is
                # clearly a working connection.
                self._retry_recovery()
                if self.untold():
                    self.flush_untold()
                fail = self.err_count = 0
                self.last_error = ""
            except Exception as exc:  # noqa: BLE001 - keep the 24/7 loop alive
                fail += 1
                self.err_count += 1
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.error("Breakout poll error: %s", exc)
                time.sleep(min(2 ** fail, 60))



# ---------------------------------------------------------------------------
# Polymarket up/down watcher — a separate stream, on its own switch
# ---------------------------------------------------------------------------
class OddsWatcher:
    """
    Report what Polymarket itself is charging for each 5-minute window.

    Kept deliberately apart from the strategy alerts: it is not a signal and
    acting on it is a different bet entirely, so it has its own switch, its own
    message shape and its own record. Off by default; the button turns it on and
    it stays on across restarts.

    While it is on it also stores every window to the same file the standalone
    collector writes, so the summary covers both. Run one or the other, not
    both, or each window lands twice.
    """

    STATE_FILE = os.environ.get("ODDS_ON_FILE", ".odds_on")

    def __init__(self, chat_source):
        self._chat_source = chat_source
        self.on = os.path.exists(self.STATE_FILE)
        self.last = None          # the row awaiting its result
        self.errors = 0
        self.why = ""             # why the last attempt collected nothing
        self.why_detail = ""      # the full diagnosis from that moment
        self.done_for = 0         # boundary already handled this pass

    @property
    def chat_id(self):
        return getattr(self._chat_source, "chat_id", "") or TELEGRAM_CHAT_ID

    def toggle(self):
        self.on = not self.on
        try:
            if self.on:
                open(self.STATE_FILE, "w").close()
            elif os.path.exists(self.STATE_FILE):
                os.remove(self.STATE_FILE)
        except OSError as exc:
            log.warning("odds toggle not persisted: %s", exc)
        log.info("Odds watcher %s", "ON" if self.on else "OFF")
        if self.on:
            return ("📈 <b>جمع‌آوریِ بالا/پایین روشن شد</b>\n"
                    "بی‌صدا ثبت می‌کنم — هیچ پیامی نمی‌فرستم.\n\n"
                    "هر وقت خواستی: دکمهٔ <b>📈 بالا/پایین</b> یا "
                    "<code>/odds 6</code> برای ۶ ساعتِ گذشته.")
        return ("📉 <b>جمع‌آوری خاموش شد</b> — دادهٔ ثبت‌شده سرِ جایش می‌ماند.")

    def self_test(self, hours=3):
        """
        Grade the collection itself, so the user is not the one finding bugs.

        Three things can go wrong and each is invisible in a normal report: a
        window silently missing, a price that is really an API default, and a
        sample taken so late it no longer represents the open. All three are
        checked here and the verdict is stated plainly.
        """
        import polymarket_collector as pmc
        cut = time.time() // GRANULARITY * GRANULARITY - hours * 3600
        rows = sorted((r for r in pmc.load_all() if r["t"] >= cut),
                      key=lambda r: r["t"])
        if len(rows) < 2:
            return (f"🧪 <b>تستِ جمع‌آوری</b>\n\nهنوز داده‌ای برای سنجیدن نیست "
                    f"({len(rows)} ردیف در {hours} ساعت).")
        first, last = rows[0]["t"], rows[-1]["t"]
        want = int((last - first) / GRANULARITY) + 1
        have = len({r["t"] for r in rows})
        missing = sorted({first + GRANULARITY * i for i in range(want)}
                         - {r["t"] for r in rows})
        flat = [r for r in rows if abs(r["up"] - 0.5) < 1e-9
                and abs(r["down"] - 0.5) < 1e-9]
        late = [r for r in rows if (r.get("lag") or 0) > 5]
        nosum = [r for r in rows if abs(r["up"] + r["down"] - 1) > 0.02]
        unresolved = [r for r in rows if not r.get("winner")]

        def line(ok, label, detail):
            return f"{'✅' if ok else '❌'} {label}: {detail}"

        out = [f"🧪 <b>تستِ جمع‌آوری — {hours} ساعتِ گذشته</b>", ""]
        out.append(line(not missing, "پوشش",
                        f"{have}/{want} پنجره"
                        + (f" · {len(missing)} جاافتاده" if missing else " · کامل")))
        out.append(line(not flat, "قیمت‌ها",
                        f"{len(flat)} ردیفِ دقیقاً ۵۰-۵۰"
                        if flat else "هیچ ۵۰-۵۰ی نیست"))
        out.append(line(not nosum, "جمعِ دو طرف",
                        f"{len(nosum)} ردیف جمعشان ۱۰۰ نیست"
                        if nosum else "همه ۱۰۰"))
        out.append(line(not late, "زمانِ نمونه",
                        f"{len(late)} ردیف بعد از باز شدنِ پنجره"
                        if late else "همه پیش از باز شدن"))
        out.append(f"ℹ️ نتیجه‌های معلق: {len(unresolved)}"
                   + ("  (با /oddsfill یا خودکار پر می‌شوند)" if unresolved else ""))
        if missing:
            show = missing[:12]
            out += ["", "<b>پنجره‌های جاافتاده:</b>",
                    "  ".join(f"{et_time(t):%H:%M}" for t in show)
                    + (f"  … و {len(missing)-len(show)} تای دیگر"
                       if len(missing) > len(show) else "")]
        ok = not (missing or flat or nosum)
        out += ["", "<b>✅ همه‌چیز درست است.</b>" if ok
                else "<b>❌ هنوز ایراد دارد — همین پیام را بفرست.</b>"]
        return "\n".join(out)

    def window_report(self, hours=3):
        """
        The windows of the last `hours`, newest last — only when asked for.

        Sending one message per window around the clock was noise; the data is
        worth having continuously, the notifications are not. So collection runs
        silently and this is the only thing that ever speaks.
        """
        import polymarket_collector as pmc
        cutoff = time.time() - hours * 3600
        # load_all(), NOT load(). load() drops every row whose winner is still
        # unknown, and since the collector deliberately writes the row the
        # moment it has a price and fills the outcome in later, the newest
        # windows are ALWAYS unresolved. The report was therefore showing the
        # older half of every hour and silently hiding the rest — 5 windows out
        # of 12, which read exactly like a collector that had stopped.
        rows = [r for r in pmc.load_all() if r["t"] >= cutoff
                and r.get("up") is not None]
        # Asking for the report is the best moment to chase the outcomes that
        # are still open — on its own thread, because a button press must not
        # wait on fifteen network calls.
        if any(not r.get("winner") for r in rows):
            threading.Thread(target=self._sweep, args=(pmc,), daemon=True).start()
        if not rows:
            msg = f"📈 <b>{hours} ساعتِ گذشته</b>\n\nهنوز پنجره‌ای ثبت نشده."
            if not self.on:
                msg += "\n\n⚠️ جمع‌آوری خاموش است — /oddscollect روشنش می‌کند."
            elif self.why:
                # Show the diagnosis captured at the moment it failed. Running
                # /oddsdebug now probes a DIFFERENT window and can come back
                # green while the collector is still failing — which is exactly
                # what happened and sent the search in the wrong direction.
                msg += f"\n\n⚠️ آخرین تلاش: {self.why}"
                if self.why_detail:
                    msg += "\n\n" + self.why_detail
            return msg
        rows.sort(key=lambda r: r["t"])
        n = len(rows)
        # Every window collected is listed; only the settled ones can be scored.
        done = [r for r in rows if r.get("winner") and favourite_of(r) != "tie"]
        pending = n - len(done)
        lines = []
        for r in rows[-ODDS_SHOW:]:
            if r.get("winner"):
                mark = "✅" if r["winner"] == favourite_of(r) else "❌"
                tail = f"برنده {_fa_side(r['winner'])}"
            else:
                mark, tail = "⏳", "<i>منتظرِ نتیجه</i>"
            lines.append(f"{mark} <b>{et_time(r['t']):%I:%M%p}</b>  "
                         f"🟢{r['up']*100:.0f} 🔴{r['down']*100:.0f}  →  {tail}")
        more = (f"\n<i>… و {n - ODDS_SHOW} پنجرهٔ دیگر در همین بازه</i>"
                if n > ODDS_SHOW else "")

        # Coverage, stated up front. A missing window is the one failure that
        # used to be invisible, so the report now says how many it expected —
        # and keeps "missing" separate from "not settled yet", which used to
        # look identical.
        span = int((rows[-1]["t"] - rows[0]["t"]) / GRANULARITY) + 1
        cover = (f"{n}/{span} پنجره"
                 + ("" if n >= span else f"  ·  ⚠️ <b>{span - n} جاافتاده</b>"))
        head = f"📈 <b>بالا/پایینِ {hours} ساعتِ گذشته</b>\n{cover}"
        if pending:
            head += f"  ·  ⏳ {pending} منتظرِ نتیجه"
        if not done:
            return (head + "\n\nهنوز هیچ‌کدام تسویه نشده‌اند — نتیجه‌ها با "
                    "تأخیر از پلی‌مارکت می‌آیند.\n\n" + "\n".join(lines) + more)
        d = len(done)
        hit = sum(1 for r in done if r["winner"] == favourite_of(r))
        paid = sum(max(r["up"], r["down"]) for r in done) / d
        edge = hit / d / paid - 1 if paid else 0
        return (head + f"\nاز {d} پنجرهٔ تسویه‌شده: سمتِ گران‌تر "
                f"<b>{hit}/{d} = {hit/d*100:.0f}%</b> برد  ·  "
                f"میانگینِ قیمتش <b>{paid*100:.0f}¢</b>\n"
                f"اگر همیشه سمتِ گران را می‌گرفتی: <b>{edge*100:+.1f}%</b> در هر معامله\n\n"
                + "\n".join(lines) + more)

    def run(self):
        """
        One pass per window: wake at T-15s, read the quote, store, sleep again.

        The first version waited nearly six minutes after each quote to see who
        won, which meant it was asleep through the NEXT window and could only
        ever catch every other one — and it woke up at the wrong offset, asking
        for markets several minutes before Polymarket lists them. The outcome
        does not need to be fetched here at all: the row is written immediately
        with no winner and `resolve_pending` fills it in later. Collecting and
        settling are separate jobs and blocking one on the other cost most of
        the data.
        """
        import polymarket_collector as pmc
        while True:
            now = time.time()
            nxt = (int(now) // GRANULARITY + 1) * GRANULARITY
            # Already handled this boundary, or already inside its lead window:
            # move to the next one. Without this the loop wakes, collects, and
            # comes straight back round while still 14 seconds from the same
            # boundary — asking Polymarket for the same window twice.
            while nxt <= self.done_for or nxt - ODDS_LEAD - now < 0:
                nxt += GRANULARITY
            time.sleep(max(1.0, nxt - ODDS_LEAD - now))
            self.done_for = nxt
            if not self.on:
                continue
            try:
                # The link to Polymarket resolves only intermittently here, so a
                # single failed attempt is not evidence of anything. Keep trying
                # into the first seconds of the window: a quote taken at T+20 is
                # still worth far more than a missing row.
                m = up = None
                deadline = nxt + ODDS_GRACE
                while time.time() < deadline:
                    m = pmc.market_for(nxt, deadline=deadline)
                    if m:
                        up, down, src = pmc.quote(m)
                        if up is not None:
                            break
                    time.sleep(4)
                if not m:
                    log.warning("Odds: no market for %s after %ds",
                                et_time(nxt).strftime("%H:%M"), ODDS_GRACE)
                    self._explain(pmc, nxt, "بازارِ این پنجره پیدا نشد")
                    continue
                if up is None:
                    self._explain(pmc, nxt, "قیمت خوانده نشد")
                    continue
                self.why = ""
                fav = _favourite(up, down)
                mins = int((pmc._duration(m) or GRANULARITY) / 60)
                log.info("Odds %s: up %.0f down %.0f -> %s [%s, %dm]",
                         et_time(nxt).strftime("%H:%M"), up * 100, down * 100,
                         fav, src, mins)
                row = {"t": nxt, "et": et_time(nxt).isoformat(),
                       "hour_et": et_time(nxt).hour, "up": up, "down": down,
                       "favourite": fav, "winner": None, "beat": None,
                       "final": None, "source": src, "market_id": m.get("id"),
                       "title": (m.get("question") or "")[:70], "minutes": mins,
                       "lag": round(time.time() - nxt)}
                pmc.append(row)
                self.last = row
                self.errors = 0
                # Fill in outcomes for everything already stored. Cheap, and it
                # keeps the file complete without ever blocking a collection.
                if int(nxt) % 600 < GRANULARITY:
                    # In its own thread: it makes one network call per pending
                    # row, and doing that inline stalled the loop straight past
                    # the next window.
                    threading.Thread(target=self._sweep, args=(pmc,),
                                     daemon=True).start()
            except Exception as exc:  # noqa: BLE001 - one bad window is not fatal
                self.errors += 1
                log.warning("Odds watcher error: %s: %s",
                            type(exc).__name__, str(exc)[:160])
                if self.errors == 3 and self.chat_id:
                    send_message(self.chat_id,
                                 "⚠️ پایشِ بالا/پایین به پلی‌مارکت وصل نمی‌شود "
                                 f"({type(exc).__name__}). با VPN امتحان کن.")

    @staticmethod
    def _sweep(pmc):
        try:
            n = pmc.resolve_pending()
            if n:
                log.info("Odds: filled in %d pending outcomes.", n)
        except Exception as exc:  # noqa: BLE001
            log.warning("resolve_pending: %s", exc)

    def _explain(self, pmc, boundary, short):
        """
        Keep the full diagnosis of a failure, not just a one-line label.

        A report that says only "market not found" while /oddsdebug says
        everything is fine is worse than useless — it sends you looking in the
        wrong place. Whatever went wrong is captured here at the moment it
        happened, for the next /odds to show.
        """
        self.why = short

        def _probe():
            # On its own thread: diagnose walks every endpoint again and can
            # take over a minute. Doing that inline ate the next window, which
            # is how a failure turned into two.
            try:
                self.why_detail = pmc.diagnose(boundary)
            except Exception as exc:  # noqa: BLE001
                self.why_detail = f"عیب‌یابی هم شکست خورد: {type(exc).__name__}"
        threading.Thread(target=_probe, daemon=True).start()


def _fa_side(side):
    return "🟢 بالا" if side == "up" else ("🔴 پایین" if side == "down" else "برابر")

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
                elif text.startswith("/update") or text == MENU_UPDATE:
                    # Pulling from the phone's terminal keeps going wrong —
                    # commands get typed into the log viewer and silently do
                    # nothing — so the update runs from here instead. Exiting
                    # afterwards is deliberate: run_bot.sh's supervisor restarts
                    # the process, and only a fresh process runs the new code.
                    send_message(chat_id, "⏳ در حال به‌روزرسانی…")
                    try:
                        ok, out, moved = git_pull()
                        if not ok:
                            send_message(chat_id,
                                         f"❌ به‌روزرسانی نشد:\n<code>{out}</code>")
                        elif not moved and code_version() == RUNNING_VERSION:
                            send_message(chat_id,
                                         f"✅ همین الان جدیدترین نسخه است.\n"
                                         f"نسخه: <b>{code_version()}</b>")
                        elif not moved:
                            # Nothing to pull, but the running process is older
                            # than the files. Happens whenever the pull was done
                            # from the terminal: git moves, the live process does
                            # not, and it keeps serving the old rules for ever
                            # while /update cheerfully reports "already latest".
                            send_message(chat_id,
                                         "♻️ فایل‌ها به‌روز بودند ولی پروسه "
                                         "نسخهٔ قدیمی را اجرا می‌کرد.\n"
                                         f"در حال اجرا: <b>{RUNNING_VERSION}</b>\n"
                                         f"روی دیسک: <b>{code_version()}</b>\n\n"
                                         "🔄 در حال ری‌استارت…")
                            log.info("Restarting: process %s is behind disk %s.",
                                     RUNNING_VERSION, code_version())
                            os._exit(0)
                        else:
                            send_message(chat_id,
                                         f"✅ به‌روز شد به <b>{code_version()}</b>\n"
                                         f"<code>{out}</code>\n\n"
                                         "🔄 در حال ری‌استارت… تا ۱۰ ثانیهٔ دیگر برمی‌گردم.")
                            log.info("Restarting after /update.")
                            os._exit(0)
                    except Exception as exc:  # noqa: BLE001 - report, never die
                        send_message(chat_id, f"❌ خطا در به‌روزرسانی: {exc}")
                elif text.startswith("/missed") or text == MENU_MISSED:
                    bm = globals().get("BREAKOUT_MONITOR")
                    if bm:
                        bm.missed_report()
                        bm.flush_untold()   # mark anything queued as seen
                    else:
                        send_message(chat_id, "سابقه‌ای در دسترس نیست.")
                elif text.startswith("/oddstest"):
                    bm = globals().get("ODDS_WATCHER")
                    send_message(chat_id, bm.self_test() if bm
                                 else "پایشِ بالا/پایین در دسترس نیست.")
                elif text.startswith("/oddsfill"):
                    parts = text.split()
                    hrs = 24
                    if len(parts) > 1:
                        try:
                            hrs = max(1, min(168, int(float(parts[1]))))
                        except ValueError:
                            pass
                    send_message(chat_id,
                                 f"⏳ در حال بازیابیِ پنجره‌های جاافتادهٔ "
                                 f"{hrs} ساعتِ گذشته…\n"
                                 "<i>هر پنجره چند درخواست لازم دارد، پس ممکن "
                                 "است چند دقیقه طول بکشد.</i>")

                    def _fill(cid=chat_id, hours=hrs):
                        try:
                            import polymarket_collector as pmc
                            add, miss, bad = pmc.backfill(hours)
                            if not miss:
                                send_message(cid, "✅ هیچ پنجره‌ای جا نیفتاده بود.")
                            else:
                                send_message(
                                    cid,
                                    f"📥 <b>بازیابی تمام شد</b>\n"
                                    f"جا افتاده بود: <b>{miss}</b> پنجره\n"
                                    f"بازیابی شد: <b>{add}</b>\n"
                                    f"نشد: <b>{bad}</b>"
                                    + ("\n\n<i>قیمتِ این‌ها از تاریخچهٔ دفترِ "
                                       "سفارش گرفته شده، نه لحظه‌ای — در گزارش "
                                       "با منبعِ history مشخص‌اند.</i>"
                                       if add else "")
                                    + ("\n\n<i>«نشد»ها یا بازارشان دیگر در "
                                       "دسترس نیست یا تاریخچه‌شان آن‌قدر عقب "
                                       "نمی‌رود.</i>" if bad else ""))
                        except Exception as exc:  # noqa: BLE001
                            send_message(cid, f"❌ بازیابی خطا داد: "
                                              f"{type(exc).__name__}: {exc}")
                    threading.Thread(target=_fill, daemon=True).start()
                elif text.startswith("/oddsdebug"):
                    send_message(chat_id, "🔧 در حال بررسی…")

                    def _dbg(cid=chat_id):
                        try:
                            import polymarket_collector as pmc
                            send_message(cid, pmc.diagnose())
                        except Exception as exc:  # noqa: BLE001
                            send_message(cid, f"عیب‌یابی خطا داد: "
                                              f"{type(exc).__name__}: {exc}")
                    threading.Thread(target=_dbg, daemon=True).start()
                elif text.startswith("/oddsreport"):
                    try:
                        import polymarket_collector as pmc
                        send_message(chat_id, pmc.report_text(html=True))
                    except Exception as exc:  # noqa: BLE001
                        send_message(chat_id, f"گزارش در دسترس نیست: {exc}")
                elif text.startswith("/oddscollect"):
                    w = globals().get("ODDS_WATCHER")
                    send_message(chat_id, w.toggle() if w else "در دسترس نیست.")
                elif text.startswith("/odds") or text == MENU_ODDS:
                    w = globals().get("ODDS_WATCHER")
                    if not w:
                        send_message(chat_id, "پایشِ بالا/پایین در دسترس نیست.")
                    else:
                        parts = text.split()
                        # The button starts at one hour: for the first day the
                        # store is nearly empty and a three-hour view looks
                        # broken when it is merely early.
                        hrs = 3 if text.startswith("/odds") else 1
                        if len(parts) > 1:
                            try:
                                hrs = max(1, min(48, int(float(parts[1]))))
                            except ValueError:
                                pass
                        send_keyboard(chat_id, w.window_report(hrs),
                                      _odds_keyboard())
                elif text.startswith("/check"):
                    bm = globals().get("BREAKOUT_MONITOR")
                    send_message(chat_id, bm.check_report() if bm else
                                 "موتورِ سیگنال روشن نیست.")
                elif text.startswith("/last") or text == MENU_LAST:
                    # Read-only replay of the recent past: what WOULD have been
                    # sent. Nothing is scored, so it is safe to run repeatedly.
                    bm = globals().get("BREAKOUT_MONITOR")
                    parts = text.split()
                    hrs = 6
                    if len(parts) > 1:
                        try:
                            hrs = max(1, min(48, int(float(parts[1]))))
                        except ValueError:
                            pass
                    if bm:
                        send_message(chat_id, f"🔍 در حال بررسیِ {hrs} ساعتِ گذشته…")
                        threading.Thread(target=bm.scan_report, args=(hrs,),
                                         daemon=True).start()
                    else:
                        send_message(chat_id, "موتورِ سیگنال روشن نیست.")
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
                elif text.startswith("/why") or text == MENU_WHY:
                    bm = globals().get("BREAKOUT_MONITOR")
                    send_message(chat_id, bm.why_report() if bm else
                                 "موتورِ سیگنال روشن نیست (STRATEGY را ببین).")
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


# ---------------------------------------------------------------------------
# Worker supervision
# ---------------------------------------------------------------------------
_WORKERS = {}   # name -> [thread, target]


def keep_alive(name, target):
    """Start `target` in a daemon thread and remember how to restart it."""
    t = threading.Thread(target=target, daemon=True, name=name)
    t.start()
    _WORKERS[name] = [t, target]
    return t


def watch_workers(poll=30):
    """
    Never return; restart any worker thread that has died.

    Every loop below already catches Exception, so a thread that exits got past
    that — and when it did, the main thread was parked in a bare hour-long
    sleep. The process stayed up, the pid stayed valid, run_bot.sh's supervisor
    saw a perfectly healthy bot, and no signal was sent for as long as it took
    someone to notice. Restarting in-process is both faster than bouncing the
    whole thing and cheaper: the rolling close series stays in memory instead of
    being re-seeded from the network.

    Deliberately does NOT touch the heartbeat. A wedged worker with a healthy
    main thread is the case the external watchdog exists to catch, and stamping
    the file here would hide exactly that.
    """
    while True:
        time.sleep(poll)
        for name, entry in _WORKERS.items():
            if entry[0].is_alive():
                continue
            log.error("Worker %r died; restarting it.", name)
            entry[0] = threading.Thread(target=entry[1], daemon=True, name=name)
            entry[0].start()
            try:
                cid = load_chat_id()
                if cid:
                    send_message(cid, f"♻️ بخشِ «{name}» متوقف شده بود و "
                                      f"دوباره راه‌اندازی شد. کاری لازم نیست.")
            except Exception:  # noqa: BLE001 - notifying must never kill the watcher
                pass


def main():
    log.info("=== bot.py version %s ===", code_version())
    if not TELEGRAM_TOKEN:
        raise SystemExit(
            "TELEGRAM_TOKEN is not set. Create a bot via @BotFather and set it "
            "in your environment or .env file."
        )

    chat_id = load_chat_id()
    if chat_id and not TELEGRAM_CHAT_ID:
        log.info("Using chat_id %s remembered from a previous /start.", chat_id)
    monitor = Monitor(chat_id)

    keep_alive("listener", lambda: command_listener(monitor))

    if STRATEGY in ("breakout", "both"):
        breakout = BreakoutMonitor(chat_id, chat_source=monitor)
        # The command listener runs in its own thread and needs to reach the
        # monitor to answer /score.
        globals()["BREAKOUT_MONITOR"] = breakout
        odds = OddsWatcher(monitor)
        globals()["ODDS_WATCHER"] = odds
        keep_alive("odds", odds.run)
        log.info("Odds watcher ready (%s).", "ON" if odds.on else "OFF — /odds")
        log.info(
            "Breakout-fade alerts ON | feed=%s lookback=%d vol_filter=%s | "
            "history=%d rules=1,2,3%s%s%s%s%s",
            BREAKOUT_FEED, BREAKOUT_LOOKBACK, BREAKOUT_VOL_FILTER, HISTORY_SHOW,
            ",5" if RULE5_ENABLED else "", ",6" if RULE6_ENABLED else "",
            ",7" if RULE7_ENABLED else "", ",8" if RULE8_ENABLED else "",
            ",4" if RULE4_ENABLED else "",
        )
        keep_alive("breakout", breakout.run)

    if STRATEGY != "breakout":
        log.info(
            "Starting BTC candle alternation bot | product=%s granularity=%ds "
            "threshold=%d",
            PRODUCT,
            GRANULARITY,
            ALTERNATION_THRESHOLD,
        )
        keep_alive("alternation", monitor.run)

    # The main thread does nothing but keep the others alive. It used to BE one
    # of the workers, which meant the one thread nobody was watching was the one
    # holding the process open.
    log.info("Worker supervisor active over: %s", ", ".join(_WORKERS))
    # Only stamped once the workers are actually up — never at the top of main().
    # A bot that dies on startup gets restarted by the supervisor every few
    # seconds, and a heartbeat written before the workers exist would be
    # refreshed by every one of those failed attempts: a crash loop would read
    # as perfect health and the watchdog would never fire.
    beat("startup")
    watch_workers()


if __name__ == "__main__":
    main()
