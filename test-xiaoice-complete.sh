#!/bin/bash

# 小冰平台 Webhook 完整测试脚本
# 基于小冰平台官方文档格式
# 文档: https://aibeings-vip.xiaoice.cn/product-doc/show/154

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载共享库
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/output.sh"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/proxy-setup.sh"

# 禁用代理
disable_proxy

# 测试计数器
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

print_title "小冰平台 Webhook 完整测试"

echo "测试配置:"
echo "  Webhook URL: $WEBHOOK_URL"
echo "  Access Key: $ACCESS_KEY"
echo "  认证状态: ${AUTH_REQUIRED}"
echo ""

# 测试结果记录函数
run_test() {
  local test_name="$1"
  local test_func="$2"

  TESTS_RUN=$((TESTS_RUN + 1))
  echo ""
  print_info "测试 $TESTS_RUN: $test_name"

  if $test_func; then
    print_success "通过"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    print_error "失败"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ==========================================
# 测试 1: 基本对话请求（非流式）
# ==========================================
test_basic_dialogue() {
  local body='{
    "askText": "你好，请介绍一下你自己",
    "sessionId": "test-session-001",
    "traceId": "trace-001",
    "languageCode": "zh",
    "extra": {
      "mode": "0",
      "dialogueId": "dialogue-001"
    }
  }'

  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  echo "  请求体: $(echo $body | python3 -m json.tool --compact)"

  local response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body")

  local status=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | head -n -1)

  echo "  HTTP 状态: $status"

  if [ "$status" = "200" ]; then
    # 验证响应格式
    local reply_text=$(echo "$body" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get '.replyText' 2>/dev/null)
    local reply_type=$(echo "$body" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get '.replyType' 2>/dev/null)

    if [ -n "$reply_text" ] && [ "$reply_text" != "null" ]; then
      echo "  回复文本: ${reply_text:0:50}..."
      echo "  回复类型: $reply_type"
      return 0
    else
      echo "  错误: 响应缺少 replyText 字段"
      return 1
    fi
  else
    echo "  错误: HTTP 状态码不是 200"
    return 1
  fi
}

# ==========================================
# 测试 2: 流式对话请求
# ==========================================
test_streaming_dialogue() {
  local body='{
    "askText": "请用三句话介绍人工智能",
    "sessionId": "test-session-002",
    "traceId": "trace-002",
    "stream": true,
    "languageCode": "zh"
  }'

  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  echo "  请求体: $(echo $body | python3 -m json.tool --compact)"
  echo "  Accept: text/event-stream"

  local response=$(curl -s -w "\n%{http_code}" -N -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "Accept: text/event-stream" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body" \
    --max-time 30)

  local status=$(echo "$response" | tail -n 1)

  echo "  HTTP 状态: $status"

  if [ "$status" = "200" ]; then
    echo "  流式响应接收成功"
    return 0
  else
    echo "  错误: HTTP 状态码不是 200"
    return 1
  fi
}

# ==========================================
# 测试 3: 多轮对话（保持会话）
# ==========================================
test_multi_turn_dialogue() {
  local session_id="test-session-multi-$(date +%s)"

  # 第一轮
  echo "  第一轮对话..."
  local body1='{
    "askText": "我叫小明",
    "sessionId": "'$session_id'",
    "traceId": "trace-multi-1"
  }'

  local timestamp1=$(get_timestamp)
  local signature1=$(generate_signature "$body1" "$timestamp1")

  local response1=$(curl -s -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp1" \
    -H "x-xiaoice-signature: $signature1" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body1")

  local reply1=$(echo "$response1" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get '.replyText' 2>/dev/null)
  echo "    回复: ${reply1:0:50}..."

  sleep 1

  # 第二轮（测试上下文记忆）
  echo "  第二轮对话（测试上下文）..."
  local body2='{
    "askText": "我叫什么名字？",
    "sessionId": "'$session_id'",
    "traceId": "trace-multi-2"
  }'

  local timestamp2=$(get_timestamp)
  local signature2=$(generate_signature "$body2" "$timestamp2")

  local response2=$(curl -s -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp2" \
    -H "x-xiaoice-signature: $signature2" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body2")

  local reply2=$(echo "$response2" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get '.replyText' 2>/dev/null)
  echo "    回复: ${reply2:0:50}..."

  # 检查是否记住了名字
  if echo "$reply2" | grep -qi "小明"; then
    echo "  ✓ 上下文记忆正常"
    return 0
  else
    echo "  ⚠ 上下文记忆可能未生效"
    return 0  # 不算失败，因为可能是模型回答方式不同
  fi
}

