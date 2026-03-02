#!/bin/bash

# Webhook Status Dashboard

export NO_PROXY=localhost,127.0.0.1

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         XiaoIce Webhook - Status Dashboard               ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Process Status
echo -e "${BLUE}[1] Process Status${NC}"
if ps aux | grep -v grep | grep -q "node.*webhook-proxy.js"; then
    PID=$(ps aux | grep -v grep | grep "node.*webhook-proxy.js" | awk '{print $2}' | head -1)
    UPTIME=$(ps -p $PID -o etime= | xargs)
    echo -e "  ${GREEN}✓ Webhook Proxy: RUNNING${NC}"
    echo -e "    PID: $PID | Uptime: $UPTIME"
else
    echo -e "  ${RED}✗ Webhook Proxy: STOPPED${NC}"
fi

if ps aux | grep -v grep | grep -q "openclaw-gateway"; then
    GATEWAY_PID=$(ps aux | grep -v grep | grep "openclaw-gateway" | awk '{print $2}' | head -1)
    echo -e "  ${GREEN}✓ OpenClaw Gateway: RUNNING${NC}"
    echo -e "    PID: $GATEWAY_PID"
else
    echo -e "  ${YELLOW}⚠ OpenClaw Gateway: NOT RUNNING${NC}"
fi

if pgrep -f "ngrok http" > /dev/null; then
    NGROK_PID=$(pgrep -f "ngrok http" | head -1)
    NGROK_UPTIME=$(ps -p $NGROK_PID -o etime= | xargs)
    echo -e "  ${GREEN}✓ Ngrok Tunnel: RUNNING${NC}"
    echo -e "    PID: $NGROK_PID | Uptime: $NGROK_UPTIME"
else
    echo -e "  ${YELLOW}⚠ Ngrok Tunnel: NOT RUNNING${NC}"
fi

echo ""

# 2. Port Status
echo -e "${BLUE}[2] Port Status${NC}"
if netstat -tln 2>/dev/null | grep -q ":3002 " || ss -tln 2>/dev/null | grep -q ":3002 "; then
    echo -e "  ${GREEN}✓ Port 3002 (Webhook): LISTENING${NC}"
else
    echo -e "  ${RED}✗ Port 3002 (Webhook): NOT LISTENING${NC}"
fi

if netstat -tln 2>/dev/null | grep -q ":18789 " || ss -tln 2>/dev/null | grep -q ":18789 "; then
    echo -e "  ${GREEN}✓ Port 18789 (Gateway): LISTENING${NC}"
else
    echo -e "  ${YELLOW}⚠ Port 18789 (Gateway): NOT LISTENING${NC}"
fi

echo ""

# 3. Ngrok Tunnel Info
if pgrep -f "ngrok http" > /dev/null; then
    echo -e "${BLUE}[3] Ngrok Tunnel${NC}"
    PUBLIC_URL=$(curl -s --max-time 2 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)

    if [ -n "$PUBLIC_URL" ]; then
        echo -e "  ${GREEN}✓ Tunnel Active${NC}"
        echo -e "    Public URL: ${CYAN}$PUBLIC_URL${NC}"
        echo -e "    Webhook: ${CYAN}$PUBLIC_URL/webhooks/xiaoice${NC}"
        echo -e "    Web UI: ${CYAN}http://localhost:4040${NC}"
    else
        echo -e "  ${YELLOW}⚠ Tunnel establishing...${NC}"
    fi
    echo ""
fi

# 4. Health Check
echo -e "${BLUE}[4] Health Check${NC}"
HEALTH=$(curl -s --max-time 2 http://localhost:3002/health 2>/dev/null)
if echo "$HEALTH" | grep -q "ok"; then
    echo -e "  ${GREEN}✓ Health Endpoint: OK${NC}"
    echo -e "    Response: $HEALTH"
else
    echo -e "  ${RED}✗ Health Endpoint: FAILED${NC}"
fi

echo ""

# 5. Recent Activity
echo -e "${BLUE}[5] Recent Activity (Last 10 log entries)${NC}"
if [ -f "/home/yirongbest/.openclaw/webhook.log" ]; then
    tail -10 /home/yirongbest/.openclaw/webhook.log | while IFS= read -r line; do
        if echo "$line" | grep -q "\[ERROR\]"; then
            echo -e "  ${RED}$line${NC}"
        elif echo "$line" | grep -q "\[WARN\]"; then
            echo -e "  ${YELLOW}$line${NC}"
        elif echo "$line" | grep -q "\[INFO\]"; then
            echo -e "  ${GREEN}$line${NC}"
        else
            echo "  $line"
        fi
    done
else
    echo -e "  ${YELLOW}No log file found${NC}"
fi

echo ""

# 6. Request Statistics
echo -e "${BLUE}[6] Request Statistics${NC}"
if [ -f "/home/yirongbest/.openclaw/webhook.log" ]; then
    TOTAL_REQUESTS=$(grep -c "Webhook request:" /home/yirongbest/.openclaw/webhook.log 2>/dev/null || echo 0)
    AUTH_SUCCESS=$(grep -c "Signature verification passed" /home/yirongbest/.openclaw/webhook.log 2>/dev/null || echo 0)
    AUTH_FAILED=$(grep -c "Authentication failed" /home/yirongbest/.openclaw/webhook.log 2>/dev/null || echo 0)
    TIMEOUTS=$(grep -c "OpenClaw timeout" /home/yirongbest/.openclaw/webhook.log 2>/dev/null || echo 0)

    echo -e "  Total Requests: ${CYAN}$TOTAL_REQUESTS${NC}"
    echo -e "  Auth Success: ${GREEN}$AUTH_SUCCESS${NC}"
    echo -e "  Auth Failed: ${RED}$AUTH_FAILED${NC}"
    echo -e "  Timeouts: ${YELLOW}$TIMEOUTS${NC}"
fi

echo ""

# 7. Quick Actions
echo -e "${BLUE}[7] Quick Actions${NC}"
echo -e "  Ngrok status:      ${CYAN}./ngrok-status.sh${NC}"
echo -e "  XiaoIce config:    ${CYAN}./xiaoice-config.sh${NC}"
echo -e "  View live logs:    ${CYAN}./watch-logs.sh${NC}"
echo -e "  Run tests:         ${CYAN}./test-quick.sh${NC}"
echo -e "  Stop webhook:      ${CYAN}kill \$(cat webhook.pid)${NC}"
echo -e "  Restart webhook:   ${CYAN}./start-webhook.sh${NC}"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
