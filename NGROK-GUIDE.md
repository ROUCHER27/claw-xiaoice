# Ngrok 使用指南

## 概述

Ngrok 是一个安全的内网穿透工具，可以将本地运行的 webhook 服务暴露到公网，让 XiaoIce 平台能够访问。

## 当前配置

- **版本**: ngrok v3.36.1
- **配置文件**: `~/.ngrok2/ngrok.yml`
- **本地端口**: 3002 (Webhook 代理)
- **Web 界面**: http://localhost:4040
- **区域**: 美国 (US)

## 快速开始

### 1. 查看 Ngrok 状态

```bash
cd /home/yirongbest/.openclaw
./ngrok-status.sh
```

显示内容：
- Ngrok 进程状态
- 公网 URL
- Webhook 端点
- 连接统计

### 2. 启动 Ngrok 隧道

```bash
./start-ngrok.sh
```

脚本会：
- 检查 ngrok 是否已运行
- 启动 ngrok 隧道
- 等待隧道建立
- 显示公网 URL
- 保存 URL 到 `.ngrok-url` 文件

### 3. 停止 Ngrok 隧道

```bash
./stop-ngrok.sh
```

优雅地停止 ngrok 进程并清理缓存文件。

### 4. 获取 XiaoIce 配置

```bash
./xiaoice-config.sh
```

显示：
- Webhook 完整 URL
- 认证信息
- 测试命令（带签名）
- 配置步骤

## Ngrok Web 界面

### 访问方式

```bash
# 需要绕过代理
export NO_PROXY=localhost,127.0.0.1
```

然后在浏览器中打开：http://localhost:4040

### 功能

- **实时流量监控**: 查看所有 HTTP 请求和响应
- **请求详情**: 查看请求头、请求体、响应内容
- **重放请求**: 重新发送之前的请求进行测试
- **统计信息**: 连接数、数据传输量

## 常见操作

### 获取当前公网 URL

```bash
# 方法 1: 使用脚本
./ngrok-status.sh

# 方法 2: 从缓存文件读取
cat .ngrok-url

# 方法 3: 直接查询 API
export NO_PROXY=localhost,127.0.0.1
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*'
```

### 测试公网 Webhook

```bash
# 获取测试命令
./xiaoice-config.sh

# 复制输出的 curl 命令并执行
```

### 查看隧道流量

1. 打开 http://localhost:4040
2. 发送测试请求
3. 在 Web 界面中查看请求详情

### 集成到状态监控

```bash
# 查看完整状态（包括 ngrok）
./status.sh

# 实时监控日志（包括 ngrok 信息）
./watch-logs.sh
```

## 配置 XiaoIce 平台

### 步骤

1. **获取 Webhook URL**
   ```bash
   ./xiaoice-config.sh
   ```

2. **登录 XiaoIce 开放平台**
   - 访问 XiaoIce 开放平台控制台

3. **配置 Webhook**
   - Webhook URL: `https://your-ngrok-url.ngrok-free.dev/webhooks/xiaoice`
   - Access Key: `test-key`
   - Secret Key: `test-secret`
   - 签名算法: SHA512

4. **测试连接**
   - 使用平台提供的测试功能
   - 或使用 `./xiaoice-config.sh` 生成的测试命令

5. **监控请求**
   - 打开 http://localhost:4040
   - 查看 XiaoIce 平台发送的请求

## 高级配置

### 自定义域名（需要付费账户）

编辑 `~/.ngrok2/ngrok.yml`:

```yaml
version: "3"
agent:
    authtoken: YOUR_TOKEN
tunnels:
  xiaoice:
    proto: http
    addr: 3002
    domain: your-custom-domain.ngrok.app
```

启动：
```bash
ngrok start xiaoice
```

### 固定子域名（需要付费账户）

```yaml
tunnels:
  xiaoice:
    proto: http
    addr: 3002
    subdomain: your-subdomain
```

### 基本认证

```yaml
tunnels:
  xiaoice:
    proto: http
    addr: 3002
    auth: "username:password"
```

## 故障排查

### 问题 1: Ngrok 未运行

**症状**: `./ngrok-status.sh` 显示 "Ngrok 未运行"

**解决方案**:
```bash
./start-ngrok.sh
```

### 问题 2: 无法获取公网 URL

**症状**: API 查询返回空