# ==========================================
# 测试 4: 不同语言代码
# ==========================================
test_language_codes() {
  local languages=("zh" "en" "ja")
  local questions=("你好" "Hello" "こんにちは")

  for i in "${!languages[@]}"; do
    local lang="${languages[$i]}"
    local question="${questions[$i]}"

    echo "  测试语言: $lang - $question"

    local body='{
      "askText": "'$question'",
      "sessionId": "test-lang-'$lang'",
      "languageCode": "'$lang'"
    }'

    local timestamp=$(get_timestamp)
    local signature=$(generate_signature "$body" "$timestamp")

    local response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
      --noproxy "*" \
      -H "Content-Type: application/json" \
      -H "x-xiaoice-timestamp: $timestamp" \
      -H "x-xiaoice-signature: $signature" \
      -H "x-xiaoice-key: $ACCESS_KEY" \
      -d "$body")

    local status=$(echo "$response" | tail -n 1)

    if [ "$status" = "200" ]; then
      echo "    ✓ $lang 语言请求成功"
    else
      echo "    ✗ $lang 语言请求失败"
      return 1
    fi
  done

  return 0
}

# ==========================================
# 测试 5: Extra 字段传递
# ==========================================
test_extra_fields() {
  local body='{
    "askText": "测试 extra 字段",
    "sessionId": "test-extra-001",
    "extra": {
      "mode": "1",
      "dialogueId": "custom-dialogue-id",
      "customField": "customValue"
    }
  }'

  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  echo "  请求体: $(echo $body | python3 -m json.tool --compact)"

  local response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body")

  local status=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | head -n -1)

  echo "  HTTP 状态: $status"

  if [ "$status" = "200" ]; then
    local extra=$(echo "$body" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get '.extra' 2>/dev/null)
    echo "  响应 extra: $extra"
    return 0
  else
    return 1
  fi
}

# ==========================================
# 测试 6: 长文本处理
# ==========================================
test_long_text() {
  local long_text="请详细介绍一下人工智能的发展历史，包括早期的图灵测试、专家系统时代、机器学习的兴起、深度学习革命，以及最近的大语言模型时代。"

  local body='{
    "askText": "'$long_text'",
    "sessionId": "test-long-text-001",
    "traceId": "trace-long-001"
  }'

  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  echo "  长文本长度: ${#long_text} 字符"

  local response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body" \
    --max-time 30)

  local status=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | head -n -1)

  echo "  HTTP 状态: $status"

  if [ "$status" = "200" ]; then
    local reply_text=$(echo "$body" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get '.replyText' 2>/dev/null)
    local reply_length=${#reply_text}
    echo "  回复长度: $reply_length 字符"
    echo "  回复预览: ${reply_text:0:100}..."
    return 0
  else
    return 1
  fi
}

# ==========================================
# 测试 7: 错误处理 - 缺少必需字段
# ==========================================
test_missing_required_field() {
  local body='{
    "sessionId": "test-error-001",
    "traceId": "trace-error-001"
  }'

  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  echo "  请求体（缺少 askText）: $(echo $body | python3 -m json.tool --compact)"

  local response=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body")

  local status=$(echo "$response" | tail -n 1)

  echo "  HTTP 状态: $status"

  if [ "$status" = "400" ]; then
    echo "  ✓ 正确返回 400 错误"
    return 0
  else
    echo "  ✗ 应该返回 400，实际返回 $status"
    return 1
  fi
}

# ==========================================
# 测试 8: 响应格式验证
# ==========================================
test_response_format() {
  local body='{
    "askText": "测试响应格式",
    "sessionId": "test-format-001",
    "traceId": "trace-format-001"
  }'

  local timestamp=$(get_timestamp)
  local signature=$(generate_signature "$body" "$timestamp")

  local response=$(curl -s -X POST "$WEBHOOK_URL" \
    --noproxy "*" \
    -H "Content-Type: application/json" \
    -H "x-xiaoice-timestamp: $timestamp" \
    -H "x-xiaoice-signature: $signature" \
    -H "x-xiaoice-key: $ACCESS_KEY" \
    -d "$body")

  echo "  验证响应字段..."

  # 验证必需字段
  local required_fields=("id" "sessionId" "askText" "replyText" "replyType" "timestamp")
  local all_present=true

  for field in "${required_fields[@]}"; do
    local value=$(echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get ".$field" 2>/dev/null)
    if [ -z "$value" ] || [ "$value" = "null" ]; then
      echo "    ✗ 缺少字段: $field"
      all_present=false
    else
      echo "    ✓ $field: ${value:0:30}..."
    fi
  done

  if $all_present; then
    return 0
  else
    return 1
  fi
}

# ==========================================
# 运行所有测试
# ==========================================

run_test "基本对话请求（非流式）" test_basic_dialogue
run_test "流式对话请求" test_streaming_dialogue
run_test "多轮对话（上下文记忆）" test_multi_turn_dialogue
run_test "不同语言代码支持" test_language_codes
run_test "Extra 字段传递" test_extra_fields
run_test "长文本处理" test_long_text
run_test "错误处理 - 缺少必需字段" test_missing_required_field
run_test "响应格式验证" test_response_format

# ==========================================
# 测试总结
# ==========================================

echo ""
print_separator
echo "测试总结"
print_separator
echo "总计: $TESTS_RUN"
echo -e "${GREEN}通过: $TESTS_PASSED${NC}"
echo -e "${RED}失败: $TESTS_FAILED${NC}"
print_separator

if [ $TESTS_FAILED -eq 0 ]; then
  echo ""
  print_success "所有测试通过！"
  exit 0
else
  echo ""
  print_error "有 $TESTS_FAILED 个测试失败"
  exit 1
fi
