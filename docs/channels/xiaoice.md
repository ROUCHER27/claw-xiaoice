# 小冰 (XiaoIce)

Status: ready for DMs via Webhook + HTTP API.

## 快速配置

1. **配置小冰 API**:
   - 在 `channels.xiaoice` 下配置账号
   - 需要提供小冰 API 端点 URL

2. **配置 Webhook**:
   - Webhook 端点: `/webhooks/xiaoice/:accountId`
   - 配置签名密钥用于验证

3. **配置示例**:
```json5
{
  channels: {
    xiaoice: {
      accounts: {
        default: {
          enabled: true,
          apiBaseUrl: "https://your-xiaoice-api.com",
          apiKey: "your-api-key",
          webhookSecret: "your-webhook-secret"
        }
      }
    }
  }
}
```

## 功能

- 支持私信对话
- 支持文本消息
- Webhook 接收消息
- HTTP API 发送响应

## 消息流程

```
用户 → 小冰 → OpenClaw Webhook → 处理 → 小冰 → 用户
```

## 配置项

| 配置项 | 描述 | 必填 |
|--------|------|------|
| apiBaseUrl | 小冰 API 基础 URL | 是 |
| apiKey | API 密钥 | 是 |
| webhookSecret | Webhook 签名密钥 | 是 |
