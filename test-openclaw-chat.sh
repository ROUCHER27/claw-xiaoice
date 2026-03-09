#!/bin/bash

set -euo pipefail

export no_proxy="localhost,127.0.0.1,::1,*.local"
export NO_PROXY="localhost,127.0.0.1,::1,*.local"

echo "=========================================="
echo "OpenClaw 对话功能测试"
echo "=========================================="
echo ""

echo "1. 检查配置文件有效性..."
if node -e "JSON.parse(require('fs').readFileSync('/home/yirongbest/claw-xiaoice/openclaw.json','utf8'))" 2>/dev/null; then
    echo "   ✅ claw-xiaoice/openclaw.json 有效"
else
    echo "   ❌ claw-xiaoice/openclaw.json 无效"
    exit 1
fi

if node -e "JSON.parse(require('fs').readFileSync('/home/yirongbest/.openclaw/openclaw.json','utf8'))" 2>/dev/null; then
    echo "   ✅ ~/.openclaw/openclaw.json 有效"
else
    echo "   ❌ ~/.openclaw/openclaw.json 无效"
    exit 1
fi
echo ""

echo "2. 检查 Gateway 状态..."
if systemctl --user is-active openclaw-gateway.service >/dev/null 2>&1; then
    echo "   ✅ Gateway 运行中"
    PID=$(systemctl --user show openclaw-gateway.service -p MainPID --value)
    echo "   PID: $PID"
else
    echo "   ❌ Gateway 未运行"
    exit 1
fi
echo ""

echo "3. 检查代理配置..."
if systemctl --user show openclaw-gateway.service | grep -q "no_proxy=localhost"; then
    echo "   ✅ no_proxy 已配置"
else
    echo "   ⚠️  no_proxy 未配置"
fi
echo ""

echo "4. 检查模型配置..."
DEFAULT_MODEL=$(openclaw config get agents.defaults.model.primary 2>/dev/null || echo "unknown")
echo "   默认模型: $DEFAULT_MODEL"
echo ""

echo "5. 检查插件状态..."
openclaw plugins doctor 2>&1 | head -5
echo ""

echo "6. 测试 Gateway 连接..."
if curl -s --noproxy "*" http://127.0.0.1:18789/health >/dev/null 2>&1; then
    echo "   ✅ Gateway 可访问"
else
    echo "   ❌ Gateway 不可访问"
fi
echo ""

echo "7. 测试视频服务..."
if curl -s --noproxy "*" http://127.0.0.1:3105/health >/dev/null 2>&1; then
    echo "   ✅ 视频服务运行中"
else
    echo "   ⚠️  视频服务未运行"
fi
echo ""

echo "=========================================="
echo "测试完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 打开浏览器访问: http://127.0.0.1:18789/"
echo "2. 发送消息测试对话功能"
echo "3. 如果看到 Connection error，运行: openclaw logs | grep -i error"
echo ""
echo "切换模型："
echo "  openclaw config set agents.defaults.model.primary \"yunyi-claude/claude-sonnet-4-6\""
echo "  systemctl --user restart openclaw-gateway.service"
