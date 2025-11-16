#!/bin/bash

SCRIPT="api.py"
PID_FILE="api.pid"
LOG_FILE="api.log"

set -a
source .env
set +a

start() {
  if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "$SCRIPT is already running with PID $(cat "$PID_FILE")"
    exit 1
  fi

  nohup python3 "$SCRIPT" > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Started $SCRIPT with PID $(cat "$PID_FILE")"
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found for $SCRIPT"
    exit 1
  fi

  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Stopped $SCRIPT (PID $PID)"
    rm "$PID_FILE"
  else
    echo "Process $PID not running"
    rm "$PID_FILE"
  fi
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "$SCRIPT is running with PID $(cat "$PID_FILE")"
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