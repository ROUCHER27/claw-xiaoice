#!/bin/bash
# 通用函数库

# 生成 SHA512 签名
# 参数: $1=body, $2=timestamp
generate_signature() {
    local body="$1"
    local timestamp="$2"
    local secret_key="${SECRET_KEY:-test-secret}"
    local message="${body}${secret_key}${timestamp}"
    echo -n "$message" | openssl dgst -sha512 | awk '{print $2}'
}

# 生成唯一 ID
generate_id() {
    echo "xiaoice-$(date +%s)000-$(openssl rand -hex 4)"
}

# 获取当前时间戳（毫秒）
get_timestamp() {
    echo "$(date +%s)000"
}

# 等待服务就绪
wait_for_service() {
    local url="$1"
    local max_attempts="${2:-30}"
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    return 1
}
