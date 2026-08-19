"""
Send any file from the phone to the Telegram chat.

The bot already has /export for its own ledger, but reaching that means editing
the bot and restarting it. This is a standalone one-shot: it reads the same
credentials from the same places and posts the file, with the bot untouched and
still running.

    python send_file.py signals_month.csv
    python send_file.py polymarket_chart.csv "the month of outcomes"
"""

import os
import re
import sys

import requests

HERE = os.path.dirname(os.path.abspath(__file__))


def cred(name):
    """From the environment, else from .env — without executing .env."""
    v = os.environ.get(name, "").strip()
    if v:
        return v
    try:
        with open(os.path.join(HERE, ".env")) as f:
            for line in f:
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return ""


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    path = sys.argv[1]
    caption = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(path)
    if not os.path.exists(path):
        print(f"{path} not found")
        return

    token = cred("TELEGRAM_TOKEN")
    chat = cred("TELEGRAM_CHAT_ID")
    if not chat:
        try:
            chat = open(os.path.join(HERE, ".chat_id")).read().strip()
        except OSError:
            pass
    if not token or not chat:
        print("no TELEGRAM_TOKEN / chat id found (.env or .chat_id)")
        return

    size = os.path.getsize(path) / 1024
    lines = sum(1 for _ in open(path, errors="ignore"))
    print(f"sending {path} — {size:,.0f} KB, {lines:,} lines …")
    with open(path, "rb") as f:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendDocument",
                          data={"chat_id": chat,
                                "caption": f"{caption}\n{lines:,} خط · "
                                           f"{size:,.0f} کیلوبایت"},
                          files={"document": (os.path.basename(path), f)},
                          timeout=180)
    if r.status_code == 200:
        print("sent ✓")
    else:
        # The body carries the real reason — file too large, wrong chat id, a
        # revoked token — and printing only the status code would hide it.
        print(f"failed ({r.status_code}): {r.text[:300]}")


if __name__ == "__main__":
    main()
