#!/bin/bash

# XiaoIce Webhook Authentication Modes Test Suite
# Tests both enabled and disabled authentication scenarios

set -e

# Disable proxy for localhost connections
unset http_proxy
unset https_proxy
unset HTTP_PROXY
unset HTTPS_PROXY

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
WEBHOOK_PORT=3002
WEBHOOK_URL="http://localhost:${WEBHOOK_PORT}/webhooks/xiaoice"
HEALTH_URL="http://localhost:${WEBHOOK_PORT}/health"
SECRET_KEY="test-secret"
ACCESS_KEY="test-key"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Webhook process PID
WEBHOOK_PID=""

# Cleanup function
cleanup() {
  if [ -n "$WEBHOOK_PID" ]; then
    echo -e "\n${YELLOW}Stopping webhook proxy (PID: $WEBHOOK_PID)...${NC}"
    kill $WEBHOOK_PID 2>/dev/null || true
    wait $WEBHOOK_PID 2>/dev/null || true
  fi

  # Kill any remaining webhook processes on port 3002
  lsof -ti:$WEBHOOK_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
}

trap cleanup EXIT

# Initial cleanup - kill any existing webhook on port 3002
echo "Checking for existing webhook processes..."
if lsof -ti:$WEBHOOK_PORT > /dev/null 2>&1; then
  echo "Found existing process on port $WEBHOOK_PORT, cleaning up..."
  lsof -ti:$WEBHOOK_PORT | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Helper: Start webhook with specific auth mode
start_webhook() {
  local auth_required=$1

  echo -e "${YELLOW}Starting webhook with XIAOICE_AUTH_REQUIRED=${auth_required}...${NC}"

  export XIAOICE_AUTH_REQUIRED=$auth_required
  export XIAOICE_ACCESS_KEY=$ACCESS_KEY
  export XIAOICE_SECRET_KEY=$SECRET_KEY

  node webhook-proxy.js > /tmp/webhook-test.log 2>&1 &
  WEBHOOK_PID=$!

  # Wait for webhook to start
  for i in {1..10}; do
    if curl -s --noproxy "*" $HEALTH_URL > /dev/null 2>&1; then
      echo -e "${GREEN}Webhook started (PID: $WEBHOOK_PID)${NC}"
      return 0
    fi
    sleep 0.5
  done

  echo -e "${RED}Failed to start webhook${NC}"
  cat /tmp/webhook-test.log
  return 1
}

# Helper: Stop webhook
stop_webhook() {
  if [ -n "$WEBHOOK_PID" ]; then
    kill $WEBHOOK_PID 2>/dev/null || true
    wait $WEBHOOK_PID 2>/dev/null || true
    WEBHOOK_PID=""
  fi
}

# Helper: Generate signature
generate_signature() {
  local body=$1
  local timestamp=$2
  echo -n "${body}${SECRET_KEY}${timestamp}" | sha512sum | awk '{print $1}'
}

# Helper: Send request with authentication
send_authenticated_request() {
  local body='{"askText":"test","sessionId":"test-session","stream":false}'
  local timestamp=$(date +%s%3N)
  local signature=$(generate_signature "$body" "$timestamp")

  curl -s -w "\n%{http_code}" -X POST $WEBHOOK_URL \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body"
}

# Helper: Send request without authentication
send_unauthenticated_request() {
  local body='{"askText":"test","sessionId":"test-session","stream":false}'

  curl -s -w "\n%{http_code}" -X POST $WEBHOOK_URL \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -d "$body"
}

# Helper: Send request with invalid signature
send_invalid_signature_request() {
  local body='{"askText":"test","sessionId":"test-session","stream":false}'
  local timestamp=$(date +%s%3N)
  local signature="invalid_signature_12345"

  curl -s -w "\n%{http_code}" -X POST $WEBHOOK_URL \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body"
}

# Helper: Send request with expired timestamp
send_expired_timestamp_request() {
  local body='{"askText":"test","sessionId":"test-session","stream":false}'
  local timestamp=$(($(date +%s%3N) - 400000)) # 400 seconds ago
  local signature=$(generate_signature "$body" "$timestamp")

  curl -s -w "\n%{http_code}" -X POST $WEBHOOK_URL \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body"
}

# Test runner
run_test() {
  local test_name=$1
  local expected_status=$2
  local test_func=$3

  TESTS_RUN=$((TESTS_RUN + 1))
  echo -e "\n${YELLOW}Test $TESTS_RUN: $test_name${NC}"

  local response=$($test_func)
  local status=$(echo "$response" | tail -n 1)

  if [ "$status" = "$expected_status" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $status)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗ FAILED${NC} (Expected: $expected_status, Got: $status)"
    echo "Response: $response"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Main test execution
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     XiaoIce Webhook Authentication Modes Test Suite     ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Test Group 1: Authentication Enabled (Default)
echo -e "\n${YELLOW}═══ Test Group 1: Authentication ENABLED ═══${NC}"
start_webhook "true"

run_test "Auth enabled + valid headers → 200 OK" "200" send_authenticated_request
run_test "Auth enabled + no headers → 401 Unauthorized" "401" send_unauthenticated_request
run_test "Auth enabled + invalid signature → 401 Unauthorized" "401" send_invalid_signature_request
run_test "Auth enabled + expired timestamp → 401 Unauthorized" "401" send_expired_timestamp_request

stop_webhook
sleep 1

# Test Group 2: Authentication Disabled
echo -e "\n${YELLOW}═══ Test Group 2: Authentication DISABLED ═══${NC}"
start_webhook "false"

run_test "Auth disabled + valid headers → 200 OK" "200" send_authenticated_request
run_test "Auth disabled + no headers → 200 OK" "200" send_unauthenticated_request

stop_webhook

# Test Summary
echo -e "\n╔═══════════════════════════════════════════════════════════╗"
echo "║                      Test Summary                        ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo -e "║  Total:  $TESTS_RUN tests                                        ║"
echo -e "║  ${GREEN}Passed: $TESTS_PASSED tests${NC}                                        ║"
echo -e "║  ${RED}Failed: $TESTS_FAILED tests${NC}                                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed! ✓${NC}"
  exit 0
else
  echo -e "\n${RED}Some tests failed! ✗${NC}"
  exit 1
fi
