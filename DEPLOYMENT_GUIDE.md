# XiaoIce Webhook 生产合并指南（当前策略：禁用签名）

> 更新日期：2026-03-05
> 目标：将运行中的旧入口 `webhook-proxy.js` 切换到模块化入口 `webhook-proxy-new.js`，并在当前阶段保持 `XIAOICE_AUTH_REQUIRED=false`。

## 1. 关键结论（先看）

- 代码已经具备模块化入口：`webhook-proxy-new.js -> src/*`。
- 历史问题是“文档/脚本说新入口，运行中仍是旧入口”。
- 本次切换以**入口一致性**为核心：启动脚本、状态脚本、部署步骤统一使用新入口。
- 本阶段生产策略明确为**禁用签名**，但保留后续切回签名校验能力。

## 2. 切换前确认

### 2.1 环境变量策略

必须满足（本阶段）：

```bash
export XIAOICE_AUTH_REQUIRED=false
export XIAOICE_TIMEOUT=30000
```

说明：
- `start-webhook.sh` 已按本阶段策略默认 `XIAOICE_AUTH_REQUIRED=false`。
- 如果后续要恢复签名校验，再改为 `true` 并跑 `test-auth-modes.sh`。

### 2.2 代码与入口一致性

```bash
# 主入口（npm）
cat package.json | jq '.main, .scripts.start'

# 启动脚本入口
rg -n "WEBHOOK_ENTRY|webhook-proxy-new\.js|node webhook-proxy" start-webhook.sh
```

期望：
- `package.json.main = webhook-proxy-new.js`
- `npm start` 指向 `node webhook-proxy-new.js`
- `start-webhook.sh` 默认入口是 `webhook-proxy-new.js`

## 3. 生产切换步骤

### Phase A：备份与快照（必须）

```bash
cd /home/yirongbest/.openclaw

cp webhook.log webhook.log.backup-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true
ps aux | grep -E "node.*webhook-proxy(-new)?\.js" | grep -v grep > current-webhook-process.txt || true
env | grep -E '^XIAOICE_|^PORT=' > current-env.txt || true
```

### Phase B：停止旧服务（先温和后强制）

```bash
# 1) 若有 PID 文件，先发 SIGTERM
if [ -f webhook.pid ]; then
  PID=$(cat webhook.pid)
  kill -TERM "$PID" 2>/dev/null || true
  sleep 2
fi

# 2) 清理仍占用端口的进程（仍先 TERM）
for pid in $(lsof -ti:3002 2>/dev/null); do
  kill -TERM "$pid" 2>/dev/null || true
  sleep 1
  ps -p "$pid" >/dev/null 2>&1 && kill -KILL "$pid" 2>/dev/null || true
done
```

### Phase C：启动新服务

```bash
# 推荐方式（已内置新入口、健康检查、PID 记录）
bash start-webhook.sh
```

### Phase D：上线后即时验证（阻断项）

```bash
# 1. 进程与端口
bash status.sh

# 2. 健康检查
curl -s http://localhost:3002/health

# 3. 空消息/空白消息（Bad Case 3）
bash test-empty-message.sh

# 4. 快速端到端
bash test-quick.sh

# 5. 单元测试（代码层）
npm test -- --runInBand
```

阻断条件（任一满足则停止放量并回滚）：
- `/health` 失败
- `test-empty-message.sh` 失败
- `test-quick.sh` 失败
- 日志出现持续 `ERROR` 或大量 `TIMEOUT`

## 4. 各环节测试脚本指引（按阶段）

### 4.1 预检查阶段

1. `status.sh`
- 用途：看进程、端口、ngrok、最近日志。
- 通过标准：Webhook 运行、3002 监听、health 正常。

2. `ngrok-status.sh`
- 用途：确认公网隧道状态与 URL。
- 通过标准：`public_url` 可读、4040 API 正常。

### 4.2 切换后冒烟阶段

1. `test-empty-message.sh`
- 用途：验证空消息和空白消息处理。
- 通过标准：返回“请说点什么吧～”。

2. `test-quick.sh`
- 用途：快速验证 health + 基础请求 + auth 行为。
- 当前口径（auth=false）：
  - 基础请求返回文本即通过（JSON/纯文本都接受）
  - “无效签名被拒绝”不作为失败条件（会提示 auth disabled）

3. `quick-test.sh`
- 用途：单次请求回显。
- 说明：已支持 JSON/非 JSON 输出显示。

### 4.3 集成验证阶段

1. `test-auth-modes.sh`
- 用途：验证 `XIAOICE_AUTH_REQUIRED=true/false` 两组行为。
- 通过标准：两组 HTTP 状态码符合预期。
- 建议：切换前后各跑一次，确认后续可恢复签名。

2. `test-webhook.sh`
- 用途：覆盖签名、流式、重放等场景。
- 注意：脚本会写证据目录，先确认目录存在后再跑。

3. `test-xiaoice-complete.sh`
- 用途：全流程压力与格式检查。
- 注意：该脚本部分断言基于旧 JSON 响应假设；当前纯文本响应模式下请作为“信息性检查”，不要单独作为阻断项。

### 4.4 运维监控阶段

1. `monitor-webhook.sh`
- 用途：实时日志 + PID 状态。

2. `watch-logs.sh`
- 用途：彩色日志跟踪，快速看 WARN/ERROR。

3. 日志 grep 组合

```bash
grep -E "ERROR|Failed|TIMEOUT" webhook.log | tail -20
grep "Empty or missing askText" webhook.log | tail -20
grep "Authentication disabled" webhook.log | tail -20
```

## 5. 向 Agent 报障的标准模板（已吸收两篇调试文档）

参考文档：
- `docs/debugging-guides/如何向Agent描述日志-快速定位问题指南.md`
- `docs/debugging-guides/Agent调试效率对比-Main vs Worktree.md`

建议按下面模板发给 Agent（高效定位）：

```text
问题现象：
[一句话业务影响]

关键日志（5-10行）：
[带时间戳 + 日志级别 + 一条上下文 JSON]

环境上下文：
- 请求类型：流式/非流式
- sessionId：xxx
- 问题时间：ISO 时间
- 当前模式：XIAOICE_AUTH_REQUIRED=false

已执行测试：
- test-empty-message.sh: pass/fail
- test-quick.sh: pass/fail
- npm test: pass/fail

怀疑位置：
[src/handlers.js 或 src/openclaw-client.js 等]
```

## 6. 回滚方案

当新入口出现持续故障时：

```bash
# 1) 停止当前进程（先 TERM）
if [ -f webhook.pid ]; then
  kill -TERM "$(cat webhook.pid)" 2>/dev/null || true
  sleep 2
fi

# 2) 必要时强制释放端口
for pid in $(lsof -ti:3002 2>/dev/null); do
  kill -TERM "$pid" 2>/dev/null || true
  sleep 1
  ps -p "$pid" >/dev/null 2>&1 && kill -KILL "$pid" 2>/dev/null || true
done

# 3) 回退到旧入口
nohup node webhook-proxy.js >> webhook.log 2>&1 &
echo $! > webhook.pid

# 4) 验证
curl -s http://localhost:3002/health
```

## 7. 验证清单

- [ ] 运行入口为 `webhook-proxy-new.js`
- [ ] `XIAOICE_AUTH_REQUIRED=false` 生效
- [ ] `/health` 正常
- [ ] 空消息返回“请说点什么吧～”
- [ ] 基础消息可返回文本
- [ ] `npm test` 全部通过
- [ ] 监控日志无持续 ERROR/TIMEOUT
- [ ] 已保留回滚路径（旧入口可启动）
