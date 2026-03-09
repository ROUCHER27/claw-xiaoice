# 视频服务 Ngrok 回调配置完整方案

## 背景说明

### 问题描述

视频服务（端口 3105）当前的回调地址配置为 `http://127.0.0.1:3105`，这是本地地址。当小冰视频生成完成后，小冰服务器无法访问这个本地地址，导致回调通知失败，视频服务无法收到生成结果。

### 当前架构

**小冰频道（已正常工作）**：
- Webhook 代理运行在端口 3002
- Ngrok 隧道将 3002 端口暴露到公网 HTTPS URL
- 管理脚本位于 `.openclaw/` 目录
- 公网 URL 保存在 `.openclaw/.ngrok-url`

**视频服务（需要修复）**：
- 视频任务服务运行在端口 3105
- 回调端点：`/v1/callbacks/provider`
- 配置文件：`credentials/video-service.secrets.json`
- 当前使用本地 URL：`http://127.0.0.1:3105`（无法被外网访问）

## 解决方案设计

### 核心思路

复用小冰频道已有的 ngrok 基础设施，在同一个 ngrok 进程中配置多个隧道，同时暴露：
- 端口 3002：小冰 webhook 代理
- 端口 3105：视频服务回调

### 技术方案

#### 1. Ngrok 配置策略

使用单个 ngrok 进程管理多个隧道（共享 Web UI 端口 4040）：

**修改 `~/.ngrok2/ngrok.yml`**：
```yaml
tunnels:
  xiaoice-webhook:
    proto: http
    addr: 3002
  video-callback:
    proto: http
    addr: 3105
```

**启动命令**：
```bash
ngrok start xiaoice-webhook video-callback
```

#### 2. 小冰 API 工作流程

根据小冰 API 文档：

1. **创建视频**：POST `/openapi/aivideo/create`
   - 请求体包含 `callbackUrl` 字段（字符串类型）
   - 响应的 `data` 字段包含任务 ID (bizId)

2. **回调通知**：视频生成完成后，小冰 POST 到 callbackUrl
   - 回调载荷格式未在文档中详细说明
   - 当前代码已实现灵活的字段提取逻辑

3. **查询状态**：GET `/openapi/aivideo/detail/{bizId}`
   - 状态流转：COMMIT → TRANSFER_TO_OSS → ADD_EFFECT → CREATE_VIDEO_PROJECT → CREATE_VIDEO_TASK_ING → SUCC/FAIL
   - 成功时 `outputData` 字段包含视频 URL

#### 3. 回调 URL 构造

```
{video_ngrok_public_url}/v1/callbacks/provider?token={VIDEO_SERVICE_CALLBACK_TOKEN}
```

示例：
```
https://abc123.ngrok-free.app/v1/callbacks/provider?token=video-callback-token
```

#### 4. 回调认证

视频服务的回调端点支持两种认证方式：
- 查询参数：`?token=xxx`
- HTTP 头：`X-Callback-Token: xxx`

Token 值从环境变量 `VIDEO_SERVICE_CALLBACK_TOKEN` 读取。

## 实施步骤

### 阶段 1：更新 Ngrok 配置

**1.1 修改 `~/.ngrok2/ngrok.yml`**

添加命名隧道配置：
```yaml
version: "2"
authtoken: YOUR_NGROK_TOKEN

tunnels:
  xiaoice-webhook:
    proto: http
    addr: 3002
  video-callback:
    proto: http
    addr: 3105
```

**1.2 修改 `.openclaw/start-ngrok.sh`**

将启动命令从：
```bash
ngrok http 3002
```

改为：
```bash
ngrok start xiaoice-webhook video-callback
```

同时更新脚本逻辑：
- 查询 ngrok API 获取两个隧道的公网 URL
- 保存小冰 webhook URL 到 `.openclaw/.ngrok-url`
- 保存视频回调 URL 到 `.openclaw/.video-ngrok-url`

### 阶段 2：创建视频服务管理脚本

**2.1 创建 `video-ngrok-status.sh`**

功能：
- 检查 ngrok 进程是否运行
- 查询 ngrok API（端口 4040）
- 查找名为 "video-callback" 的隧道
- 显示公网 URL 和回调端点
- 显示连接统计信息

**2.2 创建 `update-video-callback.sh`**

功能：
- 从 `.openclaw/.video-ngrok-url` 读取公网 URL
- 调用视频服务管理 API 更新配置
- API 端点：`PUT http://127.0.0.1:3105/v1/admin/config`
- 请求头：`X-Admin-Token: video-admin-token`
- 请求体：
  ```json
  {
    "callbackPublicBaseUrl": "https://xxx.ngrok-free.app"
  }
  ```
