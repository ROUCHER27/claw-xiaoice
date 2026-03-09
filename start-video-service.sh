#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VIDEO_SERVICE_LOG="$SCRIPT_DIR/video-service.log"
VIDEO_SERVICE_PID_FILE="$SCRIPT_DIR/video-service.pid"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export VIDEO_TASK_SERVICE_PORT="${VIDEO_TASK_SERVICE_PORT:-3105}"
export VIDEO_SERVICE_INTERNAL_TOKEN="${VIDEO_SERVICE_INTERNAL_TOKEN:-video-internal-token}"
export VIDEO_SERVICE_ADMIN_TOKEN="${VIDEO_SERVICE_ADMIN_TOKEN:-video-admin-token}"
export VIDEO_SERVICE_CALLBACK_TOKEN="${VIDEO_SERVICE_CALLBACK_TOKEN:-video-callback-token}"
export VIDEO_USE_NGROK="${VIDEO_USE_NGROK:-false}"

if [ -f "$VIDEO_SERVICE_PID_FILE" ]; then
  OLD_PID="$(cat "$VIDEO_SERVICE_PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "Stopping old video service process: $OLD_PID"
    kill -TERM "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

# Ngrok 集成（可选）
if [ "$VIDEO_USE_NGROK" = "true" ]; then
  echo "VIDEO_USE_NGROK enabled, checking ngrok status..."

  # 检查 ngrok 是否运行
  if ! pgrep -f "ngrok" > /dev/null; then
    echo "Starting ngrok..."
    if [ -f "$SCRIPT_DIR/start-ngrok.sh" ]; then
      "$SCRIPT_DIR/start-ngrok.sh"
    else
      echo "Warning: start-ngrok.sh not found, skipping ngrok startup"
    fi
  else
    echo "Ngrok already running"
  fi

  # 等待隧道建立
  sleep 2
fi

echo "Starting video task service on port ${VIDEO_TASK_SERVICE_PORT}..."
nohup node services/video-task-service/cli.js >> "$VIDEO_SERVICE_LOG" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$VIDEO_SERVICE_PID_FILE"

sleep 1
if ! ps -p "$NEW_PID" >/dev/null 2>&1; then
  echo "Video service failed to start. Recent logs:"
  tail -20 "$VIDEO_SERVICE_LOG" || true
  exit 1
fi

echo "Video service started. PID=$NEW_PID"
echo "Health: http://127.0.0.1:${VIDEO_TASK_SERVICE_PORT}/health"
echo "Logs: $VIDEO_SERVICE_LOG"

# 自动更新回调 URL（如果启用 ngrok）
if [ "$VIDEO_USE_NGROK" = "true" ]; then
  echo ""
  echo "Updating video callback URL..."
  sleep 1

  if [ -f "$SCRIPT_DIR/update-video-callback.sh" ]; then
    "$SCRIPT_DIR/update-video-callback.sh" || echo "Warning: Failed to update callback URL"
  else
    echo "Warning: update-video-callback.sh not found"
  fi
fi
