#!/bin/bash

set -e

# 设置 no_proxy
export no_proxy="localhost,127.0.0.1,::1,*.local"
export NO_PROXY="localhost,127.0.0.1,::1,*.local"

echo "=========================================="
echo "OpenClaw 连接测试"
echo "=========================================="
echo ""

echo "1. 测试视频服务健康检查..."
HEALTH=$(curl -s http://127.0.0.1:3105/health)
echo "   结果: $HEALTH"
if echo "$HEALTH" | grep -q "ok"; then
    echo "   ✅ 视频服务正常"
else
    echo "   ❌ 视频服务异常"
    exit 1
fi
echo ""

echo "2. 测试 OpenClaw Gateway 连接..."
GATEWAY=$(curl -s http://127.0.0.1:18789/health 2>&1 | head -1)
if echo "$GATEWAY" | grep -q "html"; then
    echo "   ✅ Gateway 正常响应"
else
    echo "   ❌ Gateway 异常: $GATEWAY"
    exit 1
fi
echo ""

echo "3. 测试视频服务创建任务..."
TASK_RESULT=$(curl -s -H "X-Internal-Token: video-internal-token" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"测试视频生成","sessionId":"test-session","traceId":"test-trace"}' \
    http://127.0.0.1:3105/v1/tasks)
echo "   结果: $TASK_RESULT"
if echo "$TASK_RESULT" | grep -q "taskId"; then
    TASK_ID=$(echo "$TASK_RESULT" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ 任务创建成功: $TASK_ID"

    echo ""
    echo "4. 测试查询任务状态..."
    sleep 1
    TASK_STATUS=$(curl -s -H "X-Internal-Token: video-internal-token" \
        http://127.0.0.1:3105/v1/tasks/$TASK_ID)
    echo "   结果: $TASK_STATUS"
    if echo "$TASK_STATUS" | grep -q "status"; then
        echo "   ✅ 任务查询成功"
    else
        echo "   ❌ 任务查询失败"
        exit 1
    fi
else
    echo "   ❌ 任务创建失败"
    exit 1
fi
echo ""

echo "5. 检查 OpenClaw 插件状态..."
PLUGIN_STATUS=$(openclaw plugins doctor 2>&1)
if echo "$PLUGIN_STATUS" | grep -q "No plugin issues"; then
    echo "   ✅ 插件无错误"
else
    echo "   ⚠️  插件状态: $PLUGIN_STATUS"
fi
echo ""

echo "=========================================="
echo "✅ 所有测试通过！"
echo "=========================================="
echo ""
echo "OpenClaw 和视频服务已正常运行。"
echo "可以通过 xiaoice_video_produce 工具使用视频生成功能。"
