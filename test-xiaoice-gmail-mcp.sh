#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/output.sh"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/proxy-setup.sh"

disable_proxy

GMAIL_DIR="${GMAIL_MCP_HOME:-${SCRIPT_DIR}/credentials/gmail-mcp}"
GMAIL_CREDENTIALS_PATH="${GMAIL_CREDENTIALS_PATH:-${GMAIL_DIR}/credentials.json}"
RECIPIENT_CACHE="${GMAIL_DIR}/test-recipient.txt"
RECIPIENT="${GMAIL_TEST_RECIPIENT:-}"

print_title "XiaoIce + Gmail MCP E2E 测试"

if [[ ! -f "$GMAIL_CREDENTIALS_PATH" ]]; then
  print_error "未找到 Gmail OAuth 凭据: $GMAIL_CREDENTIALS_PATH"
  echo "先执行: ./setup-gmail-mcp-auth.sh"
  exit 1
fi

if [[ -z "$RECIPIENT" && -f "$RECIPIENT_CACHE" ]]; then
  RECIPIENT="$(cat "$RECIPIENT_CACHE")"
fi

if [[ -z "$RECIPIENT" ]]; then
  read -r -p "请输入验收收件邮箱（建议使用本次登录的 Gmail 同账号）: " RECIPIENT
fi

if [[ -z "$RECIPIENT" ]]; then
  print_error "收件邮箱不能为空"
  exit 1
fi

mkdir -p "$GMAIL_DIR"
echo "$RECIPIENT" > "$RECIPIENT_CACHE"

if ! curl -s --noproxy "*" --max-time 5 "http://localhost:3002/health" >/dev/null; then
  print_error "Webhook 服务不可用: http://localhost:3002/health"
  exit 1
fi

print_info "检查 MCP 工具是否可见..."
LIST_OUTPUT="$(openclaw agent --agent main --message '请调用 mcp 工具，action=list，并返回结果。' --json 2>&1 || true)"
if echo "$LIST_OUTPUT" | grep -q "gmail:send_email"; then
  print_success "已发现 gmail:send_email"
else
  print_warning "可见性检查未返回 gmail:send_email，继续执行真实发信回查验证。"
  echo "$LIST_OUTPUT" | tail -n 20
fi

SUBJECT="XiaoIce Gmail MCP E2E $(date +%Y%m%d-%H%M%S)"
MAIL_BODY="This is an E2E verification email sent via XiaoIce channel and Gmail MCP."
SESSION_ID="test-gmail-$(date +%s)"

build_request_body() {
  local ask_text="$1"
  local session_id="$2"
  local trace_id="$3"

  ASK_TEXT="$ask_text" SESSION_ID="$session_id" TRACE_ID="$trace_id" python3 - <<'PY'
import json
import os

print(json.dumps({
  "askText": os.environ["ASK_TEXT"],
  "sessionId": os.environ["SESSION_ID"],
  "traceId": os.environ["TRACE_ID"]
}, ensure_ascii=False))
PY
}

post_webhook() {
  local body="$1"

  local timestamp
  timestamp="$(get_timestamp)"
  local signature
  signature="$(generate_signature "$body" "$timestamp")"

  curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body"
}

SEND_PROMPT=$(cat <<EOF
你必须严格执行以下动作：
1) 调用 mcp 工具，参数如下：
   - action: "call"
   - server: "gmail"
   - tool: "send_email"
   - args:
     - to: ["$RECIPIENT"]
     - subject: "$SUBJECT"
     - body: "$MAIL_BODY"
     - mimeType: "text/plain"
2) 成功后只回复：GMAIL_SEND_OK
3) 失败后只回复：GMAIL_SEND_FAIL: <原因>
EOF
)

print_info "步骤 1/2：通过 XiaoIce channel 触发 Gmail 发信"
SEND_BODY="$(build_request_body "$SEND_PROMPT" "$SESSION_ID" "trace-gmail-send")"
SEND_RESPONSE="$(post_webhook "$SEND_BODY")"
SEND_STATUS="$(echo "$SEND_RESPONSE" | tail -n 1)"
SEND_TEXT="$(echo "$SEND_RESPONSE" | head -n -1)"

echo "  HTTP 状态: $SEND_STATUS"
echo "  响应: ${SEND_TEXT:0:180}..."

if [[ "$SEND_STATUS" != "200" ]]; then
  print_error "发信步骤 HTTP 失败"
  exit 1
fi

if ! echo "$SEND_TEXT" | grep -q "GMAIL_SEND_OK"; then
  print_error "发信步骤未返回 GMAIL_SEND_OK"
  exit 1
fi

print_success "发信步骤通过"

VERIFY_PROMPT=$(cat <<EOF
你必须严格执行以下动作：
1) 调用 mcp 工具，参数如下：
   - action: "call"
   - server: "gmail"
   - tool: "search_emails"
   - args:
     - query: "subject:\\"$SUBJECT\\" newer_than:1d"
     - maxResults: 5
2) 如果找到至少 1 封邮件，只回复：GMAIL_VERIFY_OK
3) 如果找不到，只回复：GMAIL_VERIFY_FAIL
4) 如果报错，只回复：GMAIL_VERIFY_FAIL: <原因>
EOF
)

print_info "步骤 2/2：通过 XiaoIce channel 回查发送结果"
VERIFY_BODY="$(build_request_body "$VERIFY_PROMPT" "$SESSION_ID" "trace-gmail-verify")"
VERIFY_RESPONSE="$(post_webhook "$VERIFY_BODY")"
VERIFY_STATUS="$(echo "$VERIFY_RESPONSE" | tail -n 1)"
VERIFY_TEXT="$(echo "$VERIFY_RESPONSE" | head -n -1)"

echo "  HTTP 状态: $VERIFY_STATUS"
echo "  响应: ${VERIFY_TEXT:0:180}..."

if [[ "$VERIFY_STATUS" != "200" ]]; then
  print_error "回查步骤 HTTP 失败"
  exit 1
fi

if ! echo "$VERIFY_TEXT" | grep -q "GMAIL_VERIFY_OK"; then
  print_error "回查步骤未返回 GMAIL_VERIFY_OK"
  exit 1
fi

echo
print_success "XiaoIce + Gmail MCP E2E 通过"
echo "主题: $SUBJECT"
echo "收件人: $RECIPIENT"