- 验证更新成功

### 阶段 3：集成到视频服务启动流程

**3.1 修改 `start-video-service.sh`**

添加可选的 ngrok 自动启动功能：
- 检查环境变量 `VIDEO_USE_NGROK`
- 如果设置为 `true`，在启动服务前：
  1. 调用 `start-ngrok.sh`（如果未运行）
  2. 等待隧道建立
  3. 调用 `update-video-callback.sh` 自动更新回调 URL

**3.2 更新 `.env.example`**

添加配置项：
```bash
# 视频服务 Ngrok 配置
VIDEO_USE_NGROK=false  # 设置为 true 启用自动 ngrok 配置
```

### 阶段 4：文档和验证

**4.1 创建 `VIDEO-NGROK-GUIDE.md`**

包含：
- 快速开始指南
- 手动 vs 自动配置说明
- 常见问题排查
- 如何验证回调 URL 工作正常
- 安全注意事项

## 文件清单

### 需要创建的文件

```
/home/yirongbest/claw-xiaoice/
├── video-ngrok-status.sh         (新建)
├── update-video-callback.sh      (新建)
├── VIDEO-NGROK-GUIDE.md          (新建)
└── 视频服务Ngrok回调配置方案.md  (本文件)
```

### 需要修改的文件

```
/home/yirongbest/claw-xiaoice/
├── start-video-service.sh        (修改 - 添加 ngrok 集成)
└── .env.example                  (修改 - 添加 VIDEO_USE_NGROK)

/home/yirongbest/.openclaw/
└── start-ngrok.sh                (修改 - 启动双隧道)

~/.ngrok2/
└── ngrok.yml                     (修改 - 添加视频隧道配置)
```

### 自动生成的文件

```
/home/yirongbest/.openclaw/
└── .video-ngrok-url              (缓存文件，自动生成)
```

### 配置文件（通过脚本更新）

```
/home/yirongbest/claw-xiaoice/credentials/
└── video-service.secrets.json    (通过 update-video-callback.sh 更新)
```

## 验证步骤

### 1. 启动视频服务

```bash
cd /home/yirongbest/claw-xiaoice
./start-video-service.sh
```

### 2. 启动 Ngrok（双隧道模式）

```bash
cd /home/yirongbest/.openclaw
./start-ngrok.sh
```

应该看到两个隧道都已建立。

### 3. 检查视频隧道状态

```bash
cd /home/yirongbest/claw-xiaoice
./video-ngrok-status.sh
```

应该显示：
- Ngrok 进程运行状态
- 视频回调的公网 URL
- 完整的回调端点地址

### 4. 更新视频服务回调配置

```bash
./update-video-callback.sh
```

### 5. 验证配置已更新

```bash
# 检查服务健康状态
curl http://127.0.0.1:3105/health

# 检查回调 URL 已设置
cat credentials/video-service.secrets.json | grep callbackPublicBaseUrl
```

应该看到：
```json
"callbackPublicBaseUrl": "https://xxx.ngrok-free.app"
```

### 6. 测试公网回调端点

```bash
# 获取公网 URL
PUBLIC_URL=$(cat /home/yirongbest/.openclaw/.video-ngrok-url)

# 模拟小冰回调
curl "$PUBLIC_URL/v1/callbacks/provider?token=video-callback-token" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"providerTaskId":"test-123","videoUrl":"https://example.com/video.mp4"}'
```

预期响应：
```json
{"data":{"acknowledged":true}}
```

### 7. 端到端测试

1. 通过 OpenClaw 工具 `xiaoice_video_produce` 创建视频任务
2. 视频服务提交到小冰，携带 ngrok 回调 URL
3. 等待视频生成（5-10 分钟）
4. 小冰回调到 ngrok URL → 视频服务
5. 查询任务状态验证已收到视频 URL

## 管理 API 说明

### 视频服务配置更新 API

**端点**：`PUT /v1/admin/config`

**认证**：
- Header: `X-Admin-Token: {VIDEO_SERVICE_ADMIN_TOKEN}`

**可更新字段**（server.js:667-675）：
- `apiBaseUrl` - 提供商 API 端点
- `apiKey` - 提供商 API 密钥
- `modelId` - 视频模型 ID
- `vhBizId` - 业务 ID
- `callbackPublicBaseUrl` - **回调公网地址（我们需要更新的）**
- `providerAuthHeader` - 认证头名称
- `providerAuthScheme` - 认证方案

