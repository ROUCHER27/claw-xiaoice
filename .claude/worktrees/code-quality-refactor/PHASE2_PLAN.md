# Phase 2: 模块化 webhook-proxy.js

## 目标

将 webhook-proxy.js (432行) 拆分为模块化架构，提高可维护性和可测试性。

## 架构设计

```
src/
├── auth.js              # 认证模块
├── openclaw-client.js   # OpenClaw 集成
├── response-parser.js   # 响应解析
├── handlers.js          # 请求处理器
└── server.js            # HTTP 服务器
```

## 模块职责

### 1. src/auth.js
**职责**: 签名验证、时间戳验证、访问密钥验证
**提取代码**: webhook-proxy.js Lines 154-197
**导出函数**:
- `verifySignature(body, timestamp, signature, key)`
- `validateTimestamp(timestamp, window)`
- `validateAccessKey(key, expectedKey)`

### 2. src/openclaw-client.js
**职责**: OpenClaw CLI 调用、进程管理、超时控制
**提取代码**: webhook-proxy.js Lines 40-126
**导出类**:
- `OpenClawClient`
  - `sendMessage(payload, options)`
  - `sendStreamingMessage(payload, streamCallback)`

### 3. src/response-parser.js
**职责**: 响应解析、文本提取
**提取代码**: webhook-proxy.js Lines 129-176
**导出函数**:
- `extractReplyText(stdout)`
- `parseOpenClawResponse(response)`

### 4. src/handlers.js
**职责**: HTTP 请求处理逻辑
**提取代码**: webhook-proxy.js Lines 230-395
**导出函数**:
- `handleXiaoIceDialogue(req, res, config)`
- `handleHealthCheck(req, res)`

### 5. src/server.js
**职责**: HTTP 服务器、路由、优雅关闭
**提取代码**: webhook-proxy.js Lines 397-432
**导出函数**:
- `createServer(config)`
- `startServer(port, config)`

## 实施步骤

### Step 1: 创建 src/auth.js
- [ ] 提取 verifySignature 函数
- [ ] 添加 JSDoc 注释
- [ ] 编写单元测试

### Step 2: 创建 src/response-parser.js
- [ ] 提取 extractReplyText 函数
- [ ] 添加 JSDoc 注释
- [ ] 编写单元测试

### Step 3: 创建 src/openclaw-client.js
- [ ] 提取 sendToOpenClaw 函数
- [ ] 封装为 OpenClawClient 类
- [ ] 添加 JSDoc 注释
- [ ] 编写单元测试

### Step 4: 创建 src/handlers.js
- [ ] 提取 handleXiaoIceDialogue 函数
- [ ] 提取 handleHealthCheck 函数
- [ ] 添加 JSDoc 注释
- [ ] 编写集成测试

### Step 5: 创建 src/server.js
- [ ] 提取服务器创建逻辑
- [ ] 提取路由逻辑
- [ ] 提取优雅关闭逻辑
- [ ] 添加 JSDoc 注释

### Step 6: 更新 webhook-proxy.js
- [ ] 导入所有模块
- [ ] 简化为主入口文件
- [ ] 保持向后兼容

### Step 7: 添加 Jest 单元测试
- [ ] 配置 Jest
- [ ] 编写 auth.test.js
- [ ] 编写 response-parser.test.js
- [ ] 编写 openclaw-client.test.js
- [ ] 编写 handlers.test.js
- [ ] 目标覆盖率: 80%+

## 预期结果

### 代码行数
- webhook-proxy.js: 432 → ~50 行 (主入口)
- src/auth.js: ~60 行
- src/response-parser.js: ~50 行
- src/openclaw-client.js: ~100 行
- src/handlers.js: ~150 行
- src/server.js: ~80 行
- **总计**: ~490 行 (增加 58 行，但模块化)

### 可测试性
- 每个模块独立测试
- Mock 外部依赖
- 单元测试覆盖率 80%+

### 可维护性
- 单一职责原则
- 清晰的模块边界
- 易于理解和修改

## 时间估计

- Step 1-2: 1 小时
- Step 3-4: 2 小时
- Step 5-6: 1 小时
- Step 7: 2 小时
- **总计**: 6 小时
