#!/bin/bash

# 停止 Ngrok 隧道脚本

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}       停止 Ngrok 隧道                 ${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

# 查找 ngrok 进程
NGROK_PID=$(pgrep -f "ngrok http" | head -1)

if [ -z "$NGROK_PID" ]; then
    echo -e "${YELLOW}⚠ Ngrok 未运行${NC}"
    exit 0
fi

echo -e "${CYAN}找到 Ngrok 进程: PID $NGROK_PID${NC}"
echo ""

# 发送 SIGTERM 信号
echo -e "${CYAN}发送停止信号...${NC}"
kill -TERM $NGROK_PID

# 等待进程结束
sleep 2

# 检查是否成功停止
if pgrep -f "ngrok http" > /dev/null; then
    echo -e "${YELLOW}⚠ 进程未响应，强制终止...${NC}"
    kill -9 $NGROK_PID
    sleep 1
fi

# 验证
if ! pgrep -f "ngrok http" > /dev/null; then
    echo -e "${GREEN}✓ Ngrok 已停止${NC}"

    # 清理 URL 文件
    if [ -f "/home/yirongbest/.openclaw/.ngrok-url" ]; then
        rm -f /home/yirongbest/.openclaw/.ngrok-url
        echo -e "${GREEN}✓ 已清理 URL 缓存${NC}"
    fi
else
    echo -e "${RED}❌ 无法停止 Ngrok${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
