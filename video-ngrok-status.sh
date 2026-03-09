#!/bin/bash

# video-ngrok-status.sh
# Check ngrok status and display video callback tunnel information
#
# Usage:
#   ./video-ngrok-status.sh
#
# This script:
#   - Checks if ngrok process is running
#   - Queries ngrok API at http://localhost:4040/api/tunnels
#   - Finds tunnel named "video-callback"
#   - Displays public URL and callback endpoint
#   - Shows connection statistics

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

NGROK_API="http://localhost:4040/api/tunnels"
TUNNEL_NAME="video-callback"

echo "=== Video Service Ngrok Status ==="
echo

# Check if ngrok process is running
if ! pgrep -x "ngrok" > /dev/null; then
    echo -e "${RED}✗ Ngrok is not running${NC}"
    echo
    echo "To start ngrok with video callback tunnel:"
    echo "  cd /home/yirongbest/.openclaw"
    echo "  ./start-ngrok.sh"
    exit 1
fi

echo -e "${GREEN}✓ Ngrok process is running${NC}"
echo

# Query ngrok API
if ! curl -s --connect-timeout 5 "$NGROK_API" > /dev/null 2>&1; then
    echo -e "${RED}✗ Cannot connect to ngrok API at $NGROK_API${NC}"
    echo
    echo "Ngrok process is running but API is not accessible."
    echo "This may indicate ngrok is starting up or misconfigured."
    exit 1
fi

# Get tunnels data
TUNNELS_JSON=$(curl -s "$NGROK_API")

# Check if video-callback tunnel exists
if ! echo "$TUNNELS_JSON" | grep -q "\"name\":\"$TUNNEL_NAME\""; then
    echo -e "${YELLOW}⚠ Tunnel '$TUNNEL_NAME' not found${NC}"
    echo
    echo "Available tunnels:"
    echo "$TUNNELS_JSON" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//' | sed 's/^/  - /'
    echo
    echo "To configure the video-callback tunnel:"
    echo "  1. Edit ~/.ngrok2/ngrok.yml to add the tunnel configuration"
    echo "  2. Restart ngrok with: ngrok start xiaoice-webhook video-callback"
    exit 1
fi

echo -e "${GREEN}✓ Tunnel '$TUNNEL_NAME' found${NC}"
echo

# Extract tunnel information using grep and sed (more portable than jq)
PUBLIC_URL=$(echo "$TUNNELS_JSON" | grep -A 20 "\"name\":\"$TUNNEL_NAME\"" | grep '"public_url"' | head -1 | sed 's/.*"public_url":"\([^"]*\)".*/\1/')
LOCAL_ADDR=$(echo "$TUNNELS_JSON" | grep -A 20 "\"name\":\"$TUNNEL_NAME\"" | grep '"addr"' | head -1 | sed 's/.*"addr":"[^:]*:\([^"]*\)".*/\1/')
PROTO=$(echo "$TUNNELS_JSON" | grep -A 20 "\"name\":\"$TUNNEL_NAME\"" | grep '"proto"' | head -1 | sed 's/.*"proto":"\([^"]*\)".*/\1/')

# Get connection metrics
CONNS=$(echo "$TUNNELS_JSON" | grep -A 20 "\"name\":\"$TUNNEL_NAME\"" | grep '"count"' | head -1 | sed 's/.*"count":\([0-9]*\).*/\1/')

if [ -z "$PUBLIC_URL" ]; then
    echo -e "${RED}✗ Failed to extract public URL from ngrok API${NC}"
    exit 1
fi

# Display tunnel information
echo -e "${BLUE}Tunnel Information:${NC}"
echo "  Name:        $TUNNEL_NAME"
echo "  Protocol:    $PROTO"
echo "  Local Port:  $LOCAL_ADDR"
echo "  Public URL:  $PUBLIC_URL"
echo

# Construct callback endpoint
CALLBACK_ENDPOINT="${PUBLIC_URL}/v1/callbacks/provider"
echo -e "${BLUE}Callback Endpoint:${NC}"
echo "  $CALLBACK_ENDPOINT"
echo

# Display connection statistics
echo -e "${BLUE}Connection Statistics:${NC}"
echo "  Total Connections: ${CONNS:-0}"
echo

# Check if URL file exists and matches
URL_FILE="/home/yirongbest/.openclaw/.video-ngrok-url"
if [ -f "$URL_FILE" ]; then
    CACHED_URL=$(cat "$URL_FILE")
    if [ "$CACHED_URL" = "$PUBLIC_URL" ]; then
        echo -e "${GREEN}✓ Cached URL matches current tunnel${NC}"
    else
        echo -e "${YELLOW}⚠ Cached URL differs from current tunnel${NC}"
        echo "  Cached:  $CACHED_URL"
        echo "  Current: $PUBLIC_URL"
        echo
        echo "Run update-video-callback.sh to sync the configuration."
    fi
else
    echo -e "${YELLOW}⚠ URL cache file not found: $URL_FILE${NC}"
    echo "  This file should be created by start-ngrok.sh"
fi

echo
echo -e "${GREEN}Ngrok Web UI:${NC} http://localhost:4040"
echo

# Provide next steps
echo "Next steps:"
echo "  1. Update video service callback URL:"
echo "     ./update-video-callback.sh"
echo "  2. View ngrok traffic in real-time:"
echo "     http://localhost:4040"
