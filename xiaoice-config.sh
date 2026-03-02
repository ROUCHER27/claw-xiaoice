#!/bin/bash

# XiaoIce Webhook 配置助手
# 生成 XiaoIce 平台所需的配置信息和测试命令

export NO_PROXY=localhost,127.0.0.1

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          XiaoIce Webhook 配置信息                         ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查 ngrok 是否运行
if ! pgrep -f "ngrok http" > /dev/null; then
    echo -e "${RED}❌ Ngrok 未运行${NC}"
    echo ""
    echo -e "${YELLOW}请先启动 ngrok:${NC}"
    echo -e "  ${CYAN}./start-ngrok.sh${NC}"
    exit 1
fi

# 获取公网 URL
PUBLIC_URL=$(curl -s --max-time 3 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4 | head -1)

if [ -z "$PUBLIC_URL" ]; then
    # 尝试从缓存文件读取
    if [ -f "/home/yirongbest/.openclaw/.ngrok-url" ]; then
        PUBLIC_URL=$(cat /home/yirongbest/.openclaw/.ngrok-url)
        echo -e "${YELLOW}⚠ 从缓存读取 URL${NC}"
    else
        echo -e "${RED}❌ 无法获取公网 URL${NC}"
        exit 1
    fi
fi

# 显示配置信息
echo -e "${BLUE}[1] Webhook 端点${NC}"
echo -e "  ${GREEN}$PUBLIC_URL/webhooks/xiaoice${NC}"
echo ""

echo -e "${BLUE}[2] 认证信息${NC}"
echo -e "  Access Key: ${CYAN}test-key${NC}"
echo -e "  Secret Key: ${CYAN}test-secret${NC}"
echo -e "  签名算法:   ${CYAN}SHA512(RequestBody + SecretKey + Timestamp)${NC}"
echo ""

echo -e "${BLUE}[3] 请求头${NC}"
echo -e "  ${CYAN}Content-Type: application/json${NC}"
echo -e "  ${CYAN}x-xiaoice-timestamp: <毫秒时间戳>${NC}"
echo -e "  ${CYAN}x-xiaoice-signature: <SHA512签名>${NC}"
echo -e "  ${CYAN}x-xiaoice-key: test-key${NC}"
echo ""

echo -e "${BLUE}[4] 测试命令${NC}"
echo ""

# 生成测试命令
BODY='{"askText":"你好，请介绍一下你自己","sessionId":"test-session","traceId":"trace-001","languageCode":"zh"}'
TIMESTAMP=$(date +%s)000
SECRET_KEY="test-secret"
SIGNATURE=$(echo -n "${BODY}${SECRET_KEY}${TIMESTAMP}" | openssl dgst -sha512 | awk '{print $2}')

echo -e "${YELLOW}# 非流式请求测试${NC}"
cat << EOF
curl -X POST '$PUBLIC_URL/webhooks/xiaoice' \\
  -H 'Content-Type: application/json' \\
  -H 'x-xiaoice-timestamp: $TIMESTAMP' \\
  -H 'x-xiaoice-signature: $SIGNATURE' \\
  -H 'x-xiaoice-key: test-key' \\
  -d '$BODY'
EOF

echo ""
echo ""

echo -e "${YELLOW}# 流式请求测试 (SSE)${NC}"
cat << EOF
curl -N -X POST '$PUBLIC_URL/webhooks/xiaoice' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: text/event-stream' \\
  -H 'x-xiaoice-timestamp: $TIMESTAMP' \\
  -H 'x-xiaoice-signature: $SIGNATURE' \\
  -H 'x-xiaoice-key: test-key' \\
  -d '$BODY'
EOF

echo ""
echo ""

echo -e "${BLUE}[5] 健康检查${NC}"
echo -e "  ${CYAN}curl $PUBLIC_URL/health${NC}"
echo ""

echo -e "${BLUE}[6] Web 监控界面${NC}"
echo -e "  本地访问: ${CYAN}http://localhost:4040${NC}"
echo -e "  查看所有请求和响应详情"
echo ""

echo -e "${BLUE}[7] 配置到 XiaoIce 平台${NC}"
echo -e "  1. 登录 XiaoIce 开放平台"
echo -e "  2. 进入 Webhook 配置页面"
echo -e "  3. 填写以下信息："
echo -e "     - Webhook URL: ${GREEN}$PUBLIC_URL/webhooks/xiaoice${NC}"
echo -e "     - Access Key: ${CYAN}test-key${NC}"
echo -e "     - Secret Key: ${CYAN}test-secret${NC}"
echo -e "  4. 保存并测试连接"
echo ""

echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
