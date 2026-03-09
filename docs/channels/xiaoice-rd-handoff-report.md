# XiaoIce Channel 研发对接详细汇报

更新时间: 2026-03-06  
面向对象: 研发老师 / 技术负责人 / Junior PM 对接使用  
仓库路径: `/home/yirongbest/.openclaw`

## 先说结论

当前 XiaoIce 接入实际上存在两条实现路径，但真正承接线上 webhook 入站逻辑的是 `Webhook Proxy` 这一条；`extensions/xiaoice` 更像是 OpenClaw 原生插件化方案的骨架，目前还没有和 proxy 做到完全等价。

另外，当前代码里“队列消息重排”这个说法需要非常谨慎。就我基于现有源码的判断，**当前生效代码不是 latest-first 重排，而是按 session 串行 + FIFO 顺序处理**。如果研发老师口中的“重排”指“新消息优先”，那和当前 `src/handlers.js` 的实现是不一致的，需要当场确认。

还有一个必须提前说明的问题：**代码、测试、README 在 SSE 细节上存在轻微漂移**。这不是致命问题，但它正是现在 ngrok 已经收到请求、而小冰平台侧仍然“不接消息/不展示消息”时最值得优先核查的区域。

---

## 1. 当前队列消息“重排”技术是怎么实现的，逻辑是什么

### 1.1 当前真实实现

当前核心逻辑在 `src/handlers.js`：
- session 队列状态: `src/handlers.js:16`
- 出队执行: `src/handlers.js:197`
- 入队逻辑: `src/handlers.js:238`
- webhook 主处理里调用队列: `src/handlers.js:428`

代码层面的结构是：

```js
const sessionPipelines = new Map();
```

每个 `sessionId` 对应一个独立状态：
- `running`: 当前这个 session 是否已有请求在执行
- `queue`: 当前这个 session 的等待队列

### 1.2 实际处理规则

当前规则不是“全局重排”，而是“按 session 做串行化”：

1. 同一个 `sessionId` 的请求不能并发执行。
2. 不同 `sessionId` 之间可以并发执行。
3. 同一个 `sessionId` 内，等待队列当前使用 `push()` 入队、`shift()` 出队。
4. 这意味着同一会话内是标准 FIFO，而不是最新消息抢占旧消息。
5. 如果某个 session 的在途请求数超过上限，会直接返回 `SESSION_QUEUE_FULL` 的 fallback。

对应代码依据：
- 入队 `push`: `src/handlers.js:276`
- 出队 `shift`: `src/handlers.js:205`
- 队列上限检查: `src/handlers.js:247-257`
- 队列满后的 fallback: `src/handlers.js:561-584`

### 1.3 为什么会让人感觉“有重排”

这里有两个容易混淆的点：

第一，代码会重新计算 `queuePosition`。  
见 `src/handlers.js:218-220` 和 `src/handlers.js:278-280`。  
这只是为了让日志里的排队位置正确，不等于真正改变执行顺序。

第二，测试文件名字和历史注释里保留过“reorder”语义。  
例如 `__tests__/session-queue.test.js` 里有 `reorder-session` 的命名，但断言的执行顺序实际上是：

```js
['first', 'second', 'third']
```

也就是 FIFO。对应位置在 `__tests__/session-queue.test.js` 中“processes waiting requests in FIFO order within the same session”这一段。

### 1.4 这套逻辑解决了什么问题

它主要解决的是同一会话的上下文一致性问题：
- 避免同一用户连续发 2 条消息时，被两个 OpenClaw agent 并发处理，导致上下文错乱。
- 避免先发的问题后返回、后发的问题先返回，造成平台侧会话顺序混乱。
- 对不同用户/不同 session 保持并行，避免整个系统被单个会话拖慢。

### 1.5 这套逻辑带来的代价

代价也很明确：
- 某个 session 如果第一条消息很慢，后面的消息都会排队等待。
- 如果小冰平台本身对 webhook 响应时间很敏感，那么“排队等待 + OpenClaw 处理时间”叠加后，平台可能超时。
- 当前并没有“取消旧请求、只保留最后一条”的策略，所以连续高频输入会形成 backlog。

