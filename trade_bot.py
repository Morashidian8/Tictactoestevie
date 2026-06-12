"""
Polymarket auto-trading bot for the BTC Up/Down 5-minute market series.

You give it a strategy (STRATEGY env var, see strategies.py) and a bankroll
policy (stake, daily loss limit, ...), and it trades each 5-minute window
hands-free:

  1. At the start of every window it reads the resolved directions of the
     previous windows and asks the strategy for a signal (up / down / none).
  2. If the risk manager approves (entry price, daily loss limit, loss
     streak), it buys the chosen outcome token for STAKE_USDC.
  3. After the window resolves it records the win/loss, updates the limits,
     and reports the trade and the running daily P&L on Telegram.

SAFE BY DEFAULT: DRY_RUN=true simulates fills at the live ask without
touching real money. Set DRY_RUN=false plus POLY_PRIVATE_KEY (and
POLY_FUNDER for proxy accounts) only when you have tested the strategy.
"""

import os
import time
import logging
from datetime import datetime, timezone

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from bot import send_message, TELEGRAM_CHAT_ID
from strategies import make_strategy
from risk import RiskManager
from polymarket_trader import (
    PaperTrader,
    LiveTrader,
    fetch_window_market,
    fetch_resolved_direction,
    fetch_buy_price,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("trade-bot")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DRY_RUN = os.environ.get("DRY_RUN", "true").strip().lower() != "false"

STRATEGY = os.environ.get("STRATEGY", "alternation").strip()
STRATEGY_MODE = os.environ.get("STRATEGY_MODE", "follow").strip()
STRATEGY_THRESHOLD = int(os.environ.get("ALTERNATION_THRESHOLD", "5"))

STAKE_USDC = float(os.environ.get("STAKE_USDC", "5"))
MAX_ENTRY_PRICE = float(os.environ.get("MAX_ENTRY_PRICE", "0.60"))
DAILY_LOSS_LIMIT_USDC = float(os.environ.get("DAILY_LOSS_LIMIT_USDC", "20"))
MAX_CONSECUTIVE_LOSSES = int(os.environ.get("MAX_CONSECUTIVE_LOSSES", "4"))

# Only enter during the first part of a window; later entries get bad odds.
ENTRY_WINDOW_SECONDS = int(os.environ.get("ENTRY_WINDOW_SECONDS", "90"))

WINDOW_SECONDS = int(os.environ.get("GRANULARITY", "300"))
POLY_SLUG_PREFIX = os.environ.get("POLY_SLUG_PREFIX", "btc-updown-5m").strip()
HISTORY_WINDOWS = int(os.environ.get("POLY_LOOKBACK", "12"))
RESOLUTION_TIMEOUT = int(os.environ.get("RESOLUTION_TIMEOUT", "180"))
STATE_PATH = os.environ.get("TRADER_STATE_PATH", "trader_state.json")

POLY_PRIVATE_KEY = os.environ.get("POLY_PRIVATE_KEY", "").strip()
POLY_FUNDER = os.environ.get("POLY_FUNDER", "").strip()
POLY_SIGNATURE_TYPE = int(os.environ.get("POLY_SIGNATURE_TYPE", "1"))

MAX_RUNTIME_SECONDS = os.environ.get("MAX_RUNTIME_SECONDS", "").strip()


def notify(text: str):
    """Telegram if configured, always logged."""
    log.info("NOTIFY: %s", text.replace("\n", " | "))
    if TELEGRAM_CHAT_ID:
        send_message(TELEGRAM_CHAT_ID, text)


def window_slug(window_start: int) -> str:
    return f"{POLY_SLUG_PREFIX}-{window_start}"


def fetch_recent_directions(up_to_window: int):
    """
    Directions (+1/-1) of resolved windows ending at `up_to_window`
    (exclusive), oldest -> newest. Returns None when the latest needed
    window is not resolved yet, so the caller can retry.
    """
    directions = []
    latest = up_to_window - WINDOW_SECONDS
    for k in range(HISTORY_WINDOWS - 1, -1, -1):
        ts = latest - k * WINDOW_SECONDS
        d = fetch_resolved_direction(window_slug(ts))
        if d is None:
            if ts == latest:
                return None  # most recent window not resolved yet
            directions = []  # gap in history; only keep a contiguous tail
            continue
        directions.append(d)
    return directions or None


def wait_for_resolution(window_start: int):
    """Block until the window resolves (or timeout). Returns +1/-1/None."""
    deadline = window_start + WINDOW_SECONDS + RESOLUTION_TIMEOUT
    slug = window_slug(window_start)
    while time.time() < deadline:
        remaining = window_start + WINDOW_SECONDS - time.time()
        if remaining > 0:
            time.sleep(min(remaining + 2, 30))
            continue
        d = fetch_resolved_direction(slug)
        if d is not None:
            return d
        time.sleep(5)
    return None


def fmt_usdc(x: float) -> str:
    return f"{x:+.2f} USDC"


def trade_window(trader, strategy, risk, window_start: int) -> bool:
    """Evaluate and (maybe) trade one window. True if a trade happened."""
    directions = fetch_recent_directions(window_start)
    if directions is None:
        return False  # history not ready; caller retries within entry window

    signal = strategy.decide(directions)
    if signal is None:
        log.info(
            "Window %s: no signal (pattern tail: %s).",
            window_start,
            " ".join({1: "U", -1: "D", 0: "?"}[d] for d in directions[-8:]),
        )
        return True  # evaluated; nothing to do this window

    slug = window_slug(window_start)
    market = fetch_window_market(slug)
    if market is None:
        log.warning("Window market %s not found; skipping.", slug)
        return True
    token_id = market[signal]

    price = fetch_buy_price(token_id)
    if price is None:
        log.warning("No ask price for %s (%s); skipping.", slug, signal)
        return True

    allowed, reason = risk.can_trade(price)
    if not allowed:
        notify(f"⛔️ معامله انجام نشد: {reason}")
        return True

    position = trader.buy(token_id, STAKE_USDC, price)
    when = datetime.fromtimestamp(window_start, tz=timezone.utc).strftime(
        "%H:%M UTC"
    )
    mode_tag = "🧪 تمرینی" if trader.mode == "paper" else "💸 واقعی"
    arrow = "⬆️ Up" if signal == "up" else "⬇️ Down"
    notify(
        f"{mode_tag} | ورود به معامله\n"
        f"پنجره: {when} | پیش‌بینی: <b>{arrow}</b>\n"
        f"قیمت ورود: {position['price']:.3f} | "
        f"حجم: {STAKE_USDC:.2f} USDC ({position['shares']:.1f} سهم)\n"
        f"استراتژی: {strategy.describe()}"
    )

    result = wait_for_resolution(window_start)
    if result is None:
        notify(
            "⚠️ نتیجه پنجره مشخص نشد (timeout). این معامله در سود/زیان "
            "روزانه ثبت نشد — وضعیت را در پلی‌مارکت بررسی کنید."
        )
        return True

    won = (result > 0) == (signal == "up")
    pnl = position["shares"] - position["cost"] if won else -position["cost"]
    risk.record_result(pnl)
    outcome = "✅ برد" if won else "❌ باخت"
    notify(
        f"{mode_tag} | نتیجه معامله: <b>{outcome}</b>\n"
        f"نتیجه پنجره: {'⬆️ Up' if result > 0 else '⬇️ Down'} | "
        f"سود/زیان: <b>{fmt_usdc(pnl)}</b>\n"
        f"امروز: {fmt_usdc(risk.daily_pnl)} در {risk.trades_today} معامله | "
        f"کل: {fmt_usdc(risk.total_pnl)}"
    )
    return True


def main():
    strategy = make_strategy(STRATEGY, STRATEGY_THRESHOLD, STRATEGY_MODE)
    risk = RiskManager(
        stake_usdc=STAKE_USDC,
        max_entry_price=MAX_ENTRY_PRICE,
        daily_loss_limit_usdc=DAILY_LOSS_LIMIT_USDC,
        max_consecutive_losses=MAX_CONSECUTIVE_LOSSES,
        state_path=STATE_PATH,
    )

    if DRY_RUN:
        trader = PaperTrader()
    else:
        if not POLY_PRIVATE_KEY:
            raise SystemExit(
                "DRY_RUN=false but POLY_PRIVATE_KEY is not set. "
                "Refusing to start live trading without a key."
            )
        trader = LiveTrader(
            POLY_PRIVATE_KEY,
            signature_type=POLY_SIGNATURE_TYPE,
            funder=POLY_FUNDER,
        )

    mode_fa = "🧪 تمرینی (بدون پول واقعی)" if DRY_RUN else "💸 واقعی"
    notify(
        f"🤖 ربات ترید پلی‌مارکت روشن شد — حالت: <b>{mode_fa}</b>\n"
        f"بازار: {POLY_SLUG_PREFIX} | استراتژی: {strategy.describe()}\n"
        f"حجم هر معامله: {STAKE_USDC:.2f} USDC | "
        f"سقف ضرر روزانه: {DAILY_LOSS_LIMIT_USDC:.2f} USDC"
    )

    started = time.time()
    max_runtime = int(MAX_RUNTIME_SECONDS) if MAX_RUNTIME_SECONDS else None
    done_window = 0
    while True:
        if max_runtime and time.time() - started >= max_runtime:
            notify("🛑 ربات ترید به سقف زمان اجرا رسید و خاموش شد.")
            return
        now = time.time()
        current = int(now // WINDOW_SECONDS) * WINDOW_SECONDS
        in_entry = (now - current) <= ENTRY_WINDOW_SECONDS
        if current == done_window or not in_entry:
            time.sleep(3)
            continue
        try:
            if trade_window(trader, strategy, risk, current):
                done_window = current
        except Exception as exc:
            log.error("Trade loop error on window %s: %s", current, exc)
            done_window = current  # do not retry a failed window blindly
            time.sleep(10)


if __name__ == "__main__":
    main()
