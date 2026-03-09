#!/bin/bash

# XiaoIce Webhook - Start Script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WEBHOOK_LOG="$SCRIPT_DIR/webhook.log"
WEBHOOK_PID_FILE="$SCRIPT_DIR/webhook.pid"
WEBHOOK_ENTRY="${WEBHOOK_ENTRY:-webhook-proxy-new.js}"
WEBHOOK_PORT="${PORT:-3002}"

echo "=========================================="
echo "Starting XiaoIce Webhook Proxy"
echo "=========================================="
echo ""

# Check if OpenClaw is available
if ! command -v openclaw >/dev/null 2>&1; then
    echo "❌ Error: openclaw command not found"
    echo "Please ensure OpenClaw is installed and in PATH"
    exit 1
fi

# Load environment variables if .env file exists
if [ -f .env ]; then
    echo "Loading environment variables from .env"
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

# Development default: keep signature verification disabled until platform config is stable
export XIAOICE_AUTH_REQUIRED="${XIAOICE_AUTH_REQUIRED:-false}"
export XIAOICE_TIMEOUT="${XIAOICE_TIMEOUT:-30000}"

echo "Configuration:"
echo "  Entry: ${WEBHOOK_ENTRY}"
echo "  Port: ${PORT:-3002}"
echo "  Access Key: ${XIAOICE_ACCESS_KEY:-test-key}"
echo "  Timeout: ${XIAOICE_TIMEOUT}ms"
echo "  Auth Required: ${XIAOICE_AUTH_REQUIRED}"
echo ""

# Check if OpenClaw Gateway is running
if ! nc -z localhost 18789 2>/dev/null; then
    echo "⚠ Warning: OpenClaw Gateway (port 18789) is not responding"
    echo "The webhook will start but may fail to process requests"
    echo ""
fi

if [ ! -f "$WEBHOOK_ENTRY" ]; then
    echo "❌ Entry file not found: $WEBHOOK_ENTRY"
    exit 1
fi

graceful_stop_pid() {
    local target_pid="$1"
    if [ -z "$target_pid" ] || ! ps -p "$target_pid" >/dev/null 2>&1; then
        return
    fi

    kill -TERM "$target_pid" 2>/dev/null || true
    for _ in {1..20}; do
        if ! ps -p "$target_pid" >/dev/null 2>&1; then
            return
        fi
        sleep 0.25
    done

    # Escalate only after graceful stop timeout
    kill -KILL "$target_pid" 2>/dev/null || true
}

# Stop PID from previous run if still alive
if [ -f "$WEBHOOK_PID_FILE" ]; then
    OLD_PID="$(cat "$WEBHOOK_PID_FILE" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && ps -p "$OLD_PID" >/dev/null 2>&1; then
        echo "Stopping old webhook process from PID file: $OLD_PID"
        graceful_stop_pid "$OLD_PID"
    fi
    rm -f "$WEBHOOK_PID_FILE"
fi

# Stop any process still binding port
PORT_PIDS="$(lsof -ti:$WEBHOOK_PORT 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
    echo "Stopping process(es) on port $WEBHOOK_PORT: $PORT_PIDS"
    for pid in $PORT_PIDS; do
        graceful_stop_pid "$pid"
    done
fi

echo "Starting ${WEBHOOK_ENTRY}..."
nohup node "$WEBHOOK_ENTRY" >> "$WEBHOOK_LOG" 2>&1 &
WEBHOOK_PID=$!
echo "$WEBHOOK_PID" > "$WEBHOOK_PID_FILE"

# Wait for health check (must be direct localhost, not proxy)
HEALTH_URL="http://localhost:${WEBHOOK_PORT}/health"
LAST_HEALTH_CODE="000"
for _ in {1..20}; do
    if ! ps -p "$WEBHOOK_PID" >/dev/null 2>&1; then
        echo "❌ Webhook process exited before health check passed (PID: $WEBHOOK_PID)"
        tail -20 "$WEBHOOK_LOG" || true
        exit 1
    fi

    LAST_HEALTH_CODE="$(curl --noproxy "*" -sS --max-time 2 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
    if [ "$LAST_HEALTH_CODE" = "200" ]; then
        echo "Webhook started with PID: $WEBHOOK_PID"
        echo "Log file: $WEBHOOK_LOG"
        echo "Health endpoint: $HEALTH_URL"
        echo ""
        echo "To monitor logs: ./monitor-webhook.sh"
        echo "To stop: kill \$(cat webhook.pid)"
        exit 0
    fi
    sleep 0.5
done

echo "❌ Webhook failed to pass health check (last HTTP code: $LAST_HEALTH_CODE)"
tail -20 "$WEBHOOK_LOG" || true
exit 1
