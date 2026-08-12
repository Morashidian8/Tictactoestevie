#!/data/data/com.termux/files/usr/bin/bash
#
# Keep the candle bot alive on Termux until told to stop.
#
#   bash run_bot.sh start     # start in the background, survives closing Termux
#   bash run_bot.sh stop      # the only thing that shuts it down
#   bash run_bot.sh status    # is it running? what did it last log?
#   bash run_bot.sh log       # follow the log
#
# Why a wrapper: Android aggressively kills background work. This takes a
# wake-lock so the CPU is not suspended, and restarts the bot if it ever exits
# (crash, OOM, dropped connection) with a backoff, so a single bad night does
# not silently leave you with no alerts.

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.bot.pid"
LOOPPID="$DIR/.bot.loop.pid"
LOG="$DIR/bot.log"
STOPFLAG="$DIR/.bot.stop"

have() { command -v "$1" >/dev/null 2>&1; }

wake_lock() {
    # Termux:API is optional — without it the bot still runs, it is just more
    # likely to be suspended when the screen is off.
    if have termux-wake-lock; then
        termux-wake-lock && echo "wake-lock acquired"
    else
        echo "note: termux-wake-lock not found (install Termux:API for best uptime)"
    fi
}

wake_unlock() {
    have termux-wake-unlock && termux-wake-unlock
}

supervise() {
    # Restart the bot whenever it exits, unless a stop was requested.
    local delay=5
    rm -f "$STOPFLAG"
    while [ ! -f "$STOPFLAG" ]; do
        echo "=== starting bot.py at $(date '+%Y-%m-%d %H:%M:%S') ===" >>"$LOG"
        python "$DIR/bot.py" >>"$LOG" 2>&1 &
        echo $! >"$PIDFILE"
        wait "$(cat "$PIDFILE")"
        code=$?
        [ -f "$STOPFLAG" ] && break
        echo "=== bot.py exited (code $code); restarting in ${delay}s ===" >>"$LOG"
        sleep "$delay"
        # Back off up to a minute so a persistent failure does not spin the CPU.
        delay=$(( delay * 2 )); [ "$delay" -gt 60 ] && delay=60
    done
    rm -f "$PIDFILE" "$LOOPPID"
    echo "=== supervisor stopped at $(date '+%Y-%m-%d %H:%M:%S') ===" >>"$LOG"
}

running() {
    [ -f "$LOOPPID" ] && kill -0 "$(cat "$LOOPPID")" 2>/dev/null
}

case "${1:-start}" in
    start)
        if running; then
            echo "already running (supervisor pid $(cat "$LOOPPID"))."
            exit 0
        fi
        if [ ! -f "$DIR/.env" ] && [ -z "${TELEGRAM_TOKEN:-}" ]; then
            echo "ERROR: no .env and TELEGRAM_TOKEN is unset — the bot would exit immediately."
            echo "  printf 'TELEGRAM_TOKEN=xxx\\nSTRATEGY=breakout\\n' > $DIR/.env"
            exit 1
        fi
        wake_lock
        # setsid detaches from the terminal so closing Termux does not kill it.
        if have setsid; then
            setsid bash "$0" _supervise </dev/null >>"$LOG" 2>&1 &
        else
            nohup bash "$0" _supervise </dev/null >>"$LOG" 2>&1 &
        fi
        echo $! >"$LOOPPID"
        sleep 2
        echo "started. supervisor pid $(cat "$LOOPPID")"
        echo "log: $LOG   (follow it with: bash run_bot.sh log)"
        echo "it will keep running — and restart itself — until: bash run_bot.sh stop"
        # The supervisor here only survives as long as Android lets this process
        # group live. Hand a second copy of the job to Android itself, which
        # outlives Termux being swiped away. Skipped when the watchdog is what
        # called us, so a restart does not re-register on every cycle.
        if [ -x "$DIR/watchdog.sh" ] && [ "${WATCHDOG_CALLING:-}" != "1" ]; then
            bash "$DIR/watchdog.sh" install 2>/dev/null | sed 's/^/  /'
        fi
        ;;
    _supervise)
        supervise
        ;;
    stop)
        touch "$STOPFLAG"
        [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
        [ -f "$LOOPPID" ] && kill "$(cat "$LOOPPID")" 2>/dev/null
        sleep 1
        pkill -f "python .*bot\.py" 2>/dev/null
        rm -f "$PIDFILE" "$LOOPPID"
        wake_unlock
        echo "stopped."
        ;;
    status)
        if running; then
            echo "RUNNING (supervisor pid $(cat "$LOOPPID"), bot pid $(cat "$PIDFILE" 2>/dev/null))"
        else
            echo "NOT running"
        fi
        # A live pid is not the same as a working loop, so report the heartbeat
        # too — that is the number that says whether it is actually doing its job.
        if [ -f "$DIR/.bot.heartbeat" ]; then
            echo "heartbeat: $(( $(date +%s) - $(stat -c %Y "$DIR/.bot.heartbeat") ))s old"
        else
            echo "heartbeat: (none yet)"
        fi
        [ -f "$LOG" ] && { echo "--- last 12 log lines ---"; tail -n 12 "$LOG"; }
        ;;
    log)
        tail -f "$LOG"
        ;;
    *)
        echo "usage: bash run_bot.sh [start|stop|status|log]"
        exit 1
        ;;
esac
