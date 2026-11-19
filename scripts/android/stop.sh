#!/data/data/com.termux/files/usr/bin/sh
# Stops the dashboard started by start.sh (the restart loop and the node server).
DIR="$HOME/miner-dashboard"
PIDFILE="$DIR/logs/start.pid"
[ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
rm -f "$PIDFILE"
# Next renames the node process: its cmdline becomes "node next-server (vX.Y.Z)".
# On SIGTERM it waits for open connections, and the live feed (SSE) never closes: KILL after 5 s.
# No pkill: in Termux it is a link to pgrep and may run as pgrep (only prints the pids).
PAT="next-server [(]v"
pids=$(pgrep -f "$PAT")
[ -n "$pids" ] && kill $pids 2>/dev/null
for i in 1 2 3 4 5; do pgrep -f "$PAT" >/dev/null || break; sleep 1; done
pids=$(pgrep -f "$PAT")
[ -n "$pids" ] && kill -9 $pids 2>/dev/null
command -v termux-wake-unlock >/dev/null && termux-wake-unlock
echo stopped
