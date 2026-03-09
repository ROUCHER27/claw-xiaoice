#!/bin/bash

# Real-time webhook dashboard

WEBHOOK_LOG="/home/yirongbest/.openclaw/webhook.log"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           XiaoIce Webhook - Live Monitor                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Status check
echo -e "${BLUE}[Status Check]${NC}"
WEBHOOK_PATTERN="node.*webhook-proxy(-new)?\\.js"
if ps aux | grep -v grep | grep -Eq "$WEBHOOK_PATTERN"; then
    PID=$(ps aux | grep -v grep | grep -E "$WEBHOOK_PATTERN" | awk '{print $2}' | head -1)
    ENTRY=$(ps -p $PID -o args= | awk '{print $NF}')
    echo -e "  ${GREEN}✓ Webhook: RUNNING (PID: $PID)${NC}"
    echo -e "    Entry: ${CYAN}$ENTRY${NC}"
else
    echo -e "  ${RED}✗ Webhook: STOPPED${NC}"
fi

if netstat -tln 2>/dev/null | grep -q ":3002 " || ss -tln 2>/dev/null | grep -q ":3002 "; then
    echo -e "  ${GREEN}✓ Port 3002: LISTENING${NC}"
else
    echo -e "  ${RED}✗ Port 3002: NOT LISTENING${NC}"
fi

if netstat -tln 2>/dev/null | grep -q ":18789 " || ss -tln 2>/dev/null | grep -q ":18789 "; then
    echo -e "  ${GREEN}✓ OpenClaw Gateway: RUNNING${NC}"
else
    echo -e "  ${YELLOW}⚠ OpenClaw Gateway: NOT RUNNING${NC}"
fi

if pgrep -f "ngrok http" > /dev/null; then
    echo -e "  ${GREEN}✓ Ngrok Tunnel: RUNNING${NC}"
    export NO_PROXY=localhost,127.0.0.1
    PUBLIC_URL=$(curl -s --max-time 2 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)
    if [ -n "$PUBLIC_URL" ]; then
        echo -e "    Public URL: ${CYAN}$PUBLIC_URL${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Ngrok Tunnel: NOT RUNNING${NC}"
fi

echo ""
echo -e "${BLUE}[Endpoints]${NC}"
echo -e "  Webhook: ${CYAN}http://localhost:3002/webhooks/xiaoice${NC}"
echo -e "  Health:  ${CYAN}http://localhost:3002/health${NC}"

echo ""
echo -e "${BLUE}[Live Logs]${NC} ${YELLOW}(Press Ctrl+C to exit)${NC}"
echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
echo ""

# Tail logs with color coding
tail -f "$WEBHOOK_LOG" 2>/dev/null | while IFS= read -r line; do
    if echo "$line" | grep -q "\[ERROR\]"; then
        echo -e "${RED}$line${NC}"
    elif echo "$line" | grep -q "\[WARN\]"; then
        echo -e "${YELLOW}$line${NC}"
    elif echo "$line" | grep -q "\[INFO\]"; then
        if echo "$line" | grep -q "Webhook request"; then
            echo -e "${CYAN}$line${NC}"
        elif echo "$line" | grep -q "Signature verification passed"; then
            echo -e "${GREEN}$line${NC}"
        else
            echo -e "${GREEN}$line${NC}"
        fi
    else
        echo "$line"
    fi
done
