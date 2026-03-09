#!/bin/bash

# 测试 OpenClaw 对话功能

export no_proxy="localhost,127.0.0.1,::1,*.local"
export NO_PROXY="localhost,127.0.0.1,::1,*.local"

echo "=========================================="
echo "测试 OpenClaw 对话功能"
echo "=========================================="
echo ""

echo "1. 检查 Gateway 状态..."
openclaw status | grep "Gateway" | head -2
echo ""

echo "2. 通过 Dashboard 发送测试消息..."
echo "   请在浏览器中打开: http://127.0.0.1:18789/"
echo "   发送消息: 你好"
echo ""

echo "3. 监控日志中的连接错误..."
echo "   运行: openclaw logs | grep -E '(Connection error|embedded run agent end)'"
echo ""

echo "如果看到 'Connection error'，说明 MiniMax API 连接失败。"
echo "可能的原因："
echo "  - 代理配置未生效"
echo "  - API Key 无效"
echo "  - 网络问题"
