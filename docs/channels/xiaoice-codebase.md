# XiaoIce Channel 代码结构与技术栈

更新时间: 2026-03-06 (Asia/Shanghai)  
仓库路径: `/home/yirongbest/.openclaw`

本仓库里与 “xiaoice channel” 相关的实现主要分两条线:
- `webhook-proxy-new.js` + `src/**`: 独立运行的 XiaoIce Webhook Proxy (HTTP Server)，把 `/webhooks/xiaoice` 的请求转发给 `openclaw` CLI。
- `extensions/xiaoice/**`: OpenClaw 插件形态的 XiaoIce channel（通过 `openclaw/plugin-sdk` 注册 channel 和 webhook handler）。

## 技术栈

- Runtime
  - Node.js: `v25.7.0`
  - npm: `11.10.1`
- 语言与模块形态
  - JavaScript (Node, CommonJS): 根目录 `webhook-proxy-*.js` 与 `src/*.js`
  - TypeScript (ESM import with `.js` specifiers): `extensions/xiaoice/src/*.ts`
- Web 服务
  - Node 内置 `http` 手写路由 (非 Express/Koa)
  - SSE: 通过 `Content-Type: text/event-stream` 输出 `event: message\ndata: {json}\n\n`
  - XiaoIce 最终事件以 JSON 内的 `isFinal: true` 标记结束；当前主链路不再发送 `data: [DONE]`
  - 本地 Dashboard: `/dashboard` + `/api/dashboard/*`（限制 localhost）
- 安全/鉴权
  - Webhook Proxy: SHA-512 签名校验 `SHA512(body + secret + timestamp)` + 时间窗校验 + 常量时间对比 (`crypto.timingSafeEqual`)
  - 插件 webhook: HMAC-SHA256 (`crypto.createHmac("sha256", secret)`)
- 与 OpenClaw 集成
  - `child_process.spawn('openclaw', ['agent', '--channel', 'xiaoice', ...])` 调用 OpenClaw CLI
  - 依赖本机 OpenClaw Gateway (默认端口在 `openclaw.json` 里配置，当前为 `18789`)
- 测试
  - Jest (`__tests__/*.test.js`)，并启用全局覆盖率阈值 (80%)
- 依赖 (来自根 `package.json`)
  - 测试: `jest`
  - MCP: `@modelcontextprotocol/sdk`, `@gongrzhe/server-gmail-autoauth-mcp`
  - SSE/流式解析: `eventsource`, `eventsource-parser`
  - 说明: XiaoIce Webhook Proxy 主体主要依赖 Node 内置模块；以上第三方包更多用于集成/扩展能力（例如 MCP）。

## 核心代码文件结构 (XiaoIce Channel)

### 1) Webhook Proxy (独立服务)

入口与核心模块:
```text
webhook-proxy-new.js          # 当前主入口：加载配置并启动 server
webhook-proxy.js              # 旧版/单文件实现（仍保留）
src/
  server.js                   # HTTP server + 路由: /health /dashboard /api/dashboard/* /webhooks/xiaoice
  handlers.js                 # Webhook 主逻辑：读 body、鉴权、按 session 串行队列、流式/非流式返回
  auth.js                     # SHA512 签名验证 + 时间窗校验
  openclaw-client.js          # spawn openclaw CLI + timeout/kill
  response-parser.js          # 从 OpenClaw stdout 提取 replyText（兼容多种 JSON 输出格式）
  dashboard.js                # localhost-only dashboard 页面与 status/logs API
```

关键路由:
- `POST /webhooks/xiaoice`
- `GET /health`
- `GET /dashboard`
- `GET /api/dashboard/status`
- `GET /api/dashboard/logs`

### 2) OpenClaw 插件 (extensions/xiaoice)

```text
extensions/xiaoice/
  index.ts                    # 插件入口：register channel + registerHttpHandler
  openclaw.plugin.json         # 插件元数据 + configSchema（accounts/apiBaseUrl/apiKey/webhookSecret）
  package.json                # OpenClaw 扩展入口声明
  src/
    accounts.ts               # accountId 解析与配置合并逻辑（channels.xiaoice.accounts）
    api.ts                    # 调用上游 XiaoIce HTTP API：/send 与 /send/stream（SSE）
    channel.ts                # ChannelPlugin: outbound.sendText + streaming 支持
    types.ts                  # 类型定义（WebhookPayload、SSE event 等）
    webhook.ts                # webhook handler: 解析 path accountId + 签名校验（X-Signature）
```

## 测试结构

```text
__tests__/
  auth.test.js                # auth.js: 签名/时间窗相关测试
  handlers.test.js            # handlers.js: webhook 处理、边界条件、返回格式等
  response-parser.test.js     # response-parser.js: replyText 提取兼容性
  session-queue.test.js       # handlers.js: session 串行队列策略（latest-first）
```

## 运维/本地开发脚本 (常用)

```text
start-webhook.sh              # 启动 webhook proxy（通常配合 .env）
start-ngrok.sh / stop-ngrok.sh
status.sh                     # 运行状态检查
monitor-webhook.sh            # 监控 webhook 进程/日志
watch-logs.sh                 # tail/过滤日志
test-quick.sh                 # 快速冒烟测试
test-webhook.sh               # 完整测试
test-auth-modes.sh            # 鉴权模式测试
test-xiaoice-complete.sh      # 更完整链路测试（依赖 OpenClaw/Gateway）
xiaoice-auth-helper.sh        # 辅助生成/校验签名
```

## 配置入口 (注意包含敏感信息)

- `.env` / `.env.example`
  - Webhook Proxy 的端口与鉴权: `PORT`, `XIAOICE_ACCESS_KEY`, `XIAOICE_SECRET_KEY`, `XIAOICE_AUTH_REQUIRED`, `XIAOICE_TIMEOUT`
- `openclaw.json`
  - OpenClaw 的 channel 配置与插件开关: `channels.xiaoice`, `plugins.entries.xiaoice`
  - 该文件包含 token/apiKey 等敏感字段，文档中未展开具体值。

## 附录: 代码文件清单 (xiaoice channel 相关)

说明: 这里列出的是源码与脚本文件路径清单，便于你在 Obsidian 里检索与跳转。

```text
./webhook-proxy-new.js
./webhook-proxy.js
./mock-xiaoice-server.ts
./help.sh
./monitor-webhook.sh
./ngrok-status.sh
./quick-test.sh
./setup-gmail-mcp-auth.sh
./start-ngrok.sh
./start-webhook.sh
./status.sh
./stop-ngrok.sh
./test-auth-modes.sh
./test-empty-message.sh
./test-lib.sh
./test-model-config.sh
./test-quick.sh
./test-text-extraction.sh
./test-webhook.sh
./test-xiaoice-complete.sh
./test-xiaoice-gmail-mcp.sh
./watch-logs.sh
./xiaoice-auth-helper.sh
./xiaoice-config.sh
__tests__/auth.test.js
__tests__/handlers.test.js
__tests__/response-parser.test.js
__tests__/session-queue.test.js
extensions/xiaoice/index.ts
extensions/xiaoice/openclaw.plugin.json
extensions/xiaoice/package.json
extensions/xiaoice/src/accounts.ts
extensions/xiaoice/src/api.ts
extensions/xiaoice/src/channel.ts
extensions/xiaoice/src/types.ts
extensions/xiaoice/src/webhook.ts
lib/colors.sh
lib/common.sh
lib/config.sh
lib/output.sh
lib/proxy-setup.sh
src/auth.js
src/dashboard.js
src/handlers.js
src/openclaw-client.js
src/response-parser.js
src/server.js
```
