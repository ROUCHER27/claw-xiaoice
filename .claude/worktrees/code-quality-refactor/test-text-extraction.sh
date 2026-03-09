#!/bin/bash

# 测试 OpenClaw 响应文本提取
# 模拟 XiaoIce 平台发送请求，验证只返回纯文本

set -e

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载共享库
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/output.sh"
source "$SCRIPT_DIR/lib/proxy-setup.sh"

# 禁用代理
disable_proxy

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     测试 OpenClaw 响应文本提取功能                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 测试 1: 简单问候
print_info "测试 1: 发送简单问候..."
RESPONSE=$(curl -s --noproxy "*" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"askText":"你好","sessionId":"test-extract-1","stream":false}')

echo "完整响应:"
echo "$RESPONSE" | jq .
echo ""

REPLY_TEXT=$(echo "$RESPONSE" | jq -r '.replyText')
echo "提取的纯文本: $REPLY_TEXT"
echo ""

# 测试 2: 复杂问题
print_info "测试 2: 发送复杂问题..."
RESPONSE=$(curl -s --noproxy "*" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"askText":"请用一句话介绍人工智能","sessionId":"test-extract-2","stream":false}')

echo "完整响应:"
echo "$RESPONSE" | jq .
echo ""

REPLY_TEXT=$(echo "$RESPONSE" | jq -r '.replyText')
echo "提取的纯文本: $REPLY_TEXT"
echo ""

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     测试完成                                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "验证要点:"
echo "1. replyText 字段应该只包含纯文本内容"
echo "2. 不应该包含 JSON 结构、runId、meta 等信息"
echo "3. 适合直接用于语音播报"
