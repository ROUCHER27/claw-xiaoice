# OpenClaw 代理连接问题修复

## 问题根因

HTTP 代理配置 (`http_proxy`, `https_proxy`) 导致本地服务（127.0.0.1）连接失败：
- OpenClaw Gateway (端口 18789)
- 视频任务服务 (端口 3105)

所有本地请求被错误地路由到代理服务器 `172.23.112.1:7897`，导致 502 Bad Gateway 错误。

## 解决方案

添加 `no_proxy` 环境变量，绕过本地地址的代理：

### 1. 永久配置（已添加到 ~/.bashrc）
```bash
export no_proxy="localhost,127.0.0.1,::1,*.local"
export NO_PROXY="localhost,127.0.0.1,::1,*.local"
```

### 2. 项目配置（已添加到 .env）
```bash
no_proxy=localhost,127.0.0.1,::1,*.local
NO_PROXY=localhost,127.0.0.1,::1,*.local
```

### 3. 立即生效
```bash
source ~/.bashrc
```

或在新终端会话中自动生效。

## 验证

```bash
# 测试 Gateway 连接
curl http://127.0.0.1:18789/health

# 测试视频服务连接
curl http://127.0.0.1:3105/health

# 检查 OpenClaw 状态
openclaw status

# 验证插件
openclaw plugins doctor
```

## 注意事项

- 每次新开终端会话，`no_proxy` 会自动从 `~/.bashrc` 加载
- 如果使用 systemd 服务，需要在服务配置中也添加 `Environment="no_proxy=..."`
- 对于 Node.js 应用，确保 `.env` 文件包含 `no_proxy` 配置

## 相关文件

- `~/.bashrc` - Shell 环境配置
- `.env` - 项目环境变量
- `.env.example` - 环境变量模板（已更新）
