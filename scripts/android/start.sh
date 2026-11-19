#!/data/data/com.termux/files/usr/bin/sh
# Runs the dashboard on an Android phone in Termux (installed by scripts/deploy-android.ps1).
# Keeps the CPU awake, restarts the server if it exits and writes logs/server.log.
# Started at boot by ~/.termux/boot/miner-dashboard (Termux:Boot); by hand: sh ~/miner-dashboard/start.sh &
# Settings: ~/miner-dashboard/env.sh (PORT, SCAN_SUBNETS, TELEGRAM_BOT_TOKEN, ...), optional.

DIR="$HOME/miner-dashboard"
LOG="$DIR/logs/server.log"
PIDFILE="$DIR/logs/start.pid"
mkdir -p "$DIR/logs" "$DIR/data"

# Only one copy of the loop.
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "already running (pid $(cat "$PIDFILE"))"
  exit 0
fi
echo $$ > "$PIDFILE"

command -v termux-wake-lock >/dev/null && termux-wake-lock

export PORT=3100 HOSTNAME=0.0.0.0 NODE_ENV=production DATA_DIR="$DIR/data"
[ -f "$DIR/env.sh" ] && . "$DIR/env.sh"

while :; do
  # Keep the log small: the phone runs for months.
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then mv -f "$LOG" "$LOG.old"; fi
  echo "=== $(date '+%F %T') start" >> "$LOG"
  (cd "$DIR/app" && node --max-old-space-size=256 server.js) >> "$LOG" 2>&1
  echo "=== $(date '+%F %T') exit $?, restart in 10 s" >> "$LOG"
  sleep 10
done
