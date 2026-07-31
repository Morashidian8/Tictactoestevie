#!/data/data/com.termux/files/usr/bin/bash
#
# Keep the bot alive across Android killing Termux outright.
#
#   bash install_watchdog.sh          # install
#   bash install_watchdog.sh status   # is it registered?
#   bash install_watchdog.sh remove   # uninstall
#
# Why run_bot.sh is not enough: its supervisor restarts bot.py when bot.py
# exits, but Android kills the WHOLE process group — supervisor included — and
# then nothing is left to restart anything. A 44-hour outage happened exactly
# that way: the last log line before the gap was a normal candle, and there was
# no restart line after it, because the supervisor died too.
#
# The fix has to live outside Termux. Android's JobScheduler does: a persisted
# job survives the app being killed and survives reboot, and re-launches the
# script on a schedule. The script itself is a no-op when the bot is already
# running, so re-running it costs nothing.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
BOOT="$HOME/.termux/boot"
LAUNCH="$BOOT/start-bot.sh"
PERIOD_MS="${WATCHDOG_PERIOD_MS:-900000}"   # 15 minutes; Android's floor is ~15

have() { command -v "$1" >/dev/null 2>&1; }

write_launcher() {
    mkdir -p "$BOOT"
    cat > "$LAUNCH" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Launched by Termux:Boot at power-on and by termux-job-scheduler periodically.
# run_bot.sh start is a no-op when the supervisor is already alive.
termux-wake-lock 2>/dev/null
cd "$DIR" || exit 1
bash run_bot.sh start >> "$DIR/watchdog.log" 2>&1
EOF
    chmod +x "$LAUNCH"
    echo "launcher: $LAUNCH"
}

case "${1:-install}" in
    install)
        write_launcher
        if ! have termux-job-scheduler; then
            echo
            echo "⚠️  termux-job-scheduler not found — the periodic watchdog cannot be"
            echo "    installed, so Android killing Termux will still stop the bot."
            echo "    Install the Termux:API *app* (F-Droid/Play), then:  pkg install termux-api"
            echo "    Boot-time start still works if the Termux:Boot app is installed."
            exit 1
        fi
        # --persisted survives reboot; --period-ms is clamped to ~15 min by Android.
        termux-job-scheduler \
            --script "$LAUNCH" \
            --period-ms "$PERIOD_MS" \
            --persisted true \
            --network any
        echo
        echo "✅ watchdog installed — Android will re-launch the bot every ~15 minutes"
        echo "   if it is not running, including after a reboot or an OOM kill."
        echo "   Check with: bash install_watchdog.sh status"
        ;;
    status)
        have termux-job-scheduler && termux-job-scheduler --pending \
            || echo "termux-job-scheduler not installed"
        echo "--- launcher ---"
        [ -f "$LAUNCH" ] && echo "present: $LAUNCH" || echo "MISSING: $LAUNCH"
        echo "--- bot ---"
        bash "$DIR/run_bot.sh" status | head -3
        ;;
    remove)
        have termux-job-scheduler && termux-job-scheduler --cancel-all
        rm -f "$LAUNCH"
        echo "watchdog removed (the bot itself keeps running until run_bot.sh stop)"
        ;;
    *)
        echo "usage: bash install_watchdog.sh [install|status|remove]"
        exit 1
        ;;
esac
