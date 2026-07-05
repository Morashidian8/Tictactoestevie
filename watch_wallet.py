"""Continuously watch a Polymarket wallet and Telegram-alert on new activity.

Polls the public Data API activity feed for ONE address every POLL_SECONDS and
sends a Telegram message for each new row (trades by default). Designed to run as
a long-lived GitHub Actions job that self-exits before the job timeout; a queued
successor (concurrency group, cancel-in-progress:false) takes over for near-
continuous coverage — exactly the pattern candle-alert.yml uses.

State (the last-seen activity timestamp) is cached to `.wallet_cache/` so a
handoff between jobs does not replay old activity. On a truly fresh start it
baselines to the latest existing row, so history is never spammed.

No keys, no signing — read-only. Telegram creds come from env (GitHub secrets).
"""

import os
import time
import html
from datetime import datetime, timezone, timedelta

import requests

from wallet_tracker.polymarket_client import PolymarketClient

ADDRESS = os.environ.get(
    "WATCH_ADDRESS", "0xb8ea51bd3b55e7105cd6ff351eeaf70d68f36240"
).strip().lower()
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "30"))
MAX_RUNTIME = int(os.environ.get("MAX_RUNTIME_SECONDS", "20400"))  # ~340 min
CACHE_DIR = os.environ.get("WALLET_CACHE_DIR", ".wallet_cache")
# Which activity types trigger an alert. "ALL" = every type; otherwise a
# comma-separated allow-list (default just trades — i.e. positions opened/closed).
WATCH_TYPES = os.environ.get("WATCH_TYPES", "TRADE").strip().upper()

TZ_OFFSET = timedelta(hours=3, minutes=30)  # Asia/Tehran for display
STATE_FILE = os.path.join(CACHE_DIR, f"last_ts_{ADDRESS}.txt")


def _int(v, default=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def esc(s):
    return html.escape(str(s)) if s is not None else ""


def fmt_time(ts):
    dt = datetime.fromtimestamp(_int(ts), tz=timezone.utc) + TZ_OFFSET
    return dt.strftime("%Y-%m-%d %H:%M")


def tg(text):
    """Send a Telegram message (HTML). Prints instead if creds are missing."""
    if not (TELEGRAM_TOKEN and TELEGRAM_CHAT_ID):
        print("[no telegram creds] would send:\n" + text)
        return
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=15,
        )
        if r.status_code != 200:
            print("telegram error:", r.text)
    except requests.RequestException as exc:
        print("telegram send failed:", exc)


def load_last_ts():
    try:
        with open(STATE_FILE) as f:
            return _int(f.read().strip(), None)
    except (OSError, ValueError):
        return None


def save_last_ts(ts):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        f.write(str(_int(ts)))


def wanted(row):
    if WATCH_TYPES in ("", "ALL", "*"):
        return True
    return str(row.get("type") or "").upper() in set(
        t.strip() for t in WATCH_TYPES.split(",") if t.strip()
    )


def format_row(row):
    typ = str(row.get("type") or "").upper()
    title = row.get("title") or row.get("slug") or "?"
    outcome = row.get("outcome")
    side = str(row.get("side") or "").upper()
    size = _float(row.get("size"))
    price = _float(row.get("price"))
    usd = _float(row.get("usdcSize"))
    ts = row.get("timestamp")
    slug = row.get("eventSlug") or row.get("slug")
    link = f"https://polymarket.com/event/{slug}" if slug else None

    side_fa = {"BUY": "🟢 خرید", "SELL": "🔴 فروش"}.get(side, esc(side))
    head = "🔔 ترید جدید" if typ == "TRADE" else f"🔔 {esc(typ) or 'رویداد'}"

    lines = [f"<b>{head}</b>"]
    oc = f" ({esc(outcome)})" if outcome else ""
    if typ == "TRADE":
        lines.append(f"{side_fa}{oc} در «{esc(title)}»")
        det = []
        if size is not None:
            det.append(f"{size:g} سهم")
        if price is not None:
            det.append(f"@ {price:.3f}")
        if usd is not None:
            det.append(f"= {usd:,.2f}$")
        if det:
            lines.append(" ".join(det))
    else:
        lines.append(f"{esc(title)}{oc}")
        if usd is not None:
            lines.append(f"{usd:,.2f}$")
    if ts:
        lines.append(f"⏰ {fmt_time(ts)} (تهران)")
    if link:
        lines.append(esc(link))
    return "\n".join(lines)


def main():
    client = PolymarketClient()
    now = int(time.time())
    last_ts = load_last_ts()

    if last_ts is None:
        # Fresh start: baseline to the latest existing row so we never replay
        # history; only alert on activity that happens from now on.
        try:
            recent = client.activity(ADDRESS, start=now - 86400)
        except Exception as exc:  # network hiccup on first poll -> baseline now
            recent = []
            print("baseline fetch error:", exc)
        last_ts = max((_int(r.get("timestamp")) for r in recent), default=now)
        save_last_ts(last_ts)
        short = ADDRESS[:6] + "…" + ADDRESS[-4:]
        tg(
            f"👀 رصدِ کیف‌پول شروع شد\n<code>{short}</code>\n"
            f"از این پس هر تریدِ جدید را همین‌جا خبر می‌دهم."
        )

    start = time.time()
    while time.time() - start < MAX_RUNTIME:
        try:
            rows = client.activity(ADDRESS, start=last_ts)
            new = [r for r in rows if _int(r.get("timestamp")) > last_ts]
            new.sort(key=lambda r: _int(r.get("timestamp")))
            for r in new:
                if wanted(r):
                    tg(format_row(r))
                last_ts = max(last_ts, _int(r.get("timestamp")))
            if new:
                save_last_ts(last_ts)
        except Exception as exc:  # keep the loop alive across transient errors
            print("poll error:", exc)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
