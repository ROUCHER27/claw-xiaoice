# OpenClaw Webhook 代码质量提升计划

## 参考文档

- **小冰平台官方文档**: https://aibeings-vip.xiaoice.cn/product-doc/show/154
- **开发方法**: 必须使用 TDD workflow（测试驱动开发）

## 审查结果总结

**代码质量评分**: 6.5/10

**主要问题**:
- 代码重复率高 (30%+)
- webhook-proxy.js 过长 (432行)
- 配置管理混乱
- 错误处理不一致

**优势**:
- 安全性考虑周全
- 优雅关闭处理
- 测试覆盖较好

---

## Phase 1: 消除代码重复（本次实施）

### 目标
- 减少 30% 代码重复
- 统一配置管理
- 提取共享库

### 任务清单

#### Task 1.1: 创建共享库目录结构
```
lib/
├── common.sh          # 通用函数（签名生成等）
├── colors.sh          # 颜色定义
├── output.sh          # 输出函数
├── proxy-setup.sh     # 代理设置
└── config.sh          # 配置管理
```

#### Task 1.2: 提取签名生成函数
**问题**: `generate_signature()` 在 5 个脚本中重复
**文件**: test-webhook.sh, test-auth-modes.sh, test-quick.sh, xiaoice-auth-helper.sh, quick-test.sh

**解决方案**: 创建 `lib/common.sh`
```bash
#!/bin/bash
# 通用函数库

# 生成 SHA512 签名
# 参数: $1=body, $2=timestamp
generate_signature() {
    local body="$1"
    local timestamp="$2"
    local secret_key="${SECRET_KEY:-test-secret}"
    local message="${body}${secret_key}${timestamp}"
    echo -n "$message" | openssl dgst -sha512 | awk '{print $2}'
}

# 生成唯一 ID
generate_id() {
    echo "xiaoice-$(date +%s)000-$(openssl rand -hex 4)"
}

# 获取当前时间戳（毫秒）
get_timestamp() {
    echo "$(date +%s)000"
}
```

#### Task 1.3: 统一颜色定义
**问题**: 颜色定义在 8 个脚本中重复（193 行代码）

**解决方案**: 创建 `lib/colors.sh`
```bash
#!/bin/bash
# 颜色定义

# ANSI 颜色代码
export GREEN='\033[0;32m'
export RED='\033[0;31m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m'  # No Color

# 颜色输出函数
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_header() {
    echo -e "${CYAN}$1${NC}"
}
```

#### Task 1.4: 统一输出格式
**解决方案**: 创建 `lib/output.sh`
```bash
#!/bin/bash
# 输出格式化函数

source "$(dirname "${BASH_SOURCE[0]}")/colors.sh"

# 打印测试结果
print_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"

    if [ "$status" = "PASSED" ]; then
        echo -e "[TEST] $test_name ... ${GREEN}✓ PASSED${NC}"
    else
        echo -e "[TEST] $test_name ... ${RED}✗ FAILED${NC}"
        if [ -n "$message" ]; then
            echo -e "  ${RED}$message${NC}"
        fi
    fi
}

# 打印分隔线
print_separator() {
    echo "=========================================="
}

# 打印标题
print_title() {
    print_separator
    echo "$1"
    print_separator
}
```

#### Task 1.5: 统一代理设置
**问题**: 代理禁用代码在 4 个脚本中重复

**解决方案**: 创建 `lib/proxy-setup.sh`
```bash
#!/bin/bash
# 代理设置

# 禁用代理（用于本地测试）
disable_proxy() {
    unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
    export NO_PROXY=localhost,127.0.0.1
}

# 启用代理（如果需要）
enable_proxy() {
    if [ -n "$PROXY_URL" ]; then
        export http_proxy="$PROXY_URL"
        export https_proxy="$PROXY_URL"
    fi
}
```

#### Task 1.6: 集中配置管理
**问题**: 配置分散在各个脚本中

**解决方案**: 创建 `lib/config.sh`
```bash
#!/bin/bash
# 配置管理

# 加载 .env 文件（如果存在）
load_env() {
    local env_file="${1:-.env}"
    if [ -f "$env_file" ]; then
        export $(cat "$env_file" | grep -v '^#' | xargs)
    fi
}

# Webhook 配置
export WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3002/webhooks/xiaoice}"
export WEBHOOK_PORT="${PORT:-3002}"

# 认证配置
export ACCESS_KEY="${XIAOICE_ACCESS_KEY:-test-key}"
export SECRET_KEY="${XIAOICE_SECRET_KEY:-test-secret}"
export AUTH_REQUIRED="${XIAOICE_AUTH_REQUIRED:-true}"

# 超时配置
export TIMEOUT="${XIAOICE_TIMEOUT:-18000}"

# Ngrok 配置
export NGROK_API_URL="${NGROK_API_URL:-http://localhost:4040/api/tunnels}"

# 测试配置
export TEST_SESSION_ID="${TEST_SESSION_ID:-test-session}"
export TEST_MESSAGE="${TEST_MESSAGE:-你好}"
```

