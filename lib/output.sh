#!/bin/bash
# 输出格式化函数

# 获取脚本目录
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载颜色定义
source "$LIB_DIR/colors.sh"

# 打印测试结果
print_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"

    if [ "$status" = "PASSED" ]; then
        echo -e "[TEST] $test_name ... ${GREEN}✓ PASSED${NC}"
    else
        echo -e "[TEST] $test_name ... ${RED}✗ FAILED${NC}"
        if [ -n "$message" ]; then
            echo -e "  ${RED}$message${NC}"
        fi
    fi
}

# 打印分隔线
print_separator() {
    echo "=========================================="
}

# 打印标题
print_title() {
    print_separator
    echo "$1"
    print_separator
}

# 打印节标题
print_section() {
    echo ""
    echo "$1"
    echo "----------------------------------------"
}
