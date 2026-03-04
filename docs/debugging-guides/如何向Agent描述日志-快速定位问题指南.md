# 如何向 Agent 描述日志以快速定位问题

## 🎯 核心原则

**好的日志描述 = 问题现象 + 关键日志片段 + 环境上下文**

---

## 📋 Main 分支（单文件架构）

### 日志位置
```bash
/home/yirongbest/.openclaw/webhook.log
```

### 日志格式
```
[2026-03-04T09:20:18.652Z] [INFO] Calling OpenClaw CLI
[2026-03-04T09:20:23.145Z] [INFO] OpenClaw response
[2026-03-04T09:20:23.152Z] [INFO] Response sent successfully
```

---

### ❌ 不好的描述方式

```
用户: "日志里有错误"
用户: "看一下日志"
用户: "webhook 不工作"
```

**问题**: Agent 需要读取整个日志文件，无法快速定位

---

### ✅ 好的描述方式

#### 模板 1: 报告错误
```
用户: "小冰平台没收到回复。最近的日志显示：

[2026-03-04T09:20:18.652Z] [INFO] Calling OpenClaw CLI
[2026-03-04T09:20:43.145Z] [ERROR] OpenClaw timeout

请检查 webhook-proxy.js 的超时配置"
```

**Agent 能快速理解**:
- ✅ 问题：超时
- ✅ 位置：OpenClaw 调用环节
- ✅ 方向：检查超时配置

---

#### 模板 2: 报告异常行为
```
用户: "语音输出包含 emoji。日志显示响应正常发送：

[2026-03-04T09:20:23.152Z] [INFO] Response sent successfully
{
  "replyText": "刚才查过了：☁️ 上海多云",
  "voiceOptimized": true
}

但 replyText 里还有 emoji，请检查 formatForVoice 函数"
```

**Agent 能快速理解**:
- ✅ 问题：emoji 未被移除
- ✅ 位置：formatForVoice 函数
- ✅ 证据：日志中的 replyText

---

#### 模板 3: 报告性能问题
```
用户: "响应太慢。日志显示：

[2026-03-04T09:20:18.652Z] [INFO] Calling OpenClaw CLI
{
  "thinkingLevel": "high",
  "questionLength": 5
}
[2026-03-04T09:20:38.145Z] [INFO] Performance metrics
{
  "processingTime": 19493
}

简单问题用了 high thinking，请检查 selectThinkingLevel 逻辑"
```

**Agent 能快速理解**:
- ✅ 问题：thinking level 选择不当
- ✅ 位置：selectThinkingLevel 函数
- ✅ 数据：5 字符问题用了 high

---

### 📝 Main 分支日志关键字速查

| 问题类型 | 搜索关键字 | 对应代码位置 |
|---------|-----------|------------|
| 签名验证失败 | `Signature verification` | webhook-proxy.js:262-305 |
| OpenClaw 超时 | `OpenClaw timeout` | webhook-proxy.js:148 |
| 响应解析错误 | `Could not extract text` | webhook-proxy.js:248 |
| 请求体过大 | `Request body too large` | webhook-proxy.js:328 |
| 认证失败 | `Authentication failed` | webhook-proxy.js:354 |
| 流式响应 | `Streaming response` | webhook-proxy.js:391 |
| 性能指标 | `Performance metrics` | webhook-proxy.js:181 |

---

### 🔍 Main 分支：如何提供有效日志

#### 步骤 1: 获取最近日志
```bash
# 最近 20 行
tail -20 webhook.log

# 最近 1 分钟的日志
tail -100 webhook.log | grep "$(date -u +%Y-%m-%d)"

# 特定时间段
grep "2026-03-04T09:2" webhook.log
```

#### 步骤 2: 过滤关键信息
```bash
# 只看错误
grep "ERROR" webhook.log | tail -10

# 只看特定 session
grep "test-session-001" webhook.log

# 看完整请求流程
grep -A 5 "Webhook request" webhook.log | tail -30
```

#### 步骤 3: 向 Agent 描述
```
用户: "问题：[简短描述]

相关日志：
[粘贴 5-10 行关键日志]

环境：
- 请求类型：流式/非流式
- sessionId: xxx
- 时间：[时间戳]

请检查：[你怀疑的模块/函数]"
```

---

## 📋 Worktree 分支（模块化架构）

### 日志位置
```bash
/home/yirongbest/.openclaw/.claude/worktrees/code-quality-refactor/webhook.log
```

### 日志格式（更结构化）
```
[INFO] Calling OpenClaw CLI
[ERROR] ✗ OpenClaw timeout
[SUCCESS] ✓ Response sent successfully
```

