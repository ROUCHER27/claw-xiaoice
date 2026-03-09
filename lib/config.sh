#!/bin/bash
# 配置管理

# 加载 .env 文件（如果存在）
load_env() {
    local env_file="${1:-.env}"
    if [ -f "$env_file" ]; then
        export $(cat "$env_file" | grep -v '^#' | xargs)
    fi
}

# Webhook 配置
export WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3002/webhooks/xiaoice}"
export WEBHOOK_PORT="${PORT:-3002}"

# 认证配置
export ACCESS_KEY="${XIAOICE_ACCESS_KEY:-test-key}"
export SECRET_KEY="${XIAOICE_SECRET_KEY:-test-secret}"
export AUTH_REQUIRED="${XIAOICE_AUTH_REQUIRED:-false}"

# 超时配置
export TIMEOUT="${XIAOICE_TIMEOUT:-30000}"

# Ngrok 配置
export NGROK_API_URL="${NGROK_API_URL:-http://localhost:4040/api/tunnels}"

# 测试配置
export TEST_SESSION_ID="${TEST_SESSION_ID:-test-session}"
export TEST_MESSAGE="${TEST_MESSAGE:-你好}"