### 1.6 跟研发确认时建议直接问

建议你直接确认这句话：

> 我现在看到 `src/handlers.js` 里的现行逻辑是同 session 串行 + FIFO，不是 latest-first。我们最终想要的是“严格顺序处理”，还是“新消息优先，旧消息可丢弃/降级”？

这是关键分歧点。先问清楚，再谈优化。

---

## 2. 为什么需要插件和 proxy 双路径

### 2.1 两条路径分别解决什么问题

当前仓库里的两条路径不是重复造轮子，而是在解决不同层级的问题。

#### 路径 A: Webhook Proxy

核心文件：
- `webhook-proxy-new.js:27-39`
- `src/server.js:19-54`
- `src/handlers.js:315-594`
- `src/openclaw-client.js:32-129`

它做的是：
- 直接暴露 HTTP webhook 给小冰平台
- 处理小冰入站鉴权
- 按 session 排队
- 调起 `openclaw agent --channel xiaoice ...`
- 把结果包装成小冰能消费的响应
- 提供 ngrok、本地 dashboard、日志观察、测试脚本

这是当前更偏“集成层 / 适配层 / 运维层”的方案。

#### 路径 B: OpenClaw 插件

核心文件：
- `extensions/xiaoice/index.ts:13-24`
- `extensions/xiaoice/src/channel.ts:16-109`
- `extensions/xiaoice/src/webhook.ts:20-74`
- `extensions/xiaoice/src/api.ts:7-198`

它做的是：
- 在 OpenClaw 内注册 `xiaoice` channel
- 提供 account 配置解析
- 走 OpenClaw 原生 channel outbound 能力发消息
- 为未来把 XiaoIce 作为正式插件能力沉淀到 OpenClaw 框架里做准备

这是更偏“产品层 / 框架层 / 长期归一化”的方案。

### 2.2 为什么当前阶段会同时保留两条

因为现在这两条线的成熟度并不一样。

目前从代码上看：
- proxy 路径已经覆盖了 webhook 入站、队列、fallback、SSE、dashboard、ngrok 调试等完整链路
- plugin 路径当前的 webhook handler 还只是“验签 + 解析 + 返回 ack”，并没有像 proxy 一样真正把消息交给 OpenClaw agent 再回传结果

这点从 `extensions/xiaoice/src/webhook.ts:61-67` 可以直接看出来，它当前只返回：

```json
{ "ok": true, "messageId": "..." }
```

这不是完整对话回包。

### 2.3 所以当前怎么理解“双路径”

对接时建议这样表述：

> 现在 proxy 是可运行的集成入口，plugin 是 OpenClaw 原生化的长期方向。两者不是都已经 fully production-ready，而是一个负责把链路跑通，一个负责框架内沉淀。

### 2.4 当前双路径带来的风险

这是一个研发会非常关心的问题：

1. 路由不一致  
proxy 路由是 `/webhooks/xiaoice`，见 `src/server.js:50-53`。  
plugin 文档写的是 `/webhooks/xiaoice/:accountId`，见 `docs/channels/xiaoice.md`。

2. 鉴权协议不一致  
proxy 用的是 `x-xiaoice-timestamp + x-xiaoice-signature + x-xiaoice-key`，算法是 SHA-512，见 `src/auth.js:20-50`。  
plugin 用的是 `x-signature`，算法是 HMAC-SHA256，见 `extensions/xiaoice/src/webhook.ts:32-47`。

3. SSE 写法不一致  
proxy 当前发送 data-only SSE，见 `src/handlers.js:146-154`。  
plugin outbound 仍然写 `event: message\ndata: ...`，见 `extensions/xiaoice/src/channel.ts:66-69`。

结论就是：**双路径目前不是“同协议双实现”，而是“两个不同阶段的方案并存”**。

---

## 3. 当前如何和小冰文档中的 SSE 格式对齐

### 3.1 当前 proxy 的 SSE 处理方式

