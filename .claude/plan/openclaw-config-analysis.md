# OpenClaw 配置关系分析报告

## Context（背景）

用户在使用 `openclaw tui` 时遇到连接问题，需要理解：
1. `.openclaw/openclaw.json` 和 `claw-xiaoice/openclaw.json` 之间的关系
2. OpenClaw 到底使用哪个配置文件？
3. 模型配置在哪里？
4. 哪些配置会相互影响？

## 核心发现

### 1. OpenClaw 配置文件架构

**OpenClaw 使用单一活跃配置：`~/.openclaw/openclaw.json`**

```
systemd 服务启动命令：
/usr/local/bin/node /usr/local/lib/node_modules/openclaw/dist/index.js gateway --port 18789

工作目录：$HOME (即 /home/yirongbest)
配置文件：~/.openclaw/openclaw.json (硬编码路径)
```

**关键结论：**
- OpenClaw Gateway **只读取** `~/.openclaw/openclaw.json`
- `claw-xiaoice/openclaw.json` 是项目级配置模板，**不会被 Gateway 直接使用**
- 没有环境变量可以改变配置文件路径

### 2. 两个配置文件的关系

#### `~/.openclaw/openclaw.json` (活跃配置 - 5055 字节)
- **Gateway 实际使用的配置**
- 包含完整的运行时配置：
  - ✅ models (minimax-cn, yunyi-claude)
  - ✅ channels (feishu, xiaoice)
  - ✅ plugins (video-orchestrator, mcp-integration, xiaoice)
  - ✅ gateway (token: 8db388d0368f7e4351e87556596396825ed9c17f9eb70012)
  - ✅ agents.defaults.model.primary = "minimax-cn/MiniMax-M2.5-highspeed"

#### `claw-xiaoice/openclaw.json` (项目配置 - 4693 字节)
- **项目级配置模板/备份**
- 包含相同的配置结构，但：
  - ⚠️ 有 `"api": "chat/completions"` 字段（minimax-cn provider）
  - ⚠️ 缺少 `plugins.installs` 部分
  - ⚠️ 缺少 `commands` 和 `session` 配置

**同步状态：**
- 两个文件的 `lastTouchedAt` 时间戳相同：2026-03-09T16:01
- 说明最近被同步过（通过 `cp` 命令）
- 但项目配置有额外的 `"api"` 字段导致验证失败

### 3. 模型配置位置

**当前使用的模型（来自 `~/.openclaw/openclaw.json`）：**

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "minimax-cn": {
        "baseUrl": "https://api.minimax.chat/v1",
        "apiKey": "sk-cp-RqhWkvRUYGhG2cMFwUH-...",
        "auth": "api-key",
        "models": [
          {"id": "MiniMax-M2.5-highspeed"},
          {"id": "MiniMax-Text-01"}
        ]
      },
      "yunyi-claude": {
        "baseUrl": "https://yunyi.rdzhvip.com/claude",
        "apiKey": "JEU1MDXM-C51V-8UMN-QSZS-0HYHBEUHS2CM",
        "api": "anthropic-messages",
        "models": [
          {"id": "claude-sonnet-4-6"},
          {"id": "claude-haiku-4.5"}
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "minimax-cn/MiniMax-M2.5-highspeed"
      }
    }
  }
}
```

**默认模型：** `minimax-cn/MiniMax-M2.5-highspeed`

### 4. 插件配置位置

**插件加载路径（来自 `~/.openclaw/openclaw.json`）：**

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/home/yirongbest/claw-xiaoice/extensions/mcp-integration",
        "/home/yirongbest/claw-xiaoice/extensions/xiaoice",
        "/home/yirongbest/claw-xiaoice/extensions/video-orchestrator"
      ]
    },
    "entries": {
      "feishu": {"enabled": true},
      "xiaoice": {"enabled": true},
      "mcp-integration": {"enabled": true},
      "video-orchestrator": {
        "enabled": true,
        "config": {
          "serviceBaseUrl": "http://127.0.0.1:3105",
          "internalToken": "video-internal-token",
          "requestTimeoutMs": 15000
        }
      }
    }
  }
}
```

**关键点：**
- 插件路径指向 `claw-xiaoice/extensions/`
- 这是两个配置文件的**唯一物理连接**
- 活跃配置引用项目目录中的插件代码

### 5. Channels 配置位置

**Channels 配置（来自 `~/.openclaw/openclaw.json`）：**

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "cli_a92a90cd23f85cb5",
      "appSecret": "o6GWpVP3U5t9B1YSkH3cFgxt5rrgbMWz",
      "verificationToken": "sWjL4sgzzTVvE7w3bbBqDrfEhn1qoecs",
      "domain": "feishu"
    },
    "xiaoice": {
      "enabled": true,
      "accounts": {
        "default": {
          "enabled": true,
          "apiBaseUrl": "http://localhost:3001",
          "apiKey": "test-key",
          "webhookSecret": "test-secret"
        }
      }
    }
  }
}
```

### 6. 配置影响关系图

```
┌─────────────────────────────────────────────────────────────┐
│                    systemd Service                          │
│  openclaw-gateway.service                                   │
│  ├─ ExecStart: /usr/local/bin/node .../openclaw/...        │
│  ├─ Environment: http_proxy, https_proxy, no_proxy         │
│  └─ Environment: OPENCLAW_GATEWAY_TOKEN=8db388d0...         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│          ~/.openclaw/openclaw.json (活跃配置)               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ models:                                               │  │
│  │   - minimax-cn/MiniMax-M2.5-highspeed (默认)         │  │
│  │   - yunyi-claude/claude-sonnet-4-6                    │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ channels:                                             │  │
│  │   - feishu (enabled)                                  │  │
│  │   - xiaoice (enabled, port 3001)                      │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ plugins.load.paths: ──────────────────────┐           │  │
│  │   - claw-xiaoice/extensions/xiaoice       │           │  │
│  │   - claw-xiaoice/extensions/mcp-integration│          │  │
│  │   - claw-xiaoice/extensions/video-orchestrator        │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ gateway:                                              │  │
│  │   - port: 18789                                       │  │
│  │   - token: 8db388d0368f7e4351e87556596396825ed9c17f  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ 插件加载路径
                     ▼
