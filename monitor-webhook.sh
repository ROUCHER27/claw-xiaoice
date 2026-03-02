#!/bin/bash

# Webhook Monitor - Real-time log viewer with connection status

WEBHOOK_LOG="/home/yirongbest/.openclaw/webhook.log"
WEBHOOK_PID_FILE="/home/yirongbest/.openclaw/webhook.pid"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo -e "${BLUE}=========================================="
echo "XiaoIce Webhook Monitor"
echo -e "==========================================${NC}\n"

# Check if webhook is running
check_status() {
    if [ -f "$WEBHOOK_PID_FILE" ]; then
        PID=$(cat "$WEBHOOK_PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Webhook Status: RUNNING (PID: $PID)${NC}"
        else
            echo -e "${RED}✗ Webhook Status: STOPPED (stale PID file)${NC}"
            rm -f "$WEBHOOK_PID_FILE"
            return 1
        fi
    else
        echo -e "${RED}✗ Webhook Status: NOT RUNNING${NC}"
        return 1
    fi
}

# Check port
check_port() {
    if netstat -tln 2>/dev/null | grep -q ":3002 " || ss -tln 2>/dev/null | grep -q ":3002 "; then
        echo -e "${GREEN}✓ Port 3002: LISTENING${NC}"
    else
        echo -e "${RED}✗ Port 3002: NOT LISTENING${NC}"
    fi
}

# Check OpenClaw Gateway
check_gateway() {
    if netstat -tln 2>/dev/null | grep -q ":18789 " || ss -tln 2>/dev/null | grep -q ":18789 "; then
        echo -e "${GREEN}✓ OpenClaw Gateway (18789): RUNNING${NC}"
    else
        echo -e "${YELLOW}⚠ OpenClaw Gateway (18789): NOT RUNNING${NC}"
    fi
}

# Display status
check_status
check_port
check_gateway

echo -e "\n${BLUE}------------------------------------------${NC}"
echo -e "${YELLOW}Real-time Logs (Ctrl+C to exit):${NC}"
echo -e "${BLUE}------------------------------------------${NC}\n"

# Tail logs if webhook is running
if [ -f "$WEBHOOK_LOG" ]; then
    tail -f "$WEBHOOK_LOG" | while read line; do
        # Color code different log levels
        if echo "$line" | grep -q "\[ERROR\]"; then
            echo -e "${RED}$line${NC}"
        elif echo "$line" | grep -q "\[WARN\]"; then
            echo -e "${YELLOW}$line${NC}"
        elif echo "$line" | grep -q "\[INFO\]"; then
            echo -e "${GREEN}$line${NC}"
        else
            echo "$line"
        fi
    done
else
    echo -e "${YELLOW}No log file found. Webhook may not be started yet.${NC}"
    echo -e "\nTo start webhook: ${GREEN}./start-webhook.sh${NC}"
fi