**请求示例**：
```bash
curl -X PUT http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: video-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackPublicBaseUrl": "https://abc123.ngrok-free.app"
  }'
```

**响应示例**：
```json
{
  "data": {
    "apiBaseUrl": "http://aibeings-vip.xiaoice.com",
    "apiKey": "431***50f9",
    "modelId": "CVHPZJ4LCGBMNIZULS0",
    "vhBizId": "CVHPZJ4LCGBMNIZULS0",
    "callbackPublicBaseUrl": "https://abc123.ngrok-free.app",
    "providerAuthHeader": "subscription-key",
    "providerAuthScheme": ""
  }
}
```

## 安全考虑

### 1. 认证 Token

视频服务使用三个独立的 token：
- `VIDEO_SERVICE_INTERNAL_TOKEN` - 内部 API 调用（OpenClaw 插件 → 视频服务）
- `VIDEO_SERVICE_ADMIN_TOKEN` - 管理 API 调用（配置更新）
- `VIDEO_SERVICE_CALLBACK_TOKEN` - 回调认证（小冰 → 视频服务）

确保这些 token 设置为强随机值，不要使用默认值。

### 2. Ngrok 可选启用

- 默认情况下 `VIDEO_USE_NGROK=false`
- 只有明确设置为 `true` 才会自动启动 ngrok
- 避免意外暴露本地服务到公网

### 3. 回调端点保护

- 回调端点要求 token 认证
- Token 可以通过查询参数或 HTTP 头传递
- 无效 token 返回 401 Unauthorized

## 故障排查

### Ngrok 未启动

**症状**：`video-ngrok-status.sh` 显示 ngrok 未运行

**解决**：
```bash
cd /home/yirongbest/.openclaw
./start-ngrok.sh
```

### 无法获取公网 URL

**症状**：ngrok 运行但无法获取 URL

**检查**：
1. 确认 ngrok authtoken 已配置
2. 检查网络连接
3. 查看 ngrok 日志：`tail -f /home/yirongbest/.openclaw/ngrok.log`

### 回调 URL 未更新

**症状**：配置文件中仍是本地地址

**解决**：
```bash
# 手动运行更新脚本
./update-video-callback.sh

# 或直接调用 API
curl -X PUT http://127.0.0.1:3105/v1/admin/config \
  -H "X-Admin-Token: video-admin-token" \
  -H "Content-Type: application/json" \
  -d "{\"callbackPublicBaseUrl\": \"$(cat /home/yirongbest/.openclaw/.video-ngrok-url)\"}"
```

### 小冰回调失败

**症状**：视频生成完成但任务状态未更新

**排查步骤**：
1. 检查 ngrok 是否运行：`./video-ngrok-status.sh`
2. 检查回调 URL 是否正确：`cat credentials/video-service.secrets.json`
3. 查看 ngrok Web UI：http://localhost:4040
4. 查看视频服务日志：`tail -f video-service.log`
5. 测试回调端点是否可公网访问（参考验证步骤 6）

## 成功标准

- [x] 单个 ngrok 进程运行两个隧道（xiaoice-webhook + video-callback）
- [x] 两个公网 URL 都可通过共享 Web UI（端口 4040）访问
- [x] 公网回调 URL 自动更新到视频服务配置
- [x] 视频服务能够接收来自小冰提供商的回调
- [x] 脚本优雅处理错误（ngrok 未安装、已运行等）
- [x] 文档清晰完整
- [x] 现有小冰 webhook 继续正常工作不受影响

## 架构图

```
小冰视频服务器
    ↓ HTTPS POST (回调)
Ngrok 公网隧道 (https://xxx.ngrok-free.app)
    ↓ 转发到本地
视频任务服务 (localhost:3105)
    ↓ 更新任务状态
SQLite 数据库 (video_tasks.db)
    ↑ 查询状态
OpenClaw 插件 (video-orchestrator)
    ↑ 工具调用
OpenClaw Gateway (localhost:18789)
```

## 总结

本方案通过复用现有的 ngrok 基础设施，以最小的改动实现视频服务回调的公网访问能力。核心优势：

1. **复用现有资源**：共享 ngrok 进程和 Web UI
2. **最小侵入性**：只需修改配置文件和添加管理脚本
3. **灵活可控**：支持手动和自动两种配置方式
4. **安全可靠**：多层 token 认证保护
5. **易于维护**：清晰的脚本和文档

实施后，视频服务将能够正常接收小冰的回调通知，完成视频生成的完整流程。
