"""
Long-running monitor entrypoint for GitHub Actions (public repo => free).

Runs a single continuous process that polls Coinbase every POLL_SECONDS and
sends Telegram alerts on candle-direction alternation. It exits cleanly after
MAX_RUNTIME_SECONDS so the GitHub Actions job stays under the 6-hour limit;
a queued successor run then takes over for near-continuous 24/7 coverage.
"""

import os

from bot import Monitor, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, log

# Default 5h40m, comfortably under the GitHub Actions 6h job limit.
MAX_RUNTIME_SECONDS = int(os.environ.get("MAX_RUNTIME_SECONDS", "20400"))


def main():
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        raise SystemExit("Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID.")
    log.info("Long-running monitor starting (max_runtime=%ss).", MAX_RUNTIME_SECONDS)
    monitor = Monitor(TELEGRAM_CHAT_ID)
    monitor.run(max_runtime=MAX_RUNTIME_SECONDS)


if __name__ == "__main__":
    main()