---

### ✅ 好的描述方式（更精确）

#### 模板 1: 模块化定位
```
用户: "签名验证失败。日志显示：

✗ Signature verification failed
{
  "timestamp": 1772616018652,
  "expectedSig": "abc123...",
  "receivedSig": "def456..."
}

请检查 src/auth.js 的签名算法"
```

**Agent 响应**:
```
Agent: 收到。问题在认证模块。
1. Read src/auth.js (84行)
2. 运行测试：npm test auth.test.js
3. 定位到 verifySignature 函数
```

**效率**: 2-3 分钟定位

---

#### 模板 2: 测试失败报告
```
用户: "响应解析有问题。运行测试失败：

$ npm test response-parser
FAIL __tests__/response-parser.test.js
  ✗ should extract text from new format (line 45)

Expected: "你好"
Received: ""

请检查 src/response-parser.js 的新格式解析"
```

**Agent 响应**:
```
Agent: 测试指向了具体问题。
1. Read __tests__/response-parser.test.js:45
2. Read src/response-parser.js
3. 修复 extractReplyText 函数
4. 运行测试验证
```

**效率**: 2 分钟定位

---

#### 模板 3: 使用测试脚本报告
```
用户: "完整测试有 2 个失败：

$ bash test-xiaoice-complete.sh

✓ 测试 1: 基本对话请求（非流式）
✓ 测试 2: 流式对话请求
✗ 测试 3: 多轮对话（上下文记忆）
  ⚠ 上下文记忆可能未生效
✗ 测试 4: 不同语言代码支持
  ✗ ja 语言请求失败

总计: 8
通过: 6
失败: 2

请检查多轮对话和日语支持"
```

**Agent 响应**:
```
Agent: 测试脚本已经隔离了问题。
1. 检查 src/handlers.js 的 sessionId 处理
2. 检查 languageCode 参数传递
3. 运行单独测试验证修复
```

**效率**: 3-4 分钟定位

---

### 📝 Worktree 分支日志关键字速查

| 问题类型 | 搜索关键字 | 对应模块 | 测试文件 |
|---------|-----------|---------|---------|
| 签名验证 | `✗ Signature` | src/auth.js | __tests__/auth.test.js |
| 响应解析 | `Could not extract` | src/response-parser.js | __tests__/response-parser.test.js |
| OpenClaw 调用 | `OpenClaw timeout` | src/openclaw-client.js | - |
| 请求处理 | `Webhook request` | src/handlers.js | - |
| 服务器错误 | `Server error` | src/server.js | - |

---

### 🔍 Worktree 分支：如何提供有效日志

#### 步骤 1: 运行测试脚本
```bash
# 完整测试
bash test-xiaoice-complete.sh

# 快速测试
bash quick-test.sh

# 认证测试
bash test-auth-modes.sh
```

#### 步骤 2: 运行单元测试
```bash
# 所有测试
npm test

# 特定模块
npm test auth
npm test response-parser

# 带覆盖率
npm run test:coverage
```

#### 步骤 3: 向 Agent 描述
```
用户: "问题：[简短描述]

测试结果：
[粘贴测试输出]

或

日志片段：
[粘贴关键日志]

建议检查模块：src/[模块名].js"
```

---

## 🎯 对比：两个版本的最佳实践

### Main 分支最佳实践

```
用户描述模板：
"
问题：[一句话描述]

日志：
[粘贴 5-10 行关键日志，包含时间戳]

环境：
- sessionId: xxx
- 请求类型：流式/非流式
- 问题时间：[时间]

怀疑位置：webhook-proxy.js 的 [函数名] 函数
"
```

**关键点**:
- ✅ 提供时间戳（帮助定位代码执行顺序）
- ✅ 包含完整的 JSON 日志（如果有）
- ✅ 说明怀疑的函数名

---

### Worktree 分支最佳实践

```
用户描述模板：
"
问题：[一句话描述]

测试结果：
[粘贴测试脚本输出]

或

单元测试失败：
[粘贴 npm test 输出]

或

日志：
[粘贴关键日志]

建议检查：src/[模块名].js
"
```

**关键点**:
- ✅ 优先提供测试结果（最精确）
- ✅ 指明具体模块（不是整个文件）
- ✅ 包含测试失败的行号

---

## 📊 效率对比实例

### 场景："小冰平台没收到回复"

#### ❌ 低效描述（两个版本都适用）
```
用户: "不工作了，看一下"
```

**Agent 需要**:
1. 询问具体问题
2. 要求提供日志
3. 读取大量代码
4. 猜测问题位置