入口判断在 `src/handlers.js:403`：
- `Accept` 包含 `text/event-stream`
- 或 payload 里 `stream === true`

一旦判定为流式，proxy 会：

1. 写入 SSE headers  
见 `src/handlers.js:129-139`

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

2. 把业务结果包装成统一 envelope  
见 `src/handlers.js:82-108`

核心字段有：
- `id`
- `traceId`
- `sessionId`
- `askText`
- `replyText`
- `replyType`
- `timestamp`
- `replyPayload`
- `extra`
- `isFinal`

3. 发送单条 `data: {json}\n\n`  
见 `src/handlers.js:146-154`

当前实现是：

```text
data: {"id":"...","traceId":"...","sessionId":"...","replyText":"...","isFinal":true}

```

然后直接 `res.end()`，不再额外发 `[DONE]`。

### 3.2 当前对齐思路是什么

当前的对齐思路其实很明确：

1. 不依赖 `event:` 字段，尽量走最保守的 SSE 子集
2. 不依赖 `[DONE]` 终止标记，而是在 JSON 内部显式带 `isFinal: true`
3. 返回一个结构完整的 envelope，而不是只回一段纯文本
4. 在回包前做一次 `replyText` 清洗，去掉 emoji、控制字符、异常换行，避免平台解析或渲染异常

`replyText` 清洗逻辑见 `src/handlers.js:52-75`。

### 3.3 当前存在的“文档/代码不完全一致”

这是和研发必须确认的点。

#### 不一致 A: README 仍写 `event: message`

`README-XIAOICE.md:48-51` 里写的是：

```text
event: message
data: {json}
```

但 proxy 的现行代码 `src/handlers.js:151-153` 实际只发：

```text
data: {json}
```

#### 不一致 B: plugin outbound 仍保留 `event: message`

`extensions/xiaoice/src/channel.ts:66-69` 仍然写的是：

```text
event: message
data: {json}
```

#### 不一致 C: plugin 的 SSE 解析兼容 `[DONE]` 和 `isFinal`

`extensions/xiaoice/src/api.ts:131-146` 同时兼容：
- `data: [DONE]`
- `event.isFinal === true`

这说明当前团队事实上还没有把“小冰最终认哪一种结束标记”收敛为唯一答案。

### 3.4 所以现在最准确的说法

建议你在会上这样说：

> 当前 proxy 侧已经按最保守的 SSE 方式收敛到 data-only + `isFinal`，但 README 和 plugin 侧还保留了 `event: message` / `[DONE]` 的兼容痕迹。这里我希望和研发确认一下，小冰平台最终接受的严格格式到底是哪一种，我们要不要统一成单一协议。

这句话比较稳，不会把自己说死。

---

## 4. 当前面对“重排后的 askText，成功传到 ngrok 但小冰平台仍接收不到消息”，可能原因有哪些

这一类问题我建议分成 4 层来看：入口层、协议层、处理层、平台层。

### 4.1 第一优先级: 协议格式没对上，平台丢弃了响应

这是我认为最可能的原因。

虽然 ngrok 能看到请求打进来，但这只能证明：
- 小冰平台发出了 webhook
- ngrok 把请求转发到了本地

它**不能证明**小冰平台认可了你的响应。

平台侧可能丢弃响应的原因包括：

1. SSE 格式不符合平台严格要求  
比如平台要求 `event: message`，但当前 proxy 只发 `data:`。

2. 平台要求 `isFinal` 之外还要 `[DONE]`  
当前 proxy 不发 `[DONE]`，只在 JSON 内带 `isFinal: true`。

3. 平台其实不接受 JSON envelope，只接受更简单的纯文本或固定字段  
这需要研发拿官方契约再确认。

4. `replyType` / `replyPayload` / `extra` 字段取值不符合平台校验规则  
当前 proxy 的 `replyPayload` 默认是 `null`，而 README 例子里是 `{}`。这不一定是错，但有可能踩平台的宽松/严格校验差异。

### 4.2 第二优先级: 你走到的不是同一条实现路径

这个仓库里最危险的不是“代码没写”，而是“有两条路，而且协议不同”。

