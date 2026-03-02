#!/bin/bash
# 代理设置

# 禁用代理（用于本地测试）
disable_proxy() {
    unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
    export NO_PROXY=localhost,127.0.0.1
}

# 启用代理（如果需要）
enable_proxy() {
    if [ -n "$PROXY_URL" ]; then
        export http_proxy="$PROXY_URL"
        export https_proxy="$PROXY_URL"
    fi
}
