#!/bin/bash

# XiaoIce Authentication Helper
# Interactive tool to understand and test webhook authentication

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载共享库
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/output.sh"
source "$SCRIPT_DIR/lib/common.sh"

# Helper: Send authenticated request
send_authenticated_request() {
  local body='{"askText":"Hello from auth helper","sessionId":"test-session","stream":false}'
  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  echo -e "${CYAN}Request Body:${NC}"
  echo "$body" | jq .
  echo ""
  echo -e "${CYAN}Headers:${NC}"
  echo "  x-xiaoice-timestamp: $timestamp"
  echo "  x-xiaoice-signature: $signature"
  echo "  x-xiaoice-key: $ACCESS_KEY"
  echo ""

  print_warning "Sending request..."
  local response=$(curl -s -w "\n%{http_code}" -X POST $WEBHOOK_URL \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body")

  local status=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | head -n -1)

  echo -e "${CYAN}Response Status:${NC} $status"
  if [ -n "$body" ]; then
    echo -e "${CYAN}Response Body:${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
  fi
}

# Helper: Send unauthenticated request
send_unauthenticated_request() {
  local body='{"askText":"Hello without auth","sessionId":"test-session","stream":false}'

  echo -e "${CYAN}Request Body:${NC}"
  echo "$body" | jq .
  echo ""
  echo -e "${YELLOW}No authentication headers${NC}"
  echo ""

  echo -e "${YELLOW}Sending request...${NC}"
  local response=$(curl -s -w "\n%{http_code}" -X POST $WEBHOOK_URL \
    -H "Content-Type: application/json" \
    -d "$body")

  local status=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | head -n -1)

  echo -e "${CYAN}Response Status:${NC} $status"
  if [ -n "$body" ]; then
    echo -e "${CYAN}Response Body:${NC}"
    echo "$body" | jq . 2>/dev/null || echo "$body"
  fi
}

# Menu: Show authentication explanation
show_auth_explanation() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║          XiaoIce Webhook Authentication                 ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo -e "${CYAN}How Authentication Works:${NC}"
  echo ""
  echo "1. Client prepares request body (JSON)"
  echo "2. Client generates timestamp (milliseconds since epoch)"
  echo "3. Client calculates signature:"
  echo "   SHA512(RequestBody + SecretKey + Timestamp)"
  echo "4. Client sends three headers:"
  echo "   - x-xiaoice-timestamp: <timestamp>"
  echo "   - x-xiaoice-signature: <signature>"
  echo "   - x-xiaoice-key: <access_key>"
  echo ""
  echo -e "${CYAN}Server Verification:${NC}"
  echo ""
  echo "1. Checks all three headers are present"
  echo "2. Verifies timestamp is within 5-minute window"
  echo "3. Verifies access key matches configured key"
  echo "4. Recalculates signature and compares"
  echo ""
  echo -e "${CYAN}Current Configuration:${NC}"
  echo "  Access Key: $ACCESS_KEY"
  echo "  Secret Key: ${SECRET_KEY:0:10}... (hidden)"
  echo "  Auth Required: ${XIAOICE_AUTH_REQUIRED:-true}"
  echo ""
  read -p "Press Enter to continue..."
}

# Menu: Generate signature example
show_signature_example() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║              Signature Generation Example               ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""

  local body='{"askText":"test","sessionId":"123"}'
  local timestamp=$(date +%s%3N)
  local signature=$(generate_signature "$body" "$timestamp")

  echo -e "${CYAN}Step 1: Request Body${NC}"
  echo "$body"
  echo ""

  echo -e "${CYAN}Step 2: Timestamp (milliseconds)${NC}"
  echo "$timestamp"
  echo ""

  echo -e "${CYAN}Step 3: Concatenate${NC}"
  echo "${body}${SECRET_KEY}${timestamp}"
  echo ""

  echo -e "${CYAN}Step 4: SHA512 Hash${NC}"
  echo "$signature"
  echo ""

  echo -e "${CYAN}Step 5: Send Headers${NC}"
  echo "x-xiaoice-timestamp: $timestamp"
  echo "x-xiaoice-signature: $signature"
  echo "x-xiaoice-key: $ACCESS_KEY"
  echo ""

  read -p "Press Enter to continue..."
}