┌─────────────────────────────────────────────────────────────┐
│      /home/yirongbest/claw-xiaoice/extensions/              │
│  ├─ xiaoice/                                                │
│  ├─ mcp-integration/                                        │
│  └─ video-orchestrator/                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│   claw-xiaoice/openclaw.json (项目配置 - 不被使用)          │
│  ⚠️ 仅作为配置模板/备份                                      │
│  ⚠️ Gateway 不会读取此文件                                   │
│  ⚠️ 包含无效的 "api": "chat/completions" 字段               │
└─────────────────────────────────────────────────────────────┘
```

### 7. openclaw tui 连接流程

```
openclaw tui 命令
    │
    ├─ 读取 ~/.openclaw/openclaw.json
    │  └─ gateway.auth.token = "8db388d0..."
    │
    ├─ 连接到 ws://127.0.0.1:18789
    │  └─ 使用 token 进行认证
    │
    ├─ Gateway 验证 token
    │  └─ 对比 ~/.openclaw/openclaw.json 中的 token
    │
    └─ 认证成功 → 建立 WebSocket 连接
       认证失败 → token_mismatch 错误
```

### 8. 当前问题诊断

**问题 1：项目配置包含无效字段**
```
claw-xiaoice/openclaw.json:
  "minimax-cn": {
    "api": "chat/completions"  ← 无效字段，导致验证失败
  }
```

**问题 2：配置同步不完整**
- 活跃配置有 `plugins.installs` 部分
- 项目配置缺少此部分
- 导致两个文件不完全一致

**问题 3：用户误解**
- 用户认为修改 `claw-xiaoice/openclaw.json` 会影响 OpenClaw
- 实际上只有 `~/.openclaw/openclaw.json` 会被使用
- 项目配置只是模板/备份

## 建议方案

### 方案 A：保持当前架构（推荐）

**原理：**
- 接受 OpenClaw 的单一配置文件设计
- `~/.openclaw/openclaw.json` 是唯一真实配置
- `claw-xiaoice/openclaw.json` 作为版本控制的模板

**操作：**
1. 修复项目配置中的无效字段（移除 `"api": "chat/completions"`）
2. 添加同步脚本：`sync-config.sh`
   ```bash
   #!/bin/bash
   # 从活跃配置同步到项目配置（用于版本控制）
   cp ~/.openclaw/openclaw.json claw-xiaoice/openclaw.json

   # 或反向：从项目配置同步到活跃配置（用于部署）
   cp claw-xiaoice/openclaw.json ~/.openclaw/openclaw.json
   systemctl --user restart openclaw-gateway.service
   ```
3. 在 README 中明确说明配置关系

**优点：**
- 符合 OpenClaw 设计
- 配置清晰，不会混淆
- 可以版本控制项目配置模板

**缺点：**
- 需要手动同步配置
- 两个文件可能不一致

### 方案 B：符号链接（不推荐）

**原理：**
```bash
rm ~/.openclaw/openclaw.json
ln -s /home/yirongbest/claw-xiaoice/openclaw.json ~/.openclaw/openclaw.json
```

**优点：**
- 只有一个配置文件
- 自动同步

**缺点：**
- 违反 OpenClaw 设计假设
- 可能导致权限问题
- 其他 OpenClaw 项目会受影响

## 最终答案

### Q: openclaw tui 使用谁的配置？
**A:** `~/.openclaw/openclaw.json`（活跃配置）

### Q: 项目使用谁的模型？
**A:** `~/.openclaw/openclaw.json` 中定义的模型：
- 默认：`minimax-cn/MiniMax-M2.5-highspeed`
- 备选：`yunyi-claude/claude-sonnet-4-6`

### Q: 哪些地方相互影响？
**A:** 唯一的连接点是插件路径：
```
~/.openclaw/openclaw.json (plugins.load.paths)
    ↓
claw-xiaoice/extensions/* (插件代码)
```

### Q: 修改 claw-xiaoice/openclaw.json 会生效吗？
**A:** 不会。必须修改 `~/.openclaw/openclaw.json` 并重启 Gateway。

## 验证步骤

1. 确认当前使用的配置：
   ```bash
   openclaw config get models.providers
   openclaw config get agents.defaults.model.primary
   ```

2. 确认插件加载路径：
   ```bash
   openclaw config get plugins.load.paths
   ```

3. 测试对话功能：
   ```bash
   openclaw tui
   # 发送消息测试 minimax-cn 模型
   ```

4. 如果需要修改配置：
   ```bash
   # 方法 1：使用 openclaw config set
   openclaw config set agents.defaults.model.primary "yunyi-claude/claude-sonnet-4-6"

   # 方法 2：直接编辑
   vim ~/.openclaw/openclaw.json
   systemctl --user restart openclaw-gateway.service
   ```

## 配置文件清理建议

1. 修复项目配置中的无效字段
2. 添加配置同步脚本
3. 在 README 中添加配置说明
4. 考虑将敏感信息（API keys）移到环境变量