需要确认下面几件事：

1. 小冰平台配置的 URL 到底是：
   - `/webhooks/xiaoice`
   - 还是 `/webhooks/xiaoice/default`

2. ngrok 暴露出去的到底是 proxy 进程，还是别的服务

3. 当前真正启动的是：
   - `webhook-proxy-new.js`
   - 还是 OpenClaw plugin/gateway 路径

如果平台指向的是 plugin 的 webhook 路由，但本地以为自己在调 proxy，就会出现“ngrok 有请求，平台不认回包”的错位。

### 4.3 第三优先级: 鉴权/头部约定不一致

这部分也非常可能。

proxy 路径要求：
- `x-xiaoice-timestamp`
- `x-xiaoice-signature`
- `x-xiaoice-key`
- SHA-512

plugin 路径要求：
- `x-signature`
- HMAC-SHA256

如果研发或平台配置参考的是另一套协议，就会出现：
- 请求确实到 ngrok
- 但本地服务返回 401 或返回格式错误
- 平台最终不展示消息

另外还有一个配置漂移：
- `README-XIAOICE.md` 写的是“鉴权默认开启”
- `webhook-proxy-new.js:34` 当前实际代码是 `process.env.XIAOICE_AUTH_REQUIRED === 'true'`

也就是说，**当前真实默认值是未显式设为 `true` 就关闭鉴权**。这个点很容易让不同人对“现在到底有没有验签”产生不同认知。

### 4.4 第四优先级: 队列等待或模型处理超时，平台先超时了

这和你提到的“重排后的 askText”有关。

当前链路里一个请求的总耗时大致是：

```text
排队等待时间 + OpenClaw agent 执行时间 + 响应回写时间
```

相关代码：
- session 排队: `src/handlers.js:428-559`
- OpenClaw CLI 调用: `src/openclaw-client.js:41-127`
- OpenClaw timeout: `src/openclaw-client.js:73-94`

如果第一条消息很慢，后面的 askText 即使已经到 ngrok，也可能因为还在 session queue 里等待，导致：
- ngrok 看起来“请求到了”
- 但小冰平台等不到有效响应，提前超时

尤其要注意：
- `webhook-proxy-new.js:31` 默认 `XIAOICE_TIMEOUT = 30000`
- `src/server.js:75-79` 默认 `requestTimeout = 45000`

如果小冰平台自己的 webhook 超时阈值比这个更短，比如 5 秒、10 秒、15 秒，那平台侧会先放弃。

### 4.5 第五优先级: 心跳/comment 帧被平台误解析

当前 proxy 支持可选 heartbeat：
- `src/handlers.js:162-189`

格式是：

```text
: keep-alive 1700000000000

```

虽然这是标准 SSE comment 帧，但某些平台实现并不严格，可能会：
- 不认识 comment 帧
- 把它当成脏数据
- 在只期待单条 `data:` 的情况下直接报错

当前默认 `XIAOICE_SSE_HEARTBEAT_MS` 是 `0`，见 `webhook-proxy-new.js:36`，所以默认不会发。  
但如果运行环境里把它打开了，这会成为潜在变量。

### 4.6 第六优先级: askText 本身被处理后和平台上下文不一致

这里不是说“重排改变了 askText 内容”，而是说：
- 当前回包里会原样带回 `askText`
- 但内部处理时会对 `replyText` 做清洗
- 同 session 的多个 askText 仍按 FIFO 顺序执行

如果平台期望的是“最后一条输入对应最后一条输出”，而我们现在仍然会严格处理旧消息，那么用户主观感受上就会像“重排后的 askText 不生效”。

换句话说，这更像产品语义问题，而不是字符串本身被改坏了。

### 4.7 我建议研发优先排查的顺序

你可以请研发按这个顺序查：

1. 平台最终认定成功的响应样例是什么
2. 现在 ngrok 后面的服务到底是 proxy 还是 plugin
3. 平台实际请求头和我们当前验签逻辑是否一致
4. 平台 webhook 超时阈值是多少
5. 平台是否允许 `data-only SSE + isFinal`
6. 如果不允许，是否必须回到 `event: message` 或 `[DONE]`