#### Task 1.7: 更新所有脚本引入共享库
**需要更新的脚本**:
- test-webhook.sh
- test-auth-modes.sh
- test-quick.sh
- test-text-extraction.sh
- xiaoice-auth-helper.sh
- quick-test.sh
- start-webhook.sh
- watch-logs.sh
- xiaoice-config.sh

**更新模式**:
```bash
#!/bin/bash

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载共享库
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/output.sh"
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/proxy-setup.sh"

# 禁用代理（本地测试）
disable_proxy

# 脚本主逻辑...
```

---

## Phase 2: 模块化 webhook-proxy.js（下一阶段）

### 目标架构
```
src/
├── auth.js              # 认证模块
├── openclaw-client.js   # OpenClaw 集成
├── response-parser.js   # 响应解析
├── handlers.js          # 请求处理器
└── server.js            # HTTP 服务器
```

### 拆分计划

#### Module 1: auth.js
**职责**: 签名验证、时间戳验证
**提取代码**: webhook-proxy.js Lines 184-227
```javascript
// 导出函数
module.exports = {
  verifySignature,
  validateTimestamp,
  validateAccessKey
};
```

#### Module 2: openclaw-client.js
**职责**: OpenClaw CLI 调用、进程管理
**提取代码**: webhook-proxy.js Lines 40-126
```javascript
class OpenClawClient {
  async sendMessage(payload, options = {}) { }
  async sendStreamingMessage(payload, streamCallback) { }
}

module.exports = OpenClawClient;
```

#### Module 3: response-parser.js
**职责**: 响应解析、文本提取
**提取代码**: webhook-proxy.js Lines 129-176
```javascript
module.exports = {
  extractReplyText,
  parseOpenClawResponse
};
```

#### Module 4: handlers.js
**职责**: 请求处理逻辑
**提取代码**: webhook-proxy.js Lines 230-364
```javascript
module.exports = {
  handleXiaoIceDialogue,
  handleHealthCheck
};
```

#### Module 5: server.js
**职责**: HTTP 服务器、路由
**提取代码**: webhook-proxy.js Lines 377-432
```javascript
const { handleXiaoIceDialogue, handleHealthCheck } = require('./handlers');

function createServer(config) { }
function startServer(port) { }

module.exports = { createServer, startServer };
```

---

## Phase 3: 改进错误处理和日志（后续）

### 任务
- 修复 HTTP 状态码返回
- 添加结构化日志
- 改进输入验证
- 添加请求追踪

---

## Phase 4: 测试框架统一（后续）

### 任务
- 创建统一测试框架
- 添加 Jest 单元测试
- 提高测试覆盖率

---

## 实施顺序

### 本次实施（Phase 1）
1. ✅ 创建 lib/ 目录结构
2. ✅ 创建 lib/common.sh
3. ✅ 创建 lib/colors.sh
4. ✅ 创建 lib/output.sh
5. ✅ 创建 lib/proxy-setup.sh
6. ✅ 创建 lib/config.sh
7. ✅ 更新 test-webhook.sh
8. ✅ 更新 test-auth-modes.sh
9. ✅ 更新 test-quick.sh
10. ✅ 更新其他脚本
11. ✅ 测试验证
12. ✅ 提交到 worktree 分支

### 下次实施（Phase 2）
- 拆分 webhook-proxy.js
- 创建模块化架构

---

## 验证标准

### Phase 1 验证
- [ ] 所有测试脚本正常运行
- [ ] 代码行数减少 30%+
- [ ] 无功能回归
- [ ] 配置统一管理
- [ ] 共享库可复用

### 成功指标
- 代码重复率: 30% → 10%
- 脚本平均行数: 减少 40%
- 配置修改点: 多个文件 → 1 个文件
- 可维护性评分: 6.5 → 8.0

---

## 风险与缓解

### 风险 1: 破坏现有功能
**缓解**:
- 在 worktree 分支开发
- 完整测试后再合并
- 保留原始文件备份

### 风险 2: 路径引用问题
**缓解**:
- 使用 `SCRIPT_DIR` 动态获取路径
- 测试不同目录下的执行

### 风险 3: 环境变量冲突
**缓解**:
- 使用 `${VAR:-default}` 提供默认值
- 文档化所有环境变量

---

## 时间估计

- Task 1.1-1.6: 创建共享库 - 2 小时
- Task 1.7: 更新脚本 - 3 小时
- 测试验证 - 1 小时
- **总计**: 6 小时

---

## 下一步行动

1. 创建 lib/ 目录和共享库文件
2. 逐个更新测试脚本
3. 运行完整测试套件验证
4. 提交到 code-quality-refactor 分支
5. 合并到 main 分支