# Menu: Test with authentication
test_with_auth() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║           Test Request WITH Authentication              ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""

  # Check if webhook is running
  if ! curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo -e "${RED}Error: Webhook proxy is not running${NC}"
    echo "Start it with: ./start-webhook.sh"
    echo ""
    read -p "Press Enter to continue..."
    return
  fi

  send_authenticated_request
  echo ""
  read -p "Press Enter to continue..."
}

# Menu: Test without authentication
test_without_auth() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║          Test Request WITHOUT Authentication            ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""

  # Check if webhook is running
  if ! curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo -e "${RED}Error: Webhook proxy is not running${NC}"
    echo "Start it with: ./start-webhook.sh"
    echo ""
    read -p "Press Enter to continue..."
    return
  fi

  send_unauthenticated_request
  echo ""
  read -p "Press Enter to continue..."
}

# Menu: How to disable authentication
show_disable_auth() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║            How to Disable Authentication                ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo -e "${YELLOW}⚠ WARNING: Only for development/testing!${NC}"
  echo ""
  echo -e "${CYAN}Method 1: Environment Variable${NC}"
  echo "  export XIAOICE_AUTH_REQUIRED=false"
  echo "  node webhook-proxy.js"
  echo ""
  echo -e "${CYAN}Method 2: Using start-webhook.sh${NC}"
  echo "  XIAOICE_AUTH_REQUIRED=false ./start-webhook.sh"
  echo ""
  echo -e "${CYAN}Method 3: Update .env file${NC}"
  echo "  echo 'XIAOICE_AUTH_REQUIRED=false' >> .env"
  echo "  ./start-webhook.sh"
  echo ""
  echo -e "${RED}Security Note:${NC}"
  echo "  - Authentication is ENABLED by default"
  echo "  - Must explicitly set to 'false' to disable"
  echo "  - Server will show warning when auth is disabled"
  echo "  - NEVER disable in production"
  echo ""
  read -p "Press Enter to continue..."
}

# Menu: XiaoIce platform configuration
show_platform_config() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║         XiaoIce Platform Configuration Guide            ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo -e "${CYAN}If XiaoIce Platform Supports Custom Headers:${NC}"
  echo ""
  echo "1. Configure webhook URL: https://your-ngrok-url/webhooks/xiaoice"
  echo "2. Add custom headers:"
  echo "   - x-xiaoice-timestamp: {{timestamp_ms}}"
  echo "   - x-xiaoice-signature: {{calculated_signature}}"
  echo "   - x-xiaoice-key: $ACCESS_KEY"
  echo ""
  echo -e "${CYAN}If XiaoIce Platform Does NOT Support Custom Headers:${NC}"
  echo ""
  echo "Option A: Disable authentication (development only)"
  echo "  export XIAOICE_AUTH_REQUIRED=false"
  echo "  ./start-webhook.sh"
  echo ""
  echo "Option B: Add authentication proxy layer"
  echo "  - Deploy a middleware that adds auth headers"
  echo "  - XiaoIce → Middleware → Your webhook"
  echo ""
  echo "Option C: Contact XiaoIce support"
  echo "  - Request custom header support"
  echo "  - Or request IP whitelist feature"
  echo ""
  echo -e "${CYAN}Current Setup (for testing):${NC}"
  echo "  1. Disable auth: export XIAOICE_AUTH_REQUIRED=false"
  echo "  2. Start webhook: ./start-webhook.sh"
  echo "  3. Start ngrok: ngrok http 3002"
  echo "  4. Configure XiaoIce with ngrok URL"
  echo ""
  read -p "Press Enter to continue..."
}

# Main menu
show_menu() {
  clear
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║          XiaoIce Authentication Helper Tool             ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo "1. View authentication explanation"
  echo "2. Generate signature example"
  echo "3. Test request WITH authentication"
  echo "4. Test request WITHOUT authentication"
  echo "5. How to disable authentication"
  echo "6. XiaoIce platform configuration guide"
  echo "7. Exit"
  echo ""
  read -p "Select option (1-7): " choice

  case $choice in
    1) show_auth_explanation ;;
    2) show_signature_example ;;
    3) test_with_auth ;;
    4) test_without_auth ;;
    5) show_disable_auth ;;
    6) show_platform_config ;;
    7) exit 0 ;;
    *) echo "Invalid option"; sleep 1 ;;
  esac
}

# Main loop
while true; do
  show_menu
done
