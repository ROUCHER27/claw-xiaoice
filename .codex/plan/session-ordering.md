# 同 Session 乱序与 Dialogue ID 去重改造计划

## Summary
- 去重范围锁定为：`同 session 内去重`（键：`sessionId + dialogueId`）。
- 这意味着：不同用户/不同 session 即使 `dialogueId` 相同，也不会互相命中，不会串回复。
- 目标：解决“覆盖后超时、后续对话不可用”，并保证同会话多句都能稳定回传。

## Key Changes
1. 会话队列策略（混合排序）
- 保留同 `sessionId` 串行处理（active=1）。
- 入队默认按到达顺序。
- 若发现明显倒序（新请求 `timestamp` 早于 pending 项且超过阈值），仅对 pending 做重排，不打断正在执行任务。
- 新增配置：`XIAOICE_REORDER_SKEW_MS`（默认 `800`）。

2. 去重与复用（同 session + dialogueId）
- 取值：`dialogueId = payload.extra.dialogueId`。
- 去重键：`sessionId + dialogueId`。
- 命中执行中：挂接 waiter，复用主任务结果回包。
- 命中已完成缓存：直接返回缓存结果（SSE/非流式各自格式保持兼容）。
- `dialogueId` 缺失：不去重，只走队列。
- 新增配置：`XIAOICE_DEDUPE_TTL_MS`（默认 `600000`）、`XIAOICE_DEDUPE_MAX_ENTRIES`（默认 `2000`）。

3. 故障隔离与恢复
- TIMEOUT/异常后必须释放队列状态，确保后续请求继续处理。
- 子进程超时后 `SIGTERM` + 延迟 `SIGKILL` 兜底，避免僵尸进程拖垮会话。
- 响应连接提前关闭时，安全跳过写回，避免抛错污染队列。

4. 文档与计划落盘
- 在执行阶段创建并写入：`plan/session-ordering.md`。
- 文档内容包含：策略定义、配置、日志字段、排障步骤、回滚方案。

## Interfaces / Contracts
- 输入依赖：`sessionId`、`extra.dialogueId`、`timestamp`（用于混合排序判定）。
- 输出合同不变：SSE 仍为 `data: {...}` + `data: [DONE]`；非流式仍为纯文本。
- 日志字段新增/强化：`sessionId`、`traceId`、`queuePosition`、`waitMs`、`dedupeHitType(inflight|done|none)`。

## Test Plan
1. 单元测试
- 同 session 并发两句：严格串行（`queuePosition=1/2`）。
- 同 session 倒序到达：pending 重排生效。
- 同 session 同 `dialogueId`：
  - 执行中重复：第二条复用主任务结果。
  - 完成后重复：命中缓存快速返回。
- 不同 session 同 `dialogueId`：互不影响。
- TIMEOUT 后下一条仍可成功处理。

2. 集成测试
- 复用现有完整脚本 + 新增并发重复场景脚本：
  - 同 session 不同 `dialogueId` 两句并发都成功。
  - 同 session 相同 `dialogueId` 不重复执行业务。
  - 覆盖后场景回归：不再出现“后续全挂”。

3. 验收标准
- 不再出现“覆盖后整个对话不可用”。
- 同 session 多句可稳定回传，且顺序可解释（日志可观测）。
- 8项完整脚本保持全通过。

## Assumptions
- `sessionId` 能稳定代表同一会话边界。
- `extra.dialogueId` 在平台重试时保持一致；若缺失则不做去重。
- `timestamp` 仅用于“明显倒序”修正，不作为绝对真实发言顺序。
