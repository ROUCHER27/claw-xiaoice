# Ngrok 日志监控完整指南

## 🌐 为什么 Ngrok 监控很重要？

在小冰平台集成中，请求链路是：
```
小冰平台 → Ngrok 公网 URL → Webhook (localhost:3002) → OpenClaw
```

**Ngrok 是关键中间层**，如果这里出问题，webhook 根本收不到请求！

---

## 📊 Ngrok 监控的三个层次

### 层次 1: 进程状态监控
### 层次 2: 隧道信息监控
### 层次 3: 流量日志监控

---

## 🔍 层次 1: 进程状态监控

### 检查 Ngrok 是否运行

```bash
# 方法 1: 使用状态脚本（推荐）
cd /home/yirongbest/.openclaw
bash ngrok-status.sh
```

**输出示例**:
```
╔════════════════════════════════════════════════════════════╗
║              Ngrok 隧道状态                               ║
╚════════════════════════════════════════════════════════════╝

✅ Ngrok 进程运行中
  PID: 483525
  运行时长: 1-03:45:23

[隧道信息]
  名称: command_line
  公网 URL: https://noctilucan-wendell-nonmalignantly.ngrok-free.dev
  本地地址: http://localhost:3002
  连接数: 20

[Webhook 端点]
  完整 URL: https://noctilucan-wendell-nonmalignantly.ngrok-free.dev/webhooks/xiaoice
  健康检查: https://noctilucan-wendell-nonmalignantly.ngrok-free.dev/health
```

---

```bash
# 方法 2: 手动检查进程
ps aux | grep ngrok | grep -v grep
```

**输出示例**:
```
yirongb+  483525  0.3  0.2 1259816 35492 ?  Sl  Mar03  6:14 ngrok http 3002
```

**关键信息**:
- PID: 483525
- 内存: 35MB
- 运行时间: 6小时14分
- 命令: `ngrok http 3002`

---

### 常见问题 1: Ngrok 未运行

**症状**:
```
❌ Ngrok 未运行
```

**向 Agent 描述**:
```
问题：小冰平台无法访问 webhook

检查结果：
$ bash ngrok-status.sh
❌ Ngrok 未运行

请启动 ngrok 隧道
```

**Agent 响应**:
```bash
cd /home/yirongbest/.openclaw
bash start-ngrok.sh
```

---

### 常见问题 2: Ngrok 进程僵死

**症状**:
```
✅ Ngrok 进程运行中
❌ 无法连接到 ngrok API (端口 4040)
```

**向 Agent 描述**:
```
问题：Ngrok 进程存在但 API 无响应

检查结果：
$ ps aux | grep ngrok
进程存在 (PID: 483525)

$ curl http://localhost:4040/api/tunnels
curl: (7) Failed to connect to localhost port 4040

请重启 ngrok
```

**Agent 响应**:
```bash
# 停止旧进程
bash stop-ngrok.sh

# 启动新进程
bash start-ngrok.sh

# 验证
bash ngrok-status.sh
```

---

## 🔍 层次 2: 隧道信息监控

### 获取隧道详细信息

```bash
# 使用 ngrok API
export NO_PROXY=localhost,127.0.0.1
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool
```

**输出示例**:
```json
{
    "tunnels": [
        {
            "name": "command_line",
            "public_url": "https://noctilucan-wendell-nonmalignantly.ngrok-free.dev",
            "proto": "https",
            "config": {
                "addr": "http://localhost:3002",
                "inspect": true
            },
            "metrics": {
                "conns": {
                    "count": 20,
                    "gauge": 0
                },
                "http": {
                    "count": 23,
                    "rate1": 8.57e-52
                }
            }
        }
    ]
}
```

**关键指标**:
- `public_url`: 公网访问地址
- `config.addr`: 本地转发地址
- `metrics.conns.count`: 总连接数
- `metrics.http.count`: HTTP 请求数
- `metrics.conns.gauge`: 当前活跃连接数

---

### 常见问题 3: 公网 URL 变化

**症状**:
```
小冰平台配置的 URL: https://old-url.ngrok-free.dev
当前 ngrok URL: https://new-url.ngrok-free.dev
```

