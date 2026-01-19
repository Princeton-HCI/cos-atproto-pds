#!/bin/bash

SCRIPT="embed_authors.py"
PID_FILE="embed_authors.pid"
LOG_FILE="embed_authors.log"

set -a
source .env
set +a

start() {
  current=$(pgrep -f "$SCRIPT" | wc -l)
  needed=$((2 - current))
  if [ "$needed" -le 0 ]; then
    echo "Already 2 instances of $SCRIPT running"
    exit 1
  fi

  for i in $(seq 1 "$needed"); do
    nohup python3 "$SCRIPT" > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Started $SCRIPT instance $i with PID $(cat "$PID_FILE")"
  done
}

stop() {
  pkill -f "$SCRIPT"
  echo "Stopped all instances of $SCRIPT"
  rm -f "$PID_FILE"
}

status() {
  count=$(pgrep -f "$SCRIPT" | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "$count instance(s) of $SCRIPT running"
    pgrep -f "$SCRIPT"
  else
    echo "$SCRIPT is not running"
  fi
}

case "$1" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|status}" ;;
esac