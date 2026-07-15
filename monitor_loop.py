"""
Long-running monitor entrypoint for GitHub Actions (public repo => free).

Runs a single continuous process that polls Binance every POLL_SECONDS and
sends Telegram alerts on candle-direction alternation. It exits cleanly after
MAX_RUNTIME_SECONDS so the GitHub Actions job stays under the 6-hour limit;
a queued successor run then takes over for near-continuous 24/7 coverage.
"""

import os
import threading

from bot import (
    Monitor,
    command_listener,
    TELEGRAM_TOKEN,
    TELEGRAM_CHAT_ID,
    log,
)

# Default 5h40m, comfortably under the GitHub Actions 6h job limit.
MAX_RUNTIME_SECONDS = int(os.environ.get("MAX_RUNTIME_SECONDS", "20400"))

# Only ONE monitor process should long-poll Telegram getUpdates (two consumers
# of the same bot token race for updates). The workflow sets COMMAND_LISTENER=1
# on exactly one matrix entry; that process handles /threshold for all
# timeframes and writes to the shared store, which every monitor reads.
RUN_LISTENER = os.environ.get("COMMAND_LISTENER", "0").strip() == "1"


def main():
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        raise SystemExit("Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID.")
    log.info("Long-running monitor starting (max_runtime=%ss).", MAX_RUNTIME_SECONDS)
    monitor = Monitor(TELEGRAM_CHAT_ID)
    if RUN_LISTENER:
        log.info("Telegram command listener enabled (threshold control).")
        threading.Thread(
            target=command_listener, args=(monitor,), daemon=True
        ).start()
    monitor.run(max_runtime=MAX_RUNTIME_SECONDS)


if __name__ == "__main__":
    main()
