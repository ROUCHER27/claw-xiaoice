#!/bin/bash
# Quick test to verify webhook is working

WEBHOOK_URL="http://localhost:3002/webhooks/xiaoice"
SECRET_KEY="test-secret"

generate_signature() {
    local body="$1"
    local timestamp="$2"
    echo -n "${body}${SECRET_KEY}${timestamp}" | openssl dgst -sha512 | awk '{print $2}'
}

echo "Testing XiaoIce webhook..."
BODY='{"askText":"你好","sessionId":"test","traceId":"test"}'
TIMESTAMP=$(date +%s)000
SIGNATURE=$(generate_signature "$BODY" "$TIMESTAMP")

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-xiaoice-timestamp: $TIMESTAMP" \
  -H "x-xiaoice-signature: $SIGNATURE" \
  -H "x-xiaoice-key: test-key" \
  -d "$BODY" \
  -s | jq .

echo -e "\n✓ Test complete"
