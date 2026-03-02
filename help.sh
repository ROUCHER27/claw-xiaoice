#!/bin/bash

# XiaoIce Webhook + Ngrok - 快速参考

export NO_PROXY=localhost,127.0.0.1

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       XiaoIce Webhook + Ngrok - 快速参考                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 获取公网 URL
PUBLIC_URL=$(curl -s --max-time 2 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)

if [ -z "$PUBLIC_URL" ]; then
    PUBLIC_URL=$(cat .ngrok-url 2>/dev/null || echo "未获取到")
fi

echo -e "${GREEN}[当前配置]${NC}"
echo -e "  公网 URL: ${CYAN}$PUBLIC_URL${NC}"
echo -e "  Webhook:  ${CYAN}$PUBLIC_URL/webhooks/xiaoice${NC}"
echo ""

echo -e "${GREEN}[常用命令]${NC}"
echo ""
echo -e "${YELLOW}状态查看:${NC}"
echo -e "  ./status.sh              # 完整状态面板"
echo -e "  ./ngrok-status.sh        # Ngrok 隧道状态"
echo -e "  ./xiaoice-config.sh      # XiaoIce 配置信息"
echo ""

echo -e "${YELLOW}监控工具:${NC}"
echo -e "  ./watch-logs.sh          # 实时日志监控"
echo -e "  http://localhost:4040    # Ngrok Web 界面"
echo ""

echo -e "${YELLOW}测试命令:${NC}"
echo -e "  ./test-quick.sh          # 快速测试"
echo -e "  ./test-webhook.sh        # 完整测试套件"
echo ""

echo -e "${YELLOW}Ngrok 管理:${NC}"
echo -e "  ./start-ngrok.sh         # 启动 ngrok 隧道"
echo -e "  ./stop-ngrok.sh          # 停止 ngrok 隧道"
echo ""

echo -e "${YELLOW}Webhook 管理:${NC}"
echo -e "  ./start-webhook.sh       # 启动 webhook 代理"
echo -e "  kill \$(cat webhook.pid)  # 停止 webhook 代理"
echo ""

echo -e "${GREEN}[文档]${NC}"
echo -e "  README-XIAOICE.md        # XiaoIce 集成文档"
echo -e "  NGROK-GUIDE.md           # Ngrok 使用指南"
echo -e "  NGROK-IMPLEMENTATION.md  # 实施总结"
echo ""

echo -e "${GREEN}[快速测试公网访问]${NC}"
echo -e "  ${CYAN}curl $PUBLIC_URL/health${NC}"
echo ""

echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
