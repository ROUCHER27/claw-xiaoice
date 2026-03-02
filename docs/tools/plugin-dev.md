# OpenClaw 插件开发指南

## 快速开始

### 创建插件结构

```
extensions/
  └── my-channel/
      ├── index.ts          # 插件入口
      ├── src/
      │   ├── channel.ts    # Channel 实现
      │   ├── accounts.ts   # 账号配置
      │   ├── api.ts        # API 调用
      │   └── webhook.ts    # Webhook 处理
      ├── openclaw.plugin.json
      └── package.json
```

### 注册 Channel

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { ChannelPlugin } from "openclaw/plugin-sdk";

const myChannelPlugin: ChannelPlugin = {
  id: "mychannel",
  meta: {
    id: "mychannel",
    label: "My Channel",
    selectionLabel: "My Channel (API)",
    blurb: "My custom channel.",
  },
  capabilities: {
    chatTypes: ["direct"],
  },
  config: {
    listAccountIds: (cfg) => ["default"],
    resolveAccount: (cfg, accountId) => ({
      accountId: accountId || "default",
      enabled: true,
      config: {},
      credentialSource: "none",
    }),
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ text }) => {
      // 发送消息逻辑
      return { ok: true };
    },
  },
};

export default function (api: OpenClawPluginApi) {
  api.registerChannel({ plugin: myChannelPlugin });
}
```

### 注册 Webhook

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export default function (api: OpenClawPluginApi) {
  api.registerHttpHandler(async (req) => {
    // 处理 webhook 请求
    return new Response("OK");
  });
}
```

### 完整示例

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { myChannelPlugin } from "./src/channel.js";

export default function (api: OpenClawPluginApi) {
  api.registerChannel({ plugin: myChannelPlugin });
  api.registerHttpHandler(handleWebhook);
}
```
