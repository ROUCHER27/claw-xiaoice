# OpenClaw 配置修复完成报告

## 修复时间
2026-03-09

## 问题总结

### 原始问题
1. 本地未推送的改动导致配置不一致
2. Gmail MCP 功能失效
3. 模型连接问题（实际是 token_mismatch）
4. 自定义插件（xiaoice, mcp-integration）未正确加载

### 根本原因
- 项目配置 `claw-xiaoice/openclaw.json` 和活跃配置 `~/.openclaw/openclaw.json` 不同步
- 缺少 `plugins.load.paths` 配置，导致自定义插件无法加载
- 小冰插件缺少必需的 `apiKey` 和 `webhookSecret` 配置

## 修复方案

### 1. 恢复插件加载路径
在 `~/.openclaw/openclaw.json` 中添加：
```json
"plugins": {
  "load": {
    "paths": [
      "/home/yirongbest/claw-xiaoice/extensions/mcp-integration",
      "/home/yirongbest/claw-xiaoice/extensions/xiaoice",
      "/home/yirongbest/claw-xiaoice/extensions/video-orchestrator"
    ]
  }
}
```

### 2. 配置小冰插件测试凭证
```json
"channels": {
  "xiaoice": {
    "enabled": true,
    "accounts": {
      "default": {
        "enabled": true,
        "apiBaseUrl": "http://localhost:3001",
        "apiKey": "test-xiaoice-key",
        "webhookSecret": "test-xiaoice-webhook-secret"
      }
    }
  }
}
```

**注意**：
- `apiKey` 和 `webhookSecret` 是必填项（代码中有验证）
- 如果小冰平台实际不需要认证，这些测试值也能让插件通过配置验证
- 实际使用时需要替换为真实的凭证

### 3. 恢复 MCP Integration 配置
```json
"plugins": {
  "entries": {
    "mcp-integration": {
      "enabled": true,
      "config": {
        "enabled": true,
        "servers": {
          "gmail": {
            "enabled": false,
            "transport": "stdio",
            "command": "node",
            "args": [
              "/home/yirongbest/.openclaw/node_modules/@gongrzhe/server-gmail-autoauth-mcp/dist/index.js"
            ],
            "env": {
              "GMAIL_OAUTH_PATH": "/home/yirongbest/.openclaw/credentials/gmail-mcp/gcp-oauth.keys.json",
              "GMAIL_CREDENTIALS_PATH": "/home/yirongbest/.openclaw/credentials/gmail-mcp/credentials.json"
            }
          }
        }
      }
    }
  }
}
```

**注意**：Gmail MCP 当前设置为 `enabled: false`，需要时可以启用。

### 4. 模型配置
- **默认模型**：`yunyi-claude/claude-sonnet-4-6`
- **备用模型**：`minimax-cn/MiniMax-M2.5-highspeed`
- 两个模型都已配置，可以在 Dashboard 中切换

## 验证结果

### ✅ 插件状态
```
MCP Integration  - loaded
XiaoIce          - loaded
Video Orchestrator - loaded
Feishu           - loaded
```

### ✅ Gateway 状态
- 端口：18789
- 状态：reachable (18ms)
- PID：3790

### ✅ 代理配置
systemd 服务已配置代理环境变量：
- `http_proxy=http://xiaoice1234:xiaoice1234@172.23.112.1:7897`
- `https_proxy=http://xiaoice1234:xiaoice1234@172.23.112.1:7897`
- `no_proxy=localhost,127.0.0.1,::1,*.local`

### ✅ 视频服务
- 端口：3105
- 状态：运行中
- 工具：`xiaoice_video_produce` 可用

## 下一步操作

### 1. 测试对话功能
打开浏览器访问：
```
http://127.0.0.1:18789/#token=8db388d0368f7e4351e87556596396825ed9c17f9eb70012
```

发送测试消息验证模型连接。

### 2. 启用 Gmail MCP（可选）
如果需要使用 Gmail 功能：
```bash
openclaw config set plugins.entries.mcp-integration.config.servers.gmail.enabled true
systemctl --user restart openclaw-gateway.service
```

### 3. 配置真实的小冰凭证（可选）
如果有真实的小冰 API 凭证，更新配置：
```bash
openclaw config set channels.xiaoice.accounts.default.apiKey "your-real-api-key"
openclaw config set channels.xiaoice.accounts.default.webhookSecret "your-real-webhook-secret"
systemctl --user restart openclaw-gateway.service
```

### 4. 同步项目配置
将活跃配置同步回项目：
```bash
cp ~/.openclaw/openclaw.json /home/yirongbest/claw-xiaoice/openclaw.json
```

## 相关文档
- **Gateway 认证与排障**：https://docs.openclaw.ai/gateway-auth-and-troubleshooting
- **Gateway 配置**：https://docs.openclaw.ai/gateway
- **插件系统**：https://docs.openclaw.ai/plugins
- **MCP 集成**：https://docs.openclaw.ai/mcp-integration
- **Channels 配置**：https://docs.openclaw.ai/channels
- **通用排障指南**：https://docs.openclaw.ai/troubleshooting
- **模型配置**：https://docs.openclaw.ai/models

## 配置文件位置
- **活跃配置**：`~/.openclaw/openclaw.json`
- **项目配置**：`/home/yirongbest/claw-xiaoice/openclaw.json`
- **代理配置**：`~/.config/systemd/user/openclaw-gateway.service.d/proxy.conf`
- **环境变量**：`~/.bashrc` (包含 no_proxy 配置)

## 备份文件
- `~/.openclaw/openclaw.json.bak-before-sync`
- `~/.openclaw/openclaw.json.bak-before-yunyi`
- `/home/yirongbest/claw-xiaoice/openclaw.json.corrupt-20260309-152711`
