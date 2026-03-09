# XiaoIce SSE 根因与修复计划

## 结论

当前不是 `ngrok`、`OpenClaw` 或“最近一次 push 没生效”的问题。

真实根因是 **Webhook 返回的 SSE 协议与小冰当前文档约定不一致**，最关键的两个点：

1. **缺少 `isFinal` 字段**
   - 文档 172《对话服务接口协议》把 `isFinal: Boolean` 列为响应字段，并注明“用于标记结束”。
   - 当前 [`src/handlers.js`](/home/yirongbest/.openclaw/src/handlers.js) 返回体没有 `isFinal`。

2. **多发了非文档定义的 `data: [DONE]`**
   - 文档 154《接入第三方对话》和文档 172《对话服务接口协议》都只定义了 SSE `message event data` 为 JSON 结构。
   - 当前实现会在 JSON 事件后再发送一条 `data: [DONE]`，这不在小冰文档协议中。
   - 如果平台侧按“每个 SSE data 都是 JSON”解析，这条 `[DONE]` 很容易直接触发解析失败或丢弃整个响应。

## 已验证证据

### 1. 平台请求已经到达本地服务

ngrok 最近真实平台请求头里有：

- `Accept: text/event-stream`
- `Key: test-key`
- `Signature: ...`
- `Timestamp: ...`
- `X-Forwarded-For: 60.205.186.151`

说明平台确实按流式方式调用了当前 webhook。

### 2. 本地服务已经返回 200 + SSE

ngrok 抓到的最近响应主体是：

```text
data: {"id":"...","traceId":"...","sessionId":"...","askText":"...","replyText":"...","replyType":"Llm","timestamp":...,"replyPayload":{},"extra":{"modelName":"openclaw"}}

data: [DONE]
```

说明问题不在“没回”，而在“回的格式平台不认”。

### 3. Playwright 浏览器级 double check 已完成

通过临时 Playwright 脚本核验到：

- 文档 154：`接入第三方对话`
  - 更新时间：`2025-11-03 18:36:28`
- 文档 172：`对话服务接口协议`
  - 更新时间：`2025-11-03 18:16:05`

两份文档都来自页面真实加载的 `api/v1/saas/api/document/get` 接口，不是静态猜测。

## 文档对齐结果

### 文档 154

`https://aibeings-vip.xiaoice.cn/product-doc/show/154`

关键信息：

- 流式接口应基于标准 SSE
- 返回的 `message event data` 是 JSON
- JSON 字段包含：
  - `id`
  - `traceId`
  - `sessionId`
  - `askText`
  - `replyText`
  - `replyType`
  - `timestamp`
  - `replyPayload`
  - `extra`

### 文档 172

`https://aibeings-vip.xiaoice.cn/product-doc/show/172`

比 154 更明确补充了：

- 对话接口通过 SSE 流式推送
- 响应字段还包含：
  - `isFinal`
- `isFinal` 的说明是：
  - “是否是最后一句话，用于标记结束”

这等于把“流结束标记”从我们现在自定义的 `[DONE]`，改成了 **JSON 内部字段 `isFinal`**。

## 当前实现与文档的差异

文件：[`src/handlers.js`](/home/yirongbest/.openclaw/src/handlers.js)

当前行为：

1. 只发送 1 条最终 JSON 事件
2. 再发送 1 条 `data: [DONE]`
3. JSON 中没有 `isFinal`

协议风险：

1. 平台可能在等 `isFinal=true` 才提交展示
2. 平台可能逐条 `JSON.parse(event.data)`，遇到 `[DONE]` 直接报错
3. 即使第一条 JSON 已经正确，第二条非 JSON 事件也可能让平台丢弃整轮结果

## 当前修复状态

我已经在本地代码里做了最小协议修正，但**还没有切主进程**：

- 在 [`src/handlers.js`](/home/yirongbest/.openclaw/src/handlers.js) 中：
  - 为 reply envelope 增加 `isFinal`
  - 移除 `data: [DONE]`
  - SSE 改为只发送标准 `message` JSON 事件

当前 git 状态可见该文件已有本地修改：

- [`src/handlers.js`](/home/yirongbest/.openclaw/src/handlers.js)

## 后续执行计划

### P0

把当前 webhook 主链路完全按小冰 SSE 协议收口：

- 保留 `Content-Type: text/event-stream`
- 每条 SSE `data:` 都只发 JSON
- 最后一条 JSON 带 `isFinal: true`
- 不再发送 `[DONE]`

### P1

用**临时端口实例**做验证，不影响主进程：

- 起一个独立端口的 webhook 临时实例
- 用同样请求体回放平台请求
- 确认响应体变成：

```json
{
  "id": "...",
  "traceId": "...",
  "sessionId": "...",
  "askText": "...",
  "replyText": "...",
  "replyType": "Llm",
  "timestamp": 0,
  "replyPayload": {},
  "extra": { "modelName": "openclaw" },
  "isFinal": true
}
```

### P2

验证通过后再切主 webhook 进程：

- 重启当前 webhook
- 保持 ngrok URL 不变
- 在小冰平台复测

### P3

后续再处理非当前阻塞项：

- 鉴权头命名与 154/172 文档差异
- `extensions/xiaoice` 里的 SSE `[DONE]` 兼容逻辑
- 文档与 README 中旧 `[DONE]` 说明的同步更新

## 补充判断

### 不是当前 blocker，但值得记录

1. **请求头协议存在新旧版本并存**
   - 文档 154 写的是 `timestamp/signature/key`
   - 文档 172 写的是 `X-Timestamp/X-Sign/X-Key`
   - 实际平台请求目前还是旧头：`Timestamp/Signature/Key`
   - 这说明平台当前接入链路仍偏向旧版鉴权协议

2. **响应协议明显已经不能再继续沿用旧 `[DONE]` 思路**
   - 因为 172 已经明确给了 `isFinal`
   - 这是当前最可解释“平台收到了 HTTP 200，但 UI 不展示”的点

