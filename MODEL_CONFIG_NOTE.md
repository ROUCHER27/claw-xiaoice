# OpenClaw 模型配置说明

**更新时间**: 2026-03-03

## 当前配置

### API 端点
- **BaseURL**: `https://yunyi.rdzhvip.com/claude`
- **API Key**: `JEU1MDXM-C51V-8UMN-QSZS-0HYHBEUHS2CM`
- **认证方式**: `api-key`
- **API 类型**: `anthropic-messages`

### 默认模型
- **主模型**: `yunyi-claude/claude-sonnet-4-6`

### 配置文件位置
1. `/home/yirongbest/.openclaw/openclaw.json` - 主配置文件
2. `/home/yirongbest/.openclaw/agents/main/agent/models.json` - Agent 模型配置

## 支持的模型列表

旧 URL (`https://yunyi.rdzhvip.com/claude`) 支持的模型：
- `claude-opus-4-6`
- `claude-opus-4-5-20251101`
- `claude-opus-4-1-20250805`
- `claude-opus-4-20250514`
- `claude-sonnet-4-6` ✅ (当前使用)
- `claude-sonnet-4-5-20250929`
- `claude-sonnet-4-20250514`
- `claude-haiku-4-5-20251001`

## 重要说明

### 为什么使用旧 URL？
- **新 URL** (`https://yunyi.cfd/claude`) 需要通过代理访问
- OpenClaw 的 HTTP 客户端不支持系统代理设置
- **旧 URL** (`https://yunyi.rdzhvip.com/claude`) 可以直连，响应稳定

### API Key 说明
- 当前使用的 API Key 与 Claude Code 相同
- 两个 Key 都可用，但统一使用同一个便于管理

### 网络环境
- 系统配置了代理：`http://xiaoice1234:xiaoice1234@172.23.112.1:7897`
- curl 会自动使用代理
- OpenClaw 需要使用不需要代理的 endpoint

## 故障排查

### 如果遇到超时错误
1. 检查是否使用了需要代理的 URL
2. 确认 API Key 正确
3. 测试 API 连接：
   ```bash
   curl -s "https://yunyi.rdzhvip.com/claude/v1/messages" \
     -H "x-api-key: JEU1MDXM-C51V-8UMN-QSZS-0HYHBEUHS2CM" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model": "claude-sonnet-4-6", "max_tokens": 50, "messages": [{"role": "user", "content": "Hi"}]}'
   ```

### 如果遇到 model_not_supported 错误
1. 检查模型名称是否正确
2. 确认该模型在当前 endpoint 上可用
3. 查看支持的模型列表：
   ```bash
   curl -s "https://yunyi.rdzhvip.com/claude/v1/models" \
     -H "x-api-key: JEU1MDXM-C51V-8UMN-QSZS-0HYHBEUHS2CM"
   ```

## 配置历史

### 2026-03-03
- 从 `yunyi.cfd` 改回 `yunyi.rdzhvip.com`（解决超时问题）
- 统一 API Key 为 Claude Code 使用的 Key
- 默认模型从 `claude-opus-4-6` 改为 `claude-sonnet-4-6`

## 相关服务

### XiaoIce Webhook
- **端口**: 3002
- **URL**: `http://localhost:3002/webhooks/xiaoice`
- **Ngrok**: `https://noctilucan-wendell-nonmalignantly.ngrok-free.dev`
- **认证**: 已禁用（开发模式）
- **响应格式**: XiaoIce 标准 JSON 格式

### OpenClaw Gateway
- **端口**: 18789
- **模式**: local
- **绑定**: loopback
