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
if pgrep -x "ngrok" > /dev/null; then
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

# 检查 ngrok.yml 是否配置了命名隧道
NGROK_CONFIG="$HOME/.ngrok2/ngrok.yml"
HAS_TUNNELS_CONFIG=false

if [ -f "$NGROK_CONFIG" ]; then
    if grep -q "^tunnels:" "$NGROK_CONFIG" 2>/dev/null; then
        HAS_TUNNELS_CONFIG=true
    fi
fi

# 启动 ngrok（后台运行）
if [ "$HAS_TUNNELS_CONFIG" = true ]; then
    echo -e "${CYAN}使用多隧道配置 (xiaoice-webhook + video-callback)${NC}"
    nohup ngrok start xiaoice-webhook video-callback > /home/yirongbest/.openclaw/ngrok.log 2>&1 &
else
    echo -e "${YELLOW}使用单隧道模式 (仅 xiaoice-webhook)${NC}"
    nohup ngrok http 3002 > /home/yirongbest/.openclaw/ngrok.log 2>&1 &
fi

NGROK_PID=$!

echo -e "${GREEN}✓ Ngrok 已启动 (PID: $NGROK_PID)${NC}"
echo ""

# 等待隧道建立
echo -e "${CYAN}等待隧道建立...${NC}"
sleep 3

# 检查是否成功启动
if ! pgrep -x "ngrok" > /dev/null; then
    echo -e "${RED}❌ Ngrok 启动失败${NC}"
    echo ""
    echo -e "${YELLOW}查看日志:${NC}"
    echo "  tail -20 /home/yirongbest/.openclaw/ngrok.log"
    exit 1
fi

# 获取隧道信息（重试机制）
MAX_RETRIES=5
RETRY_COUNT=0
TUNNELS_JSON=""

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    TUNNELS_JSON=$(curl -s --max-time 5 http://localhost:4040/api/tunnels 2>/dev/null || echo "")

    if [ -n "$TUNNELS_JSON" ] && echo "$TUNNELS_JSON" | grep -q '"tunnels"'; then
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo -e "${YELLOW}⚠ 隧道正在建立中... (尝试 $RETRY_COUNT/$MAX_RETRIES)${NC}"
        sleep 2
    fi
done

if [ -z "$TUNNELS_JSON" ] || ! echo "$TUNNELS_JSON" | grep -q '"tunnels"'; then
    echo -e "${RED}❌ 无法连接到 ngrok API${NC}"
    echo ""
    echo -e "${YELLOW}可能的原因:${NC}"
    echo "  1. ngrok 正在启动中，请稍后运行 ./ngrok-status.sh 查看状态"
    echo "  2. ngrok 启动失败，查看日志: tail -20 /home/yirongbest/.openclaw/ngrok.log"
    echo ""
    exit 1
fi

# 提取小冰 webhook URL
XIAOICE_URL=$(echo "$TUNNELS_JSON" | grep -o '"name":"xiaoice-webhook"[^}]*"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -1 || echo "")

# 如果没有找到命名隧道，尝试获取第一个 HTTPS 隧道（向后兼容单隧道模式）
if [ -z "$XIAOICE_URL" ]; then
    XIAOICE_URL=$(echo "$TUNNELS_JSON" | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1 || echo "")
fi

# 提取视频回调 URL
VIDEO_URL=$(echo "$TUNNELS_JSON" | grep -o '"name":"video-callback"[^}]*"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -1 || echo "")

# 验证隧道配置
if [ "$HAS_TUNNELS_CONFIG" = true ]; then
    # 多隧道模式：验证两个隧道都已建立
    if [ -z "$XIAOICE_URL" ] || [ -z "$VIDEO_URL" ]; then
        echo -e "${YELLOW}⚠ 警告: 部分隧道未建立${NC}"
        echo ""
        if [ -z "$XIAOICE_URL" ]; then
            echo -e "${RED}  ✗ xiaoice-webhook 隧道未找到${NC}"
        fi
        if [ -z "$VIDEO_URL" ]; then
            echo -e "${RED}  ✗ video-callback 隧道未找到${NC}"
        fi
        echo ""
        echo -e "${YELLOW}请检查:${NC}"
        echo "  1. ngrok.yml 配置是否正确"
        echo "  2. 隧道名称是否匹配: xiaoice-webhook, video-callback"
        echo "  3. 查看日志: tail -20 /home/yirongbest/.openclaw/ngrok.log"
        echo "  4. 访问 Web UI: http://localhost:4040"
        echo ""
    fi
fi

if [ -n "$XIAOICE_URL" ]; then
    echo -e "${GREEN}✓ 小冰 Webhook 隧道建立成功！${NC}"
    echo ""
    echo -e "${CYAN}公网 URL:${NC} ${GREEN}$XIAOICE_URL${NC}"
    echo -e "${CYAN}Webhook:${NC}  ${GREEN}$XIAOICE_URL/webhooks/xiaoice${NC}"
    echo ""

    # 保存小冰 URL
    mkdir -p /home/yirongbest/.openclaw
    echo "$XIAOICE_URL" > /home/yirongbest/.openclaw/.ngrok-url
    echo -e "${CYAN}已保存到:${NC} /home/yirongbest/.openclaw/.ngrok-url"
    echo ""
fi

if [ -n "$VIDEO_URL" ]; then
    echo -e "${GREEN}✓ 视频回调隧道建立成功！${NC}"
    echo ""
    echo -e "${CYAN}公网 URL:${NC} ${GREEN}$VIDEO_URL${NC}"
    echo -e "${CYAN}回调端点:${NC} ${GREEN}$VIDEO_URL/v1/callbacks/provider${NC}"
    echo ""

    # 保存视频 URL
    mkdir -p /home/yirongbest/.openclaw
    echo "$VIDEO_URL" > /home/yirongbest/.openclaw/.video-ngrok-url
    echo -e "${CYAN}已保存到:${NC} /home/yirongbest/.openclaw/.video-ngrok-url"
    echo ""
fi

if [ -n "$XIAOICE_URL" ] || [ -n "$VIDEO_URL" ]; then
    echo -e "${CYAN}下一步:${NC}"
    if [ -f "./ngrok-status.sh" ]; then
        echo -e "  1. 查看状态: ${GREEN}./ngrok-status.sh${NC}"
    fi
    if [ -f "./xiaoice-config.sh" ]; then
        echo -e "  2. 获取配置: ${GREEN}./xiaoice-config.sh${NC}"
    fi
    echo -e "  3. Web 界面: ${GREEN}http://localhost:4040${NC}"
    if [ -n "$VIDEO_URL" ]; then
        echo -e "  4. 视频服务: ${GREEN}cd /home/yirongbest/claw-xiaoice && ./update-video-callback.sh${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 无法获取公网 URL，但 ngrok 正在运行${NC}"
    echo -e "  运行 ${GREEN}./ngrok-status.sh${NC} 查看状态"
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${NC}"
