#!/data/data/com.termux/files/usr/bin/bash
#
# Bring the bot back whenever it stops working — without being asked.
#
#   bash watchdog.sh          # one check; restart if needed. Safe to repeat.
#   bash watchdog.sh install  # ask Android to run that check every 15 minutes
#   bash watchdog.sh remove   # stop the periodic check
#   bash watchdog.sh status   # what the watchdog currently sees
#
# There are three ways the bot goes quiet, and run_bot.sh only catches one:
#
#   1. bot.py exits          -> run_bot.sh's supervisor already restarts it.
#   2. bot.py wedges         -> pid alive, loop stuck, supervisor sees nothing
#                               wrong. Caught here, via the heartbeat file.
#   3. Android kills the lot -> supervisor gone too, so nothing is left running
#                               to notice. Caught here, because Android itself
#                               is what schedules this script.
#
# Case 3 is why `install` uses termux-job-scheduler rather than a background
# loop: a loop we start is inside the same process group Android just killed.
# JobScheduler lives in the system, survives the app being swiped away, and
# with --persisted survives a reboot.

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
LOOPPID="$DIR/.bot.loop.pid"
STOPFLAG="$DIR/.bot.stop"
BEAT="$DIR/.bot.heartbeat"
LOG="$DIR/watchdog.log"
LOOPFILE="$DIR/.watchdog.loop.pid"

# Three missed 5-minute windows. Long enough that a slow network, a pre-alert
# pause or a phone doze never trips it; short enough that a real wedge is caught
# within one window of it mattering.
STALE_AFTER=${STALE_AFTER:-900}
# A fresh start has not had time to beat yet. Judging it by the heartbeat would
# restart it immediately, forever.
BOOT_GRACE=${BOOT_GRACE:-180}
PERIOD_MS=${PERIOD_MS:-900000}

have() { command -v "$1" >/dev/null 2>&1; }
now() { date +%s; }
say() { echo "$(date '+%Y-%m-%d %H:%M:%S') | $*" >>"$LOG"; echo "$*"; }

# Run a command with a time limit, whether or not coreutils' `timeout` is here.
run_limited() {
    local secs="$1"; shift
    if have timeout; then
        timeout "$secs" "$@" >/dev/null 2>&1
        return $?
    fi
    "$@" >/dev/null 2>&1 &
    local pid=$! i=0
    while kill -0 "$pid" 2>/dev/null; do
        i=$((i + 1))
        [ "$i" -ge "$secs" ] && { kill "$pid" 2>/dev/null; return 124; }
        sleep 1
    done
    wait "$pid"
}

# The fallback loop is tracked by pidfile rather than found again with
# `pkill -f`. A -f pattern matches any process whose command line merely
# CONTAINS the text — including the shell that is running this script if the
# user happened to type the pattern, which during testing killed the installer
# mid-run and left no output to explain why.
stop_loop() {
    if [ -f "$LOOPFILE" ]; then
        kill "$(cat "$LOOPFILE" 2>/dev/null)" 2>/dev/null
        rm -f "$LOOPFILE"
    fi
}

mtime() { [ -f "$1" ] && stat -c %Y "$1" 2>/dev/null || echo 0; }

running() {
    [ -f "$LOOPPID" ] && kill -0 "$(cat "$LOOPPID" 2>/dev/null)" 2>/dev/null
}

# Best-effort Telegram note, so a restart is something you're told about rather
# than something you'd have to check for. Never allowed to fail the restart.
notify() {
    local token chat
    # Read the two values out rather than sourcing .env: a single unquoted
    # value with a space in it would otherwise execute as a command.
    token="$(sed -n 's/^TELEGRAM_TOKEN=//p' "$DIR/.env" 2>/dev/null | head -1 | tr -d "\"' \r")"
    chat="$(sed -n 's/^TELEGRAM_CHAT_ID=//p' "$DIR/.env" 2>/dev/null | head -1 | tr -d "\"' \r")"
    [ -z "$chat" ] && [ -f "$DIR/.chat_id" ] && chat="$(cat "$DIR/.chat_id")"
    if [ -n "$token" ] && [ -n "$chat" ]; then
        curl -s -m 15 -X POST "https://api.telegram.org/bot$token/sendMessage" \
            -d "chat_id=$chat" -d "text=$1" >/dev/null 2>&1 || true
    fi
}

restart() {
    say "restarting: $1"
    bash "$DIR/run_bot.sh" stop  >/dev/null 2>&1
    # `stop` sets the stop flag and only `supervise` clears it. If start fails
    # for any reason the flag would survive, and every later check would read it
    # as "off on purpose" and never try again — the watchdog would disable
    # itself permanently on its first bad restart.
    rm -f "$STOPFLAG"
    sleep 2
    WATCHDOG_CALLING=1 bash "$DIR/run_bot.sh" start >/dev/null 2>&1
    sleep 3
    if running; then
        say "restarted OK"
        notify "♻️ ربات از کار افتاده بود ($1) و خودکار دوباره راه افتاد. کاری لازم نیست."
    else
        say "restart FAILED — check $DIR/bot.log"
        notify "⚠️ ربات از کار افتاد و تلاشِ خودکار برای راه‌اندازی هم موفق نشد. لطفاً ترموکس را باز کن."
    fi
}

