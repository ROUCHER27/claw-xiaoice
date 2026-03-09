#!/bin/bash

# Ngrok 状态检查脚本
# 显示 ngrok 隧道状态和公网 URL

export NO_PROXY=localhost,127.0.0.1

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              Ngrok 隧道状态                               ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查 ngrok 进程是否运行
if ! pgrep -f "ngrok http" > /dev/null; then
    echo -e "${RED}❌ Ngrok 未运行${NC}"
    echo ""
    echo -e "${YELLOW}启动 ngrok:${NC}"
    echo -e "  ${CYAN}./start-ngrok.sh${NC}"
    exit 1
fi

# 获取进程信息
NGROK_PID=$(pgrep -f "ngrok http" | head -1)
UPTIME=$(ps -p $NGROK_PID -o etime= | xargs)

echo -e "${GREEN}✅ Ngrok 进程运行中${NC}"
echo -e "  PID: $NGROK_PID"
echo -e "  运行时长: $UPTIME"
echo ""

# 查询 ngrok API
TUNNEL_INFO=$(curl -s --max-time 3 http://localhost:4040/api/tunnels 2>/dev/null)

if [ -z "$TUNNEL_INFO" ]; then
    echo -e "${RED}❌ 无法连接到 ngrok API (端口 4040)${NC}"
    echo -e "${YELLOW}提示: 确保使用 NO_PROXY=localhost,127.0.0.1${NC}"
    exit 1
fi

# 提取隧道信息
PUBLIC_URL=$(echo "$TUNNEL_INFO" | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)
TUNNEL_NAME=$(echo "$TUNNEL_INFO" | grep -o '"name":"[^"]*' | cut -d'"' -f4 | head -1)
CONNECTIONS=$(echo "$TUNNEL_INFO" | grep -o '"connections":[0-9]*' | cut -d':' -f2 | head -1)

if [ -z "$PUBLIC_URL" ]; then
    echo -e "${RED}❌ 未找到活跃隧道${NC}"
    exit 1
fi

echo -e "${BLUE}[隧道信息]${NC}"
echo -e "  名称: ${CYAN}$TUNNEL_NAME${NC}"
echo -e "  公网 URL: ${GREEN}$PUBLIC_URL${NC}"
echo -e "  本地地址: ${CYAN}http://localhost:3002${NC}"
echo -e "  连接数: ${CYAN}${CONNECTIONS:-0}${NC}"
echo ""

echo -e "${BLUE}[Webhook 端点]${NC}"
echo -e "  完整 URL: ${GREEN}$PUBLIC_URL/webhooks/xiaoice${NC}"
echo -e "  健康检查: ${CYAN}$PUBLIC_URL/health${NC}"
echo ""

echo -e "${BLUE}[Web 界面]${NC}"
echo -e "  本地访问: ${CYAN}http://localhost:4040${NC}"
echo -e "  查看流量: 在浏览器中打开上述地址"
echo ""

echo -e "${BLUE}[快速操作]${NC}"
echo -e "  获取配置: ${CYAN}./xiaoice-config.sh${NC}"
echo -e "  查看日志: ${CYAN}./watch-logs.sh${NC}"
echo -e "  停止隧道: ${CYAN}./stop-ngrok.sh${NC}"
echo ""

# 保存 URL 到文件
echo "$PUBLIC_URL" > /home/yirongbest/.openclaw/.ngrok-url
echo -e "${GREEN}✓ 公网 URL 已保存到 .ngrok-url${NC}"