**向 Agent 描述**:
```
问题：小冰平台无法访问 webhook

检查结果：
$ bash ngrok-status.sh
公网 URL: https://noctilucan-wendell-nonmalignantly.ngrok-free.dev

小冰平台配置的 URL 不匹配（可能是 ngrok 重启后 URL 变了）

需要更新小冰平台配置
```

**解决方案**:
1. 获取新 URL: `cat /home/yirongbest/.openclaw/.ngrok-url`
2. 登录小冰平台
3. 更新 API URL 配置

---

### 常见问题 4: 连接数异常

**症状**:
```json
"metrics": {
    "conns": {
        "count": 0,
        "gauge": 0
    }
}
```

**向 Agent 描述**:
```
问题：小冰平台无法访问 webhook

Ngrok 指标：
- 总连接数: 0
- 当前连接: 0
- HTTP 请求: 0

说明小冰平台的请求根本没到达 ngrok

请检查：
1. 小冰平台的 URL 配置是否正确
2. 网络是否可达
```

---

## 🔍 层次 3: 流量日志监控

### 方法 1: Ngrok Web 界面（推荐）

```bash
# 在浏览器中打开
http://localhost:4040
```

**功能**:
- ✅ 实时查看所有 HTTP 请求
- ✅ 查看请求头、请求体
- ✅ 查看响应头、响应体
- ✅ 重放请求（Replay）
- ✅ 查看请求耗时

**使用场景**:
1. **调试签名验证**: 查看小冰平台发送的签名头
2. **检查请求格式**: 查看 askText 等字段
3. **分析响应问题**: 查看 webhook 返回的内容
4. **性能分析**: 查看请求耗时

---

### 方法 2: Ngrok API 查询请求

```bash
# 获取最近的请求
export NO_PROXY=localhost,127.0.0.1
curl -s http://localhost:4040/api/requests/http | python3 -m json.tool | head -100
```

**输出示例**:
```json
{
    "requests": [
        {
            "uri": "/webhooks/xiaoice",
            "id": "abc123",
            "tunnel_name": "command_line",
            "remote_addr": "1.2.3.4:12345",
            "start": "2026-03-04T10:59:32Z",
            "duration": 5123456789,
            "request": {
                "method": "POST",
                "proto": "HTTP/1.1",
                "headers": {
                    "Content-Type": ["application/json"],
                    "X-Xiaoice-Timestamp": ["1772616018652"],
                    "X-Xiaoice-Signature": ["abc123..."]
                },
                "uri": "/webhooks/xiaoice",
                "raw": "{\"askText\":\"你好\"...}"
            },
            "response": {
                "status": "200 OK",
                "status_code": 200,
                "proto": "HTTP/1.1",
                "headers": {
                    "Content-Type": ["application/json"]
                },
                "raw": "{\"id\":\"xiaoice-123\"...}"
            }
        }
    ]
}
```

---

### 常见问题 5: 请求未到达 Ngrok

**症状**:
```
Ngrok Web 界面: 无请求记录
Webhook 日志: 无请求记录
```

**向 Agent 描述**:
```
问题：小冰平台无法访问 webhook

检查结果：
1. Ngrok 运行正常 ✓
2. Webhook 运行正常 ✓
3. Ngrok Web 界面 (http://localhost:4040) 无请求记录 ✗

说明小冰平台的请求没有到达 ngrok

请检查：
1. 小冰平台配置的 URL 是否正确
2. 小冰平台网络是否可达 ngrok
3. 是否有防火墙阻止
```

---

### 常见问题 6: 请求到达 Ngrok 但 Webhook 无响应

**症状**:
```
Ngrok Web 界面: 有请求记录，但响应为空或超时
Webhook 日志: 无对应请求记录
```

**向 Agent 描述**:
```
问题：请求到达 ngrok 但 webhook 无响应

Ngrok 请求记录：
- URI: /webhooks/xiaoice
- Method: POST
- Status: 502 Bad Gateway
- Duration: 30000ms (超时)

Webhook 日志：
无对应时间的请求记录

说明 ngrok 无法转发到 localhost:3002

请检查：
1. Webhook 是否运行在 3002 端口
2. 防火墙是否阻止本地连接
```

