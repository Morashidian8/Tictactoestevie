"""
Stateless candle-check for GitHub Actions (runs once per invocation).

Fetches the latest closed BTC 5-minute candles from Binance, measures the
trailing alternation streak (green/red/green/...), and if it reaches the
threshold sends ONE Telegram alert per alternation episode.

De-duplication: we remember the start time of the alternating run we last
alerted on (in STATE_FILE). A new alert only fires when a *different*
alternating episode reaches the threshold, so we don't spam every candle.
"""

import os
import sys

import requests

from bot import (
    fetch_candles,
    candle_direction,
    dir_label,
    PRODUCT,
    ALTERNATION_THRESHOLD,
)

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
STATE_FILE = os.environ.get("STATE_FILE", ".state/last_alert.txt")


def send_message(text: str) -> bool:
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
        json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"Telegram error: {resp.text}", file=sys.stderr)
        return False
    return True


def read_state() -> str:
    try:
        with open(STATE_FILE) as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def write_state(value: str):
    os.makedirs(os.path.dirname(STATE_FILE) or ".", exist_ok=True)
    with open(STATE_FILE, "w") as f:
        f.write(value)


def trailing_alternation(directions):
    """Return (streak_length, start_index) for the trailing alternating run."""
    if not directions:
        return 0, 0
    streak = 1
    i = len(directions) - 1
    while i > 0:
        cur, prev = directions[i], directions[i - 1]
        if cur != 0 and prev != 0 and cur == -prev:
            streak += 1
            i -= 1
        else:
            break
    return streak, i


def main():
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID.", file=sys.stderr)
        sys.exit(1)

    candles = fetch_candles()
    if not candles:
        print("No candles returned.")
        return

    directions = [candle_direction(c) for c in candles]
    streak, start_idx = trailing_alternation(directions)
    latest = candles[-1]
    streak_start_time = str(candles[start_idx]["time"])

    print(
        f"Latest close=${latest['close']:.2f} "
        f"dir={dir_label(directions[-1])} streak={streak} "
        f"threshold={ALTERNATION_THRESHOLD}"
    )

    if streak < ALTERNATION_THRESHOLD:
        return

    if read_state() == streak_start_time:
        print("Already alerted for this alternation episode; skipping.")
        return

    pattern = " ".join(
        {1: "🟢", -1: "🔴", 0: "⚪️"}[d] for d in directions[-streak:]
    )
    from datetime import datetime, timezone

    when = datetime.fromtimestamp(latest["time"], tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC"
    )
    text = (
        "🚨 <b>هشدار تناوب کندل بیت‌کوین</b> 🚨\n\n"
        f"تعداد <b>{streak}</b> کندل ۵ دقیقه‌ای پشت سر هم جهت‌شان "
        "متناوب (سبز/قرمز) شده است.\n\n"
        f"الگو: {pattern}\n"
        f"نماد: <b>{PRODUCT}</b> (Binance)\n"
        f"کندل بسته‌شده: {when}\n"
        f"قیمت بسته‌شدن: <b>${latest['close']:,.2f}</b>"
    )
    if send_message(text):
        write_state(streak_start_time)
        print("Alert sent.")


if __name__ == "__main__":
    main()
