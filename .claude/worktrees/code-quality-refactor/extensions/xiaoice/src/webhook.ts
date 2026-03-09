import type { OpenClawRuntime } from "openclaw/plugin-sdk";
import crypto from "crypto";
import type { WebhookPayload } from "./types.js";
import { resolveXiaoiceAccount } from "./accounts.js";

export function createWebhookHandler(runtime: OpenClawRuntime) {
  return async function handleXiaoiceWebhook(req: Request): Promise<Response> {
    try {
      // 获取 path 参数 accountId
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/").filter(Boolean);
      const accountId = pathParts[pathParts.length - 1];

      // 解析 body
      const body = await req.json() as WebhookPayload;
      const { messageId, conversationId, userId, text, timestamp } = body;

      // 验证签名
      const signature = req.headers.get("X-Signature");
      const account = resolveXiaoiceAccount({ 
        cfg: runtime.config, 
        accountId 
      });

      if (account.config.webhookSecret && signature) {
        const expectedSig = crypto
          .createHmac("sha256", account.config.webhookSecret)
          .update(JSON.stringify(body))
          .digest("hex");

        if (signature !== expectedSig) {
          return new Response("Invalid signature", { status: 401 });
        }
      }

      // 调用 OpenClaw 处理消息
      // 这里需要根据实际 API 调整
      runtime.logger?.info(`Received message from ${userId}: ${text}`);

      return new Response(JSON.stringify({
        ok: true,
        messageId,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      runtime.logger?.error(`Webhook error: ${error}`);
      return new Response("Internal error", { status: 500 });
    }
  };
}