**Agent 响应**:
```bash
# 检查 webhook 状态
curl http://localhost:3002/health

# 检查端口占用
lsof -i :3002

# 重启 webhook
cd /home/yirongbest/.openclaw
lsof -ti:3002 | xargs kill -9
node webhook-proxy.js > webhook.log 2>&1 &
```

---

### 常见问题 7: 签名验证失败（通过 Ngrok 发现）

**症状**:
```
Ngrok 请求记录：
- Request Headers: 包含 X-Xiaoice-Signature
- Response Status: 401 Unauthorized
```

**向 Agent 描述**:
```
问题：签名验证失败

Ngrok 请求详情：
Request Headers:
  X-Xiaoice-Timestamp: 1772616018652
  X-Xiaoice-Signature: abc123def456...
  X-Xiaoice-Key: test-key

Request Body:
  {"askText":"你好","sessionId":"test-001"}

Response:
  Status: 401 Unauthorized
  Body: {"error":"Unauthorized"}

Webhook 日志：
[2026-03-04T10:59:32.081Z] [WARN] Signature verification failed

请检查签名算法
```

**Agent 响应**:
```
收到。签名验证问题。

1. 检查 webhook-proxy.js 的 verifySignature 函数
2. 验证签名算法: SHA512Hash(RequestBody+SecretKey+TimeStamp)
3. 检查 SECRET_KEY 配置
```

---

## 📋 完整的问题诊断流程

### 用户报告："小冰平台无法访问 webhook"

#### 步骤 1: 检查 Ngrok 状态
```bash
bash ngrok-status.sh
```

**可能结果**:
- ❌ Ngrok 未运行 → 启动 ngrok
- ✅ Ngrok 运行正常 → 继续下一步

---

#### 步骤 2: 检查 Ngrok 流量
```bash
# 打开 Web 界面
http://localhost:4040
```

**可能结果**:
- ❌ 无请求记录 → 小冰平台配置问题
- ✅ 有请求记录 → 继续下一步

---

#### 步骤 3: 分析 Ngrok 请求详情

**场景 A: 请求成功 (200 OK)**
```
说明 webhook 正常响应
问题可能在响应格式
→ 检查 webhook 日志和响应内容
```

**场景 B: 请求失败 (401 Unauthorized)**
```
说明签名验证失败
→ 检查签名算法和配置
```

**场景 C: 请求超时 (502 Bad Gateway)**
```
说明 webhook 无响应
→ 检查 webhook 是否运行
```

---

#### 步骤 4: 向 Agent 描述

```
问题：小冰平台无法访问 webhook

诊断结果：
1. Ngrok 状态: [运行中/未运行]
2. Ngrok 流量: [有请求/无请求]
3. 请求详情: [状态码 + 错误信息]
4. Webhook 日志: [相关日志]

建议检查：[具体位置]
```

---

## 🎯 Ngrok 监控最佳实践

### 1. 定期检查 Ngrok 状态

```bash
# 每天检查一次
bash ngrok-status.sh
```

### 2. 监控 Ngrok URL 变化

```bash
# 保存当前 URL
cat /home/yirongbest/.openclaw/.ngrok-url

# 如果 URL 变化，更新小冰平台配置
```

### 3. 使用 Ngrok Web 界面调试

```
浏览器打开: http://localhost:4040

优势：
- 实时查看请求
- 查看完整的请求/响应
- 重放请求测试
```

### 4. 结合 Webhook 日志分析

```bash
# 同时查看两个日志
# 终端 1: Ngrok Web 界面
http://localhost:4040

# 终端 2: Webhook 日志
tail -f /home/yirongbest/.openclaw/webhook.log
```

---

## 📊 三层监控对比

