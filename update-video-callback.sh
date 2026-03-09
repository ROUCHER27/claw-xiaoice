#!/bin/bash

# update-video-callback.sh
# Update video service callback URL with current ngrok public URL
#
# Usage:
#   ./update-video-callback.sh
#
# This script:
#   - Reads public URL from /home/yirongbest/.openclaw/.video-ngrok-url
#   - Calls video service admin API: PUT http://127.0.0.1:3105/v1/admin/config
#   - Uses X-Admin-Token header from VIDEO_SERVICE_ADMIN_TOKEN env var
#   - Updates callbackPublicBaseUrl field
#   - Verifies update succeeded

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

URL_FILE="/home/yirongbest/.openclaw/.video-ngrok-url"
API_ENDPOINT="http://127.0.0.1:3105/v1/admin/config"
SERVICE_PORT=3105

echo "=== Update Video Service Callback URL ==="
echo

# Check if URL file exists
if [ ! -f "$URL_FILE" ]; then
    echo -e "${RED}✗ URL file not found: $URL_FILE${NC}"
    echo
    echo "This file should be created by start-ngrok.sh when ngrok starts."
    echo
    echo "To resolve:"
    echo "  1. Ensure ngrok is running with video-callback tunnel"
    echo "  2. Check ngrok status: ./video-ngrok-status.sh"
    echo "  3. Restart ngrok if needed: cd /home/yirongbest/.openclaw && ./start-ngrok.sh"
    exit 1
fi

# Read public URL
PUBLIC_URL=$(cat "$URL_FILE")
if [ -z "$PUBLIC_URL" ]; then
    echo -e "${RED}✗ URL file is empty: $URL_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found public URL: $PUBLIC_URL${NC}"
echo

# Check if VIDEO_SERVICE_ADMIN_TOKEN is set
if [ -z "${VIDEO_SERVICE_ADMIN_TOKEN:-}" ]; then
    echo -e "${RED}✗ VIDEO_SERVICE_ADMIN_TOKEN environment variable is not set${NC}"
    echo
    echo "This token is required to authenticate with the video service admin API."
    echo
    echo "To resolve:"
    echo "  1. Check your .env file for VIDEO_SERVICE_ADMIN_TOKEN"
    echo "  2. Source the environment: source .env"
    echo "  3. Or export manually: export VIDEO_SERVICE_ADMIN_TOKEN='your-token'"
    exit 1
fi

echo -e "${GREEN}✓ Admin token found${NC}"
echo

# Check if video service is running
if ! curl -s --connect-timeout 5 "http://127.0.0.1:$SERVICE_PORT/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Video service is not responding at http://127.0.0.1:$SERVICE_PORT${NC}"
    echo
    echo "To resolve:"
    echo "  1. Start the video service: ./start-video-service.sh"
    echo "  2. Check service logs for errors"
    exit 1
fi

echo -e "${GREEN}✓ Video service is running${NC}"
echo

# Prepare JSON payload
JSON_PAYLOAD=$(cat <<EOJSON
{
  "callbackPublicBaseUrl": "$PUBLIC_URL"
}
EOJSON
)

echo "Updating callback URL..."
echo "  Endpoint: $API_ENDPOINT"
echo "  New URL:  $PUBLIC_URL"
echo

# Call admin API
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$API_ENDPOINT" \
  -H "X-Admin-Token: $VIDEO_SERVICE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" 2>&1)

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)
# Extract response body (all but last line)
RESPONSE_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

# Check HTTP status code
if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ API request failed with HTTP $HTTP_CODE${NC}"
    echo
    echo "Response:"
    echo "$RESPONSE_BODY"
    echo

    case "$HTTP_CODE" in
        000)
            echo "Could not connect to video service. Is it running?"
            ;;
        401)
            echo "Authentication failed. Check VIDEO_SERVICE_ADMIN_TOKEN is correct."
            ;;
        404)
            echo "Admin API endpoint not found. Check video service version."
            ;;
        500)
            echo "Video service internal error. Check service logs."
            ;;
        *)
            echo "Unexpected error. Check service logs for details."
            ;;
    esac
    exit 1
fi

echo -e "${GREEN}✓ Callback URL updated successfully${NC}"
echo

# Display response
echo "API Response:"
echo "$RESPONSE_BODY" | sed 's/^/  /'
echo

# Verify the update
if echo "$RESPONSE_BODY" | grep -q "\"callbackPublicBaseUrl\":\"$PUBLIC_URL\""; then
    echo -e "${GREEN}✓ Verified: callbackPublicBaseUrl is set to $PUBLIC_URL${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Could not verify callbackPublicBaseUrl in response${NC}"
    echo "  The update may have succeeded, but response format is unexpected."
fi

echo
echo "Configuration updated. The video service will now use:"
echo "  Callback URL: ${PUBLIC_URL}/v1/callbacks/provider"
echo
echo "To test the callback endpoint:"
echo "  curl \"${PUBLIC_URL}/v1/callbacks/provider?token=\${VIDEO_SERVICE_CALLBACK_TOKEN}\" \\"
echo "    -X POST \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"providerTaskId\":\"test-123\",\"videoUrl\":\"https://example.com/video.mp4\"}'"
