#!/data/data/com.termux/files/usr/bin/bash
#
# Keep the Polymarket odds collector alive, the same way run_bot.sh keeps the
# alert bot alive — separate process, separate log, separate pid, so a problem
# with one never takes the other down.
#
#   bash run_odds.sh start
#   bash run_odds.sh stop
#   bash run_odds.sh status
#   bash run_odds.sh log
#   bash run_odds.sh report     # the summary, any time
#
# Data lands in polymarket_odds.jsonl and is only ever appended to, so stopping
# and starting costs at most the window in flight.

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.odds.pid"
LOOPPID="$DIR/.odds.loop.pid"
LOG="$DIR/odds.log"
STOPFLAG="$DIR/.odds.stop"

have() { command -v "$1" >/dev/null 2>&1; }

supervise() {
    local delay=5
    rm -f "$STOPFLAG"
    while [ ! -f "$STOPFLAG" ]; do
        echo "=== starting collector at $(date '+%Y-%m-%d %H:%M:%S') ===" >>"$LOG"
        python "$DIR/polymarket_collector.py" >>"$LOG" 2>&1 &
        echo $! >"$PIDFILE"
        wait "$(cat "$PIDFILE")"
        [ -f "$STOPFLAG" ] && break
        echo "=== collector exited; restarting in ${delay}s ===" >>"$LOG"
        sleep "$delay"
        delay=$(( delay * 2 )); [ "$delay" -gt 60 ] && delay=60
    done
    rm -f "$PIDFILE" "$LOOPPID"
}

running() { [ -f "$LOOPPID" ] && kill -0 "$(cat "$LOOPPID")" 2>/dev/null; }

case "${1:-start}" in
    start)
        if running; then echo "already running (pid $(cat "$LOOPPID"))."; exit 0; fi
        have termux-wake-lock && termux-wake-lock
        if have setsid; then
            setsid bash "$0" _supervise </dev/null >>"$LOG" 2>&1 &
        else
            nohup bash "$0" _supervise </dev/null >>"$LOG" 2>&1 &
        fi
        echo $! >"$LOOPPID"
        sleep 2
        echo "started. pid $(cat "$LOOPPID")"
        echo "log:    bash run_odds.sh log"
        echo "report: bash run_odds.sh report"
        ;;
    _supervise) supervise ;;
    stop)
        touch "$STOPFLAG"
        [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
        [ -f "$LOOPPID" ] && kill "$(cat "$LOOPPID")" 2>/dev/null
        sleep 1
        pkill -f "python .*polymarket_collector\.py" 2>/dev/null
        rm -f "$PIDFILE" "$LOOPPID"
        echo "stopped."
        ;;
    status)
        running && echo "RUNNING (pid $(cat "$LOOPPID"))" || echo "NOT running"
        [ -f "$DIR/polymarket_odds.jsonl" ] \
            && echo "پنجره‌های ثبت‌شده: $(wc -l < "$DIR/polymarket_odds.jsonl")"
        [ -f "$LOG" ] && { echo "--- last 10 ---"; tail -n 10 "$LOG"; }
        ;;
    log) tail -f "$LOG" ;;
    report) python "$DIR/polymarket_collector.py" --report ;;
    *) echo "usage: bash run_odds.sh [start|stop|status|log|report]"; exit 1 ;;
esac