| 监控层次 | 工具 | 检查内容 | 适用场景 |
|---------|------|---------|---------|
| **进程状态** | `ngrok-status.sh` | Ngrok 是否运行 | Ngrok 崩溃、未启动 |
| **隧道信息** | Ngrok API | URL、连接数、指标 | URL 变化、连接异常 |
| **流量日志** | Web 界面 (4040) | 请求/响应详情 | 签名验证、格式错误 |

---

## 🚀 快速参考

### 检查 Ngrok 是否正常
```bash
bash ngrok-status.sh
```

### 查看 Ngrok 流量
```
浏览器: http://localhost:4040
```

### 获取当前 URL
```bash
cat /home/yirongbest/.openclaw/.ngrok-url
```

### 重启 Ngrok
```bash
bash stop-ngrok.sh
bash start-ngrok.sh
```

---

## 💡 向 Agent 描述 Ngrok 问题的模板

### 模板 1: Ngrok 未运行
```
问题：小冰平台无法访问

检查：
$ bash ngrok-status.sh
❌ Ngrok 未运行

请启动 ngrok
```

### 模板 2: 请求未到达 Ngrok
```
问题：小冰平台无法访问

检查：
1. Ngrok 运行正常 ✓
2. Ngrok Web 界面无请求记录 ✗

说明小冰平台请求未到达 ngrok
请检查小冰平台 URL 配置
```

### 模板 3: 请求到达但响应异常
```
问题：小冰平台收到错误响应

Ngrok 请求记录：
- URI: /webhooks/xiaoice
- Status: 401 Unauthorized
- Request Headers: [粘贴关键头]
- Response: {"error":"Unauthorized"}

Webhook 日志：
[时间戳] [WARN] Signature verification failed

请检查签名验证逻辑
```

---

## 🎓 进阶：Ngrok 性能监控

### 监控连接数趋势

```bash
# 每 5 秒查询一次连接数
while true; do
  export NO_PROXY=localhost,127.0.0.1
  CONNS=$(curl -s http://localhost:4040/api/tunnels | grep -o '"count":[0-9]*' | head -1 | cut -d':' -f2)
  echo "$(date '+%H:%M:%S') - Connections: $CONNS"
  sleep 5
done
```

### 监控请求速率

```bash
# 查看请求速率
export NO_PROXY=localhost,127.0.0.1
curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
data = json.load(sys.stdin)
metrics = data['tunnels'][0]['metrics']['http']
print(f'Total requests: {metrics[\"count\"]}')
print(f'Rate (1min): {metrics[\"rate1\"]:.2e}')
print(f'Rate (5min): {metrics[\"rate5\"]:.2e}')
"
```

---

## 📝 总结

### Ngrok 监控的重要性

在小冰平台集成中，Ngrok 是**关键中间层**：
- ✅ 如果 Ngrok 正常，问题在 Webhook 或 OpenClaw
- ❌ 如果 Ngrok 异常，问题在网络或配置

### 三层监控策略

1. **进程监控**: 确保 Ngrok 运行
2. **隧道监控**: 确保 URL 正确、连接正常
3. **流量监控**: 确保请求/响应正确

### 向 Agent 描述问题的关键

```
问题 + Ngrok 状态 + 流量详情 + Webhook 日志

示例：
"小冰平台无法访问。Ngrok 运行正常，但 Web 界面显示 401 错误。
Webhook 日志显示签名验证失败。请检查签名算法。"
```

---

## 🔗 相关文档

- **如何向Agent描述日志**: 完整的日志描述指南
- **Agent调试效率对比**: Main vs Worktree 架构对比
- **小冰平台集成文档**: 完整的集成流程

---

## ⚡ 快速诊断清单

遇到问题时，按顺序检查：

- [ ] Ngrok 进程是否运行？ (`bash ngrok-status.sh`)
- [ ] Ngrok URL 是否正确？ (`cat .ngrok-url`)
- [ ] Ngrok 是否收到请求？ (打开 `http://localhost:4040`)
- [ ] 请求状态码是什么？ (200/401/502?)
- [ ] Webhook 是否运行？ (`curl http://localhost:3002/health`)
- [ ] Webhook 日志有什么？ (`tail webhook.log`)

根据检查结果，向 Agent 描述问题。
