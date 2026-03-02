import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { xiaoicePlugin } from "./src/channel.js";
import { createWebhookHandler } from "./src/webhook.js";

let webhookHandler: ReturnType<typeof createWebhookHandler> | null = null;

const plugin = {
  id: "xiaoice",
  name: "XiaoIce",
  description: "OpenClaw XiaoIce channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // 注册 Channel
    api.registerChannel({ plugin: xiaoicePlugin });

    // 注册 Webhook 处理
    webhookHandler = createWebhookHandler(api.runtime);
    api.registerHttpHandler(async (req) => {
      if (req.url.includes("/webhooks/xiaoice")) {
        return webhookHandler!(req);
      }
      return new Response("Not found", { status: 404 });
    });
  },
};

export default plugin;
