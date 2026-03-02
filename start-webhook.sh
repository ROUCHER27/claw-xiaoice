#!/bin/bash

# XiaoIce Webhook - Start Script
# Starts the webhook proxy with proper environment setup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Starting XiaoIce Webhook Proxy"
echo "=========================================="
echo ""

# Check if OpenClaw is available
if ! command -v openclaw &> /dev/null; then
    echo "❌ Error: openclaw command not found"
    echo "Please ensure OpenClaw is installed and in PATH"
    exit 1
fi

# Check if OpenClaw Gateway is running
if ! nc -z localhost 18789 2>/dev/null; then
    echo "⚠️  Warning: OpenClaw Gateway (port 18789) is not responding"
    echo "The webhook will start but may fail to process requests"
    echo ""
fi

# Load environment variables if .env file exists
if [ -f .env ]; then
    echo "Loading environment variables from .env"
    export $(grep -v '^#' .env | xargs)
fi

# Display configuration
echo "Configuration:"
echo "  Port: ${PORT:-3002}"
echo "  Access Key: ${XIAOICE_ACCESS_KEY:-test-key}"
echo "  Timeout: ${XIAOICE_TIMEOUT:-18000}ms"
echo "  Auth Required: ${XIAOICE_AUTH_REQUIRED:-true}"
echo ""

# Check authentication status and warn if disabled
if [ "${XIAOICE_AUTH_REQUIRED}" = "false" ]; then
    echo "⚠️  WARNING: Authentication is DISABLED"
    echo "⚠️  This should ONLY be used in development/testing"
    echo "⚠️  NEVER use this configuration in production"
    echo ""
    read -p "Continue with authentication disabled? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        exit 1
    fi
    echo ""
fi

# Start the webhook proxy
echo "Starting webhook-proxy.js..."
echo ""

# Save PID for monitoring
WEBHOOK_LOG="$SCRIPT_DIR/webhook.log"
WEBHOOK_PID_FILE="$SCRIPT_DIR/webhook.pid"

# Start with logging
node webhook-proxy.js 2>&1 | tee -a "$WEBHOOK_LOG" &
WEBHOOK_PID=$!

echo $WEBHOOK_PID > "$WEBHOOK_PID_FILE"
echo "Webhook started with PID: $WEBHOOK_PID"
echo "Log file: $WEBHOOK_LOG"
echo ""
echo "To monitor logs: ./monitor-webhook.sh"
echo "To stop: kill $WEBHOOK_PID"

# Wait for the process
wait $WEBHOOK_PID
