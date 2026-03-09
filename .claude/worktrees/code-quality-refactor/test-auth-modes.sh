#!/bin/bash

# XiaoIce Webhook Authentication Modes Test Suite
# Tests both enabled and disabled authentication scenarios

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载共享库
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/output.sh"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/proxy-setup.sh"

# 禁用代理（本地测试）
disable_proxy

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Webhook process PID
WEBHOOK_PID=""

# Cleanup function
cleanup() {
  if [ -n "$WEBHOOK_PID" ]; then
    echo ""
    print_warning "Stopping webhook proxy (PID: $WEBHOOK_PID)..."
    kill $WEBHOOK_PID 2>/dev/null || true
    wait $WEBHOOK_PID 2>/dev/null || true
  fi

  # Kill any remaining webhook processes on port
  lsof -ti:$WEBHOOK_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
}

trap cleanup EXIT

# Initial cleanup - kill any existing webhook on port
echo "Checking for existing webhook processes..."
if lsof -ti:$WEBHOOK_PORT > /dev/null 2>&1; then
  echo "Found existing process on port $WEBHOOK_PORT, cleaning up..."
  lsof -ti:$WEBHOOK_PORT | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Helper: Start webhook with specific auth mode
start_webhook() {
  local auth_required=$1

  print_warning "Starting webhook with XIAOICE_AUTH_REQUIRED=${auth_required}..."

  export XIAOICE_AUTH_REQUIRED=$auth_required
  export XIAOICE_ACCESS_KEY=$ACCESS_KEY
  export XIAOICE_SECRET_KEY=$SECRET_KEY

  node webhook-proxy.js > /tmp/webhook-test.log 2>&1 &
  WEBHOOK_PID=$!

  # Wait for webhook to start
  HEALTH_URL="http://localhost:$WEBHOOK_PORT/health"
  for i in {1..10}; do
    if curl -s --noproxy "*" $HEALTH_URL > /dev/null 2>&1; then
      print_success "Webhook started (PID: $WEBHOOK_PID)"
      return 0
    fi
    sleep 0.5
  done

  print_error "Failed to start webhook"
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

# Helper: Send request with authentication
send_authenticated_request() {
  local body='{"askText":"test","sessionId":"test-session","stream":false}'
  local timestamp=$(get_timestamp)
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
  local timestamp=$(get_timestamp)
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
  local timestamp=$(($(date +%s)000 - 400000)) # 400 seconds ago
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
  echo ""
  print_info "Test $TESTS_RUN: $test_name"

  local response=$($test_func)
  local status=$(echo "$response" | tail -n 1)

  if [ "$status" = "$expected_status" ]; then
    print_success "PASSED (HTTP $status)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    print_error "FAILED (Expected: $expected_status, Got: $status)"
    echo "Response: $response"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Main test execution
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     XiaoIce Webhook Authentication Modes Test Suite     ║"
echo "╚═══════════════════════════════════════════════════════════╝"

# Test Group 1: Authentication Enabled (Default)
echo ""
print_header "═══ Test Group 1: Authentication ENABLED ═══"
start_webhook "true"

run_test "Auth enabled + valid headers → 200 OK" "200" send_authenticated_request
run_test "Auth enabled + no headers → 401 Unauthorized" "401" send_unauthenticated_request
run_test "Auth enabled + invalid signature → 401 Unauthorized" "401" send_invalid_signature_request
run_test "Auth enabled + expired timestamp → 401 Unauthorized" "401" send_expired_timestamp_request

stop_webhook
sleep 1

# Test Group 2: Authentication Disabled
echo ""
print_header "═══ Test Group 2: Authentication DISABLED ═══"
start_webhook "false"

run_test "Auth disabled + valid headers → 200 OK" "200" send_authenticated_request
run_test "Auth disabled + no headers → 200 OK" "200" send_unauthenticated_request

stop_webhook

# Test Summary
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                      Test Summary                        ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo -e "║  Total:  $TESTS_RUN tests                                        ║"
echo -e "║  ${GREEN}Passed: $TESTS_PASSED tests${NC}                                        ║"
echo -e "║  ${RED}Failed: $TESTS_FAILED tests${NC}                                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"

if [ $TESTS_FAILED -eq 0 ]; then
  echo ""
  print_success "All tests passed! ✓"
  exit 0
else
  echo ""
  print_error "Some tests failed! ✗"
  exit 1
fi
