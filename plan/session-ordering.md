# 会话队列重排优化计划

## 目标

在保持“同一会话串行处理”的前提下，降低同会话高频输入导致的排队延迟，优先处理最新输入。

## 策略

1. 运行中任务不抢占：当前正在调用模型的请求必须执行完成。
2. 等待队列重排：同一会话内，后到请求插入队首（latest-first）。
3. 会话隔离并行：不同 `sessionId` 继续并行，不互相阻塞。
4. 失败可恢复：单个请求失败不影响后续队列继续出队。

## 数据结构

- `sessionPipelines: Map<string, SessionQueueState>`
- `SessionQueueState`
  - `running: boolean`
  - `queue: QueueItem[]`
- `QueueItem`
  - `queuedAt: number`
  - `task: Function`
  - `resolve/reject: Function`
  - `queuePosition: number`

## 处理流程

1. 入队时按会话取队列状态；不存在则创建。
2. 新请求通过 `unshift` 放入等待队列头部（最新优先）。
3. `drainSessionQueue` 单线程逐个 `shift` 执行。
4. 执行完成后自动清理空会话队列，避免内存累积。

## 验收标准

1. 同会话仍无并发执行（`maxActive === 1`）。
2. 多会话仍并行（`maxActive > 1`）。
3. 同会话三请求执行顺序从 `first -> second -> third` 调整为 `first -> third -> second`。
4. 前一请求超时/失败后，后续请求仍可正常执行。

## 影响与风险

- 优点：减少用户连续追问时的“旧问题先返回”现象，降低感知延迟。
- 风险：同会话消息可能非原始发送顺序进入模型上下文。
- 应对：如业务要求严格时间顺序，可切回 FIFO（仅替换入队顺序）。

## 回滚方案

将入队逻辑从 `unshift` 改回追加（FIFO），并保留同会话串行 drain 框架。