**可能原因**:
- 代理设置干扰
- Ngrok 隧道正在建立中

**解决方案**:
```bash
# 确保设置 NO_PROXY
export NO_PROXY=localhost,127.0.0.1

# 等待几秒后重试
sleep 3
./ngrok-status.sh
```

### 问题 3: 公网 URL 无法访问

**症状**: 从外部访问 ngrok URL 失败

**检查清单**:
1. Webhook 代理是否运行？
   ```bash
   ps aux | grep webhook-proxy
   ```

2. 端口 3002 是否监听？
   ```bash
   ss -tln | grep 3002
   ```

3. 本地测试是否正常？
   ```bash
   ./test-quick.sh
   ```

4. Ngrok 隧道是否活跃？
   ```bash
   ./ngrok-status.sh
   ```

### 问题 4: XiaoIce 平台连接失败

**症状**: XiaoIce 平台显示 webhook 连接失败

**检查步骤**:

1. **验证 URL 正确**
   ```bash
   ./xiaoice-config.sh
   ```

2. **测试公网访问**
   ```bash
   # 使用 xiaoice-config.sh 生成的测试命令
   ```

3. **查看 ngrok 流量**
   - 打开 http://localhost:4040
   - 查看是否收到请求
   - 检查响应状态码

4. **查看 webhook 日志**
   ```bash
   tail -f webhook.log
   ```

### 问题 5: 隧道频繁断开

**症状**: Ngrok 隧道不稳定

**可能原因**:
- 网络不稳定
- 免费账户限制

**解决方案**:
- 考虑升级到付费账户
- 使用自动重启脚本
- 检查网络连接

## 性能优化

### 减少延迟

1. **选择最近的区域**
   - 编辑 `~/.ngrok2/ngrok.yml`
   - 修改 `connect_url` 为最近的区域

2. **使用固定域名**
   - 避免每次重启 URL 变化
   - 减少 DNS 查询时间

### 监控性能

```bash
# 查看连接统计
./ngrok-status.sh

# 实时监控流量
# 打开 http://localhost:4040
```

## 安全建议

### 1. 保护 Authtoken

- 不要将 authtoken 提交到版本控制
- 定期轮换 token
- 使用环境变量存储

### 2. 限制访问

- 考虑添加 IP 白名单（付费功能）
- 使用 webhook 签名验证（已实现）
- 监控异常流量

### 3. HTTPS 加密

- Ngrok 默认提供 HTTPS
- 所有流量都经过 TLS 加密
- 不要使用 HTTP URL

## 参考资源

### 官方文档

- Ngrok 官网: https://ngrok.com
- 文档: https://ngrok.com/docs
- API 参考: https://ngrok.com/docs/api

### 本地脚本

- `ngrok-status.sh` - 查看状态
- `start-ngrok.sh` - 启动隧道
- `stop-ngrok.sh` - 停止隧道
- `xiaoice-config.sh` - 获取配置
- `status.sh` - 完整状态面板
- `watch-logs.sh` - 实时日志监控

### 相关文档

- `README-XIAOICE.md` - XiaoIce 集成文档
- `webhook-proxy.js` - Webhook 代理实现

## 常见问题 (FAQ)

### Q: Ngrok 免费版有什么限制？

A:
- 每次启动 URL 会变化
- 连接数限制
- 带宽限制
- 无自定义域名

### Q: 如何保持 URL 不变？

A: 升级到付费账户，使用固定域名或子域名功能。

### Q: 可以同时运行多个隧道吗？

A: 可以，编辑配置文件添加多个隧道定义。

### Q: Ngrok 安全吗？

A: 是的，所有流量都经过 TLS 加密。但建议：
- 使用 webhook 签名验证
- 监控异常流量
- 不暴露敏感端点

### Q: 如何查看历史请求？

A: 打开 http://localhost:4040，可以查看所有请求历史。

## 总结

Ngrok 提供了简单可靠的内网穿透方案，配合我们的 webhook 代理和监控工具，可以轻松实现 XiaoIce 平台集成。

**关键命令**:
- `./ngrok-status.sh` - 查看状态
- `./xiaoice-config.sh` - 获取配置
- `./status.sh` - 完整监控
- http://localhost:4040 - Web 界面

如有问题，请查看故障排查部分或查看日志文件。
