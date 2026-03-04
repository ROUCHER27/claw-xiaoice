#!/bin/bash
# 共享库功能测试套件
# 测试 lib/ 目录下的所有共享函数

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_DIR="$SCRIPT_DIR"

# 测试计数器
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# 颜色定义（临时，测试通过后会使用 lib/colors.sh）
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 测试结果记录
print_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$status" = "PASSED" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        if [ -n "$message" ]; then
            echo -e "  ${RED}Error: $message${NC}"
        fi
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# 断言函数
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [ "$expected" = "$actual" ]; then
        print_test_result "$test_name" "PASSED"
    else
        print_test_result "$test_name" "FAILED" "Expected '$expected', got '$actual'"
    fi
}

assert_not_empty() {
    local value="$1"
    local test_name="$2"

    if [ -n "$value" ]; then
        print_test_result "$test_name" "PASSED"
    else
        print_test_result "$test_name" "FAILED" "Value is empty"
    fi
}

assert_file_exists() {
    local file="$1"
    local test_name="$2"

    if [ -f "$file" ]; then
        print_test_result "$test_name" "PASSED"
    else
        print_test_result "$test_name" "FAILED" "File does not exist: $file"
    fi
}

assert_function_exists() {
    local func_name="$1"
    local test_name="$2"

    if declare -f "$func_name" > /dev/null; then
        print_test_result "$test_name" "PASSED"
    else
        print_test_result "$test_name" "FAILED" "Function does not exist: $func_name"
    fi
}

echo "=========================================="
echo "共享库功能测试套件"
echo "=========================================="
echo ""

# ==========================================
# 测试 1: 文件存在性测试
# ==========================================
echo "1. 文件存在性测试"
echo "----------------------------------------"

assert_file_exists "$WORKTREE_DIR/lib/common.sh" "lib/common.sh 存在"
assert_file_exists "$WORKTREE_DIR/lib/colors.sh" "lib/colors.sh 存在"
assert_file_exists "$WORKTREE_DIR/lib/output.sh" "lib/output.sh 存在"
assert_file_exists "$WORKTREE_DIR/lib/proxy-setup.sh" "lib/proxy-setup.sh 存在"
assert_file_exists "$WORKTREE_DIR/lib/config.sh" "lib/config.sh 存在"

echo ""

# ==========================================
# 测试 2: lib/common.sh 功能测试
# ==========================================
echo "2. lib/common.sh 功能测试"
echo "----------------------------------------"

source "$WORKTREE_DIR/lib/common.sh"

# 测试函数存在性
assert_function_exists "generate_signature" "generate_signature 函数存在"
assert_function_exists "generate_id" "generate_id 函数存在"
assert_function_exists "get_timestamp" "get_timestamp 函数存在"

# 测试 generate_signature
export SECRET_KEY="test-secret"
BODY='{"askText":"test"}'
TIMESTAMP="1234567890000"
SIGNATURE=$(generate_signature "$BODY" "$TIMESTAMP")
assert_not_empty "$SIGNATURE" "generate_signature 返回非空值"

