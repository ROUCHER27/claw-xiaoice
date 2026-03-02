#!/bin/bash

# Quick webhook test (bypasses proxy for localhost)

# Disable proxy for localhost connections
unset http_proxy
unset https_proxy
unset HTTP_PROXY
unset HTTPS_PROXY
export NO_PROXY=localhost,127.0.0.1

WEBHOOK_URL="http://localhost:3002/webhooks/xiaoice"
SECRET_KEY="test-secret"

generate_signature() {
    local body="$1"
    local timestamp="$2"
    echo -n "${body}${SECRET_KEY}${timestamp}" | openssl dgst -sha512 | awk '{print $2}'
}

echo "=========================================="
echo "XiaoIce Webhook Quick Test"
echo "=========================================="
echo ""

# Test 1: Health check
echo "[1/3] Testing health endpoint..."
HEALTH=$(curl -s --noproxy "*" http://localhost:3002/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✓ Health check passed"
    echo "  Response: $HEALTH"
else
    echo "✗ Health check failed"
    exit 1
fi

echo ""

# Test 2: Valid request (non-streaming)
echo "[2/3] Testing valid webhook request (non-streaming)..."
BODY='{"askText":"你好，请介绍一下你自己","sessionId":"browser-test","traceId":"trace-001"}'
TIMESTAMP=$(date +%s)000
SIGNATURE=$(generate_signature "$BODY" "$TIMESTAMP")

RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
  --noproxy "*" \
  -H "Content-Type: application/json" \
  -H "x-xiaoice-timestamp: $TIMESTAMP" \
  -H "x-xiaoice-signature: $SIGNATURE" \
  -H "x-xiaoice-key: test-key" \
  -d "$BODY")

if echo "$RESPONSE" | grep -q "replyText"; then
    echo "✓ Webhook request successful"
    echo "  Response preview:"
    echo "$RESPONSE" | head -c 200
    echo "..."
else
    echo "✗ Webhook request failed"
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
  -H "x-xiaoice-key: test-key" \
  -d "$BODY")

if echo "$ERROR_RESPONSE" | grep -q "Unauthorized"; then
    echo "✓ Invalid signature correctly rejected"
else
    echo "⚠ Unexpected response: $ERROR_RESPONSE"
fi

echo ""
echo "=========================================="
echo "All tests completed!"
echo "=========================================="
echo ""
echo "To view live logs: ./watch-logs.sh"
