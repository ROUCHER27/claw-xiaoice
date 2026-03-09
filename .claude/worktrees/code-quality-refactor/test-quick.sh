#!/bin/bash

# Quick webhook test (bypasses proxy for localhost)

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

print_title "XiaoIce Webhook Quick Test"

# Test 1: Health check
echo "[1/3] Testing health endpoint..."
HEALTH=$(curl -s --noproxy "*" http://localhost:$WEBHOOK_PORT/health)
if echo "$HEALTH" | grep -q "ok"; then
    print_success "Health check passed"
    echo "  Response: $HEALTH"
else
    print_error "Health check failed"
    exit 1
fi

echo ""

# Test 2: Valid request (non-streaming)
echo "[2/3] Testing valid webhook request (non-streaming)..."
BODY='{"askText":"你好，请介绍一下你自己","sessionId":"browser-test","traceId":"trace-001"}'
TIMESTAMP=$(get_timestamp)
SIGNATURE=$(generate_signature "$BODY" "$TIMESTAMP")

RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
  --noproxy "*" \
  -H "Content-Type: application/json" \
  -H "x-xiaoice-timestamp: $TIMESTAMP" \
  -H "x-xiaoice-signature: $SIGNATURE" \
  -H "x-xiaoice-key: $ACCESS_KEY" \
  -d "$BODY")

if echo "$RESPONSE" | grep -q "replyText"; then
    print_success "Webhook request successful"
    echo "  Response preview:"
    echo "$RESPONSE" | head -c 200
    echo "..."
else
    print_error "Webhook request failed"
    echo "  Response: $RESPONSE"
fi

echo ""

# Test 3: Invalid signature
echo "[3/3] Testing invalid signature (should fail)..."
INVALID_SIG="0000000000000000000000000000000000000000000000000000000000000000"
ERROR_RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
  --noproxy "*" \
  -H "Content-Type: application/json" \
  -H "x-xiaoice-timestamp: $TIMESTAMP" \
  -H "x-xiaoice-signature: $INVALID_SIG" \
  -H "x-xiaoice-key: $ACCESS_KEY" \
  -d "$BODY")

if echo "$ERROR_RESPONSE" | grep -q "Unauthorized"; then
    print_success "Invalid signature correctly rejected"
else
    print_warning "Unexpected response: $ERROR_RESPONSE"
fi

echo ""
print_separator
echo "All tests completed!"
print_separator
echo ""
echo "To view live logs: ./watch-logs.sh"
