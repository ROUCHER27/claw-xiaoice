#!/bin/bash

# Test empty message validation
echo "Testing empty message validation..."
echo ""

# Start webhook server in background
echo "Starting webhook server..."
node webhook-proxy-new.js > /tmp/webhook-test.log 2>&1 &
WEBHOOK_PID=$!

# Wait for server to start
sleep 2

# Test 1: Empty string
echo "Test 1: Empty askText"
RESPONSE=$(curl -s -X POST http://localhost:3002/webhooks/xiaoice \
  -H "Content-Type: application/json" \
  -d '{"askText":"","sessionId":"test-empty"}')
echo "Response: $RESPONSE"
echo ""

# Test 2: Whitespace only
echo "Test 2: Whitespace-only askText"
RESPONSE=$(curl -s -X POST http://localhost:3002/webhooks/xiaoice \
  -H "Content-Type: application/json" \
  -d '{"askText":"   ","sessionId":"test-whitespace"}')
echo "Response: $RESPONSE"
echo ""

# Test 3: Normal message
echo "Test 3: Normal askText"
RESPONSE=$(curl -s -X POST http://localhost:3002/webhooks/xiaoice \
  -H "Content-Type: application/json" \
  -d '{"askText":"你好","sessionId":"test-normal"}')
echo "Response (first 100 chars): ${RESPONSE:0:100}"
echo ""

# Cleanup
echo "Stopping webhook server..."
kill $WEBHOOK_PID 2>/dev/null

echo "Test completed!"
