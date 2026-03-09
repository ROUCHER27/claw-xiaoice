#!/bin/bash

# 启动 Ngrok 隧道脚本

export NO_PROXY=localhost,127.0.0.1

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}════════════════════════════════════════${NC}"
echo -e "${CYAN}       启动 Ngrok 隧道                 ${NC}"
echo -e "${CYAN}════════════════════════════════════════${NC}"
echo ""

# 检查 ngrok 是否已运行
if pgrep -f "ngrok http" > /dev/null; then
    echo -e "${YELLOW}⚠ Ngrok 已经在运行${NC}"
    echo ""
    ./ngrok-status.sh
    exit 0
fi

# 检查 ngrok 是否安装
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}❌ 错误: ngrok 未安装${NC}"
    echo ""
    echo -e "${YELLOW}安装方法:${NC}"
    echo "  wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz"
    echo "  tar xvzf ngrok-v3-stable-linux-amd64.tgz -C ~/bin/"
    exit 1
fi

# 检查配置文件
if [ ! -f "$HOME/.ngrok2/ngrok.yml" ]; then
    echo -e "${RED}❌ 错误: ngrok 配置文件不存在${NC}"
    echo ""
    echo -e "${YELLOW}配置 authtoken:${NC}"
    echo "  ngrok config add-authtoken YOUR_TOKEN"
    exit 1
fi

echo -e "${CYAN}启动 ngrok 隧道...${NC}"
echo ""

# 启动 ngrok（后台运行）
nohup ngrok http 3002 > /home/yirongbest/.openclaw/ngrok.log 2>&1 &
NGROK_PID=$!

echo -e "${GREEN}✓ Ngrok 已启动 (PID: $NGROK_PID)${NC}"
echo ""

# 等待隧道建立
echo -e "${CYAN}等待隧道建立...${NC}"
sleep 3

# 检查是否成功启动
if ! pgrep -f "ngrok http" > /dev/null; then
    echo -e "${RED}❌ Ngrok 启动失败${NC}"
    echo ""
    echo -e "${YELLOW}查看日志:${NC}"
    echo "  tail -20 /home/yirongbest/.openclaw/ngrok.log"
    exit 1
fi

# 获取公网 URL
PUBLIC_URL=$(curl -s --max-time 5 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)

if [ -z "$PUBLIC_URL" ]; then
    echo -e "${YELLOW}⚠ 隧道正在建立中，请稍候...${NC}"
    sleep 2
    PUBLIC_URL=$(curl -s --max-time 5 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)
fi

if [ -n "$PUBLIC_URL" ]; then
    echo -e "${GREEN}✓ 隧道建立成功！${NC}"
    echo ""
    echo -e "${CYAN}公网 URL:${NC} ${GREEN}$PUBLIC_URL${NC}"
    echo -e "${CYAN}Webhook:${NC}  ${GREEN}$PUBLIC_URL/webhooks/xiaoice${NC}"
    echo ""

    # 保存 URL
    echo "$PUBLIC_URL" > /home/yirongbest/.openclaw/.ngrok-url

    echo -e "${CYAN}下一步:${NC}"
    echo -e "  1. 查看状态: ${GREEN}./ngrok-status.sh${NC}"
    echo -e "  2. 获取配置: ${GREEN}./xiaoice-config.sh${NC}"
    echo -e "  3. Web 界面: ${GREEN}http://localhost:4040${NC}"
else
    echo -e "${YELLOW}⚠ 无法获取公网 URL，但 ngrok 正在运行${NC}"
    echo -e "  运行 ${GREEN}./ngrok-status.sh${NC} 查看状态"
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
