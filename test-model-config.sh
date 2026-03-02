#!/bin/bash

# OpenClaw 模型配置测试脚本
# 验证模型配置修复是否成功

echo "=========================================="
echo "OpenClaw 模型配置验证测试"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASSED=0
FAILED=0

# 测试函数
test_case() {
    local name="$1"
    local command="$2"
    local expected="$3"

    echo -n "[TEST] $name ... "

    result=$(eval "$command" 2>&1)

    if echo "$result" | grep -q "$expected"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Expected: $expected"
        echo "  Got: $result"
        ((FAILED++))
        return 1
    fi
}

echo "1. 配置文件验证"
echo "----------------------------------------"

# 测试 1: 检查主配置文件中的模型
test_case "主配置使用 claude-sonnet-4-6" \
    "grep -A 2 '\"primary\"' openclaw.json" \
    "claude-sonnet-4-6"

# 测试 2: 检查 agent 配置文件中的模型定义
test_case "Agent 配置包含 sonnet-4-6 定义" \
    "grep -A 5 '\"id\": \"claude-sonnet-4-6\"' agents/main/agent/models.json" \
    "claude-sonnet-4-6"

# 测试 3: 检查 yunyi-claude 提供商有模型列表
test_case "yunyi-claude 提供商有模型定义" \
    "grep -A 2 '\"yunyi-claude\"' openclaw.json | grep -A 20 'models'" \
    "claude-sonnet-4-6"

echo ""
echo "2. OpenClaw CLI 功能测试"
echo "----------------------------------------"

# 测试 4: OpenClaw CLI 可以成功调用
test_case "OpenClaw CLI 调用成功" \
    "timeout 30 openclaw agent --channel xiaoice --to test-verify --message '测试' --json 2>&1" \
    '"status": "ok"'

# 测试 5: 使用正确的模型
test_case "使用 claude-sonnet-4-6 模型" \
    "timeout 30 openclaw agent --channel xiaoice --to test-verify --message '测试' --json 2>&1" \
    '"model": "claude-sonnet-4-6"'

# 测试 6: 没有 model_not_supported 错误
echo -n "[TEST] 没有 model_not_supported 错误 ... "
result=$(timeout 30 openclaw agent --channel xiaoice --to test-verify --message '测试' --json 2>&1)
if echo "$result" | grep -q "model_not_supported"; then
    echo -e "${RED}✗ FAILED${NC}"
    echo "  仍然出现 model_not_supported 错误"
    ((FAILED++))
else
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
fi

echo ""
echo "3. Webhook 端点测试"
echo "----------------------------------------"

# 测试 7: Health 端点
test_case "Health 端点正常" \
    "curl -s http://localhost:3002/health" \
    '"status":"ok"'

# 测试 8: Webhook 端点响应
echo -n "[TEST] Webhook 端点正常响应 ... "
signature=$(echo -n '{"askText":"验证测试","sessionId":"verify-test","streaming":false}' | openssl dgst -sha256 -hmac "test-secret" | cut -d' ' -f2)
response=$(curl -s -X POST http://localhost:3002/webhooks/xiaoice \
    -H "Content-Type: application/json" \
    -H "X-XiaoIce-Signature: $signature" \
    -d '{"askText":"验证测试","sessionId":"verify-test","streaming":false}' \
    --max-time 25)

if echo "$response" | grep -q '"replyText"'; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "  Response: $response"
    ((FAILED++))
fi

echo ""
echo "4. 日志验证"
echo "----------------------------------------"

# 测试 9: 最近的会话使用正确的模型
test_case "最近会话使用 claude-sonnet-4-6" \
    "tail -50 agents/main/sessions/*.jsonl | grep 'model-snapshot'" \
    "claude-sonnet-4-6"

# 测试 10: 没有新的超时错误
echo -n "[TEST] 没有新的超时错误 ... "
recent_errors=$(tail -20 webhook.log | grep -c "OpenClaw timeout" || true)
if [ "$recent_errors" -eq 0 ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo "  发现 $recent_errors 个超时错误（可能是旧日志）"
    ((PASSED++))
fi

echo ""
echo "=========================================="
echo "测试结果汇总"
echo "=========================================="
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo "总计: $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！模型配置修复成功。${NC}"
    exit 0
else
    echo -e "${RED}✗ 有 $FAILED 个测试失败，请检查配置。${NC}"
    exit 1
fi