check() {
    # A deliberate stop is not a fault. Without this the watchdog would undo
    # `run_bot.sh stop` within fifteen minutes and there would be no way to
    # turn the bot off at all.
    if [ -f "$STOPFLAG" ]; then
        say "stop flag present — bot is off on purpose; doing nothing."
        return 0
    fi

    if ! running; then
        restart "supervisor not running"
        return 0
    fi

    # Started too recently to have beaten yet.
    local age_start
    age_start=$(( $(now) - $(mtime "$LOOPPID") ))
    if [ "$age_start" -lt "$BOOT_GRACE" ]; then
        say "started ${age_start}s ago — inside the ${BOOT_GRACE}s grace; OK."
        return 0
    fi

    if [ ! -f "$BEAT" ]; then
        restart "no heartbeat file"
        return 0
    fi

    local age
    age=$(( $(now) - $(mtime "$BEAT") ))
    if [ "$age" -gt "$STALE_AFTER" ]; then
        restart "heartbeat ${age}s old (limit ${STALE_AFTER}s)"
    else
        say "healthy — heartbeat ${age}s old."
    fi
}

case "${1:-check}" in
    check)
        check
        ;;
    install)
        chmod +x "$DIR/watchdog.sh" 2>/dev/null   # job-scheduler execs this file
        ok=0
        if have termux-job-scheduler; then
            # Wrapped in a timeout because the `termux-*` commands talk to the
            # Termux:API *app*, not the package. With the package installed and
            # the app missing, this call blocks forever waiting for an answer
            # that never comes — and since run_bot.sh calls install right after
            # starting the bot, that hang holds the whole start command open.
            # Protecting the bot from its own watchdog matters more than the
            # watchdog getting installed.
            if run_limited 20 termux-job-scheduler \
                    --script "$DIR/watchdog.sh" \
                    --job-id 8412 \
                    --period-ms "$PERIOD_MS" \
                    --persisted true \
                    --network any; then
                ok=1
                say "scheduled with Android every $((PERIOD_MS / 60000)) min (job 8412, persisted)."
            else
                say "termux-job-scheduler did not answer within 20s."
                say "The Termux:API *app* is probably missing — the package"
                say "alone is not enough. Install it from the same store you"
                say "installed Termux from, then re-run: bash watchdog.sh install"
            fi
        else
            say "termux-job-scheduler not found (pkg install termux-api)."
        fi
        if [ "$ok" = 0 ]; then
            say "Falling back to an in-Termux loop — it works, but does NOT"
            say "survive Android killing Termux."
            stop_loop
            setsid bash "$0" _loop </dev/null >/dev/null 2>&1 &
            echo $! >"$LOOPFILE"
            say "fallback loop started (pid $!)."
        fi
        # Also start on reboot, if Termux:Boot is installed.
        mkdir -p "$HOME/.termux/boot" 2>/dev/null && {
            cat >"$HOME/.termux/boot/btc-bot.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null
bash "$DIR/run_bot.sh" start
bash "$DIR/watchdog.sh" install
EOF
            chmod +x "$HOME/.termux/boot/btc-bot.sh"
            say "boot script written to ~/.termux/boot/btc-bot.sh"
            say "(needs the Termux:Boot app installed to actually fire)"
        }
        ;;
    _loop)
        while true; do
            sleep "$(( PERIOD_MS / 1000 ))"
            [ -f "$STOPFLAG" ] && continue
            check >/dev/null
        done
        ;;
    remove)
        have termux-job-scheduler && run_limited 20 termux-job-scheduler --cancel-job-id 8412
        stop_loop
        rm -f "$HOME/.termux/boot/btc-bot.sh"
        say "watchdog removed."
        ;;
    status)
        echo "supervisor: $(running && echo RUNNING || echo 'NOT running')"
        if [ -f "$BEAT" ]; then
            echo "heartbeat:  $(( $(now) - $(mtime "$BEAT") ))s old  ($(cat "$BEAT"))"
        else
            echo "heartbeat:  (none yet)"
        fi
        [ -f "$STOPFLAG" ] && echo "stop flag:  SET — bot is off on purpose"
        if [ -f "$LOOPFILE" ] && kill -0 "$(cat "$LOOPFILE")" 2>/dev/null; then
            echo "fallback:   in-Termux loop running (pid $(cat "$LOOPFILE"))"
        fi
        # Same hang risk as install: ask, but never wait forever for an answer.
        if have termux-job-scheduler; then
            if run_limited 15 termux-job-scheduler --pending; then
                echo "android job: $(termux-job-scheduler --pending 2>/dev/null | grep -c 8412) entr(y/ies) for 8412"
            else
                echo "android job: Termux:API app not answering — install the APP, not just the package"
            fi
        fi
        [ -f "$LOG" ] && { echo "--- last 10 watchdog lines ---"; tail -n 10 "$LOG"; }
        ;;
    *)
        echo "usage: bash watchdog.sh [check|install|remove|status]"
        exit 1
        ;;
esac
