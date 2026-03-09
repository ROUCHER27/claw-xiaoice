#!/bin/bash
# Quick test to verify webhook is working

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载共享库
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/common.sh"

echo "Testing XiaoIce webhook..."
BODY='{"askText":"你好","sessionId":"test","traceId":"test"}'
TIMESTAMP=$(get_timestamp)
SIGNATURE=$(generate_signature "$BODY" "$TIMESTAMP")

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-xiaoice-timestamp: $TIMESTAMP" \
  -H "x-xiaoice-signature: $SIGNATURE" \
  -H "x-xiaoice-key: $ACCESS_KEY" \
  -d "$BODY" \
  -s | jq .

echo ""
print_success "Test complete"