# 验证签名长度（SHA512 = 128 字符）
SIGNATURE_LENGTH=${#SIGNATURE}
if [ "$SIGNATURE_LENGTH" -eq 128 ]; then
    print_test_result "generate_signature 返回正确长度 (128)" "PASSED"
else
    print_test_result "generate_signature 返回正确长度 (128)" "FAILED" "Got length: $SIGNATURE_LENGTH"
fi

# 测试 generate_id
ID=$(generate_id)
assert_not_empty "$ID" "generate_id 返回非空值"

# 验证 ID 格式（应该以 xiaoice- 开头）
if [[ "$ID" == xiaoice-* ]]; then
    print_test_result "generate_id 格式正确 (xiaoice-*)" "PASSED"
else
    print_test_result "generate_id 格式正确 (xiaoice-*)" "FAILED" "Got: $ID"
fi

# 测试 get_timestamp
TIMESTAMP=$(get_timestamp)
assert_not_empty "$TIMESTAMP" "get_timestamp 返回非空值"

# 验证时间戳格式（应该是 13 位数字）
if [[ "$TIMESTAMP" =~ ^[0-9]{13}$ ]]; then
    print_test_result "get_timestamp 格式正确 (13位数字)" "PASSED"
else
    print_test_result "get_timestamp 格式正确 (13位数字)" "FAILED" "Got: $TIMESTAMP"
fi

echo ""

# ==========================================
# 测试 3: lib/colors.sh 功能测试
# ==========================================
echo "3. lib/colors.sh 功能测试"
echo "----------------------------------------"

source "$WORKTREE_DIR/lib/colors.sh"

# 测试颜色变量存在性
assert_not_empty "$GREEN" "GREEN 变量已定义"
assert_not_empty "$RED" "RED 变量已定义"
assert_not_empty "$YELLOW" "YELLOW 变量已定义"
assert_not_empty "$BLUE" "BLUE 变量已定义"
assert_not_empty "$CYAN" "CYAN 变量已定义"
assert_not_empty "$NC" "NC 变量已定义"

# 测试函数存在性
assert_function_exists "print_success" "print_success 函数存在"
assert_function_exists "print_error" "print_error 函数存在"
assert_function_exists "print_warning" "print_warning 函数存在"
assert_function_exists "print_info" "print_info 函数存在"
assert_function_exists "print_header" "print_header 函数存在"

echo ""

# ==========================================
# 测试 4: lib/output.sh 功能测试
# ==========================================
echo "4. lib/output.sh 功能测试"
echo "----------------------------------------"

source "$WORKTREE_DIR/lib/output.sh"

# 测试函数存在性
assert_function_exists "print_test_result" "print_test_result 函数存在"
assert_function_exists "print_separator" "print_separator 函数存在"
assert_function_exists "print_title" "print_title 函数存在"
assert_function_exists "print_section" "print_section 函数存在"

echo ""

# ==========================================
# 测试 5: lib/proxy-setup.sh 功能测试
# ==========================================
echo "5. lib/proxy-setup.sh 功能测试"
echo "----------------------------------------"

source "$WORKTREE_DIR/lib/proxy-setup.sh"

# 测试函数存在性
assert_function_exists "disable_proxy" "disable_proxy 函数存在"
assert_function_exists "enable_proxy" "enable_proxy 函数存在"

# 测试 disable_proxy
disable_proxy
if [ -z "$http_proxy" ] && [ -z "$https_proxy" ]; then
    print_test_result "disable_proxy 清除代理变量" "PASSED"
else
    print_test_result "disable_proxy 清除代理变量" "FAILED" "Proxy still set"
fi

echo ""

# ==========================================
# 测试 6: lib/config.sh 功能测试
# ==========================================
echo "6. lib/config.sh 功能测试"
echo "----------------------------------------"

source "$WORKTREE_DIR/lib/config.sh"

# 测试配置变量存在性
assert_not_empty "$WEBHOOK_URL" "WEBHOOK_URL 已定义"
assert_not_empty "$WEBHOOK_PORT" "WEBHOOK_PORT 已定义"
assert_not_empty "$ACCESS_KEY" "ACCESS_KEY 已定义"
assert_not_empty "$SECRET_KEY" "SECRET_KEY 已定义"
assert_not_empty "$AUTH_REQUIRED" "AUTH_REQUIRED 已定义"
assert_not_empty "$TIMEOUT" "TIMEOUT 已定义"

# 测试默认值
assert_equals "http://localhost:3002/webhooks/xiaoice" "$WEBHOOK_URL" "WEBHOOK_URL 默认值正确"
assert_equals "3002" "$WEBHOOK_PORT" "WEBHOOK_PORT 默认值正确"
assert_equals "test-key" "$ACCESS_KEY" "ACCESS_KEY 默认值正确"
assert_equals "test-secret" "$SECRET_KEY" "SECRET_KEY 默认值正确"
assert_equals "18000" "$TIMEOUT" "TIMEOUT 默认值正确"

echo ""

# ==========================================
# 测试 7: 集成测试 - 签名生成一致性
# ==========================================
echo "7. 集成测试 - 签名生成一致性"
echo "----------------------------------------"

# 使用已知的输入生成签名
TEST_BODY='{"askText":"你好","sessionId":"test-123"}'
TEST_TIMESTAMP="1709366400000"
export SECRET_KEY="test-secret"

SIGNATURE1=$(generate_signature "$TEST_BODY" "$TEST_TIMESTAMP")
SIGNATURE2=$(generate_signature "$TEST_BODY" "$TEST_TIMESTAMP")

# 两次生成的签名应该相同
assert_equals "$SIGNATURE1" "$SIGNATURE2" "相同输入生成相同签名"

# 不同输入应该生成不同签名
TEST_BODY2='{"askText":"hello","sessionId":"test-456"}'
SIGNATURE3=$(generate_signature "$TEST_BODY2" "$TEST_TIMESTAMP")

if [ "$SIGNATURE1" != "$SIGNATURE3" ]; then
    print_test_result "不同输入生成不同签名" "PASSED"
else
    print_test_result "不同输入生成不同签名" "FAILED" "Signatures are the same"
fi

echo ""

# ==========================================
# 测试总结
# ==========================================
echo "=========================================="
echo "测试总结"
echo "=========================================="
echo "总计: $TESTS_RUN"
echo -e "${GREEN}通过: $TESTS_PASSED${NC}"
echo -e "${RED}失败: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 有 $TESTS_FAILED 个测试失败${NC}"
    exit 1
fi