---

## 5. 跟研发老师对接时，我建议你怎么表达

你是 Junior PM，不需要强行像工程师一样“下结论”，你更适合做三件事：
- 先确认事实
- 再确认边界
- 最后推动收敛方案

### 5.1 一个比较稳的开场说法

你可以这样开场：

> 我先把我目前确认到的事实同步一下：ngrok 已经能收到小冰平台请求，本地 proxy 侧也能处理，但平台端还没有稳定收到/展示回包。我这边初步看到的风险点，主要集中在 SSE 响应契约、双路径实现差异，以及 session queue 带来的时延。

这句话的好处是：
- 不会显得你在拍脑袋
- 也不会显得你只是在复述现象
- 研发一听就知道你已经把问题收敛到了几个技术点

### 5.2 你可以直接问研发的 5 个问题

1. `当前线上想走的到底是 proxy 路径，还是 OpenClaw plugin 路径？`
2. `小冰平台对 webhook 响应的严格格式要求是什么？是 data-only SSE，还是必须带 event/message 或 DONE？`
3. `平台 webhook 的超时阈值是多少？如果同 session 有排队，平台会不会直接判失败？`
4. `当前我们对“消息重排”的目标定义是什么？是 FIFO 保序，还是最新消息优先？`
5. `鉴权协议最终以哪套为准？SHA512 + timestamp/key，还是 x-signature + HMAC-SHA256？`

这 5 个问题足够把会开实。

### 5.3 当你不确定时，建议这样说

建议用这些句式：

> 我现在先不下结论，我想先确认当前生效的是哪一条链路。

> 这个现象我已经能复述，但根因我想和你对一下，是格式契约问题，还是队列/超时问题。

> 我看到代码和 README 在 SSE 细节上有一点漂移，这里我怕我理解错，想请你帮我确认最终以哪个实现为准。

> 我这边更想把问题收敛成一个明确动作：是改协议、改队列策略，还是统一入口。

这类表达会让你显得稳，而不是“会一点技术词但没收口”。

### 5.4 不建议这样表达

尽量避免：

> 应该就是 ngrok 有问题吧。

> 我感觉是小冰平台的问题。

> 队列重排已经做好了，应该没问题。

> 插件和 proxy 都可以，随便走哪个都行。

这些说法的问题是：不是证据驱动，而且会把研发带偏。

### 5.5 最后收口时建议这样提

你可以用这段话做会议收口：

> 我理解这次最需要研发帮我确认的不是“现象有没有”，而是三件事情：第一，线上准备用哪条链路；第二，小冰严格接受的响应契约；第三，我们对 session 消息处理到底要 FIFO 还是 latest-first。只要这三件事情定下来，后面的改动范围就比较清楚了。

这段话会很像一个能推动事情落地的 PM。

---

## 我建议你在会上重点强调的 3 个事实

1. **当前现行代码的 session queue 是 FIFO，不是 latest-first。**
2. **当前真正较完整的入站链路在 proxy，不在 plugin。**
3. **当前最可疑的问题点是 SSE 契约和双路径协议不一致，而不是 ngrok 是否收到了请求。**

---

## 附: 我认为最值得研发当场确认的代码点

- 队列策略: `src/handlers.js:197-290`
- Webhook 主处理: `src/handlers.js:315-594`
- SSE envelope: `src/handlers.js:82-154`
- Proxy 路由: `src/server.js:50-53`
- OpenClaw 调用与超时: `src/openclaw-client.js:41-127`
- Plugin 注册入口: `extensions/xiaoice/index.ts:13-24`
- Plugin outbound SSE: `extensions/xiaoice/src/channel.ts:58-82`
- Plugin webhook 鉴权: `extensions/xiaoice/src/webhook.ts:32-47`
- Plugin webhook 当前回包: `extensions/xiaoice/src/webhook.ts:61-67`
- Proxy 鉴权实现: `src/auth.js:20-50`
- README 中 SSE 描述: `README-XIAOICE.md:46-52`