**耗时**: 10-15 分钟

---

#### ✅ 高效描述 - Main 分支
```
用户: "小冰平台没收到回复。日志显示：

[2026-03-04T09:20:18.652Z] [INFO] Calling OpenClaw CLI
[2026-03-04T09:20:23.145Z] [INFO] OpenClaw response
{
  "stdout": "{\"result\":{\"payloads\":[{\"text\":\"你好\"}]}}"
}
[2026-03-04T09:20:23.152Z] [INFO] Response sent successfully
{
  "replyText": "你好",
  "sessionId": "test-001"
}

OpenClaw 返回了响应，webhook 也发送了，但小冰平台说没收到。
请检查响应格式是否符合小冰 API 规范。"
```

**Agent 响应**:
```
Agent: 明白了。问题可能在响应格式。
1. Read webhook-proxy.js:446-456 (响应构建部分)
2. 对比小冰 API 文档
3. 检查必需字段
```

**耗时**: 3-5 分钟

---

#### ✅ 高效描述 - Worktree 分支
```
用户: "小冰平台没收到回复。测试结果：

$ bash test-xiaoice-complete.sh

✓ 测试 1: 基本对话请求（非流式）
✓ 测试 2: 流式对话请求
✓ 测试 8: 响应格式验证

所有测试通过，但小冰平台实际调用时没收到。
可能是生产环境的网络或签名问题。

请检查：
1. ngrok 是否正常运行
2. 小冰平台的签名配置是否正确"
```

**Agent 响应**:
```
Agent: 测试通过说明代码正常。检查外部因素。
1. 运行 ngrok-status.sh
2. 检查小冰平台配置
3. 查看 ngrok 日志
```

**耗时**: 2-3 分钟

---

## 🎓 进阶技巧

### 技巧 1: 提供完整的请求-响应链路

```
用户: "问题追踪：

1. 小冰平台发送请求 → ngrok 收到 ✓
2. ngrok 转发到 webhook → webhook 收到 ✓
3. webhook 调用 OpenClaw → OpenClaw 响应 ✓
4. webhook 发送响应 → 小冰平台收到 ✗

日志：
[粘贴第 3-4 步的日志]

问题在第 4 步，请检查响应格式"
```

**效果**: Agent 立即知道问题范围

---

### 技巧 2: 对比正常和异常日志

```
用户: "对比分析：

正常请求（简单问候）：
[2026-03-04T09:20:18.652Z] [INFO] thinkingLevel: minimal
[2026-03-04T09:20:23.145Z] [INFO] processingTime: 4493ms
✓ 成功

异常请求（天气查询）：
[2026-03-04T09:25:18.652Z] [INFO] thinkingLevel: medium
[2026-03-04T09:25:43.145Z] [ERROR] OpenClaw timeout
✗ 失败

问题：medium thinking 导致超时，请调整 selectThinkingLevel"
```

**效果**: Agent 看到明确的因果关系

---

### 技巧 3: 使用测试脚本隔离问题

```
用户: "使用测试脚本定位问题：

$ bash test-auth-modes.sh
✓ 禁用认证模式
✗ 启用认证模式 - 签名验证失败

$ bash test-webhook.sh
✓ 基本请求
✗ 带签名的请求

问题确认：签名验证逻辑有 bug
请检查 verifySignature 函数"
```

**效果**: Agent 得到精确的问题范围

---

## 📋 快速参考卡片

### Main 分支
```
问题描述公式：
问题 + 日志片段 + 怀疑位置

示例：
"超时 + [ERROR] OpenClaw timeout + 检查 sendToOpenClaw"
```

### Worktree 分支
```
问题描述公式：
问题 + 测试结果 + 建议模块

示例：
"签名失败 + npm test auth 失败 + 检查 src/auth.js"
```

---

## 🎯 总结

### Main 分支关键
1. **提供时间戳日志**（帮助追踪执行流程）
2. **包含完整 JSON**（如果日志中有）
3. **说明怀疑的函数名**（缩小搜索范围）

### Worktree 分支关键
1. **优先运行测试**（最快定位）
2. **指明具体模块**（不是整个文件）
3. **提供测试输出**（精确到行号）

### 通用原则
- ✅ 简短描述问题（1 句话）
- ✅ 提供关键日志（5-10 行）
- ✅ 说明环境上下文（sessionId, 时间等）
- ✅ 建议检查方向（函数名/模块名）
- ❌ 不要只说 "不工作" 或 "有错误"
- ❌ 不要粘贴 100+ 行日志
- ❌ 不要省略时间戳和上下文
