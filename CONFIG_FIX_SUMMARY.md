# OpenClaw 配置修复总结

## 已完成的修复

### 1. ✅ openclaw.json 非法 JSON
- 修复了重复的 provider 配置块
- 合并了 minimax-cn 的多个 model 条目

### 2. ✅ 代理配置
- 添加了 systemd 服务代理配置：`~/.config/systemd/user/openclaw-gateway.service.d/proxy.conf`
- 配置了 `no_proxy` 绕过本地地址
- 添加了 `http_proxy`, `https_proxy`, `all_proxy` 支持外部 API 调用

### 3. ✅ 视频能力集成
- 安装并启用了 `video-orchestrator` 插件
- 配置了视频任务服务（端口 3105）
- 工具 `xiaoice_video_produce` 已可用

### 4. ✅ 模型配置
- **MiniMax M2.5 Highspeed** - 主要对话模型
- **Claude Sonnet 4.6** (yunyi-claude) - 已恢复
- **Claude Haiku 4.5** (yunyi-claude) - 已恢复

## 当前配置

### 活跃配置文件
`~/.openclaw/openclaw.json`

### 模型提供商
```json
{
  "minimax": {
    "baseUrl": "https://api.minimax.chat/v1",
    "models": ["MiniMax-M2.5-highspeed"]
  },
  "yunyi-claude": {
    "baseUrl": "https://yunyi.rdzhvip.com/claude",
    "models": ["claude-sonnet-4-6", "claude-haiku-4.5"]
  }
}
```

### 代理配置
```bash
http_proxy=http://xiaoice1234:xiaoice1234@172.23.112.1:7897
https_proxy=http://xiaoice1234:xiaoice1234@172.23.112.1:7897
no_proxy=localhost,127.0.0.1,::1,*.local
```

### Gateway Token
```
8db388d0368f7e4351e87556596396825ed9c17f9eb70012
```

## 测试方法

### 1. 测试连接
```bash
./test-connection.sh
```

### 2. 测试对话
打开浏览器访问：
```
http://127.0.0.1:18789/#token=8db388d0368f7e4351e87556596396825ed9c17f9eb70012
```

发送消息测试 MiniMax 或 Claude 模型。

### 3. 监控日志
```bash
export no_proxy="localhost,127.0.0.1,::1,*.local"
export NO_PROXY="localhost,127.0.0.1,::1,*.local"
openclaw logs | grep -E "(Connection error|embedded run)"
```

## 已知问题

### Connection error
如果仍然看到 "Connection error"，可能原因：
1. MiniMax API Key 无效或过期
2. 代理服务器 172.23.112.1:7897 不可达
3. systemd 服务未正确加载代理环境变量

### 验证代理生效
```bash
systemctl --user show openclaw-gateway.service | grep -i proxy
```

应该看到 `http_proxy`, `https_proxy`, `no_proxy` 环境变量。

## 备份文件
- `openclaw.json.corrupt-20260309-152711` - 损坏的配置
- `~/.openclaw/openclaw.json.bak-before-yunyi` - 添加 yunyi-claude 前的备份
- `~/.openclaw/openclaw.json.bak` - 自动备份

## 下一步

1. 在 Dashboard 中测试对话功能
2. 如果 MiniMax 连接失败，切换到 yunyi-claude/claude-sonnet-4-6
3. 验证视频生成功能可用
